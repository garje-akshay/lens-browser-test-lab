'use client';
import { create } from 'zustand';

// ADB-only state. Pure real-device testing — no iframe presets, no networking
// profiles, no global URL "go" (that was an iframe-mode concept). Per-device
// URL push happens inline from AdbDeviceFrame via api.adbNavigate.

export const useLabStore = create((set, get) => ({
  theme: 'dark',
  pendingUrl: '',           // URL field in the toolbar (pushed to a device)
  lastPushedUrl: '',

  // Real Android devices reported by /api/adb/devices. The sidebar reads from
  // this; the grid renders every serial in `selectedAdbSerials`.
  adbDevices: [],
  selectedAdbSerials: [],

  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  },

  setPendingUrl: (pendingUrl) => set({ pendingUrl }),
  commitUrl: () => set({ lastPushedUrl: get().pendingUrl }),

  setAdbDevices: (adbDevices) => set({ adbDevices }),
  toggleAdbDevice: (serial) =>
    set((s) => {
      const cur = new Set(s.selectedAdbSerials);
      cur.has(serial) ? cur.delete(serial) : cur.add(serial);
      return { selectedAdbSerials: [...cur] };
    }),
}));
