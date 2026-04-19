'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import TopBar from '../components/TopBar';
import ViewBar from '../components/ViewBar';
import DeviceSidebar from '../components/DeviceSidebar';
import DeviceGrid from '../components/DeviceGrid';
import CommandPalette from '../components/CommandPalette';
import { useLabStore } from '../store/useLabStore';

export default function Page() {
  const hydrateFromHash = useLabStore((s) => s.hydrateFromHash);
  const theme = useLabStore((s) => s.theme);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const gridRef = useRef(null);

  useEffect(() => { hydrateFromHash(); }, [hydrateFromHash]);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen]);

  const onCapture = useCallback(() => {
    gridRef.current?.captureAll?.();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar onOpenShortcuts={() => setPaletteOpen(true)} />
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <DeviceSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <ViewBar onCapture={onCapture} />
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              bgcolor: 'background.default',
              backgroundImage: (t) => t.palette.mode === 'dark'
                ? 'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.08), transparent 40%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.06), transparent 40%)'
                : 'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.06), transparent 40%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.05), transparent 40%)',
            }}
          >
            <DeviceGrid ref={gridRef} />
          </Box>
        </Box>
      </Box>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </Box>
  );
}
