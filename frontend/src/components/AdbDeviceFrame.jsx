'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Stack, Typography, IconButton, Tooltip, Chip, Alert } from '@mui/material';
import AndroidIcon from '@mui/icons-material/Android';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import BugReportIcon from '@mui/icons-material/BugReport';
import TuneIcon from '@mui/icons-material/Tune';
import { useLabStore } from '../store/useLabStore';
import { api, getBackendUrl } from '../lib/api';
import AdbDevtoolsPanel from './AdbDevtoolsPanel';
import AdbDeviceControls from './AdbDeviceControls';

// ws-scrcpy is reverse-proxied by the backend at /ws-scrcpy — this way users
// only expose ONE tunnel (the backend) and ws-scrcpy rides through it.
// The hash format `#!action=stream&...` is ws-scrcpy's in-app router convention.
// We explicitly set the ws param to ws-scrcpy's scrcpy WS endpoint on the same
// host so the client doesn't default to 127.0.0.1:8886 (which is unreachable
// from the hosted frontend).
function buildStreamUrl(serial) {
  const base = `${getBackendUrl()}/ws-scrcpy`;
  const wsBase = base.replace(/^http/, 'ws');
  const ws = `${wsBase}/?action=proxy-adb&remote=tcp:8886&udid=${encodeURIComponent(serial)}`;
  // WebCodecs decodes H.264 directly in JS and works on every modern Chromium
  // browser. MSE requires the source H.264 profile + level to exactly match a
  // codec string the browser accepts, which fails on some Samsung devices
  // where scrcpy emits a profile the MediaSource pipeline rejects silently.
  const q = new URLSearchParams({
    action: 'stream',
    udid: serial,
    player: 'webcodecs',
    ws,
  });
  return `${base}/#!${q.toString()}`;
}

// Default frame width; height is derived from the device's real screen
// aspect (fetched via /api/adb/size) so the iframe matches the panel and we
// don't get letterbox gaps.
const FRAME_WIDTH = 380;
const FALLBACK_ASPECT = 2; // 1:2 for devices we can't query (fallback only)
const MIN_W = 220;
const MAX_W = 900;

function AdbDeviceFrame({ serial }) {
  const url = useLabStore((s) => s.lastPushedUrl);
  const adbDevices = useLabStore((s) => s.adbDevices);
  const toggleAdbDevice = useLabStore((s) => s.toggleAdbDevice);
  const device = adbDevices.find((d) => d.serial === serial);
  const [reloadKey, setReloadKey] = useState(0);
  const [pushing, setPushing] = useState(false);
  const [size, setSize] = useState({ w: FRAME_WIDTH, h: Math.round(FRAME_WIDTH * FALLBACK_ASPECT) });
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  // Fetch the device's real screen aspect ratio once so the frame matches
  // what scrcpy emits (otherwise we letterbox → visible gap around the video).
  useEffect(() => {
    let cancelled = false;
    api.adbSize(serial)
      .then(({ width, height }) => {
        if (cancelled || !width || !height) return;
        const aspect = height / width;
        setSize((s) => ({ w: s.w, h: Math.round(s.w * aspect) }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serial]);
  // Bump when the user updates the backend URL so the iframe src (and thus
  // the ws:// upgrade) rebuild against the new tunnel.
  const [backendTick, setBackendTick] = useState(0);
  useEffect(() => {
    const onChange = () => setBackendTick((t) => t + 1);
    window.addEventListener('lens:backend-changed', onChange);
    return () => window.removeEventListener('lens:backend-changed', onChange);
  }, []);
  const iframeSrc = useMemo(() => buildStreamUrl(serial), [serial, backendTick]);
  const lastPushedUrl = useRef(null);

  const onResizeMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;
    const ratio = startH / startW;
    const shiftFreeform = e.shiftKey;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      let w = Math.min(MAX_W, Math.max(MIN_W, startW + dx));
      let h = ev.shiftKey || shiftFreeform
        ? Math.max(MIN_W, startH + (ev.clientY - startY))
        : Math.round(w * ratio);
      setSize({ w, h });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // When the Lens URL changes (and isn't the same as the last one pushed),
  // open it in Chrome on the device so the emulator tracks what you're
  // testing without a separate click.
  useEffect(() => {
    if (!url || url === lastPushedUrl.current) return;
    lastPushedUrl.current = url;
    api.adbNavigate(serial, url).catch(() => {});
  }, [url, serial]);

  const pushUrl = async () => {
    setPushing(true);
    try { await api.adbNavigate(serial, url); }
    catch (e) { alert(`Push URL failed: ${e.message}`); }
    finally { setPushing(false); }
  };

  return (
    <Stack direction="row" alignItems="flex-start" gap={2}>
    <Stack alignItems="center" gap={1}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ width: size.w + 28 }}
      >
        <Stack direction="row" alignItems="center" gap={0.75}>
          <AndroidIcon sx={{ fontSize: 14, color: '#3ddc84' }} />
          <Typography variant="caption" sx={{ opacity: 0.85 }}>
            {device?.model || serial} · Live
          </Typography>
          <Chip label="adb" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
        </Stack>
        <Stack direction="row">
          <Tooltip title="Push current URL to device Chrome">
            <span>
              <IconButton size="small" onClick={pushUrl} disabled={pushing}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={controlsOpen ? 'Hide device controls' : 'Show device controls'}>
            <IconButton
              size="small"
              onClick={() => setControlsOpen((v) => !v)}
              color={controlsOpen ? 'primary' : 'default'}
            >
              <TuneIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={devtoolsOpen ? 'Hide DevTools' : 'Show DevTools (Network / HAR)'}>
            <IconButton
              size="small"
              onClick={() => setDevtoolsOpen((v) => !v)}
              color={devtoolsOpen ? 'primary' : 'default'}
            >
              <BugReportIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reload stream">
            <IconButton size="small" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove from grid">
            <IconButton size="small" onClick={() => toggleAdbDevice(serial)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Box
        sx={{
          position: 'relative',
          width: size.w,
          height: size.h,
          bgcolor: '#000',
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
      >
        <Box
          component="iframe"
          key={reloadKey}
          src={iframeSrc}
          title={`Android ${serial}`}
          sx={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          allow="autoplay; clipboard-read; clipboard-write"
        />
        <Box
          onMouseDown={onResizeMouseDown}
          title="Drag to resize (hold Shift for freeform)"
          sx={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 16,
            height: 16,
            cursor: 'nwse-resize',
            background:
              'linear-gradient(135deg, transparent 0 55%, rgba(255,255,255,0.35) 55% 65%, transparent 65% 75%, rgba(255,255,255,0.35) 75% 85%, transparent 85%)',
          }}
        />
      </Box>
      <Alert severity="info" icon={false} sx={{ fontSize: 11, py: 0, px: 1 }}>
        Click inside the frame to interact. URL from the address bar auto-opens on the device.
      </Alert>
    </Stack>
      {controlsOpen && (
        <Box
          sx={{
            width: 320,
            height: size.h + 64,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          <AdbDeviceControls serial={serial} />
        </Box>
      )}
      {devtoolsOpen && (
        <Box
          sx={{
            width: 520,
            // Match the device frame's height (title bar + frame + footer
            // alert) so the two columns align visually.
            height: size.h + 64,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          <AdbDevtoolsPanel serial={serial} />
        </Box>
      )}
    </Stack>
  );
}

export default memo(AdbDeviceFrame);
