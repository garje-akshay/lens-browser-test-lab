'use client';
import { memo, useEffect, useRef, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { useLabStore, useDeviceConfig, scrollBus } from '../store/useLabStore';
import { FrameShell, buildDetailHref } from './IframeDeviceFrame';
import { api, BACKEND_WS } from '../lib/api';
import { downloadPng } from '../lib/download';
import LogPanel from './LogPanel';
import DeviceSettings from './DeviceSettings';

const placeholderSx = { width: '100%', height: '100%' };

function RealDeviceFrame({ device }) {
  const syncScroll = useLabStore((s) => s.syncScroll);
  const setSession = useLabStore((s) => s.setSession);
  const clearSession = useLabStore((s) => s.clearSession);

  const config = useDeviceConfig(device.id);
  const { url, orientation, networkProfile, reloadTick } = config;
  const overridden =
    config.urlOverridden || config.orientationOverridden ||
    config.networkProfileOverridden || config.useProxyOverridden;

  const [sessionId, setSessionId] = useState(null);
  const [err, setErr] = useState(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const wsRef = useRef(null);
  const imgRef = useRef(null);
  const scrollYRef = useRef(0);
  const scrollXRef = useRef(0);
  const surfaceRef = useRef(null);
  const sendScrollRef = useRef(null);

  const syncScrollRef = useRef(syncScroll);
  useEffect(() => { syncScrollRef.current = syncScroll; }, [syncScroll]);

  const { width, height } = orientation === 'landscape'
    ? { width: device.viewport.height, height: device.viewport.width }
    : device.viewport;

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    setHasFrame(false);
    setLogs([]);
    scrollYRef.current = 0;
    scrollXRef.current = 0;
    (async () => {
      try {
        const { sessionId: id } = await api.createSession(device.id, url, networkProfile);
        if (cancelled) { api.close(id).catch(() => {}); return; }
        setSessionId(id);
        setSession(device.id, id);
      } catch (e) {
        setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
      clearSession(device.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, url, reloadTick]);

  useEffect(() => {
    if (sessionId) api.setNetwork(sessionId, networkProfile).catch(() => {});
  }, [networkProfile, sessionId]);

  // WebSocket: frames go straight to <img>.src (no React re-render per frame).
  useEffect(() => {
    if (!sessionId) return;
    const ws = new WebSocket(`${BACKEND_WS}/stream?sessionId=${sessionId}`);
    wsRef.current = ws;
    let gotFirst = false;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'frame') {
          if (imgRef.current) imgRef.current.src = `data:image/jpeg;base64,${msg.data}`;
          if (!gotFirst) { gotFirst = true; setHasFrame(true); }
        } else if (msg.type === 'log') {
          setLogs((prev) => {
            const next = prev.length >= 500 ? prev.slice(-499) : prev.slice();
            next.push(msg.event);
            return next;
          });
        } else if (msg.type === 'log-replay') {
          setLogs(msg.events || []);
        } else if (msg.type === 'error') {
          setErr(msg.message);
        }
      } catch {}
    };
    ws.onerror = () => setErr('stream error');

    return () => {
      try { ws.close(); } catch {}
      api.close(sessionId).catch(() => {});
    };
  }, [sessionId]);

  // Subscribe to the sync-scroll bus — no React re-renders per tick.
  useEffect(() => {
    if (!syncScroll) return;
    const unsub = scrollBus.subscribe((x, y) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== 1) return;
      scrollXRef.current = x;
      scrollYRef.current = y;
      ws.send(JSON.stringify({ type: 'scroll', x, y }));
    });
    return unsub;
  }, [syncScroll, sessionId]);

  // rAF-throttled wheel → send scroll updates at most once per frame.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    let scheduled = false;

    const flush = () => {
      scheduled = false;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: 'scroll', x: scrollXRef.current, y: scrollYRef.current }));
      if (syncScrollRef.current) scrollBus.publish(scrollXRef.current, scrollYRef.current);
    };
    sendScrollRef.current = flush;

    const onWheel = (e) => {
      e.preventDefault();
      scrollYRef.current = Math.max(0, scrollYRef.current + e.deltaY);
      scrollXRef.current = Math.max(0, scrollXRef.current + e.deltaX);
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [sessionId]);

  const onClick = (e) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (height / rect.height));
    ws.send(JSON.stringify({ type: 'tap', x, y }));
  };

  const clearLogs = async () => {
    setLogs([]);
    if (sessionId) { try { await api.clearLogs(sessionId); } catch {} }
  };

  const detailHref = buildDetailHref(device.id, { url, orientation, network: networkProfile });
  const onScreenshot = sessionId ? () => downloadPng(api.screenshotUrl(sessionId), `${device.id}.png`) : null;

  return (
    <Stack alignItems="center" gap={1}>
      <FrameShell
        device={device}
        width={width}
        height={height}
        showLogs={showLogs}
        onToggleLogs={() => setShowLogs((v) => !v)}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((v) => !v)}
        detailHref={detailHref}
        onScreenshot={onScreenshot}
        overridden={overridden}
      >
        <Box
          ref={surfaceRef}
          onClick={onClick}
          sx={{
            width, height,
            bgcolor: '#000',
            position: 'relative',
            cursor: 'pointer',
            overscrollBehavior: 'contain',
            touchAction: 'none',
          }}
        >
          <Box
            component="img"
            ref={imgRef}
            alt={device.name}
            sx={{
              width, height, objectFit: 'cover', display: hasFrame ? 'block' : 'none',
              contain: 'strict',
            }}
            draggable={false}
          />
          {!hasFrame && (
            <Stack alignItems="center" justifyContent="center" sx={placeholderSx}>
              <Typography variant="caption" sx={{ color: 'grey.400' }}>
                {err ? `Error: ${err}` : 'Launching emulator…'}
              </Typography>
            </Stack>
          )}
        </Box>
      </FrameShell>
      {showSettings && (
        <Box sx={{ width: Math.max(width, 320) }}>
          <DeviceSettings deviceId={device.id} mode="real" />
        </Box>
      )}
      {showLogs && (
        <Box sx={{ width: Math.max(width, 320) }}>
          <LogPanel logs={logs} onClear={clearLogs} />
        </Box>
      )}
    </Stack>
  );
}

export default memo(RealDeviceFrame);
