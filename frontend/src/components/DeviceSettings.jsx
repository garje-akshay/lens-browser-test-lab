'use client';
import { useState } from 'react';
import {
  Paper, Stack, TextField, Button, Select, MenuItem, Switch, FormControlLabel,
  IconButton, Typography, Box, Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { NETWORK_PROFILES } from '../config/devices';
import { useLabStore, useDeviceConfig } from '../store/useLabStore';

export default function DeviceSettings({ deviceId, mode }) {
  const config = useDeviceConfig(deviceId);
  const setDeviceOverride = useLabStore((s) => s.setDeviceOverride);
  const clearDeviceOverrides = useLabStore((s) => s.clearDeviceOverrides);
  const reloadDevice = useLabStore((s) => s.reloadDevice);

  const [pendingUrl, setPendingUrl] = useState(config.url);

  const submitUrl = (e) => {
    e.preventDefault();
    setDeviceOverride(deviceId, { url: normalizeUrl(pendingUrl) });
  };

  return (
    <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
      <Box component="form" onSubmit={submitUrl} sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          label="URL"
          value={pendingUrl}
          onChange={(e) => setPendingUrl(e.target.value)}
          placeholder="inherits from toolbar"
        />
        <Button type="submit" variant="contained" size="small">Go</Button>
        {config.urlOverridden && (
          <IconButton
            size="small"
            title="Inherit URL from toolbar"
            onClick={() => setDeviceOverride(deviceId, { url: undefined })}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
        <Field label="Orientation" overridden={config.orientationOverridden}
          onClear={() => setDeviceOverride(deviceId, { orientation: undefined })}>
          <Select
            size="small"
            value={config.orientation}
            onChange={(e) => setDeviceOverride(deviceId, { orientation: e.target.value })}
            sx={{ minWidth: 110 }}
          >
            <MenuItem value="portrait">Portrait</MenuItem>
            <MenuItem value="landscape">Landscape</MenuItem>
          </Select>
        </Field>

        {mode === 'real' && (
          <Field label="Network" overridden={config.networkProfileOverridden}
            onClear={() => setDeviceOverride(deviceId, { networkProfile: undefined })}>
            <Select
              size="small"
              value={config.networkProfile}
              onChange={(e) => setDeviceOverride(deviceId, { networkProfile: e.target.value })}
              sx={{ minWidth: 110 }}
            >
              {Object.entries(NETWORK_PROFILES).map(([v, { name }]) => (
                <MenuItem key={v} value={v}>{name}</MenuItem>
              ))}
            </Select>
          </Field>
        )}

        {mode === 'iframe' && (
          <Field label="Proxy" overridden={config.useProxyOverridden}
            onClear={() => setDeviceOverride(deviceId, { useProxy: undefined })}>
            <Switch
              size="small"
              checked={config.useProxy}
              onChange={(e) => setDeviceOverride(deviceId, { useProxy: e.target.checked })}
            />
          </Field>
        )}

        <Box sx={{ flex: 1 }} />

        <Button size="small" startIcon={<RefreshIcon />} onClick={() => reloadDevice(deviceId)}>
          Reload
        </Button>
        <Button
          size="small"
          startIcon={<RestartAltIcon />}
          color="inherit"
          onClick={() => {
            clearDeviceOverrides(deviceId);
            setPendingUrl(useLabStore.getState().url);
          }}
        >
          Reset
        </Button>
      </Stack>
    </Paper>
  );
}

function Field({ label, overridden, onClear, children }) {
  return (
    <Stack direction="row" alignItems="center" gap={0.75}>
      <Typography
        variant="caption"
        sx={{ opacity: overridden ? 1 : 0.7, color: overridden ? 'primary.main' : 'inherit', fontWeight: overridden ? 600 : 400 }}
      >
        {label}
      </Typography>
      {children}
      {overridden && (
        <IconButton size="small" onClick={onClear} title={`Inherit ${label} from toolbar`}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Stack>
  );
}

function normalizeUrl(input) {
  const s = (input || '').trim();
  if (!s) return 'https://example.com';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
