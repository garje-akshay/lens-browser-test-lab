'use client';
import { memo, useMemo, useState } from 'react';
import {
  Box, Stack, Typography, IconButton, TextField, InputAdornment, Collapse,
  ListItemButton, ListItemText, Chip, Tooltip, Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import AndroidIcon from '@mui/icons-material/Android';
import TabletMacIcon from '@mui/icons-material/TabletMac';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { DEVICES } from '../config/devices';
import { useLabStore } from '../store/useLabStore';

const GROUPS = (() => {
  const g = { iPhones: [], 'Android phones': [], Tablets: [] };
  for (const d of DEVICES) {
    if (d.category === 'tablet') g.Tablets.push(d);
    else if (d.os === 'ios') g.iPhones.push(d);
    else g['Android phones'].push(d);
  }
  return Object.entries(g);
})();

const GROUP_ICONS = {
  iPhones: PhoneIphoneIcon,
  'Android phones': AndroidIcon,
  Tablets: TabletMacIcon,
};

export default function DeviceSidebar({ collapsed, onToggle }) {
  const selected = useLabStore((s) => s.selectedDeviceIds);
  const toggleDevice = useLabStore((s) => s.toggleDevice);
  const clearAll = useLabStore.getState;

  const [q, setQ] = useState('');
  const [openGroups, setOpenGroups] = useState({ iPhones: true, 'Android phones': true, Tablets: true });

  const filtered = useMemo(() => {
    if (!q.trim()) return GROUPS;
    const n = q.toLowerCase();
    return GROUPS.map(([group, items]) => [
      group,
      items.filter((d) => d.name.toLowerCase().includes(n) || d.id.includes(n)),
    ]).filter(([, items]) => items.length > 0);
  }, [q]);

  const selectAllInGroup = (items) => {
    const sel = new Set(useLabStore.getState().selectedDeviceIds);
    const allOn = items.every((d) => sel.has(d.id));
    items.forEach((d) => {
      const on = sel.has(d.id);
      if (allOn ? on : !on) toggleDevice(d.id);
    });
  };

  const clearSelection = () => {
    const current = useLabStore.getState().selectedDeviceIds.slice();
    current.forEach((id) => toggleDevice(id));
  };

  if (collapsed) {
    return (
      <Box sx={{ width: 48, flexShrink: 0, borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1 }}>
        <Tooltip title="Open devices" placement="right">
          <IconButton onClick={onToggle} size="small"><MenuOpenIcon sx={{ transform: 'rotate(180deg)' }} /></IconButton>
        </Tooltip>
        <Chip label={selected.length} size="small" color="primary" sx={{ mt: 1 }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1 }}>Devices</Typography>
          <Chip label={selected.length} size="small" color={selected.length ? 'primary' : 'default'} />
        </Stack>
        <Stack direction="row">
          <Tooltip title="Clear selection">
            <span>
              <IconButton size="small" onClick={clearSelection} disabled={!selected.length}>
                <ClearAllIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Collapse sidebar">
            <IconButton size="small" onClick={onToggle}><MenuOpenIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          fullWidth
          size="small"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search devices"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Divider />

      <Box sx={{ overflowY: 'auto', flex: 1, py: 0.5 }}>
        {filtered.map(([group, items]) => {
          const Icon = GROUP_ICONS[group];
          const open = openGroups[group];
          const onIn = items.filter((d) => selected.includes(d.id)).length;
          return (
            <Box key={group}>
              <ListItemButton
                onClick={() => setOpenGroups((s) => ({ ...s, [group]: !s[group] }))}
                sx={{ py: 0.5, px: 2 }}
              >
                {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                <Icon fontSize="small" sx={{ mx: 1, opacity: 0.7 }} />
                <ListItemText
                  primary={group}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                  secondary={`${onIn}/${items.length}`}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <Tooltip title={onIn === items.length ? 'Deselect group' : 'Select group'}>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); selectAllInGroup(items); }}
                  >
                    <SelectAllIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
              <Collapse in={open} unmountOnExit>
                {items.map((d) => {
                  const isOn = selected.includes(d.id);
                  return (
                    <ListItemButton
                      key={d.id}
                      onClick={() => toggleDevice(d.id)}
                      selected={isOn}
                      sx={{ pl: 5, py: 0.5 }}
                    >
                      <ListItemText
                        primary={d.name}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondary={`${d.viewport.width}×${d.viewport.height} · ${d.deviceScaleFactor}x`}
                        secondaryTypographyProps={{ variant: 'caption', sx: { opacity: 0.7 } }}
                      />
                      {isOn && (
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }} />
                      )}
                    </ListItemButton>
                  );
                })}
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
