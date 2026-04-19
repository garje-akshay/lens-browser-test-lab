const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
export const BACKEND_URL = BACKEND;
export const BACKEND_WS = process.env.NEXT_PUBLIC_BACKEND_WS || 'ws://localhost:4000';

async function j(res) {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export const api = {
  createSession: (deviceId, url, networkProfile) =>
    fetch(`${BACKEND}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, url, networkProfile }),
    }).then(j),

  navigate: (id, url) =>
    fetch(`${BACKEND}/api/sessions/${id}/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).then(j),

  reload: (id) =>
    fetch(`${BACKEND}/api/sessions/${id}/reload`, { method: 'POST' }).then(j),

  setNetwork: (id, profile) =>
    fetch(`${BACKEND}/api/sessions/${id}/network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    }).then(j),

  screenshotUrl: (id) => `${BACKEND}/api/sessions/${id}/screenshot`,

  close: (id) => fetch(`${BACKEND}/api/sessions/${id}`, { method: 'DELETE' }).then(j),

  clearLogs: (id) => fetch(`${BACKEND}/api/sessions/${id}/logs`, { method: 'DELETE' }).then(j),

  proxyUrl: (url) => `${BACKEND}/proxy/fetch?url=${encodeURIComponent(url)}`,

  probeProxy: (url, signal) =>
    fetch(`${BACKEND}/proxy/probe?url=${encodeURIComponent(url)}`, { signal })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        return { ok: r.ok && data.ok !== false, error: data.error };
      }),
};
