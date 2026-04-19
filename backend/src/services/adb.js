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

function closeAll() {
  for (const [, proc] of scrcpyProcs) {
    try { proc.kill('SIGTERM'); } catch {}
  }
  scrcpyProcs.clear();
}

module.exports = { listDevices, launchScrcpy, closeScrcpy, openUrl, screenshot, getScreenSize, closeAll };
