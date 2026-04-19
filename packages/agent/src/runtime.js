const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const tar = require('tar');
const {
  DATA_DIR, WS_SCRCPY_DIR, LOG_DIR, PID_FILE,
  ensureDirs, writeState, readState,
} = require('./paths');

const execFileAsync = promisify(execFile);

const WS_SCRCPY_VERSION = '0.8.1';
const WS_SCRCPY_URL =
  `https://github.com/NetrisTV/ws-scrcpy/archive/refs/tags/v${WS_SCRCPY_VERSION}.tar.gz`;

const BACKEND_PORT = 4000;
const WSSCRCPY_PORT = 8000;

// Homebrew installs to /opt/homebrew (Apple Silicon) or /usr/local (Intel);
// include both so prereq detection and spawned children find their tools
// even when launched outside a login shell (Finder, launchd).
//
// ws-scrcpy 0.8.1 pulls node-pty 0.10.1 which doesn't compile against newer
// V8 APIs (fails on Node 22+). Pin its runtime to node@20 via keg-only
// prefixes so users who already have a newer `node` on PATH still get a
// working ws-scrcpy. `brew install node@20` is declared as a formula dep.
const BREW_PATHS = [
  '/opt/homebrew/opt/node@20/bin',
  '/usr/local/opt/node@20/bin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
];

function brewEnv(extra = {}) {
  const PATH = [...BREW_PATHS, process.env.PATH || ''].join(':');
  return { ...process.env, ...extra, PATH };
}

async function resolveBin(name) {
  for (const d of BREW_PATHS) {
    const p = `${d}/${name}`;
    if (fs.existsSync(p)) return p;
  }
  return name;
}

// ---------- external binary checks ----------

function hasBin(name) {
  const dirs = [...BREW_PATHS, '/usr/bin', '/bin'];
  return dirs.some((d) => fs.existsSync(`${d}/${name}`));
}

async function checkPrereqs() {
  const missing = [];
  if (!hasBin('adb')) missing.push('adb (android-platform-tools)');
  if (!hasBin('cloudflared')) missing.push('cloudflared');
  // `node` is only required for the dev-mode flow where we spawn the backend
  // as a child process. In the pkg binary we run the backend in-process.
  if (!process.pkg && !hasBin('node')) missing.push('node (>=18)');
  return missing;
}

// ---------- ws-scrcpy first-run install ----------

async function ensureWsScrcpy(log) {
  const markerFile = path.join(WS_SCRCPY_DIR, '.installed');
  if (fs.existsSync(markerFile)) return WS_SCRCPY_DIR;

  log(`ws-scrcpy not found — installing v${WS_SCRCPY_VERSION} (~30 MB)…`);
  fs.mkdirSync(WS_SCRCPY_DIR, { recursive: true });

  const tarballPath = path.join(DATA_DIR, `ws-scrcpy-${WS_SCRCPY_VERSION}.tar.gz`);
  await download(WS_SCRCPY_URL, tarballPath);
  log('Downloaded. Extracting…');

  await tar.x({ file: tarballPath, cwd: WS_SCRCPY_DIR, strip: 1 });
  fs.unlinkSync(tarballPath);

  log('Installing ws-scrcpy npm dependencies (this takes ~2 min)…');
  // npm is a #!/usr/bin/env node script — pkg can't interpret shebangs, so we
  // invoke `node /opt/homebrew/bin/npm …` with the Node binary resolved first.
  const nodeBin = await resolveBin('node');
  const npmBin = await resolveBin('npm');
  await runBlocking(nodeBin, [npmBin, 'install', '--no-audit', '--no-fund'], { cwd: WS_SCRCPY_DIR });

  // Patch upstream bug: ws-scrcpy invokes scrcpy-server with a redirect in the
  // wrong order (`2>&1 >/dev/null`), which sends stderr to the terminal fd and
  // kills the process once adb shell detaches. Swap to `>/dev/null 2>&1`.
  patchWsScrcpyRedirect(log);

  fs.writeFileSync(markerFile, WS_SCRCPY_VERSION);
  log('ws-scrcpy ready.');
  return WS_SCRCPY_DIR;
}

function patchWsScrcpyRedirect(log) {
  const distPath = path.join(WS_SCRCPY_DIR, 'dist', 'index.js');
  if (!fs.existsSync(distPath)) return;
  const before = fs.readFileSync(distPath, 'utf8');
  const after = before
    .replace(/2>&1 >\/dev\/null/g, '>/dev/null 2>&1')
    .replace(/2>&1 > \/dev\/null/g, '> /dev/null 2>&1');
  if (after !== before) {
    fs.writeFileSync(distPath, after);
    log('Patched ws-scrcpy scrcpy-server launch redirect.');
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = (u) => https.get(u, { headers: { 'user-agent': 'lens-agent' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return req(res.headers.location);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${u}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
    req(url);
  });
}

function runBlocking(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts, env: brewEnv(opts.env) });
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
    p.on('error', reject);
  });
}

// ---------- process orchestration ----------

function startChild(name, cmd, args, { cwd, env } = {}) {
  const logPath = path.join(LOG_DIR, `${name}.log`);
  const out = fs.openSync(logPath, 'a');
  const err = fs.openSync(logPath, 'a');
  // detached:true puts the child in its own process group; on stop we signal
  // -pid so npm-wrapped children (ws-scrcpy) don't orphan their node child.
  const child = spawn(cmd, args, {
    cwd, env: brewEnv(env),
    stdio: ['ignore', out, err],
    detached: true,
  });
  child.unref();
  child.on('error', (e) => {
    fs.appendFileSync(logPath, `\n[spawn error] ${e.message}\n`);
  });
  return { child, logPath };
}

async function waitForTunnelUrl(logPath, timeoutMs = 30000) {
  // Logs are append-only across restarts, so the file may contain URLs from
  // previous runs. Only scan content written after this call began, and
  // return the LAST match (most recent) rather than the first.
  const startOffset = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(logPath)) {
      const fd = fs.openSync(logPath, 'r');
      try {
        const size = fs.fstatSync(fd).size;
        if (size > startOffset) {
          const buf = Buffer.alloc(size - startOffset);
          fs.readSync(fd, buf, 0, buf.length, startOffset);
          const matches = buf.toString('utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
          if (matches && matches.length) return matches[matches.length - 1];
        }
      } finally {
        fs.closeSync(fd);
      }
    }
    await sleep(500);
  }
  throw new Error('Timed out waiting for cloudflared to publish a tunnel URL');
}

async function waitForHealth(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`Timed out waiting for backend on :${port}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function portInUse(port) {
  try {
    await execFileAsync('lsof', ['-i', `tcp:${port}`, '-sTCP:LISTEN']);
    return true;
  } catch { return false; }
}

// The pkg binary bundles the entire backend (src + node_modules) inside its
// snapshot. Rather than copy files out and spawn external `node`, we require
// the backend in-process — it exports `startBackend({ port })`. In dev we fall
// back to spawning the sibling workspace so the backend can be iterated on.
function startBackendInProcess() {
  process.env.ADB_ENABLED = '1';
  process.env.PORT = String(BACKEND_PORT);
  // eslint-disable-next-line global-require
  const backend = require('../../../backend/src/server.js');
  return backend.start ? backend.start() : undefined;
}

// ---------- commands ----------

async function start({ quiet } = {}) {
  ensureDirs();

  if (fs.existsSync(PID_FILE)) {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
    if (isAlive(pid)) {
      const state = readState();
      console.log(`Agent already running (pid ${pid}).`);
      if (state.tunnelUrl) console.log(`Tunnel: ${state.tunnelUrl}`);
      return;
    }
    fs.unlinkSync(PID_FILE);
  }

  const log = quiet ? () => {} : (m) => console.log(`[lens] ${m}`);

  const missing = await checkPrereqs();
  if (missing.length) {
    console.error(`Missing prerequisites: ${missing.join(', ')}`);
    console.error('Install with: brew install android-platform-tools cloudflared node');
    process.exit(1);
  }

  for (const p of [BACKEND_PORT, WSSCRCPY_PORT]) {
    if (await portInUse(p)) {
      console.error(`Port ${p} is already in use. Stop the process holding it, then retry.`);
      process.exit(1);
    }
  }

  const wsScrcpyDir = await ensureWsScrcpy(log);

  log('Starting backend…');
  let backendPid;
  if (process.pkg) {
    // Backend runs in-process: pkg can't re-exec itself with custom argv and
    // can't spawn external `node` against bundled sources, so hosting it
    // in-process is the only option. The listening HTTP server keeps the
    // agent's event loop alive, which means `start` blocks until Ctrl-C or
    // SIGTERM — this is fine: `lens-agent start` is designed to be a
    // foreground command.
    startBackendInProcess();
    backendPid = process.pid;
  } else {
    const nodeBin = process.execPath;
    const backendEntry = path.resolve(__dirname, '../../..', 'backend/src/server.js');
    const backend = startChild('backend', nodeBin, [backendEntry], {
      env: { ADB_ENABLED: '1', PORT: String(BACKEND_PORT) },
    });
    backendPid = backend.child.pid;
  }
  await waitForHealth(BACKEND_PORT);

  log('Starting ws-scrcpy…');
  const nodeBin = await resolveBin('node');
  const npmBin = await resolveBin('npm');
  const ws = startChild('ws-scrcpy', nodeBin, [npmBin, 'start'], { cwd: wsScrcpyDir });

  log('Starting tunnel…');
  const cfBin = await resolveBin('cloudflared');
  const tunnel = startChild('tunnel', cfBin, [
    'tunnel', '--url', `http://127.0.0.1:${BACKEND_PORT}`,
  ]);
  const tunnelUrl = await waitForTunnelUrl(tunnel.logPath);

  writeState({
    tunnelUrl,
    pids: { backend: backendPid, wsScrcpy: ws.child.pid, tunnel: tunnel.child.pid },
    startedAt: new Date().toISOString(),
  });
  fs.writeFileSync(PID_FILE, String(process.pid));

  console.log('');
  console.log('  \x1b[32m✓\x1b[0m Lens agent is running');
  console.log('');
  console.log(`  Tunnel URL:  \x1b[1m${tunnelUrl}\x1b[0m`);
  console.log('  Paste this into the cloud icon at https://lens.knicklab.com');
  console.log('');
  console.log('  Logs:  ~/.lens/logs/');
  console.log('  Stop:  Ctrl-C here (or `lens-agent stop` from another shell)');
  console.log('');

  if (process.pkg) {
    // The backend's http.listen keeps the event loop alive on its own, but we
    // still need to clean up the detached ws-scrcpy + tunnel children when
    // the user hits Ctrl-C in this terminal.
    const cleanup = () => {
      console.log('\n[lens] shutting down…');
      stop().then(() => process.exit(0)).catch(() => process.exit(1));
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

// When the pkg binary re-spawns itself with LENS_HOST_BACKEND=1, it becomes
// the backend host — load server.js in-process and block on its HTTP server.
function isBackendHostInvocation() {
  return process.env.LENS_HOST_BACKEND === '1';
}

function hostBackend() {
  startBackendInProcess();
}

async function stop() {
  const state = readState();
  const pids = state.pids || {};
  for (const [name, pid] of Object.entries(pids)) {
    try { process.kill(-pid, 'SIGTERM'); console.log(`stopped ${name} (pid ${pid})`); }
    catch {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  }
  try { fs.unlinkSync(PID_FILE); } catch {}
  writeState({ pids: {}, tunnelUrl: null, stoppedAt: new Date().toISOString() });
}

function status() {
  const state = readState();
  const pids = state.pids || {};
  const alive = Object.entries(pids).map(([n, p]) => `  ${n}: pid ${p} — ${isAlive(p) ? '\x1b[32mrunning\x1b[0m' : '\x1b[31mdead\x1b[0m'}`);
  console.log('');
  console.log(`  Tunnel:     ${state.tunnelUrl || '(not running)'}`);
  console.log(`  Started:    ${state.startedAt || '—'}`);
  if (alive.length) console.log(alive.join('\n'));
  console.log('');
}

function url() {
  const state = readState();
  if (!state.tunnelUrl) {
    console.error('Agent not running. Start it with: lens-agent start');
    process.exit(1);
  }
  console.log(state.tunnelUrl);
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

module.exports = {
  start, stop, status, url, checkPrereqs,
  isBackendHostInvocation, hostBackend,
};
