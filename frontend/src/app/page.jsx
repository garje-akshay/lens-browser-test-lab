'use client';
import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import TopBar from '../components/TopBar';
import DeviceSidebar from '../components/DeviceSidebar';
import DeviceGrid from '../components/DeviceGrid';
import { useLabStore } from '../store/useLabStore';

export default function Page() {
  const theme = useLabStore((s) => s.theme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <DeviceSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
        <Box
          sx={{
            flex: 1, overflow: 'auto',
            bgcolor: 'background.default',
            backgroundImage: (t) => t.palette.mode === 'dark'
              ? 'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.08), transparent 40%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.06), transparent 40%)'
              : 'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.06), transparent 40%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.05), transparent 40%)',
          }}
        >
          <DeviceGrid />
        </Box>
      </Box>
    </Box>
  );
}
