'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Box, Stack, Popover, TextField, Button, Typography, Alert, Chip, IconButton, Tooltip,
} from '@mui/material';
import CloudIcon from '@mui/icons-material/Cloud';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { api, getBackendUrl, setBackendUrl } from '../lib/api';

// Small top-bar control that lets a user point the hosted frontend at their
// own local backend via a tunnel URL. Value is persisted in localStorage so
// anyone sharing the hosted URL can BYO their own machine.
//
// Status dot semantics: green = /health OK, red = failed, gray = never tested.
export default function BackendConnector() {
  const [anchor, setAnchor] = useState(null);
  const [input, setInput] = useState(getBackendUrl());
  const [status, setStatus] = useState('idle'); // idle | checking | ok | bad
  const [statusMsg, setStatusMsg] = useState('');
  const [current, setCurrent] = useState(getBackendUrl());
  const abortRef = useRef(null);

  // Auto-check on mount so the dot reflects reality before the user opens it.
  useEffect(() => {
    testConnection(current, /* silent */ true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testConnection = async (url, silent = false) => {
    if (abortRef.current) abortRef.current.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    if (!silent) setStatus('checking');
    try {
      const prev = getBackendUrl();
      // Temporarily point api.health at the URL under test.
      window.localStorage.setItem('lens.backendUrl', url.replace(/\/+$/, ''));
      await api.health(ctl.signal);
      window.localStorage.setItem('lens.backendUrl', prev.replace(/\/+$/, ''));
      setStatus('ok');
      setStatusMsg('Reachable');
    } catch (e) {
      setStatus('bad');
      setStatusMsg(e?.message || 'Failed');
    }
  };

  const save = async () => {
    const clean = input.trim().replace(/\/+$/, '');
    if (!clean) return;
    // Mixed-content check — if the page is https but the backend is http,
    // the browser will silently block fetches. Warn early.
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && clean.startsWith('http://')) {
      setStatus('bad');
      setStatusMsg('Mixed content: https page cannot call http backend. Use https tunnel URL.');
      return;
    }
    setBackendUrl(clean);
    setCurrent(clean);
    await testConnection(clean);
  };

  const reset = () => {
    setBackendUrl('');
    const fallback = getBackendUrl();
    setInput(fallback);
    setCurrent(fallback);
    testConnection(fallback);
  };

  const dotColor =
    status === 'ok' ? 'success.main' :
    status === 'bad' ? 'error.main' :
    status === 'checking' ? 'warning.main' : 'text.disabled';

  return (
    <>
      <Tooltip title={`Backend: ${current}`}>
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
          <Box sx={{ position: 'relative', display: 'flex' }}>
            <CloudIcon fontSize="small" />
            <Box sx={{
              position: 'absolute', right: -2, bottom: -2,
              width: 8, height: 8, borderRadius: '50%',
              bgcolor: dotColor,
              border: (t) => `1.5px solid ${t.palette.background.paper}`,
            }} />
          </Box>
        </IconButton>
      </Tooltip>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 420, p: 2, borderRadius: 2 } } }}
      >
        <Typography variant="subtitle2" fontWeight={700}>Connect your backend</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.5, lineHeight: 1.5 }}>
          Paste the URL of a backend you're running locally (e.g. a Cloudflare Tunnel).
          Your Android device stays on your machine; this frontend just talks to it.
        </Typography>

        <TextField
          fullWidth
          size="small"
          label="Backend URL"
          placeholder="https://xxx.trycloudflare.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />

        <Stack direction="row" gap={1} mt={1.5}>
          <Button variant="contained" size="small" onClick={save} fullWidth>
            Save & test
          </Button>
          <Button size="small" color="inherit" onClick={reset}>
            Reset
          </Button>
        </Stack>

        <Stack direction="row" alignItems="center" gap={1} mt={1.5}>
          <Chip
            size="small"
            icon={status === 'ok' ? <CheckCircleIcon /> : status === 'bad' ? <ErrorOutlineIcon /> : undefined}
            label={
              status === 'ok' ? 'Connected' :
              status === 'bad' ? 'Unreachable' :
              status === 'checking' ? 'Checking…' : 'Not tested'
            }
            color={status === 'ok' ? 'success' : status === 'bad' ? 'error' : 'default'}
            variant={status === 'ok' ? 'filled' : 'outlined'}
            sx={{ height: 22 }}
          />
          {statusMsg && status !== 'ok' && (
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {statusMsg}
            </Typography>
          )}
        </Stack>

        <Alert severity="info" variant="outlined" sx={{ mt: 1.5, fontSize: 12, py: 0.5 }}>
          <Box sx={{ fontWeight: 600, mb: 0.5 }}>First time? Install the agent:</Box>
          <Box component="code" sx={{ display: 'block', lineHeight: 1.6 }}>
            brew tap garje-akshay/lens<br />
            brew install lens-agent<br />
            brew install --cask android-platform-tools<br />
            lens-agent start
          </Box>
          <Box sx={{ mt: 0.5, color: 'text.secondary' }}>
            Copy the printed tunnel URL and paste it above.
          </Box>
        </Alert>
      </Popover>
    </>
  );
}
