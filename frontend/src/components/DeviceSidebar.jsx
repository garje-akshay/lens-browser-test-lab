'use client';
import { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, IconButton, Chip, Tooltip, ListItemButton, ListItemText, Divider,
} from '@mui/material';
import AndroidIcon from '@mui/icons-material/Android';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useLabStore } from '../store/useLabStore';
import { api } from '../lib/api';

// Lists real Android devices reported by the backend's `adb devices`. Auto-
// refreshes every 4s so plugging/unplugging a phone is reflected without a
// manual reload. No presets, no iframes — if the backend isn't reachable or
// ADB isn't enabled, we surface that state instead of pretending.

export default function DeviceSidebar({ collapsed, onToggle }) {
  const adbDevices = useLabStore((s) => s.adbDevices);
  const setAdbDevices = useLabStore((s) => s.setAdbDevices);
  const selectedAdbSerials = useLabStore((s) => s.selectedAdbSerials);
  const toggleAdbDevice = useLabStore((s) => s.toggleAdbDevice);

  const [state, setState] = useState({ enabled: null, error: null, loaded: false });

  const refresh = async () => {
    try {
      const r = await api.listAdbDevices();
      setState({ enabled: !!r.enabled, error: r.error || null, loaded: true });
      setAdbDevices(r.devices || []);
    } catch (e) {
      setState({ enabled: false, error: e.message || 'Backend unreachable', loaded: true });
      setAdbDevices([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const tick = async () => { if (!cancelled) await refresh(); };
    tick();
    const id = setInterval(tick, 4000);
    const onBackendChange = () => tick();
    window.addEventListener('lens:backend-changed', onBackendChange);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('lens:backend-changed', onBackendChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (collapsed) {
    return (
      <Box sx={{ width: 48, flexShrink: 0, borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1 }}>
        <Tooltip title="Open devices" placement="right">
          <IconButton onClick={onToggle} size="small"><MenuOpenIcon sx={{ transform: 'rotate(180deg)' }} /></IconButton>
        </Tooltip>
        <Chip label={adbDevices.length} size="small" color="success" sx={{ mt: 1 }} />
      </Box>
    );
  }

  return (
    <Box sx={{
      width: 280, flexShrink: 0, borderRight: 1, borderColor: 'divider',
      bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <AndroidIcon sx={{ color: '#3ddc84', fontSize: 18 }} />
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1 }}>Devices</Typography>
          <Chip label={adbDevices.length} size="small" color={adbDevices.length ? 'success' : 'default'} />
        </Stack>
        <Stack direction="row">
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={refresh}><RefreshIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Collapse sidebar">
            <IconButton size="small" onClick={onToggle}><MenuOpenIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Divider />

      <Box sx={{ overflowY: 'auto', flex: 1, py: 0.5 }}>
        {!state.loaded && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography variant="caption" color="text.secondary">Contacting backend…</Typography>
          </Box>
        )}

        {state.loaded && !state.enabled && (
          <Box sx={{ px: 2, py: 2 }}>
            <Stack direction="row" gap={1} alignItems="flex-start">
              <WarningAmberIcon sx={{ color: 'warning.main', fontSize: 18, mt: 0.25 }} />
              <Box>
                <Typography variant="body2" fontWeight={600}>Backend not ready</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>
                  {state.error
                    ? `Can't reach your backend (${state.error}). Check the cloud icon top-right.`
                    : 'ADB is disabled on this backend. Run it locally with ADB_ENABLED=1 and point the cloud icon at its tunnel URL.'}
                </Typography>
              </Box>
            </Stack>
          </Box>
        )}

        {state.loaded && state.enabled && adbDevices.length === 0 && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography variant="body2" fontWeight={600}>No devices</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>
              Plug in an Android phone (with USB debugging on) or start an emulator. It will show up here automatically.
            </Typography>
          </Box>
        )}

        {adbDevices.map((d) => {
          const isOn = selectedAdbSerials.includes(d.serial);
          return (
            <ListItemButton
              key={d.serial}
              onClick={() => toggleAdbDevice(d.serial)}
              selected={isOn}
              sx={{ px: 2, py: 1 }}
            >
              <AndroidIcon fontSize="small" sx={{ color: '#3ddc84', mr: 1.5 }} />
              <ListItemText
                primary={d.model || d.serial}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                secondary={d.serial}
                secondaryTypographyProps={{ variant: 'caption', sx: { opacity: 0.7 } }}
              />
              {isOn && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main' }} />}
            </ListItemButton>
          );
        })}
      </Box>
    </Box>
  );
}
