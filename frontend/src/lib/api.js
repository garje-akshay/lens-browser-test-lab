// Backend URL resolution, in priority order:
//   1. localStorage 'lens.backendUrl' — set by the user via the "Connect backend"
//      UI, so anyone using the hosted frontend can point it at their own tunnel.
//   2. NEXT_PUBLIC_BACKEND_URL — baked-in default for local dev.
//   3. http://localhost:4000 — last-resort fallback.
const ENV_BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const LS_KEY = 'lens.backendUrl';

export function getBackendUrl() {
  if (typeof window !== 'undefined') {
    const v = window.localStorage.getItem(LS_KEY);
    if (v) return v.replace(/\/+$/, '');
  }
  return ENV_BACKEND.replace(/\/+$/, '');
}

export function setBackendUrl(url) {
  if (typeof window === 'undefined') return;
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean) window.localStorage.setItem(LS_KEY, clean);
  else window.localStorage.removeItem(LS_KEY);
  // Let any listener (DeviceSidebar, AdbDeviceFrame) rebuild against the
  // new target.
  window.dispatchEvent(new CustomEvent('lens:backend-changed'));
}

async function j(res) {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

const b = () => getBackendUrl();

export const api = {
  health: (signal) =>
    fetch(`${b()}/health`, { signal }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),

  listAdbDevices: () => fetch(`${b()}/api/adb/devices`).then(j),
  adbSize: (serial) =>
    fetch(`${b()}/api/adb/size/${encodeURIComponent(serial)}`).then(j),
  adbNavigate: (serial, url) =>
    fetch(`${b()}/api/adb/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, url }),
    }).then(j),

  adbDevtoolsAttach: (serial) =>
    fetch(`${b()}/api/adb/devtools/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial }),
    }).then(j),
  adbDevtoolsDetach: (serial) =>
    fetch(`${b()}/api/adb/devtools/detach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial }),
    }).then(j),
  adbDevtoolsEntries: (serial) =>
    fetch(`${b()}/api/adb/devtools/${encodeURIComponent(serial)}/entries`).then(j),
  adbDevtoolsClear: (serial) =>
    fetch(`${b()}/api/adb/devtools/${encodeURIComponent(serial)}/clear`, { method: 'POST' }).then(j),
  adbDevtoolsHarUrl: (serial) =>
    `${b()}/api/adb/devtools/${encodeURIComponent(serial)}/har`,

  // ---------- Testing controls ----------
  adbControl: (serial, action, body = {}) =>
    fetch(`${b()}/api/adb/${encodeURIComponent(serial)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),
  adbListPackages: (serial, filter = '') =>
    fetch(
      `${b()}/api/adb/${encodeURIComponent(serial)}/packages${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`
    ).then(j),
  adbLogcat: (serial, { lines = 500, pkg = '' } = {}) => {
    const qs = new URLSearchParams();
    if (lines) qs.set('lines', String(lines));
    if (pkg) qs.set('package', pkg);
    return fetch(`${b()}/api/adb/${encodeURIComponent(serial)}/logcat?${qs.toString()}`).then(j);
  },
  adbRecordStopUrl: (serial) =>
    `${b()}/api/adb/${encodeURIComponent(serial)}/record/stop`,

  adbWifiPair: (host, port, code) =>
    fetch(`${b()}/api/adb/wifi/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, code }),
    }).then(j),
  adbWifiConnect: (host, port) =>
    fetch(`${b()}/api/adb/wifi/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port }),
    }).then(j),
  adbWifiDisconnect: (target) =>
    fetch(`${b()}/api/adb/wifi/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    }).then(j),
};
