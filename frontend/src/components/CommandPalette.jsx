'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, TextField, List, ListItemButton, ListItemIcon, ListItemText,
  InputAdornment, Box, Typography, Chip, Divider, Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import AndroidIcon from '@mui/icons-material/Android';
import TabletMacIcon from '@mui/icons-material/TabletMac';
import BoltIcon from '@mui/icons-material/Bolt';
import VerifiedIcon from '@mui/icons-material/Verified';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import { DEVICES } from '../config/devices';
import { useLabStore } from '../store/useLabStore';

const PRESETS = [
  { label: 'Popular phones', ids: ['iphone-14-pro', 'pixel-7', 'galaxy-s22', 'iphone-se'] },
  { label: 'Flagship pair', ids: ['iphone-15-pro', 'pixel-8'] },
  { label: 'Size range', ids: ['iphone-se', 'galaxy-fold', 'iphone-14-pro-max', 'ipad-mini'] },
  { label: 'Tablets', ids: ['ipad-10', 'ipad-pro-11', 'galaxy-tab-s8'] },
];

export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const selectedDeviceIds = useLabStore((s) => s.selectedDeviceIds);
  const theme = useLabStore((s) => s.theme);

  useEffect(() => { if (open) { setQ(''); setSel(0); } }, [open]);

  const items = useMemo(() => {
    const selected = selectedDeviceIds;
    const actions = [
      { id: 'a:mode-iframe', type: 'action', label: 'Switch to iframe mode', icon: BoltIcon,
        run: () => useLabStore.getState().setMode('iframe') },
      { id: 'a:theme', type: 'action', label: 'Toggle theme', icon: theme === 'dark' ? LightModeIcon : DarkModeIcon,
        run: () => { const s = useLabStore.getState(); s.setTheme(s.theme === 'dark' ? 'light' : 'dark'); } },
      { id: 'a:clear', type: 'action', label: 'Clear all selected devices', icon: ClearAllIcon,
        run: () => {
          const ids = useLabStore.getState().selectedDeviceIds.slice();
          const toggle = useLabStore.getState().toggleDevice;
          ids.forEach(toggle);
        } },
      ...PRESETS.map((p) => ({
        id: `p:${p.label}`, type: 'preset', label: `Preset: ${p.label}`, icon: PlayCircleFilledIcon,
        hint: p.ids.length + ' devices' + (p.mode ? ` · ${p.mode}` : ''),
        run: () => {
          const s = useLabStore.getState();
          s.selectedDeviceIds.slice().forEach(s.toggleDevice);
          p.ids.forEach(s.toggleDevice);
          if (p.mode) s.setMode(p.mode);
        },
      })),
    ];
    const devices = DEVICES.map((d) => ({
      id: `d:${d.id}`, type: 'device', label: d.name, device: d,
      hint: `${d.viewport.width}×${d.viewport.height}`,
      on: selected.includes(d.id),
      icon: d.category === 'tablet' ? TabletMacIcon : d.os === 'ios' ? PhoneIphoneIcon : AndroidIcon,
      run: () => useLabStore.getState().toggleDevice(d.id),
    }));

    const all = [...actions, ...devices];
    if (!q.trim()) return all;
    const n = q.toLowerCase();
    return all.filter((i) => i.label.toLowerCase().includes(n));
  }, [q, open, selectedDeviceIds, theme]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[sel];
        if (it) { it.run(); if (it.type !== 'device') onClose(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, sel, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { borderRadius: 2, overflow: 'hidden' } } }}
    >
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Type a command or search for a device…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          variant="standard"
        />
      </Box>
      <List dense sx={{ maxHeight: 400, overflow: 'auto', py: 0 }}>
        {items.length === 0 && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No matches</Typography>
          </Box>
        )}
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <ListItemButton
              key={it.id}
              selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => { it.run(); if (it.type !== 'device') onClose(); }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}><Icon fontSize="small" /></ListItemIcon>
              <ListItemText primary={it.label} secondary={it.hint} />
              {it.on && <Chip size="small" label="selected" color="primary" variant="outlined" />}
            </ListItemButton>
          );
        })}
      </List>
      <Divider />
      <Stack direction="row" gap={2} sx={{ px: 1.5, py: 0.75, opacity: 0.6 }}>
        <Typography variant="caption">↑↓ navigate</Typography>
        <Typography variant="caption">↵ select</Typography>
        <Typography variant="caption">esc close</Typography>
      </Stack>
    </Dialog>
  );
}
