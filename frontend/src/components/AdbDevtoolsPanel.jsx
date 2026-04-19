'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, IconButton, Tooltip, Chip, TextField, InputAdornment,
  ToggleButton, ToggleButtonGroup, Button, Alert, Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DownloadIcon from '@mui/icons-material/Download';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { api } from '../lib/api';

// DevTools-like panel attached to a specific Android device serial. Polls the
// backend's CDP capture every second for recent network entries and renders a
// compact table + HAR export. "Attach" must be pressed once per device because
// Chrome's chrome_devtools_remote socket only allows ONE client at a time —
// attaching unconditionally would fight other DevTools sessions the user has
// open.

const TYPE_COLORS = {
  Document: 'primary', XHR: 'secondary', Fetch: 'secondary', Script: 'info',
  Stylesheet: 'success', Image: 'warning', Font: 'default', Media: 'warning',
  WebSocket: 'info', Other: 'default',
};

function statusColor(s) {
  if (!s) return 'default';
  if (s >= 500) return 'error';
  if (s >= 400) return 'warning';
  if (s >= 300) return 'info';
  return 'success';
}

function shortUrl(u) {
  try {
    const url = new URL(u);
    const p = url.pathname + url.search;
    return { host: url.host, path: p.length > 80 ? p.slice(0, 77) + '…' : p };
  } catch { return { host: '', path: u }; }
}

function fmtSize(n) {
  if (n == null || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtTime(ms) {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

const AdbDevtoolsPanel = memo(function AdbDevtoolsPanel({ serial }) {
  const [attached, setAttached] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState(null);
  const [entries, setEntries] = useState([]);
  const [pageUrl, setPageUrl] = useState('');
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const pollRef = useRef(null);

  const attach = async () => {
    setAttaching(true);
    setError(null);
    try {
      const r = await api.adbDevtoolsAttach(serial);
      setPageUrl(r.pageUrl || '');
      setAttached(true);
    } catch (e) {
      setError(e.message);
      setAttached(false);
    } finally {
      setAttaching(false);
    }
  };

  const detach = async () => {
    try { await api.adbDevtoolsDetach(serial); } catch {}
    setAttached(false);
    setEntries([]);
  };

  const refresh = async () => {
    try {
      const r = await api.adbDevtoolsEntries(serial);
      setEntries(r.entries || []);
      if (r.pageUrl) setPageUrl(r.pageUrl);
    } catch (e) {
      // If the capture died (tab closed, adb unplugged) surface it and stop polling.
      setError(e.message);
      setAttached(false);
    }
  };

  const clear = async () => {
    try { await api.adbDevtoolsClear(serial); setEntries([]); } catch {}
  };

  useEffect(() => {
    if (!attached) return;
    refresh();
    pollRef.current = setInterval(refresh, 1200);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attached, serial]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== 'all' && !typeMatches(e._resourceType || e.type, typeFilter)) return false;
      if (!q) return true;
      return (
        e.url?.toLowerCase().includes(q) ||
        String(e.status).includes(q) ||
        (e.method || '').toLowerCase().includes(q)
      );
    });
  }, [entries, filter, typeFilter]);

  if (!attached) {
    return (
      <Stack gap={1} sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1 }}>
            DevTools · Network
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Open a page in Chrome on the device, then attach to capture requests and export HAR.
        </Typography>
        {error && <Alert severity="warning" sx={{ py: 0, fontSize: 12 }}>{error}</Alert>}
        <Button
          size="small"
          variant="contained"
          onClick={attach}
          disabled={attaching}
          startIcon={<PowerSettingsNewIcon fontSize="small" />}
        >
          {attaching ? 'Attaching…' : 'Attach DevTools'}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 1.5, py: 1, flexWrap: 'wrap' }}>
        <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1 }}>
          Network
        </Typography>
        <Chip label={`${entries.length}`} size="small" sx={{ height: 18, fontSize: 10 }} />
        <TextField
          size="small"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter URL / method / status"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
            ),
            sx: { fontSize: 12, height: 28 },
          }}
          sx={{ flex: 1, minWidth: 160 }}
        />
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={refresh}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Clear">
          <IconButton size="small" onClick={clear}><DeleteSweepIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Export HAR">
          <IconButton
            size="small"
            component="a"
            href={api.adbDevtoolsHarUrl(serial)}
            download
          >
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Detach">
          <IconButton size="small" onClick={detach}><PowerSettingsNewIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" sx={{ px: 1.5, pb: 1 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={typeFilter}
          onChange={(_, v) => v && setTypeFilter(v)}
          sx={{ '& .MuiToggleButton-root': { py: 0.2, px: 1, fontSize: 11, textTransform: 'none' } }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="xhr">XHR/Fetch</ToggleButton>
          <ToggleButton value="doc">Doc</ToggleButton>
          <ToggleButton value="js">JS</ToggleButton>
          <ToggleButton value="css">CSS</ToggleButton>
          <ToggleButton value="img">Img</ToggleButton>
          <ToggleButton value="other">Other</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11 }}>
        {filtered.length === 0 ? (
          <Box sx={{ p: 2, opacity: 0.7 }}>
            <Typography variant="caption">
              No requests yet. Interact with the page on the device.
            </Typography>
          </Box>
        ) : filtered.map((e) => <Row key={e.id} e={e} />)}
      </Box>
      {pageUrl && (
        <Box sx={{ px: 1.5, py: 0.5, borderTop: 1, borderColor: 'divider', opacity: 0.65 }}>
          <Typography variant="caption" noWrap sx={{ fontFamily: 'ui-monospace,Menlo,monospace' }}>
            {pageUrl}
          </Typography>
        </Box>
      )}
      {error && (
        <Alert severity="warning" sx={{ fontSize: 11, py: 0, px: 1, borderRadius: 0 }}>
          {error}
        </Alert>
      )}
    </Stack>
  );
});

function typeMatches(t, key) {
  const s = String(t || '').toLowerCase();
  switch (key) {
    case 'xhr': return s === 'xhr' || s === 'fetch';
    case 'doc': return s === 'document';
    case 'js': return s === 'script';
    case 'css': return s === 'stylesheet';
    case 'img': return s === 'image';
    case 'other': return !['xhr', 'fetch', 'document', 'script', 'stylesheet', 'image'].includes(s);
    default: return true;
  }
}

const Row = memo(function Row({ e }) {
  const [open, setOpen] = useState(false);
  const u = shortUrl(e.url);
  return (
    <Box
      onClick={() => setOpen((v) => !v)}
      sx={{
        display: 'grid',
        gridTemplateColumns: '60px 50px 1fr 60px 50px',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.4,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
      }}
    >
      <Chip
        size="small"
        color={statusColor(e.status)}
        label={e.status || '—'}
        sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.8 } }}
      />
      <Typography variant="caption" sx={{ fontFamily: 'inherit' }}>{e.method}</Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" noWrap sx={{ fontFamily: 'inherit' }}>
          {u.path || e.url}
        </Typography>
        <Typography variant="caption" noWrap sx={{ fontFamily: 'inherit', opacity: 0.55, display: 'block' }}>
          {u.host} · {e.type || e._resourceType || ''}{e.error ? ` · ${e.error}` : ''}
        </Typography>
      </Box>
      <Typography variant="caption" sx={{ fontFamily: 'inherit', textAlign: 'right' }}>{fmtSize(e.size)}</Typography>
      <Typography variant="caption" sx={{ fontFamily: 'inherit', textAlign: 'right' }}>{fmtTime(e.time)}</Typography>
      {open && (
        <Box sx={{ gridColumn: '1 / -1', pl: 1, pt: 0.5, pb: 0.5, opacity: 0.85 }}>
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'inherit', wordBreak: 'break-all' }}>
            {e.url}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'inherit', opacity: 0.7 }}>
            {e.mimeType} · {e.remoteIP || '—'} · started {e.startedDateTime}
          </Typography>
        </Box>
      )}
    </Box>
  );
});

export default AdbDevtoolsPanel;
