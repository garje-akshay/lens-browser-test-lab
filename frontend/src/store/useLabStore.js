'use client';
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

// Central state.
//
// Global defaults live at the top level (url, networkProfile, orientation,
// useProxy, mode, theme). Each device can override any of those via
// `deviceConfigs[deviceId]`. A selector hook (`useDeviceConfig`) returns the
// effective config for a device by merging global + overrides with shallow
// equality so components don't re-render unless the merged value changes.
//
// `scrollBroadcast` is deliberately NOT in the store — broadcasting on every
// wheel tick through Zustand would force every subscriber to re-evaluate.
// Instead we use a tiny pub/sub (see scrollBus at bottom).

export const useLabStore = create((set, get) => ({
  // ---- global defaults ----
  url: 'https://example.com',
  pendingUrl: 'https://example.com',
  mode: 'iframe',
  theme: 'dark',
  orientation: 'portrait',
  networkProfile: 'online',
  useProxy: true,
  syncScroll: false,

  // ---- selection + per-device state ----
  selectedDeviceIds: [],
  sessions: {},
  deviceConfigs: {},
  deviceReloadTicks: {},

  reloadTick: 0,

  setPendingUrl: (pendingUrl) => set({ pendingUrl }),
  commitUrl: () => {
    const u = normalizeUrl(get().pendingUrl);
    set((s) => ({ url: u, pendingUrl: u, reloadTick: s.reloadTick + 1 }));
  },
  reload: () => set((s) => ({ reloadTick: s.reloadTick + 1 })),

  setMode: (mode) => set({ mode }),
  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  },
  setOrientation: (orientation) => set({ orientation }),
  setNetworkProfile: (networkProfile) => set({ networkProfile }),
  setUseProxy: (useProxy) => set({ useProxy }),
  setSyncScroll: (syncScroll) => set({ syncScroll }),

  toggleDevice: (deviceId) =>
    set((s) => {
      const cur = new Set(s.selectedDeviceIds);
      cur.has(deviceId) ? cur.delete(deviceId) : cur.add(deviceId);
      const nextConfigs = { ...s.deviceConfigs };
      if (!cur.has(deviceId)) delete nextConfigs[deviceId];
      return { selectedDeviceIds: [...cur], deviceConfigs: nextConfigs };
    }),

  setSession: (deviceId, sessionId) =>
    set((s) => ({ sessions: { ...s.sessions, [deviceId]: sessionId } })),
  clearSession: (deviceId) =>
    set((s) => {
      const copy = { ...s.sessions };
      delete copy[deviceId];
      return { sessions: copy };
    }),

  setDeviceOverride: (deviceId, patch) =>
    set((s) => {
      const cur = s.deviceConfigs[deviceId] || {};
      const next = { ...cur, ...patch };
      Object.keys(patch).forEach((k) => {
        if (patch[k] === undefined) delete next[k];
      });
      return { deviceConfigs: { ...s.deviceConfigs, [deviceId]: next } };
    }),
  clearDeviceOverrides: (deviceId) =>
    set((s) => {
      const copy = { ...s.deviceConfigs };
      delete copy[deviceId];
      return { deviceConfigs: copy };
    }),
  reloadDevice: (deviceId) =>
    set((s) => ({
      deviceReloadTicks: {
        ...s.deviceReloadTicks,
        [deviceId]: (s.deviceReloadTicks[deviceId] || 0) + 1,
      },
    })),

  applyGlobalToAll: () =>
    set((s) => {
      const snapshot = {
        url: s.url,
        orientation: s.orientation,
        networkProfile: s.networkProfile,
        useProxy: s.useProxy,
      };
      const next = { ...s.deviceConfigs };
      for (const id of s.selectedDeviceIds) next[id] = { ...snapshot };
      return { deviceConfigs: next, reloadTick: s.reloadTick + 1 };
    }),
  clearAllOverrides: () => set({ deviceConfigs: {} }),

  shareUrl: () => {
    const { url, mode, selectedDeviceIds, networkProfile, orientation, deviceConfigs } = get();
    const payload = { url, mode, selectedDeviceIds, networkProfile, orientation, deviceConfigs };
    const hash = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return `${location.origin}${location.pathname}#s=${hash}`;
  },
  hydrateFromHash: () => {
    if (typeof window === 'undefined') return;
    const m = window.location.hash.match(/#s=([^&]+)/);
    if (!m) return;
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      // Emulator mode is temporarily disabled — force iframe for any shared
      // links that captured mode: 'real' before the feature was shipped.
      if (data.mode === 'real') data.mode = 'iframe';
      set((s) => ({ ...s, ...data, pendingUrl: data.url || s.pendingUrl }));
    } catch {}
  },
}));

// Hook with shallow-equal: components only re-render when the effective
// merged config actually changes field-by-field.
export function useDeviceConfig(deviceId) {
  return useLabStore(
    (s) => {
      const o = s.deviceConfigs[deviceId] || {};
      return {
        url: o.url ?? s.url,
        orientation: o.orientation ?? s.orientation,
        networkProfile: o.networkProfile ?? s.networkProfile,
        useProxy: o.useProxy ?? s.useProxy,
        reloadTick: (s.deviceReloadTicks[deviceId] || 0) + s.reloadTick,
        urlOverridden: 'url' in o,
        orientationOverridden: 'orientation' in o,
        networkProfileOverridden: 'networkProfile' in o,
        useProxyOverridden: 'useProxy' in o,
      };
    },
    shallow
  );
}

// Pub/sub for sync-scroll so wheel events don't storm the store and
// force re-renders on every subscribed component.
const scrollListeners = new Set();
export const scrollBus = {
  publish(x, y) {
    for (const fn of scrollListeners) fn(x, y);
  },
  subscribe(fn) {
    scrollListeners.add(fn);
    return () => scrollListeners.delete(fn);
  },
};

function normalizeUrl(input) {
  const s = (input || '').trim();
  if (!s) return 'https://example.com';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
