'use client';
import { forwardRef, memo, useCallback, useImperativeHandle, useMemo } from 'react';
import {
  Box, Stack, Typography, Button, Chip, Paper,
} from '@mui/material';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import VerifiedIcon from '@mui/icons-material/Verified';
import StraightenIcon from '@mui/icons-material/Straighten';
import TabletIcon from '@mui/icons-material/Tablet';
import LaunchIcon from '@mui/icons-material/Launch';
import { useLabStore } from '../store/useLabStore';
import { DEVICES } from '../config/devices';
import IframeDeviceFrame from './IframeDeviceFrame';
import RealDeviceFrame from './RealDeviceFrame';
import { downloadPng } from '../lib/download';
import { api } from '../lib/api';

const DEVICE_BY_ID = new Map(DEVICES.map((d) => [d.id, d]));

const canvasSx = { p: { xs: 2, md: 4 }, minHeight: '100%' };
const framesStackSx = { gap: { xs: 3, md: 5 }, rowGap: 5 };

const DeviceGrid = forwardRef(function DeviceGrid(_props, ref) {
  const selectedDeviceIds = useLabStore((s) => s.selectedDeviceIds);
  const mode = useLabStore((s) => s.mode);

  const selected = useMemo(
    () => selectedDeviceIds.map((id) => DEVICE_BY_ID.get(id)).filter(Boolean),
    [selectedDeviceIds]
  );

  const captureAll = useCallback(async () => {
    const { sessions, url, networkProfile } = useLabStore.getState();
    if (mode === 'real') {
      const active = selected.map((d) => [d, sessions[d.id]]).filter(([, sid]) => !!sid);
      for (const [d, sid] of active) downloadPng(api.screenshotUrl(sid), `${d.id}.png`);
      return;
    }
    const host = (() => {
      try { return new URL(url).hostname.replace(/[^a-z0-9]+/gi, '_'); }
      catch { return 'page'; }
    })();
    for (const d of selected) {
      try {
        const { sessionId } = await api.createSession(d.id, url, networkProfile);
        await new Promise((r) => setTimeout(r, 1200));
        downloadPng(api.screenshotUrl(sessionId), `${host}-${d.id}.png`);
        setTimeout(() => api.close(sessionId).catch(() => {}), 2000);
      } catch {}
    }
  }, [mode, selected]);

  useImperativeHandle(ref, () => ({ captureAll }), [captureAll]);

  if (selected.length === 0) return <EmptyState />;

  return (
    <Box sx={canvasSx}>
      <Stack direction="row" sx={framesStackSx} flexWrap="wrap" alignItems="flex-start">
        {selected.map((d) =>
          mode === 'real' ? (
            <RealDeviceFrame key={d.id} device={d} />
          ) : (
            <IframeDeviceFrame key={d.id} device={d} />
          )
        )}
      </Stack>
    </Box>
  );
});

export default DeviceGrid;

const PRESETS = [
  { label: 'Popular phones', ids: ['iphone-14-pro', 'pixel-7', 'galaxy-s22', 'iphone-se'], icon: PhoneIphoneIcon },
  { label: 'Flagship pair', mode: 'real', ids: ['iphone-15-pro', 'pixel-8'], icon: VerifiedIcon },
  { label: 'Size range', ids: ['iphone-se', 'galaxy-fold', 'iphone-14-pro-max', 'ipad-mini'], icon: StraightenIcon },
  { label: 'Tablets', ids: ['ipad-10', 'ipad-pro-11', 'galaxy-tab-s8'], icon: TabletIcon },
];

const EmptyState = memo(function EmptyState() {
  const toggleDevice = useLabStore((s) => s.toggleDevice);
  const setMode = useLabStore((s) => s.setMode);

  const pick = (ids, m) => {
    const current = useLabStore.getState().selectedDeviceIds;
    current.forEach(toggleDevice);
    ids.forEach(toggleDevice);
    if (m) setMode(m);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Stack alignItems="center" gap={3} sx={{ maxWidth: 720, width: '100%' }}>
        <Stack alignItems="center" gap={1}>
          <Chip
            size="small"
            label="Lens · by KnickLab"
            sx={{
              height: 22, fontWeight: 600, letterSpacing: 0.2,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(34,211,238,0.12))',
              border: (t) => `1px solid ${t.palette.divider}`,
            }}
          />
          <Typography variant="h4" fontWeight={700} textAlign="center">
            Test any URL on every device
          </Typography>
          <Typography component="div" color="text.secondary" textAlign="center" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', justifyContent: 'center' }}>
            Pick a preset to start, or choose devices from the left sidebar. Press
            <Chip size="small" label="⌘K" sx={{ height: 20 }} />
            to search.
          </Typography>
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2, width: '100%' }}>
          {PRESETS.map((p) => {
            const Icon = p.icon;
            return (
              <Paper
                key={p.label}
                variant="outlined"
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)', boxShadow: 4 },
                }}
                onClick={() => pick(p.ids, p.mode)}
              >
                <Stack direction="row" alignItems="center" gap={1.5}>
                  <Box
                    sx={{
                      width: 40, height: 40,
                      borderRadius: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(34,211,238,0.15))',
                    }}
                  >
                    <Icon color="primary" />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight={600}>{p.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.ids.length} devices{p.mode ? ` · ${p.mode}` : ''}
                    </Typography>
                  </Box>
                  <LaunchIcon fontSize="small" sx={{ opacity: 0.4 }} />
                </Stack>
              </Paper>
            );
          })}
        </Box>

        <Stack direction="row" gap={1} sx={{ opacity: 0.7 }}>
          <Typography variant="caption"><b>iframe</b> — instant, no backend</Typography>
          <Typography variant="caption">·</Typography>
          <Typography variant="caption"><b>emulator</b> — real Chromium with OS chrome</Typography>
        </Stack>

        <Typography variant="caption" sx={{ opacity: 0.45, mt: 1 }}>
          A product of{' '}
          <Box
            component="a"
            href="https://www.knicklab.com/"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, '&:hover': { color: 'primary.main' } }}
          >
            www.knicklab.com
          </Box>
        </Typography>
      </Stack>
    </Box>
  );
});
