'use client';
import { useCallback } from 'react';
import {
  AppBar, Toolbar as MuiToolbar, Box, Stack, IconButton, Button, TextField,
  InputAdornment, Tooltip, Typography,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import SendIcon from '@mui/icons-material/Send';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useLabStore } from '../store/useLabStore';
import { api } from '../lib/api';
import BackendConnector from './BackendConnector';

const appBarSx = {
  borderBottom: 1, borderColor: 'divider',
  bgcolor: 'background.paper',
  backdropFilter: 'saturate(180%) blur(20px)',
  color: 'text.primary',
};
const logoWrap = {
  width: 32, height: 32, borderRadius: 8,
  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #22d3ee 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 6px 16px -6px rgba(99,102,241,0.6), inset 0 1px 0 rgba(255,255,255,0.2)',
  fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.5,
};

export default function TopBar() {
  const pendingUrl = useLabStore((s) => s.pendingUrl);
  const setPendingUrl = useLabStore((s) => s.setPendingUrl);
  const commitUrl = useLabStore((s) => s.commitUrl);
  const theme = useLabStore((s) => s.theme);
  const setTheme = useLabStore((s) => s.setTheme);

  // Push the URL to every selected device's Chrome via adb. We don't route
  // through a "global URL" store field anymore — real devices ARE the state.
  const onSubmit = useCallback(async (e) => {
    e.preventDefault();
    const url = normalizeUrl(pendingUrl);
    if (!url) return;
    setPendingUrl(url);
    commitUrl();
    const serials = useLabStore.getState().selectedAdbSerials;
    await Promise.all(serials.map((s) => api.adbNavigate(s, url).catch(() => {})));
  }, [pendingUrl, setPendingUrl, commitUrl]);

  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={appBarSx}>
      <MuiToolbar sx={{ gap: 2, minHeight: '56px !important' }}>
        <Box
          component="a"
          href="https://www.knicklab.com/"
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.25,
            textDecoration: 'none', color: 'inherit',
            px: 1, py: 0.5, mx: -1, borderRadius: 1.5,
            '&:hover': { background: (t) => t.palette.action.hover },
          }}
        >
          <Box sx={logoWrap}>L</Box>
          <Box>
            <Typography component="div" sx={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.3, lineHeight: 1.15, display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
              Lens
              <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: 11.5 }}>by KnickLab</Box>
            </Typography>
            <Typography component="div" sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 0.5, mt: '2px', opacity: 0.85 }}>
              Real Android device testing
              <OpenInNewIcon sx={{ fontSize: 10, opacity: 0.55 }} />
            </Typography>
          </Box>
        </Box>

        <Box component="form" onSubmit={onSubmit} sx={{ flex: 1, display: 'flex', gap: 1, maxWidth: 720, mx: 'auto' }}>
          <TextField
            fullWidth
            size="small"
            value={pendingUrl}
            onChange={(e) => setPendingUrl(e.target.value)}
            placeholder="https://example.com — open this on every selected device"
            InputProps={{
              sx: { borderRadius: 999, px: 1 },
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon fontSize="small" sx={{ opacity: 0.55 }} />
                </InputAdornment>
              ),
            }}
          />
          <Button type="submit" variant="contained" startIcon={<SendIcon />} sx={{ borderRadius: 999, px: 2.5 }}>
            Push
          </Button>
        </Box>

        <Stack direction="row" alignItems="center" gap={0.5}>
          <BackendConnector />
          <Tooltip title={`Theme: ${theme}`}>
            <IconButton size="small" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
      </MuiToolbar>
    </AppBar>
  );
}

function normalizeUrl(s) {
  const v = (s || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}
