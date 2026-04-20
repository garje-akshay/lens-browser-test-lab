'use client';
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Stack, Typography, Alert, Divider, Box, Tabs, Tab, CircularProgress,
} from '@mui/material';
import QRCode from 'qrcode';
import { api } from '../lib/api';

// Accept "192.168.1.42:37251" or separate values. We split the host:port
// string so the user can paste whatever's on the phone screen.
function splitHostPort(v) {
  const s = (v || '').trim();
  const m = s.match(/^([^:\s]+):(\d+)$/);
  if (m) return { host: m[1], port: m[2] };
  return { host: s, port: '' };
}

const QR_LABELS = {
  awaiting_scan: 'Waiting for you to scan the code…',
  discovered: 'Found your phone — pairing…',
  pairing: 'Pairing…',
  paired: 'Paired! The device should now appear in the sidebar.',
  expired: 'QR code expired. Generate a new one.',
  error: 'Pairing failed.',
};

export default function WifiConnectDialog({ open, onClose, onConnected }) {
  const [tab, setTab] = useState(0);
  const [pairTarget, setPairTarget] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [connectTarget, setConnectTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [qrJob, setQrJob] = useState(null); // { jobId, payload, service, state, error }
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Render the QR client-side whenever the payload changes — this takes ~5ms
  // in-browser vs ~1-2s through the server.
  useEffect(() => {
    if (!qrJob?.payload) { setQrDataUrl(''); return; }
    QRCode.toDataURL(qrJob.payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [qrJob?.payload]);

  // Generate a QR + poll until the phone pairs (or it expires).
  useEffect(() => {
    if (!open || tab !== 0) return;
    let cancelled = false;
    let timer;
    (async () => {
      try {
        const start = await api.adbWifiQrStart();
        if (cancelled) {
          api.adbWifiQrCancel(start.jobId).catch(() => {});
          return;
        }
        setQrJob({ ...start, state: 'awaiting_scan' });
        const poll = async () => {
          if (cancelled) return;
          try {
            const s = await api.adbWifiQrStatus(start.jobId);
            setQrJob((prev) => (prev ? { ...prev, ...s } : prev));
            if (s.state === 'paired') {
              onConnected?.();
              return;
            }
            if (s.state === 'expired' || s.state === 'error') return;
          } catch {}
          timer = setTimeout(poll, 1500);
        };
        poll();
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (qrJob?.jobId) api.adbWifiQrCancel(qrJob.jobId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const regenerateQr = async () => {
    if (qrJob?.jobId) api.adbWifiQrCancel(qrJob.jobId).catch(() => {});
    setQrJob(null);
    // Flip the tab state to retrigger the useEffect.
    setTab((t) => t);
    // Kick the effect by toggling a dependency: simplest is to close+reopen tab.
    // Instead, just call start directly.
    try {
      const start = await api.adbWifiQrStart();
      setQrJob({ ...start, state: 'awaiting_scan' });
    } catch (e) { setErr(e.message); }
  };

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
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}>
          <Tab label="QR code" sx={{ minHeight: 36 }} />
          <Tab label="Pairing code" sx={{ minHeight: 36 }} />
        </Tabs>

        {tab === 0 && (
          <Stack gap={2} alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              On your phone: Settings → Developer options → Wireless debugging →
              <strong> Pair device with QR code</strong>. Scan the code below.
              (Phone and Mac must be on the same Wi-Fi.)
            </Typography>

            {!qrJob && (
              <Box sx={{ py: 4 }}><CircularProgress size={24} /></Box>
            )}

            {qrJob && (
              <>
                <Box
                  sx={{
                    position: 'relative',
                    width: 260, height: 260,
                    bgcolor: '#fff', borderRadius: 2, overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {qrDataUrl
                    ? <Box component="img" src={qrDataUrl} alt="Pair QR" sx={{ width: '100%', height: '100%' }} />
                    : <CircularProgress size={24} />}
                  {qrJob.state === 'pairing' && (
                    <Box sx={{
                      position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.55)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CircularProgress size={32} sx={{ color: '#fff' }} />
                    </Box>
                  )}
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    textAlign: 'center',
                    color: qrJob.state === 'paired' ? 'success.main'
                         : qrJob.state === 'expired' || qrJob.state === 'error' ? 'error.main'
                         : 'text.secondary',
                    fontWeight: qrJob.state === 'paired' ? 600 : 400,
                  }}
                >
                  {QR_LABELS[qrJob.state] || qrJob.state}
                </Typography>
                {qrJob.error && (
                  <Alert severity="error" sx={{ width: '100%' }}>{qrJob.error}</Alert>
                )}
                {(qrJob.state === 'expired' || qrJob.state === 'error' || qrJob.state === 'paired') && (
                  <Button size="small" onClick={regenerateQr}>
                    {qrJob.state === 'paired' ? 'Pair another device' : 'Generate new code'}
                  </Button>
                )}
              </>
            )}
          </Stack>
        )}

        {tab === 1 && (
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
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
