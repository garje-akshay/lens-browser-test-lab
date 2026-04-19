'use client';
import { memo, useEffect, useRef, useState } from 'react';
import { Box, Stack, Typography, IconButton, Tooltip, Chip, Alert } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TerminalIcon from '@mui/icons-material/Terminal';
import AppleIcon from '@mui/icons-material/Apple';
import AndroidIcon from '@mui/icons-material/Android';
import LockIcon from '@mui/icons-material/Lock';
import { useDeviceConfig, scrollBus } from '../store/useLabStore';
import { api } from '../lib/api';
import { downloadPng } from '../lib/download';
import LogPanel from './LogPanel';
import DeviceSettings from './DeviceSettings';
import DeviceChrome from './DeviceChrome';

const BLOCKED_HOSTS = /(^|\.)(facebook|fb|instagram|linkedin|twitter|x|google|accounts\.google|mail\.google|youtube|chase|bankofamerica|wellsfargo)\.com$/i;

function isLikelyBlocked(urlStr) {
  try {
    const host = new URL(urlStr).hostname;
    return BLOCKED_HOSTS.test(host);
  } catch { return false; }
}

function IframeDeviceFrame({ device }) {
  const config = useDeviceConfig(device.id);
  const { url, orientation, useProxy, networkProfile, reloadTick } = config;
  const overridden =
    config.urlOverridden || config.orientationOverridden ||
    config.networkProfileOverridden || config.useProxyOverridden;

  const iframeRef = useRef(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [logs, setLogs] = useState([]);
  const [snapping, setSnapping] = useState(false);
  const [proxyError, setProxyError] = useState(null);
  const blocked = isLikelyBlocked(url);

  const { width, height } = applyOrientation(device.viewport, orientation);
  const src = useProxy ? api.proxyUrl(url) : url;

  // When using the proxy, probe upstream reachability first so we can show a
  // friendly overlay instead of a raw "Proxy error: ..." page inside the iframe.
  useEffect(() => {
    if (!useProxy || blocked) { setProxyError(null); return; }
    const ctl = new AbortController();
    let cancelled = false;
    api.probeProxy(url, ctl.signal)
      .then((r) => { if (!cancelled) setProxyError(r.ok ? null : (r.error || 'Unreachable')); })
      .catch(() => { if (!cancelled) setProxyError(null); });
    return () => { cancelled = true; ctl.abort(); };
  }, [url, useProxy, blocked, reloadTick]);

  useEffect(() => {
    const onMsg = (e) => {
      const data = e.data;
      if (!data || data.__btl !== true) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      setLogs((prev) => {
        const next = prev.length >= 500 ? prev.slice(-499) : prev.slice();
        next.push({ level: data.level, source: data.source, message: data.message, ts: data.ts });
        return next;
      });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => { setLogs([]); }, [url, reloadTick]);

  // Subscribe to the sync-scroll bus and forward via postMessage — best-effort
  // (only same-origin / cooperative children will honor it). No store reads.
  useEffect(() => {
    const unsub = scrollBus.subscribe((x, y) => {
      try {
        iframeRef.current?.contentWindow?.postMessage({ type: 'btl-scroll', x, y }, '*');
      } catch {}
    });
    return unsub;
  }, []);

  const detailHref = buildDetailHref(device.id, { url, orientation, network: networkProfile });

  const onScreenshot = async () => {
    if (snapping) return;
    setSnapping(true);
    try {
      const { sessionId } = await api.createSession(device.id, url, networkProfile);
      await new Promise((r) => setTimeout(r, 1200));
      const host = new URL(url).hostname.replace(/[^a-z0-9]+/gi, '_');
      downloadPng(api.screenshotUrl(sessionId), `${host}-${device.id}.png`);
      setTimeout(() => api.close(sessionId).catch(() => {}), 2000);
    } catch (e) {
      alert(`Screenshot failed: ${e.message}`);
    } finally {
      setSnapping(false);
    }
  };

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
        {blocked ? (
          <BlockedOverlay width={width} height={height} url={url} />
        ) : proxyError ? (
          <BlockedOverlay width={width} height={height} url={url} reason={proxyError} />
        ) : (
          <iframe
            ref={iframeRef}
            key={`${src}-${reloadTick}`}
            src={src}
            title={device.name}
            width={width}
            height={height}
            referrerPolicy="no-referrer"
            loading="lazy"
            style={{ border: 0, width, height, background: '#fff' }}
          />
        )}
      </FrameShell>
      {showSettings && (
        <Box sx={{ width: Math.max(width, 320) }}>
          <DeviceSettings deviceId={device.id} mode="iframe" />
        </Box>
      )}
      {showLogs && (
        <Box sx={{ width: Math.max(width, 320) }}>
          {!useProxy && (
            <Alert severity="warning" sx={{ mt: 1, fontSize: 12 }}>
              Logs are only captured when Proxy is on (iframe mode) or in real-browser mode.
            </Alert>
          )}
          <LogPanel logs={logs} onClear={() => setLogs([])} />
        </Box>
      )}
    </Stack>
  );
}

export default memo(IframeDeviceFrame);

export const FrameShell = memo(function FrameShell({
  device, width, height, children,
  showLogs, onToggleLogs,
  showSettings, onToggleSettings,
  detailHref, onScreenshot, overridden,
}) {
  const OsIcon = device.os === 'ios' ? AppleIcon : AndroidIcon;
  return (
    <Stack alignItems="center" gap={1}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ width: width + 28 }}
      >
        <Stack direction="row" alignItems="center" gap={0.75}>
          <OsIcon sx={{ fontSize: 14, opacity: 0.75 }} />
          <Typography variant="caption" sx={{ opacity: 0.85 }}>
            {device.name} · {width}×{height}
          </Typography>
          {overridden && (
            <Chip label="custom" size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
          )}
        </Stack>
        <Stack direction="row" alignItems="center">
          {onToggleSettings && (
            <Tooltip title="Per-device settings">
              <IconButton size="small" color={showSettings ? 'primary' : 'default'} onClick={onToggleSettings}>
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onScreenshot && (
            <Tooltip title="Download PNG screenshot">
              <IconButton size="small" onClick={onScreenshot}>
                <CameraAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {detailHref && (
            <Tooltip title="Open device detail view">
              <IconButton size="small" component="a" href={detailHref}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onToggleLogs && (
            <Tooltip title={showLogs ? 'Hide logs' : 'Show logs'}>
              <IconButton size="small" color={showLogs ? 'primary' : 'default'} onClick={onToggleLogs}>
                <TerminalIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
      <DeviceChrome device={device} width={width} height={height}>
        {children}
      </DeviceChrome>
    </Stack>
  );
});

const BlockedOverlay = memo(function BlockedOverlay({ width, height, url, reason }) {
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  const title = reason ? `Can't reach ${host}` : `${host} blocks embedding`;
  const body = reason
    ? `The proxy couldn't connect (${reason}). This usually means the site firewalls datacenter IPs. Real-device emulator mode (coming soon) will reach it directly.`
    : 'This site enforces strict anti-framing and bot protection. Real-device emulator mode (coming soon) will render it properly.';
  return (
    <Box sx={{
      width, height, background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      p: 3, textAlign: 'center',
    }}>
      <Stack alignItems="center" gap={1.5} sx={{ maxWidth: 280 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(34,211,238,0.12))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LockIcon sx={{ color: 'primary.main' }} />
        </Box>
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {body}
        </Typography>
      </Stack>
    </Box>
  );
});

function applyOrientation({ width, height }, orientation) {
  return orientation === 'landscape'
    ? { width: height, height: width }
    : { width, height };
}

export function buildDetailHref(deviceId, { url, orientation, network } = {}) {
  const q = new URLSearchParams();
  if (url) q.set('url', url);
  if (orientation) q.set('orientation', orientation);
  if (network) q.set('network', network);
  const qs = q.toString();
  return `/device/${deviceId}${qs ? `?${qs}` : ''}`;
}
