const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// One scrcpy process per device serial. The scrcpy CLI renders its own native
// window — we only own its lifecycle (spawn/kill) and push URLs into Chrome on
// the device via `adb shell am start`. No frame streaming, no control protocol.
// scrcpy itself is the view; we're just plumbing.
const scrcpyProcs = new Map(); // serial -> ChildProcess

async function listDevices() {
  // `adb devices -l` emits "serial <state>  product:... model:... device:..."
  const { stdout } = await execFileAsync('adb', ['devices', '-l'], { timeout: 5000 });
  const lines = stdout.split('\n').slice(1); // first line is the header
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [serial, state, ...rest] = trimmed.split(/\s+/);
    if (state !== 'device') continue; // skip 'offline' and 'unauthorized'
    const attrs = Object.fromEntries(
      rest.map((kv) => kv.split(':')).filter((p) => p.length === 2)
    );
    out.push({
      serial,
      model: attrs.model || serial,
      product: attrs.product || '',
      launched: scrcpyProcs.has(serial),
    });
  }
  return out;
}

function launchScrcpy(serial) {
  if (scrcpyProcs.has(serial)) return { alreadyRunning: true };
  // --no-audio keeps scrcpy from trying to open an audio pipeline (noisy and
  // pointless for web testing). Everything else is default — let scrcpy pick
  // reasonable encoding + sizing.
  const proc = spawn('scrcpy', ['-s', serial, '--no-audio', '--window-title', `Lens · ${serial}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  scrcpyProcs.set(serial, proc);
  proc.on('exit', () => scrcpyProcs.delete(serial));
  proc.on('error', () => scrcpyProcs.delete(serial));
  // Drain stdio so the pipe buffers don't fill and block the child.
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', () => {});
  return { launched: true, pid: proc.pid };
}

function closeScrcpy(serial) {
  const proc = scrcpyProcs.get(serial);
  if (!proc) return { wasRunning: false };
  try { proc.kill('SIGTERM'); } catch {}
  scrcpyProcs.delete(serial);
  return { wasRunning: true };
}

async function openUrl(serial, url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('url must start with http:// or https://');
  // ACTION_VIEW + http(s) URI opens the user's default browser on Android. On a
  // stock AOSP emulator image that's Chrome. We wait for adb to return but not
  // for Chrome to finish loading — that'd be 5-15s and the user can see it.
  await execFileAsync('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url], {
    timeout: 8000,
  });
}

async function screenshot(serial) {
  // `exec-out` streams raw PNG bytes without shell escaping hazards.
  const { stdout } = await execFileAsync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 10000,
  });
  return stdout;
}

// Parse `adb shell wm size`, which prints either:
//   Physical size: 1080x2400
// or, when DPI override is active:
//   Physical size: 1080x2400
//   Override size: 720x1600
// We prefer Override (matches what's actually rendered) and fall back to
// Physical.
async function getScreenSize(serial) {
  const { stdout } = await execFileAsync('adb', ['-s', serial, 'shell', 'wm', 'size'], { timeout: 5000 });
  const override = stdout.match(/Override size:\s*(\d+)x(\d+)/);
  const physical = stdout.match(/Physical size:\s*(\d+)x(\d+)/);
  const m = override || physical;
  if (!m) throw new Error('could not parse screen size');
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

// ---------- Testing helpers ----------

function sh(serial, args, opts = {}) {
  return execFileAsync('adb', ['-s', serial, 'shell', ...args], { timeout: 8000, ...opts });
}

// Rotation: Android maps 0=portrait, 1=landscape-left, 2=portrait-reverse, 3=landscape-right.
// Disabling accelerometer rotation first prevents the OS from snapping back.
async function setRotation(serial, rotation) {
  const r = Number(rotation);
  if (![0, 1, 2, 3].includes(r)) throw new Error('rotation must be 0|1|2|3');
  await sh(serial, ['settings', 'put', 'system', 'accelerometer_rotation', '0']);
  await sh(serial, ['settings', 'put', 'system', 'user_rotation', String(r)]);
  return { rotation: r };
}

async function setDarkMode(serial, on) {
  await sh(serial, ['cmd', 'uimode', 'night', on ? 'yes' : 'no']);
  return { dark: !!on };
}

async function setFontScale(serial, scale) {
  const s = Number(scale);
  if (!(s >= 0.5 && s <= 2.0)) throw new Error('font_scale must be between 0.5 and 2.0');
  await sh(serial, ['settings', 'put', 'system', 'font_scale', String(s)]);
  return { font_scale: s };
}

// Reset override to physical DPI when density is falsy.
async function setDensity(serial, density) {
  if (!density) {
    await sh(serial, ['wm', 'density', 'reset']);
    return { density: 'reset' };
  }
  const d = parseInt(density, 10);
  if (!(d >= 120 && d <= 640)) throw new Error('density must be 120-640 (or empty to reset)');
  await sh(serial, ['wm', 'density', String(d)]);
  return { density: d };
}

async function setWifi(serial, on) {
  await sh(serial, ['svc', 'wifi', on ? 'enable' : 'disable']);
  return { wifi: !!on };
}

async function setMobileData(serial, on) {
  await sh(serial, ['svc', 'data', on ? 'enable' : 'disable']);
  return { data: !!on };
}

async function setShowTouches(serial, on) {
  await sh(serial, ['settings', 'put', 'system', 'show_touches', on ? '1' : '0']);
  return { show_touches: !!on };
}

async function setPointerLocation(serial, on) {
  await sh(serial, ['settings', 'put', 'system', 'pointer_location', on ? '1' : '0']);
  return { pointer_location: !!on };
}

// Battery simulation: set status/level and "unplug" so the device doesn't
// auto-reset from the real charger. `dumpsys battery reset` restores real readings.
async function setBattery(serial, { level, status, reset } = {}) {
  if (reset) {
    await sh(serial, ['dumpsys', 'battery', 'reset']);
    return { battery: 'reset' };
  }
  await sh(serial, ['dumpsys', 'battery', 'unplug']);
  if (level != null) {
    const l = parseInt(level, 10);
    if (!(l >= 0 && l <= 100)) throw new Error('level must be 0-100');
    await sh(serial, ['dumpsys', 'battery', 'set', 'level', String(l)]);
  }
  if (status != null) {
    // 2=charging, 3=discharging, 4=not charging, 5=full
    const s = parseInt(status, 10);
    if (![2, 3, 4, 5].includes(s)) throw new Error('status must be 2|3|4|5');
    await sh(serial, ['dumpsys', 'battery', 'set', 'status', String(s)]);
  }
  return { level, status };
}

async function keyevent(serial, key) {
  // Accept either a numeric keycode or the KEYCODE_* suffix ("HOME", "BACK", ...).
  const code = typeof key === 'number' || /^\d+$/.test(key) ? String(key) : `KEYCODE_${String(key).toUpperCase()}`;
  await sh(serial, ['input', 'keyevent', code]);
  return { key: code };
}

async function inputText(serial, text) {
  if (typeof text !== 'string' || !text.length) throw new Error('text required');
  // `input text` doesn't handle spaces — Android wants them as %s. It also
  // breaks on a handful of shell metacharacters; wrapping in single quotes in
  // the shell arg avoids that since execFile doesn't invoke a shell.
  const escaped = text.replace(/ /g, '%s');
  await sh(serial, ['input', 'text', escaped]);
  return { len: text.length };
}

async function clearAppData(serial, pkg) {
  if (!pkg) throw new Error('package required');
  await sh(serial, ['pm', 'clear', pkg], { timeout: 15000 });
  return { cleared: pkg };
}

async function forceStop(serial, pkg) {
  if (!pkg) throw new Error('package required');
  await sh(serial, ['am', 'force-stop', pkg]);
  return { stopped: pkg };
}

async function launchApp(serial, pkg) {
  if (!pkg) throw new Error('package required');
  await sh(serial, ['monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
  return { launched: pkg };
}

async function listPackages(serial, filter = '') {
  // -3 = third-party only; drops system packages that clutter the picker.
  const args = ['pm', 'list', 'packages', '-3'];
  if (filter) args.push(filter);
  const { stdout } = await sh(serial, args, { timeout: 10000 });
  return stdout
    .split('\n')
    .map((l) => l.trim().replace(/^package:/, ''))
    .filter(Boolean)
    .sort();
}

// Active screen recordings, one per serial. `adb shell screenrecord` writes to
// a device path and we pull it on stop.
const recordings = new Map(); // serial -> { proc, devicePath, startedAt }

function startScreenRecord(serial) {
  if (recordings.has(serial)) return { alreadyRunning: true };
  const devicePath = `/sdcard/lens-${Date.now()}.mp4`;
  // screenrecord caps at 180s; we don't pass --time-limit so it uses the default.
  // --bit-rate 4M is readable without being huge.
  const proc = spawn('adb', ['-s', serial, 'shell', 'screenrecord', '--bit-rate', '4000000', devicePath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', () => {});
  recordings.set(serial, { proc, devicePath, startedAt: Date.now() });
  proc.on('exit', () => {
    const entry = recordings.get(serial);
    if (entry && entry.proc === proc) entry.exited = true;
  });
  return { started: true, devicePath };
}

async function stopScreenRecord(serial) {
  const entry = recordings.get(serial);
  if (!entry) throw new Error('no active recording');
  recordings.delete(serial);
  // SIGINT so screenrecord finalizes the mp4 instead of aborting it.
  try { entry.proc.kill('SIGINT'); } catch {}
  // Wait for the file to flush before pulling.
  await new Promise((r) => setTimeout(r, 800));
  const { stdout } = await execFileAsync('adb', ['-s', serial, 'exec-out', 'cat', entry.devicePath], {
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
    timeout: 60000,
  });
  // Clean up device-side file.
  execFileAsync('adb', ['-s', serial, 'shell', 'rm', '-f', entry.devicePath]).catch(() => {});
  return { buffer: stdout, filename: entry.devicePath.split('/').pop() };
}

function screenRecordStatus(serial) {
  const entry = recordings.get(serial);
  if (!entry) return { recording: false };
  return { recording: true, startedAt: entry.startedAt };
}

// Short logcat dump — last N lines, optionally package-filtered via --pid.
async function getLogcat(serial, { lines = 500, pkg = '' } = {}) {
  if (pkg) {
    const { stdout: pidOut } = await sh(serial, ['pidof', pkg], { timeout: 5000 }).catch(() => ({ stdout: '' }));
    const pid = pidOut.trim().split(/\s+/)[0];
    if (!pid) return { log: `(no running process for ${pkg})` };
    const { stdout } = await execFileAsync(
      'adb',
      ['-s', serial, 'logcat', '-d', '-t', String(lines), `--pid=${pid}`],
      { maxBuffer: 16 * 1024 * 1024, timeout: 15000 }
    );
    return { log: stdout };
  }
  const { stdout } = await execFileAsync(
    'adb',
    ['-s', serial, 'logcat', '-d', '-t', String(lines)],
    { maxBuffer: 16 * 1024 * 1024, timeout: 15000 }
  );
  return { log: stdout };
}

// ---------- Wireless debugging ----------
// Android 11+ requires a one-time pair with a 6-digit code before connect.
// The pairing port (usually in the 30000-40000 range) is different from the
// adb connect port (usually 5555 or another 30000+ port shown at the top of
// the Wireless debugging screen). We return adb's stdout/stderr so the UI can
// surface the real failure reason.
async function wifiPair(host, port, code) {
  if (!host) throw new Error('host required');
  if (!port) throw new Error('port required');
  if (!/^\d{6}$/.test(String(code || ''))) throw new Error('code must be 6 digits');
  const target = `${host}:${port}`;
  // Pairing code is read from stdin; execFile doesn't accept input directly,
  // so we use `spawn` + pipe.
  return new Promise((resolve, reject) => {
    const proc = spawn('adb', ['pair', target], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (rc) => {
      const text = (out + err).trim();
      if (rc === 0 && /successfully paired/i.test(text)) resolve({ paired: true, target, message: text });
      else reject(new Error(text || `adb pair exited ${rc}`));
    });
    // `adb pair` prompts "Enter pairing code:" then reads a line.
    proc.stdin.write(`${code}\n`);
    proc.stdin.end();
    setTimeout(() => { try { proc.kill(); } catch {} }, 15000);
  });
}

async function wifiConnect(host, port) {
  if (!host) throw new Error('host required');
  if (!port) throw new Error('port required');
  const target = `${host}:${port}`;
  const { stdout, stderr } = await execFileAsync('adb', ['connect', target], { timeout: 10000 });
  const text = (stdout + stderr).trim();
  // adb exits 0 even when it prints "failed to connect" — inspect the message.
  if (/^connected to/i.test(text) || /already connected/i.test(text)) {
    return { connected: true, target, message: text };
  }
  throw new Error(text || 'adb connect failed');
}

// QR pairing flow (Android 11+):
// The phone's "Pair with QR code" camera expects a payload in the exact shape
// `WIFI:T:ADB;S:<service_name>;P:<password>;;`. When scanned, the phone starts
// broadcasting an mDNS service `_adb-tls-pairing._tcp` whose instance name
// equals our <service_name>. We poll `adb mdns services` to find it, then
// shell `adb pair <host>:<port>` with our <password> on stdin.
//
// Everything here keys off `jobId` so the UI can poll status without a
// websocket. Jobs are kept in memory — restart wipes them.
const qrJobs = new Map(); // jobId -> { state, service, password, target, error, proc }

function startQrPairJob() {
  const jobId = crypto.randomBytes(6).toString('hex');
  const service = `ADB_WIFI_${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(8).toString('hex');
  const payload = `WIFI:T:ADB;S:${service};P:${password};;`;
  const job = {
    jobId,
    state: 'awaiting_scan',
    service,
    password,
    payload,
    target: null,
    error: null,
    startedAt: Date.now(),
  };
  qrJobs.set(jobId, job);
  watchQrJob(job).catch((e) => { job.state = 'error'; job.error = e.message; });
  // Auto-expire after 5 minutes so stale jobs don't hang forever.
  setTimeout(() => {
    if (job.state === 'awaiting_scan' || job.state === 'discovered') {
      job.state = 'expired';
      if (job.proc) try { job.proc.kill(); } catch {}
    }
  }, 5 * 60 * 1000);
  return job;
}

async function watchQrJob(job) {
  // Poll `adb mdns services` every 1s looking for our instance name. The
  // output format is:
  //   ADB_WIFI_abcd1234\t_adb-tls-pairing._tcp\t192.168.1.42:37251
  // Once we see our service, we shell `adb pair` and feed the password.
  const deadline = Date.now() + 4 * 60 * 1000; // 4min window to scan
  while (Date.now() < deadline) {
    if (job.state === 'expired' || job.state === 'error') return;
    try {
      const { stdout } = await execFileAsync('adb', ['mdns', 'services'], { timeout: 5000 });
      const lines = stdout.split('\n');
      const match = lines.find((l) => l.includes(job.service) && l.includes('_adb-tls-pairing'));
      if (match) {
        // Last whitespace-separated token is host:port.
        const target = match.trim().split(/\s+/).pop();
        job.target = target;
        job.state = 'pairing';
        await pairWithPassword(target, job.password);
        job.state = 'paired';
        // Most phones auto-appear in `adb devices` after pairing (they also
        // broadcast _adb-tls-connect._tcp which adb picks up automatically).
        return;
      }
    } catch {} // swallow — will retry
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (job.state === 'awaiting_scan') {
    job.state = 'expired';
    job.error = 'Timed out waiting for scan (4 min).';
  }
}

function pairWithPassword(target, password) {
  return new Promise((resolve, reject) => {
    const proc = spawn('adb', ['pair', target], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (rc) => {
      const text = (out + err).trim();
      if (rc === 0 && /successfully paired/i.test(text)) resolve({ message: text });
      else reject(new Error(text || `adb pair exited ${rc}`));
    });
    proc.stdin.write(`${password}\n`);
    proc.stdin.end();
    setTimeout(() => { try { proc.kill(); } catch {} }, 20000);
  });
}

function getQrJob(jobId) {
  const job = qrJobs.get(jobId);
  if (!job) return null;
  // Don't leak the password to the client — the QR image embeds it already.
  const { password, proc, ...safe } = job;
  return safe;
}

function cancelQrJob(jobId) {
  const job = qrJobs.get(jobId);
  if (!job) return false;
  job.state = 'expired';
  if (job.proc) try { job.proc.kill(); } catch {}
  qrJobs.delete(jobId);
  return true;
}

async function wifiDisconnect(target) {
  const args = ['disconnect'];
  if (target) args.push(target);
  const { stdout, stderr } = await execFileAsync('adb', args, { timeout: 5000 });
  return { message: (stdout + stderr).trim() };
}

async function clearLogcat(serial) {
  await execFileAsync('adb', ['-s', serial, 'logcat', '-c'], { timeout: 5000 });
  return { ok: true };
}

function closeAll() {
  for (const [, proc] of scrcpyProcs) {
    try { proc.kill('SIGTERM'); } catch {}
  }
  scrcpyProcs.clear();
  for (const [, entry] of recordings) {
    try { entry.proc.kill('SIGINT'); } catch {}
  }
  recordings.clear();
}

module.exports = {
  listDevices,
  launchScrcpy,
  closeScrcpy,
  openUrl,
  screenshot,
  getScreenSize,
  setRotation,
  setDarkMode,
  setFontScale,
  setDensity,
  setWifi,
  setMobileData,
  setShowTouches,
  setPointerLocation,
  setBattery,
  keyevent,
  inputText,
  clearAppData,
  forceStop,
  launchApp,
  listPackages,
  startScreenRecord,
  stopScreenRecord,
  screenRecordStatus,
  getLogcat,
  clearLogcat,
  wifiPair,
  wifiConnect,
  wifiDisconnect,
  startQrPairJob,
  getQrJob,
  cancelQrJob,
  closeAll,
};
