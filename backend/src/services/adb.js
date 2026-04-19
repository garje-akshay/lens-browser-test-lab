const { spawn, execFile } = require('child_process');
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
  closeAll,
};
