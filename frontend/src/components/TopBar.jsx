'use client';
import { memo, useState, useCallback } from 'react';
import {
  AppBar, Toolbar as MuiToolbar, Box, Stack, IconButton, Button, TextField,
  InputAdornment, Tooltip, Typography, Menu, MenuItem, ListItemIcon, ListItemText,
  Snackbar, Divider, Chip,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ShareIcon from '@mui/icons-material/Share';
import BoltIcon from '@mui/icons-material/Bolt';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useLabStore } from '../store/useLabStore';

const appBarSx = {
  borderBottom: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
  backdropFilter: 'saturate(180%) blur(20px)',
  color: 'text.primary',
};
const logoWrap = {
  width: 32, height: 32,
  borderRadius: 8,
  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #22d3ee 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 6px 16px -6px rgba(99,102,241,0.6), inset 0 1px 0 rgba(255,255,255,0.2)',
  fontWeight: 800, fontSize: 15, color: '#fff',
  letterSpacing: -0.5,
};
const brandKnick = {
  fontWeight: 700, letterSpacing: -0.3, fontSize: 15,
  color: 'text.primary',
  lineHeight: 1.15,
  display: 'flex', alignItems: 'baseline', gap: 0.75,
};
const brandSub = {
  color: 'text.secondary',
  fontWeight: 500,
  fontSize: 11.5,
  letterSpacing: 0,
};
const brandProduct = {
  fontWeight: 500, fontSize: 11,
  letterSpacing: 0.1,
  color: 'text.secondary',
  lineHeight: 1.1,
  display: 'flex', alignItems: 'center', gap: 0.5, mt: '2px',
  opacity: 0.85,
};
const brandLink = {
  display: 'flex', alignItems: 'center', gap: 1.25,
  textDecoration: 'none', color: 'inherit',
  px: 1, py: 0.5, mx: -1,
  borderRadius: 1.5,
  transition: 'background 0.15s',
  '&:hover': { background: (t) => t.palette.action.hover },
};

export default function TopBar({ onOpenShortcuts }) {
  const pendingUrl = useLabStore((s) => s.pendingUrl);
  const setPendingUrl = useLabStore((s) => s.setPendingUrl);
  const commitUrl = useLabStore((s) => s.commitUrl);
  const reload = useLabStore((s) => s.reload);
  const theme = useLabStore((s) => s.theme);
  const setTheme = useLabStore((s) => s.setTheme);

  const [menu, setMenu] = useState(null);
  const [snack, setSnack] = useState('');

  const onSubmit = useCallback((e) => {
    e.preventDefault();
    commitUrl();
  }, [commitUrl]);

  const copyShare = useCallback(async () => {
    const url = useLabStore.getState().shareUrl();
    await navigator.clipboard.writeText(url);
    setSnack('Share link copied');
    setMenu(null);
  }, []);

  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={0} sx={appBarSx}>
        <MuiToolbar sx={{ gap: 2, minHeight: '56px !important' }}>
          <Box
            component="a"
            href="https://www.knicklab.com/"
            target="_blank"
            rel="noopener noreferrer"
            sx={brandLink}
          >
            <Box sx={logoWrap}>L</Box>
            <Box>
              <Typography component="div" sx={brandKnick}>
                Lens
                <Box component="span" sx={brandSub}>by KnickLab</Box>
              </Typography>
              <Typography component="div" sx={brandProduct}>
                Multi-device browser preview
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
              placeholder="https://example.com"
              InputProps={{
                sx: { borderRadius: 999, px: 1 },
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon fontSize="small" sx={{ opacity: 0.55 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Reload all devices">
                      <IconButton size="small" onClick={reload}><RefreshIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" variant="contained" startIcon={<BoltIcon />} sx={{ borderRadius: 999, px: 2.5 }}>
              Go
            </Button>
          </Box>

          <Stack direction="row" alignItems="center" gap={0.5}>
            <Tooltip title={`Theme: ${theme}`}>
              <IconButton size="small" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={(e) => setMenu(e.currentTarget)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Stack>
        </MuiToolbar>
      </AppBar>

      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={copyShare}>
          <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Copy share link</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setMenu(null); onOpenShortcuts?.(); }}>
          <ListItemIcon><KeyboardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Keyboard shortcuts</ListItemText>
          <Chip label="⌘K" size="small" sx={{ ml: 2, height: 18 }} />
        </MenuItem>
      </Menu>

      <Snackbar
        open={!!snack}
        autoHideDuration={2000}
        onClose={() => setSnack('')}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
