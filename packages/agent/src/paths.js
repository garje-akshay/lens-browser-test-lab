const os = require('os');
const path = require('path');
const fs = require('fs');

// All agent state lives under ~/.lens — keeps Homebrew / pkg binaries stateless
// and makes "reset to defaults" trivial (rm -rf ~/.lens).
const HOME = os.homedir();
const DATA_DIR = path.join(HOME, '.lens');
const WS_SCRCPY_DIR = path.join(DATA_DIR, 'ws-scrcpy');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const PID_FILE = path.join(DATA_DIR, 'agent.pid');

function ensureDirs() {
  for (const d of [DATA_DIR, LOG_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}

function writeState(patch) {
  const cur = readState();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...cur, ...patch }, null, 2));
}

module.exports = {
  DATA_DIR, WS_SCRCPY_DIR, STATE_FILE, LOG_DIR, PID_FILE,
  ensureDirs, readState, writeState,
};
