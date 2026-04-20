'use client';
import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Stack, Typography, Alert, Divider, Box,
} from '@mui/material';
import { api } from '../lib/api';

// Accept "192.168.1.42:37251" or separate values. We split the host:port
// string so the user can paste whatever's on the phone screen.
function splitHostPort(v) {
  const s = (v || '').trim();
  const m = s.match(/^([^:\s]+):(\d+)$/);
  if (m) return { host: m[1], port: m[2] };
  return { host: s, port: '' };
}

export default function WifiConnectDialog({ open, onClose, onConnected }) {
  const [pairTarget, setPairTarget] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [connectTarget, setConnectTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  async function doPair() {
    const { host, port } = splitHostPort(pairTarget);
    if (!host || !port) return setErr('Enter the pairing IP:PORT shown on your phone');
    if (!/^\d{6}$/.test(pairCode)) return setErr('Pairing code must be 6 digits');
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.adbWifiPair(host, port, pairCode);
      setMsg(r.message || 'Paired. Now enter the connect IP:PORT from the top of the Wireless debugging screen and hit Connect.');
      setPairCode('');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function doConnect() {
    const { host, port } = splitHostPort(connectTarget);
    if (!host || !port) return setErr('Enter the connect IP:PORT (shown at the top of the Wireless debugging screen)');
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.adbWifiConnect(host, port);
      setMsg(r.message || 'Connected.');
      onConnected?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Connect over Wi-Fi</DialogTitle>
      <DialogContent>
        <Stack gap={2}>
          <Typography variant="caption" color="text.secondary">
            On your phone: Settings → Developer options → Wireless debugging.
            Make sure the phone and this Mac are on the same Wi-Fi.
          </Typography>

          <Box>
            <Typography variant="overline" sx={{ fontWeight: 700 }}>1. Pair (first time only)</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Open "Pair device with pairing code" on the phone and copy the IP:PORT + 6-digit code shown there.
            </Typography>
            <Stack gap={1}>
              <TextField
                size="small"
                label="Pairing IP:PORT"
                placeholder="192.168.1.42:37251"
                value={pairTarget}
                onChange={(e) => setPairTarget(e.target.value)}
                fullWidth
              />
              <TextField
                size="small"
                label="6-digit code"
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                fullWidth
                inputProps={{ inputMode: 'numeric' }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={doPair}
                disabled={busy || !pairTarget || pairCode.length !== 6}
              >
                Pair
              </Button>
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="overline" sx={{ fontWeight: 700 }}>2. Connect</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Use the IP:PORT shown at the top of the Wireless debugging screen
              (different from the pairing port).
            </Typography>
            <Stack gap={1}>
              <TextField
                size="small"
                label="Connect IP:PORT"
                placeholder="192.168.1.42:5555"
                value={connectTarget}
                onChange={(e) => setConnectTarget(e.target.value)}
                fullWidth
              />
              <Button
                variant="contained"
                size="small"
                onClick={doConnect}
                disabled={busy || !connectTarget}
              >
                Connect
              </Button>
            </Stack>
          </Box>

          {msg && <Alert severity="success" onClose={() => setMsg(null)}>{msg}</Alert>}
          {err && <Alert severity="error" onClose={() => setErr(null)}>{err}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
