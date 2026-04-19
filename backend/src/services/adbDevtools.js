const { execFile } = require('child_process');
const { promisify } = require('util');
const http = require('http');
const WebSocket = require('ws');

const execFileAsync = promisify(execFile);

// Per-serial CDP capture. For each Android device we `adb forward` the
// `chrome_devtools_remote` abstract socket onto a local TCP port, discover the
// active tab via /json, and attach a CDP WebSocket with Network + Page domains
// enabled. Events are shaped into HAR-like entries held in a ring buffer so
// the frontend can poll for recent traffic and export a HAR file.

const sessions = new Map(); // serial -> Capture
const PORT_BASE = 9222;
const MAX_ENTRIES = 500;

function pickPort(serial) {
  // Deterministic-ish mapping so repeated attaches reuse the same port.
  let h = 0;
  for (let i = 0; i < serial.length; i++) h = (h * 31 + serial.charCodeAt(i)) >>> 0;
  return PORT_BASE + (h % 500);
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(4000, () => { req.destroy(new Error('timeout')); });
  });
}

class Capture {
  constructor(serial) {
    this.serial = serial;
    this.port = pickPort(serial);
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map(); // id -> {resolve, reject}
    this.entries = new Map(); // requestId -> HAR entry (partial)
    this.completed = []; // HAR entries, newest last
    this.pageUrl = null;
    this.sessions = new Map(); // cdp sessionId -> { targetId, url, type }
    this.attached = false;
    this.closed = false;
  }

  async start() {
    // 1) adb forward — idempotent; rewriting an existing rule is a no-op.
    await execFileAsync('adb', [
      '-s', this.serial, 'forward', `tcp:${this.port}`,
      'localabstract:chrome_devtools_remote',
    ], { timeout: 5000 });

    // 2) Attach to the BROWSER-level CDP endpoint. Per-target attach only sees
    //    one tab and misses anything opened later; the browser endpoint lets us
    //    Target.setAutoAttach so every new page auto-flatten-attaches via
    //    sessionId, and Network.enable on those sessions captures all traffic.
    const version = await httpJson(`http://127.0.0.1:${this.port}/json/version`)
      .catch(() => { throw new Error('Chrome DevTools not reachable on device. Is Chrome open?'); });
    const wsUrl = (version.webSocketDebuggerUrl || '').replace('localhost', '127.0.0.1');
    if (!wsUrl) throw new Error('Chrome did not expose a browser-level debugger socket.');

    this.ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });

    this.ws.on('message', (buf) => this._onMessage(buf));
    this.ws.on('close', () => { this.attached = false; });

    // Auto-attach to existing + future pages. waitForDebuggerOnStart=false so
    // navigations aren't blocked; flatten=true gives us sessionId on every CDP
    // message from the attached target.
    await this._send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
    // Also enable discovery so we get targetInfoChanged events when new tabs
    // open (some Chrome versions require this for browser-level visibility).
    await this._send('Target.setDiscoverTargets', { discover: true }).catch(() => {});
    this.attached = true;

    // setAutoAttach with flatten does NOT retroactively attach to already-open
    // tabs — only newly created ones. Explicitly attach to each existing page
    // so we capture traffic even when the user hadn't opened a new tab since.
    try {
      const { targetInfos = [] } = await this._send('Target.getTargets');
      for (const t of targetInfos) {
        if (t.type !== 'page') continue;
        await this._send('Target.attachToTarget', { targetId: t.targetId, flatten: true }).catch(() => {});
      }
    } catch {}

    const tabs = await httpJson(`http://127.0.0.1:${this.port}/json`).catch(() => []);
    const first = tabs.find((t) => t.type === 'page');
    if (first) this.pageUrl = first.url;
  }

  _send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject });
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      this.ws.send(JSON.stringify(msg));
    });
  }

  _onMessage(buf) {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
      else resolve(msg.result);
      return;
    }
    const { method, params } = msg;
    if (!method) return;
    if (process.env.LENS_CDP_DEBUG) {
      console.log('[cdp]', method, msg.sessionId ? `sid=${msg.sessionId.slice(0,8)}` : '', params?.targetInfo?.type || params?.request?.url || '');
    }

    switch (method) {
      case 'Target.attachedToTarget':         return this._onTargetAttached(params);
      case 'Target.detachedFromTarget':       return this._onTargetDetached(params);
      case 'Target.targetInfoChanged':
        if (params.targetInfo?.type === 'page' && params.targetInfo.attached) {
          this.pageUrl = params.targetInfo.url || this.pageUrl;
        }
        return;
      case 'Network.requestWillBeSent':       return this._onRequest(params);
      case 'Network.responseReceived':        return this._onResponse(params);
      case 'Network.loadingFinished':         return this._onLoadingFinished(params);
      case 'Network.loadingFailed':           return this._onLoadingFailed(params);
      case 'Page.frameNavigated':
        if (params.frame && !params.frame.parentId) this.pageUrl = params.frame.url;
        return;
    }
  }

  async _onTargetAttached({ sessionId, targetInfo, waitingForDebugger }) {
    if (!sessionId) return;
    const isNewTab = !this.sessions.has(sessionId);
    this.sessions.set(sessionId, {
      targetId: targetInfo.targetId,
      url: targetInfo.url,
      type: targetInfo.type,
    });
    if (targetInfo.type === 'page') this.pageUrl = targetInfo.url || this.pageUrl;
    // Enable Network + Page on the per-tab session. Service workers and iframes
    // also get attached here — enabling Network on them captures their traffic.
    try {
      await this._send('Network.enable', {
        maxResourceBufferSize: 10_000_000,
        maxTotalBufferSize: 50_000_000,
      }, sessionId);
      await this._send('Page.enable', {}, sessionId).catch(() => {});
      if (waitingForDebugger) {
        await this._send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
      }
      // For the initial batch of already-open tabs, trigger a reload so we
      // actually see a full request cycle — otherwise the network panel stays
      // empty until the user does something. Only do this for pages, not
      // iframes/service workers.
      if (isNewTab && targetInfo.type === 'page' && targetInfo.url && !targetInfo.url.startsWith('chrome://')) {
        await this._send('Page.reload', { ignoreCache: true }, sessionId).catch(() => {});
      }
    } catch {
      // Target may have closed before we finished enabling; ignore.
    }
  }

  _onTargetDetached({ sessionId }) {
    if (sessionId) this.sessions.delete(sessionId);
  }

  _onRequest({ requestId, request, timestamp, type, documentURL, wallTime }) {
    this.entries.set(requestId, {
      _requestId: requestId,
      _startedTs: timestamp,
      _wallTime: wallTime,
      startedDateTime: new Date((wallTime || Date.now() / 1000) * 1000).toISOString(),
      time: -1,
      request: {
        method: request.method,
        url: request.url,
        httpVersion: 'HTTP/1.1',
        headers: headersToArr(request.headers),
        queryString: qsFromUrl(request.url),
        cookies: [],
        headersSize: -1,
        bodySize: request.postData ? Buffer.byteLength(request.postData) : 0,
        postData: request.postData ? { mimeType: request.headers['Content-Type'] || '', text: request.postData } : undefined,
      },
      response: null,
      _resourceType: type || 'Other',
      _documentURL: documentURL,
      cache: {},
      timings: { send: 0, wait: -1, receive: -1 },
      _endedTs: null,
      _status: 'pending',
    });
  }

  _onResponse({ requestId, response, timestamp }) {
    const e = this.entries.get(requestId);
    if (!e) return;
    e._respStartedTs = timestamp;
    e.response = {
      status: response.status,
      statusText: response.statusText || '',
      httpVersion: response.protocol || 'HTTP/1.1',
      headers: headersToArr(response.headers),
      cookies: [],
      content: {
        size: -1,
        mimeType: response.mimeType || '',
        text: undefined,
      },
      redirectURL: response.headers?.Location || '',
      headersSize: -1,
      bodySize: -1,
      _remoteIPAddress: response.remoteIPAddress,
      _fromDiskCache: !!response.fromDiskCache,
      _fromServiceWorker: !!response.fromServiceWorker,
    };
    e.timings.wait = response.timing
      ? Math.max(0, response.timing.receiveHeadersEnd - response.timing.sendEnd)
      : -1;
    e.serverIPAddress = response.remoteIPAddress;
  }

  _onLoadingFinished({ requestId, timestamp, encodedDataLength }) {
    const e = this.entries.get(requestId);
    if (!e) return;
    e._endedTs = timestamp;
    e.time = Math.max(0, (timestamp - e._startedTs) * 1000);
    e.timings.receive = Math.max(0, e.time - (e.timings.wait > 0 ? e.timings.wait : 0));
    if (e.response) {
      e.response.bodySize = encodedDataLength || -1;
      e.response.content.size = encodedDataLength || -1;
    }
    e._status = 'completed';
    this._finalize(requestId);
  }

  _onLoadingFailed({ requestId, timestamp, errorText, canceled }) {
    const e = this.entries.get(requestId);
    if (!e) return;
    e._endedTs = timestamp;
    e.time = Math.max(0, (timestamp - e._startedTs) * 1000);
    e._error = errorText || (canceled ? 'canceled' : 'failed');
    e._status = 'failed';
    if (!e.response) {
      e.response = {
        status: 0, statusText: e._error, httpVersion: '', headers: [], cookies: [],
        content: { size: 0, mimeType: '', text: '' }, redirectURL: '', headersSize: -1, bodySize: -1,
      };
    }
    this._finalize(requestId);
  }

  _finalize(requestId) {
    const e = this.entries.get(requestId);
    if (!e) return;
    this.entries.delete(requestId);
    this.completed.push(e);
    if (this.completed.length > MAX_ENTRIES) this.completed.shift();
  }

  summary() {
    return this.completed.map((e) => ({
      id: e._requestId,
      url: e.request.url,
      method: e.request.method,
      status: e.response?.status || 0,
      statusText: e.response?.statusText || '',
      type: e._resourceType,
      size: e.response?.bodySize ?? -1,
      time: e.time,
      startedDateTime: e.startedDateTime,
      mimeType: e.response?.content?.mimeType || '',
      error: e._error,
      remoteIP: e.response?._remoteIPAddress,
    }));
  }

  toHar() {
    // HAR 1.2. We strip our internal `_` fields except the conventional ones
    // (_resourceType is a widely-used de-facto extension used by Chrome).
    const entries = this.completed.map((e) => ({
      startedDateTime: e.startedDateTime,
      time: e.time,
      request: e.request,
      response: e.response || emptyResponse(e._error),
      cache: e.cache,
      timings: e.timings,
      serverIPAddress: e.serverIPAddress,
      _resourceType: e._resourceType,
      _error: e._error,
    }));
    return {
      log: {
        version: '1.2',
        creator: { name: 'Lens DevTools (ADB CDP)', version: '0.1' },
        browser: { name: 'Chrome (Android emulator)', version: '' },
        pages: [{
          startedDateTime: entries[0]?.startedDateTime || new Date().toISOString(),
          id: 'page_1',
          title: this.pageUrl || '',
          pageTimings: { onContentLoad: -1, onLoad: -1 },
        }],
        entries: entries.map((e) => ({ ...e, pageref: 'page_1' })),
      },
    };
  }

  clear() {
    this.completed.length = 0;
    this.entries.clear();
  }

  async close() {
    this.closed = true;
    try { this.ws?.close(); } catch {}
    try {
      await execFileAsync('adb', ['-s', this.serial, 'forward', '--remove', `tcp:${this.port}`], { timeout: 3000 });
    } catch {}
    sessions.delete(this.serial);
  }
}

function headersToArr(h) {
  if (!h) return [];
  return Object.entries(h).map(([name, value]) => ({ name, value: String(value) }));
}

function qsFromUrl(url) {
  try {
    const u = new URL(url);
    return [...u.searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch { return []; }
}

function emptyResponse(error) {
  return {
    status: 0, statusText: error || '',
    httpVersion: '', headers: [], cookies: [],
    content: { size: 0, mimeType: '', text: '' },
    redirectURL: '', headersSize: -1, bodySize: -1,
  };
}

async function attach(serial) {
  let cap = sessions.get(serial);
  if (cap && cap.attached) return cap;
  if (cap) { try { await cap.close(); } catch {} }
  cap = new Capture(serial);
  sessions.set(serial, cap);
  try { await cap.start(); }
  catch (err) { sessions.delete(serial); throw err; }
  return cap;
}

function get(serial) { return sessions.get(serial); }

async function detach(serial) {
  const cap = sessions.get(serial);
  if (cap) await cap.close();
}

async function closeAll() {
  await Promise.all([...sessions.values()].map((c) => c.close()));
}

module.exports = { attach, detach, get, closeAll };
