'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AppBar, Toolbar as MuiToolbar, Container, Grid, Box, Stack, Paper, Typography,
  TextField, Button, IconButton, Select, MenuItem, Chip, Tooltip, InputAdornment,
  Table, TableBody, TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PublicIcon from '@mui/icons-material/Public';
import ScreenRotationIcon from '@mui/icons-material/ScreenRotation';
import { DEVICES, NETWORK_PROFILES } from '../../../config/devices';
import { useDeviceConfig } from '../../../store/useLabStore';
import { api, BACKEND_WS } from '../../../lib/api';
import LogPanel from '../../../components/LogPanel';
import DeviceChrome from '../../../components/DeviceChrome';

export default function DeviceDetailPage() {
  const params = useParams();
  const search = useSearchParams();

  const device = useMemo(() => DEVICES.find((d) => d.id === params.id), [params.id]);
  const deviceConfig = useDeviceConfig(device ? device.id : '__missing__');

  const initialUrl = search.get('url') || deviceConfig?.url || 'https://example.com';
  const initialOrientation = search.get('orientation') || deviceConfig?.orientation || 'portrait';
  const initialNetwork = search.get('network') || deviceConfig?.networkProfile || 'online';

  const [url, setUrl] = useState(initialUrl);
  const [pendingUrl, setPendingUrl] = useState(initialUrl);
  const [orientation, setOrientation] = useState(initialOrientation);
  const [networkProfile, setNetworkProfile] = useState(initialNetwork);
  const [reloadTick, setReloadTick] = useState(0);

  const [sessionId, setSessionId] = useState(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [err, setErr] = useState(null);
  const [logs, setLogs] = useState([]);
  const wsRef = useRef(null);
  const imgRef = useRef(null);
  const scrollYRef = useRef(0);
  const scrollXRef = useRef(0);
  const surfaceRef = useRef(null);

  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    setErr(null);
    setHasFrame(false);
    setLogs([]);
    scrollXRef.current = 0;
    scrollYRef.current = 0;
    (async () => {
      try {
        const { sessionId: id } = await api.createSession(device.id, url, networkProfile);
        if (cancelled) { api.close(id).catch(() => {}); return; }
        setSessionId(id);
      } catch (e) {
        setErr(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [device, url, reloadTick, networkProfile]);

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
        } else if (msg.type === 'log-replay') setLogs(msg.events || []);
        else if (msg.type === 'error') setErr(msg.message);
      } catch {}
    };
    ws.onerror = () => setErr('stream error');
    return () => {
      try { ws.close(); } catch {}
      api.close(sessionId).catch(() => {});
    };
  }, [sessionId]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: 'scroll', x: scrollXRef.current, y: scrollYRef.current }));
    };
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

  if (!device) {
    return (
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <Typography mb={2}>Unknown device: {params.id}</Typography>
        <Button component={Link} href="/" startIcon={<ArrowBackIcon />} variant="outlined">
          Back to grid
        </Button>
      </Container>
    );
  }

  const { width, height } = orientation === 'landscape'
    ? { width: device.viewport.height, height: device.viewport.width }
    : device.viewport;

  const onSubmit = (e) => {
    e.preventDefault();
    const u = normalizeUrl(pendingUrl);
    setUrl(u);
    setPendingUrl(u);
    setReloadTick((t) => t + 1);
  };

  const onClickSurface = (e) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (height / rect.height));
    wsRef.current.send(JSON.stringify({ type: 'tap', x, y }));
  };

  const downloadScreenshot = () => {
    if (!sessionId) return;
    window.open(api.screenshotUrl(sessionId), '_blank');
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" color="inherit" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <MuiToolbar sx={{ gap: 2, flexWrap: 'wrap', py: 1 }}>
          <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="small" color="inherit">
            Grid
          </Button>
          <Typography variant="h6" noWrap>{device.name}</Typography>
          <Chip size="small" label={`${device.os} · ${device.category}`} />

          <Box component="form" onSubmit={onSubmit} sx={{ flex: 1, display: 'flex', gap: 1, minWidth: 320 }}>
            <TextField
              fullWidth
              value={pendingUrl}
              onChange={(e) => setPendingUrl(e.target.value)}
              placeholder="https://example.com"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" variant="contained">Go</Button>
            <Tooltip title="Reload">
              <IconButton onClick={() => setReloadTick((t) => t + 1)}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <LabeledSelect
            icon={<PublicIcon fontSize="small" />}
            label="Network"
            value={networkProfile}
            onChange={setNetworkProfile}
            options={Object.entries(NETWORK_PROFILES).map(([v, { name }]) => ({ v, l: name }))}
          />
          <LabeledSelect
            icon={<ScreenRotationIcon fontSize="small" />}
            label="Orientation"
            value={orientation}
            onChange={setOrientation}
            options={[{ v: 'portrait', l: 'Portrait' }, { v: 'landscape', l: 'Landscape' }]}
          />
          <Button
            startIcon={<CameraAltIcon />}
            onClick={downloadScreenshot}
            disabled={!sessionId}
            variant="outlined"
          >
            Screenshot
          </Button>
        </MuiToolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ py: 3, maxWidth: 1600 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} lg="auto">
            <Stack alignItems="center">
              <Typography variant="caption" color="text.secondary" mb={1}>
                {width}×{height} · DPR {device.deviceScaleFactor}
              </Typography>
              <DeviceChrome device={device} width={width} height={height}>
                <Box
                  ref={surfaceRef}
                  onClick={onClickSurface}
                  sx={{
                    width, height, bgcolor: '#000', cursor: 'pointer',
                    overscrollBehavior: 'contain', touchAction: 'none',
                  }}
                >
                  <Box
                    component="img"
                    ref={imgRef}
                    alt={device.name}
                    sx={{ width, height, objectFit: 'cover', display: hasFrame ? 'block' : 'none', contain: 'strict' }}
                    draggable={false}
                  />
                  {!hasFrame && (
                    <Stack alignItems="center" justifyContent="center" sx={{ width: '100%', height: '100%' }}>
                      <Typography variant="caption" sx={{ color: 'grey.400' }}>
                        {err ? `Error: ${err}` : 'Launching emulator…'}
                      </Typography>
                    </Stack>
                  )}
                </Box>
              </DeviceChrome>
            </Stack>
          </Grid>

          <Grid item xs={12} lg>
            <Stack gap={3}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" mb={1.5}>Device details</Typography>
                <Metadata
                  device={device}
                  url={url}
                  orientation={orientation}
                  networkProfile={networkProfile}
                  sessionId={sessionId}
                />
              </Paper>

              <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
                <Typography variant="subtitle2" mb={1}>Console & network logs</Typography>
                <LogPanel
                  logs={logs}
                  onClear={async () => {
                    setLogs([]);
                    if (sessionId) { try { await api.clearLogs(sessionId); } catch {} }
                  }}
                  height="60vh"
                />
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function Metadata({ device, url, orientation, networkProfile, sessionId }) {
  const rows = [
    ['Device', device.name],
    ['ID', device.id],
    ['OS', device.os],
    ['Category', device.category],
    ['Viewport', `${device.viewport.width} × ${device.viewport.height}`],
    ['Device pixel ratio', device.deviceScaleFactor],
    ['Orientation', orientation],
    ['Network', NETWORK_PROFILES[networkProfile]?.name || networkProfile],
    ['Current URL', url],
    ['Session ID', sessionId || '(starting…)'],
  ];
  return (
    <Table size="small">
      <TableBody>
        {rows.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell sx={{ width: 180, color: 'text.secondary', verticalAlign: 'top' }}>{k}</TableCell>
            <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, wordBreak: 'break-all' }}>
              {String(v)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LabeledSelect({ icon, label, value, onChange, options }) {
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      {icon}
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{ minWidth: 120 }}
      >
        {options.map((o) => (
          <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>
        ))}
      </Select>
    </Stack>
  );
}

function normalizeUrl(input) {
  const s = (input || '').trim();
  if (!s) return 'https://example.com';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
