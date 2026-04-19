'use client';
import { memo, useState } from 'react';
import {
  Box, Stack, ToggleButton, ToggleButtonGroup, IconButton, Tooltip, Button,
  Popover, Typography, Select, MenuItem, Switch, FormControlLabel, Divider, Chip,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import BoltIcon from '@mui/icons-material/Bolt';
import VerifiedIcon from '@mui/icons-material/Verified';
import PublicIcon from '@mui/icons-material/Public';
import ScreenRotationIcon from '@mui/icons-material/ScreenRotation';
import SyncIcon from '@mui/icons-material/Sync';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useLabStore } from '../store/useLabStore';
import { NETWORK_PROFILES } from '../config/devices';

const NETWORK_OPTIONS = Object.entries(NETWORK_PROFILES).map(([v, { name }]) => ({ v, l: name }));

const barSx = {
  px: 2, py: 1,
  borderBottom: 1, borderColor: 'divider',
  bgcolor: 'background.paper',
  display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
};

export default function ViewBar({ onCapture }) {
  const mode = useLabStore((s) => s.mode);
  const setMode = useLabStore((s) => s.setMode);
  const selectedCount = useLabStore((s) => s.selectedDeviceIds.length);
  const [anchor, setAnchor] = useState(null);

  return (
    <>
      <Box sx={barSx}>
        <ToggleButtonGroup
          value={mode === 'real' ? 'iframe' : mode}
          exclusive
          size="small"
          onChange={(_e, v) => v && v !== 'real' && setMode(v)}
          sx={{ '& .MuiToggleButton-root': { px: 1.5, gap: 0.75 } }}
        >
          <ToggleButton value="iframe">
            <BoltIcon fontSize="small" />
            iframe
          </ToggleButton>
          <Tooltip title="Real Chromium emulator with OS chrome — launching soon" placement="bottom">
            <span>
              <ToggleButton value="real" disabled sx={{ position: 'relative' }}>
                <VerifiedIcon fontSize="small" />
                emulator
                <Chip
                  label="Soon"
                  size="small"
                  sx={{
                    ml: 0.75, height: 16, fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                    background: 'linear-gradient(135deg, #6366f1, #22d3ee)',
                    color: '#fff',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              </ToggleButton>
            </span>
          </Tooltip>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        <Button
          size="small"
          variant="outlined"
          startIcon={<TuneIcon />}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ borderRadius: 999 }}
        >
          Settings
        </Button>

        <Box sx={{ flex: 1 }} />

        {selectedCount > 0 && (
          <>
            <Chip
              size="small"
              label={`${selectedCount} device${selectedCount === 1 ? '' : 's'}`}
              color="primary"
              variant="outlined"
            />
            <Tooltip title="Capture all screens">
              <IconButton size="small" onClick={onCapture}>
                <PhotoCameraIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      <SettingsPopover anchor={anchor} onClose={() => setAnchor(null)} />
    </>
  );
}

function SettingsPopover({ anchor, onClose }) {
  const networkProfile = useLabStore((s) => s.networkProfile);
  const setNetworkProfile = useLabStore((s) => s.setNetworkProfile);
  const orientation = useLabStore((s) => s.orientation);
  const setOrientation = useLabStore((s) => s.setOrientation);
  const useProxy = useLabStore((s) => s.useProxy);
  const setUseProxy = useLabStore((s) => s.setUseProxy);
  const syncScroll = useLabStore((s) => s.syncScroll);
  const setSyncScroll = useLabStore((s) => s.setSyncScroll);
  const mode = useLabStore((s) => s.mode);
  const applyGlobalToAll = useLabStore((s) => s.applyGlobalToAll);
  const clearAllOverrides = useLabStore((s) => s.clearAllOverrides);

  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{ paper: { sx: { width: 340, p: 2, borderRadius: 2 } } }}
    >
      <Typography variant="overline" sx={{ letterSpacing: 1, opacity: 0.7 }}>Defaults</Typography>
      <Stack gap={1.5} mt={1}>
        <LabeledRow icon={<PublicIcon fontSize="small" />} label="Network">
          <Select size="small" value={networkProfile} onChange={(e) => setNetworkProfile(e.target.value)} sx={{ minWidth: 160 }}>
            {NETWORK_OPTIONS.map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
          </Select>
        </LabeledRow>
        <LabeledRow icon={<ScreenRotationIcon fontSize="small" />} label="Orientation">
          <Select size="small" value={orientation} onChange={(e) => setOrientation(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="portrait">Portrait</MenuItem>
            <MenuItem value="landscape">Landscape</MenuItem>
          </Select>
        </LabeledRow>
        {mode === 'iframe' && (
          <FormControlLabel
            sx={{ justifyContent: 'space-between', ml: 0 }}
            labelPlacement="start"
            label={<Stack direction="row" alignItems="center" gap={1}><SwapHorizIcon fontSize="small" /> Proxy (bypass XFO)</Stack>}
            control={<Switch size="small" checked={useProxy} onChange={(e) => setUseProxy(e.target.checked)} />}
          />
        )}
        <FormControlLabel
          sx={{ justifyContent: 'space-between', ml: 0 }}
          labelPlacement="start"
          label={<Stack direction="row" alignItems="center" gap={1}><SyncIcon fontSize="small" /> Sync scroll</Stack>}
          control={<Switch size="small" checked={syncScroll} onChange={(e) => setSyncScroll(e.target.checked)} />}
        />
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" gap={1}>
        <Button size="small" fullWidth startIcon={<DoneAllIcon />} onClick={() => { applyGlobalToAll(); onClose(); }}>
          Apply to all
        </Button>
        <Button size="small" fullWidth color="inherit" startIcon={<ClearAllIcon />} onClick={() => { clearAllOverrides(); onClose(); }}>
          Clear overrides
        </Button>
      </Stack>
    </Popover>
  );
}

const LabeledRow = memo(function LabeledRow({ icon, label, children }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between">
      <Stack direction="row" alignItems="center" gap={1}>
        {icon}
        <Typography variant="body2">{label}</Typography>
      </Stack>
      {children}
    </Stack>
  );
});
