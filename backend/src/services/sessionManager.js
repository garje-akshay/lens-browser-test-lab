const { chromium, devices: pwDevices } = require('playwright');
const { randomUUID } = require('crypto');
const { DEVICES, NETWORK_PROFILES, MAX_SESSIONS, FRAME_FPS } = require('../config');

// Holds one shared Chromium browser; each device view is a BrowserContext so
// cookies/storage stay isolated. Contexts are cheap compared to browsers.
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true, args: ['--no-sandbox'] });
  }
  return browserPromise;
}

const sessions = new Map(); // sessionId -> Session

class Session {
  constructor({ id, deviceId, url, networkProfile }) {
    this.id = id;
    this.deviceId = deviceId;
    this.url = url;
    this.networkProfile = networkProfile || 'online';
    this.context = null;
    this.page = null;
    this.subscribers = new Set(); // WebSocket clients
    this.streamTimer = null;
    this.closed = false;
    this.logs = []; // ring buffer of recent log events
  }

  pushLog(entry) {
    const event = { ...entry, ts: Date.now() };
    this.logs.push(event);
    if (this.logs.length > 500) this.logs.shift();
    // Drop the WS send if the client is backpressured — the client can pull
    // missed history from the ring buffer via log-replay on reconnect.
    const msg = JSON.stringify({ type: 'log', sessionId: this.id, event });
    for (const ws of this.subscribers) {
      if (ws.readyState === 1 && ws.bufferedAmount < 1 << 18) ws.send(msg);
    }
  }

  attachPageListeners() {
    if (!this.page) return;
    this.page.on('console', (m) => {
      this.pushLog({
        level: m.type(), // 'log' | 'warn' | 'error' | 'info' | 'debug'
        source: 'console',
        message: m.text(),
        location: m.location(),
      });
    });
    this.page.on('pageerror', (err) => {
      this.pushLog({
        level: 'error',
        source: 'pageerror',
        message: err.message,
        stack: err.stack,
      });
    });
    this.page.on('requestfailed', (req) => {
      this.pushLog({
        level: 'error',
        source: 'network',
        message: `${req.method()} ${req.url()} — ${req.failure()?.errorText || 'failed'}`,
      });
    });
    this.page.on('response', (res) => {
      const status = res.status();
      // Only surface server-side failures + auth issues; 404 for missing assets
      // is too noisy and not usually actionable.
      if (status >= 500 || status === 401 || status === 403) {
        this.pushLog({
          level: status >= 500 ? 'error' : 'warn',
          source: 'network',
          message: `${status} ${res.request().method()} ${res.url()}`,
        });
      }
    });
    this.page.on('framenavigated', (frame) => {
      if (frame === this.page.mainFrame()) {
        this.pushLog({ level: 'info', source: 'nav', message: `→ ${frame.url()}` });
      }
    });
  }

  async start() {
    const device = DEVICES.find((d) => d.id === this.deviceId);
    if (!device) throw new Error(`Unknown device: ${this.deviceId}`);

    const browser = await getBrowser();
    const pwDescriptor = pwDevices[device.playwrightDescriptor];
    this.context = await browser.newContext({
      ...(pwDescriptor || {}),
      viewport: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      userAgent: device.userAgent,
    });

    this.page = await this.context.newPage();
    this.attachPageListeners();
    await this.applyNetworkProfile(this.networkProfile);
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

    this.startStreaming();
  }

  async applyNetworkProfile(profileId) {
    const profile = NETWORK_PROFILES[profileId] || NETWORK_PROFILES.online;
    this.networkProfile = profileId;
    if (!this.context || !this.page) return;
    const cdp = await this.context.newCDPSession(this.page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (profile.downloadKbps * 1024) / 8 || -1,
      uploadThroughput: (profile.uploadKbps * 1024) / 8 || -1,
      latency: profile.latencyMs || 0,
    });
  }

  startStreaming() {
    if (this.streamTimer) return;
    const interval = Math.max(100, Math.floor(1000 / FRAME_FPS));
    let inflight = false;

    const tick = async () => {
      if (this.closed || !this.page) return;
      // No subscribers → skip CDP screenshot entirely (it's the expensive op).
      if (this.subscribers.size === 0) return;
      if (inflight) return; // previous screenshot still running — coalesce.
      inflight = true;
      try {
        const buf = await this.page.screenshot({ type: 'jpeg', quality: 50, fullPage: false });
        const frame = buf.toString('base64');
        const msg = JSON.stringify({ type: 'frame', sessionId: this.id, data: frame });
        for (const ws of this.subscribers) {
          if (ws.readyState === 1 && ws.bufferedAmount < 1 << 20) ws.send(msg);
        }
      } catch {
        // page may be navigating; skip
      } finally {
        inflight = false;
      }
    };

    this.streamTimer = setInterval(tick, interval);
  }

  async navigate(url) {
    this.url = url;
    if (!this.page) return;
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }

  async reload() {
    if (this.page) await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  async scroll({ x, y }) {
    if (!this.page) return;
    // Coalesce: always apply the newest target, skip intermediate values
    // that arrived while a previous scroll was in-flight.
    this._pendingScroll = { x: x || 0, y: y || 0 };
    if (this._scrolling) return;
    this._scrolling = true;
    try {
      while (this._pendingScroll) {
        const target = this._pendingScroll;
        this._pendingScroll = null;
        await this.page.evaluate(([sx, sy]) => window.scrollTo(sx, sy), [target.x, target.y]).catch(() => {});
      }
    } finally {
      this._scrolling = false;
    }
  }

  async tap({ x, y }) {
    if (!this.page) return;
    await this.page.touchscreen.tap(x, y).catch(() => {});
  }

  async screenshot() {
    if (!this.page) return null;
    return this.page.screenshot({ type: 'png', fullPage: true });
  }

  attach(ws) {
    this.subscribers.add(ws);
    // Replay recent logs so the client's log panel has history.
    if (ws.readyState === 1 && this.logs.length) {
      ws.send(JSON.stringify({ type: 'log-replay', sessionId: this.id, events: this.logs }));
    }
  }

  detach(ws) {
    this.subscribers.delete(ws);
  }

  async close() {
    this.closed = true;
    if (this.streamTimer) clearInterval(this.streamTimer);
    this.streamTimer = null;
    try { await this.context?.close(); } catch {}
    sessions.delete(this.id);
  }
}

async function createSession({ deviceId, url, networkProfile }) {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`Session limit reached (${MAX_SESSIONS}). Close unused sessions first.`);
  }
  const id = randomUUID();
  const session = new Session({ id, deviceId, url, networkProfile });
  sessions.set(id, session);
  await session.start();
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

async function closeAll() {
  await Promise.all([...sessions.values()].map((s) => s.close()));
}

module.exports = { createSession, getSession, closeAll, sessions };
