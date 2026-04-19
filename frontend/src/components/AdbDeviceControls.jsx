'use client';
import { useState } from 'react';
import {
  Box, Stack, Typography, Divider, Button, IconButton, Tooltip, TextField,
  ToggleButton, ToggleButtonGroup, Switch, FormControlLabel, Slider, MenuItem,
  Select, Alert, LinearProgress, Collapse,
} from '@mui/material';
import ScreenRotationIcon from '@mui/icons-material/ScreenRotation';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import WifiIcon from '@mui/icons-material/Wifi';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import HomeIcon from '@mui/icons-material/Home';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuIcon from '@mui/icons-material/Menu';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeDownIcon from '@mui/icons-material/VolumeDown';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import StopIcon from '@mui/icons-material/Stop';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { api, getBackendUrl } from '../lib/api';

function Section({ title, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        gap={1}
        sx={{ cursor: 'pointer', py: 0.5 }}
        onClick={() => setOpen((o) => !o)}
      >
        {Icon && <Icon fontSize="small" sx={{ opacity: 0.75 }} />}
        <Typography variant="caption" sx={{ fontWeight: 600, flex: 1, opacity: 0.85 }}>
          {title}
        </Typography>
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pt: 1, pb: 1.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

export default function AdbDeviceControls({ serial }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rotation, setRotation] = useState(0);
  const [dark, setDark] = useState(false);
  const [wifi, setWifi] = useState(true);
  const [data, setData] = useState(true);
  const [touches, setTouches] = useState(false);
  const [pointer, setPointer] = useState(false);
  const [font, setFont] = useState(1.0);
  const [density, setDensity] = useState('');
  const [batteryLevel, setBatteryLevel] = useState(50);
  const [batteryStatus, setBatteryStatus] = useState('3');
  const [pkg, setPkg] = useState('');
  const [packages, setPackages] = useState([]);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState('');

  async function run(fn) {
    setBusy(true); setErr('');
    try { await fn(); }
    catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  }

  const loadPackages = () =>
    run(async () => {
      const { packages: list } = await api.adbListPackages(serial);
      setPackages(list || []);
    });

  async function stopRecording() {
    // The stop endpoint streams the mp4 back — use a raw fetch so we can pull
    // the blob and trigger a download.
    setBusy(true); setErr('');
    try {
      const res = await fetch(api.adbRecordStopUrl(serial), { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lens-${serial}-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setRecording(false);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function loadLog() {
    run(async () => {
      const { log: out } = await api.adbLogcat(serial, { lines: 500, pkg });
      setLog(out || '');
    });
  }

  return (
    <Stack sx={{ height: '100%', overflow: 'auto', px: 1.5, py: 1 }} gap={0.5}>
      {busy && <LinearProgress sx={{ position: 'sticky', top: 0, zIndex: 1 }} />}
      {err && (
        <Alert severity="error" onClose={() => setErr('')} sx={{ fontSize: 11, py: 0 }}>
          {err}
        </Alert>
      )}

      <Section title="Display" icon={ScreenRotationIcon}>
        <Stack gap={1.5}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="caption" sx={{ minWidth: 70, opacity: 0.7 }}>Rotation</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={rotation}
              onChange={(_, v) => {
                if (v == null) return;
                setRotation(v);
                run(() => api.adbControl(serial, 'rotate', { rotation: v }));
              }}
            >
              <ToggleButton value={0}>0°</ToggleButton>
              <ToggleButton value={1}>90°</ToggleButton>
              <ToggleButton value={2}>180°</ToggleButton>
              <ToggleButton value={3}>270°</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={dark}
                onChange={(e) => {
                  setDark(e.target.checked);
                  run(() => api.adbControl(serial, 'dark', { on: e.target.checked }));
                }}
              />
            }
            label={<Typography variant="caption">Dark mode</Typography>}
          />
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>Font scale: {font.toFixed(2)}×</Typography>
            <Slider
              size="small"
              value={font}
              min={0.85}
              max={1.5}
              step={0.05}
              marks={[{ value: 1, label: '1×' }]}
              onChange={(_, v) => setFont(v)}
              onChangeCommitted={(_, v) => run(() => api.adbControl(serial, 'font-scale', { scale: v }))}
            />
          </Box>
          <Stack direction="row" gap={1} alignItems="center">
            <TextField
              size="small"
              label="Density (dpi)"
              type="number"
              value={density}
              onChange={(e) => setDensity(e.target.value)}
              sx={{ flex: 1 }}
              inputProps={{ min: 120, max: 640 }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => run(() => api.adbControl(serial, 'density', { density }))}
            >
              Set
            </Button>
            <Button
              size="small"
              onClick={() => {
                setDensity('');
                run(() => api.adbControl(serial, 'density', { density: '' }));
              }}
            >
              Reset
            </Button>
          </Stack>
        </Stack>
      </Section>

      <Divider />

      <Section title="Debug overlays" icon={TouchAppIcon}>
        <Stack gap={0.5}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={touches}
                onChange={(e) => {
                  setTouches(e.target.checked);
                  run(() => api.adbControl(serial, 'show-touches', { on: e.target.checked }));
                }}
              />
            }
            label={<Typography variant="caption">Show touches</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={pointer}
                onChange={(e) => {
                  setPointer(e.target.checked);
                  run(() => api.adbControl(serial, 'pointer-location', { on: e.target.checked }));
                }}
              />
            }
            label={<Typography variant="caption">Pointer location overlay</Typography>}
          />
        </Stack>
      </Section>

      <Divider />

      <Section title="Connectivity" icon={WifiIcon}>
        <Stack gap={0.5}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={wifi}
                onChange={(e) => {
                  setWifi(e.target.checked);
                  run(() => api.adbControl(serial, 'wifi', { on: e.target.checked }));
                }}
              />
            }
            label={<Typography variant="caption">Wi-Fi</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={data}
                onChange={(e) => {
                  setData(e.target.checked);
                  run(() => api.adbControl(serial, 'data', { on: e.target.checked }));
                }}
              />
            }
            label={<Typography variant="caption">Mobile data</Typography>}
          />
        </Stack>
      </Section>

      <Divider />

      <Section title="Battery" icon={BatteryChargingFullIcon} defaultOpen={false}>
        <Stack gap={1}>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>Level: {batteryLevel}%</Typography>
            <Slider
              size="small"
              value={batteryLevel}
              min={0}
              max={100}
              onChange={(_, v) => setBatteryLevel(v)}
              onChangeCommitted={(_, v) =>
                run(() => api.adbControl(serial, 'battery', { level: v, status: batteryStatus }))
              }
            />
          </Box>
          <Stack direction="row" gap={1} alignItems="center">
            <Typography variant="caption" sx={{ minWidth: 70, opacity: 0.7 }}>Status</Typography>
            <Select
              size="small"
              value={batteryStatus}
              onChange={(e) => {
                setBatteryStatus(e.target.value);
                run(() => api.adbControl(serial, 'battery', { level: batteryLevel, status: e.target.value }));
              }}
              sx={{ flex: 1 }}
            >
              <MenuItem value="2">Charging</MenuItem>
              <MenuItem value="3">Discharging</MenuItem>
              <MenuItem value="4">Not charging</MenuItem>
              <MenuItem value="5">Full</MenuItem>
            </Select>
          </Stack>
          <Button size="small" onClick={() => run(() => api.adbControl(serial, 'battery', { reset: true }))}>
            Reset to real battery
          </Button>
        </Stack>
      </Section>

      <Divider />

      <Section title="Hardware keys" icon={HomeIcon}>
        <Stack direction="row" flexWrap="wrap" gap={0.5}>
          <Tooltip title="Home"><IconButton size="small" onClick={() => run(() => api.adbControl(serial, 'keyevent', { key: 'HOME' }))}><HomeIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Back"><IconButton size="small" onClick={() => run(() => api.adbControl(serial, 'keyevent', { key: 'BACK' }))}><ArrowBackIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Recent apps"><IconButton size="small" onClick={() => run(() => api.adbControl(serial, 'keyevent', { key: 'APP_SWITCH' }))}><MenuIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Power"><IconButton size="small" onClick={() => run(() => api.adbControl(serial, 'keyevent', { key: 'POWER' }))}><PowerSettingsNewIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Volume up"><IconButton size="small" onClick={() => run(() => api.adbControl(serial, 'keyevent', { key: 'VOLUME_UP' }))}><VolumeUpIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Volume down"><IconButton size="small" onClick={() => run(() => api.adbControl(serial, 'keyevent', { key: 'VOLUME_DOWN' }))}><VolumeDownIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
        <Stack direction="row" gap={1} sx={{ mt: 1 }}>
          <TextField
            size="small"
            placeholder="Type text to paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button
            size="small"
            variant="outlined"
            disabled={!text}
            onClick={() => run(async () => {
              await api.adbControl(serial, 'input-text', { text });
              setText('');
            })}
          >
            Paste
          </Button>
        </Stack>
      </Section>

      <Divider />

      <Section title="Apps" defaultOpen={false}>
        <Stack gap={1}>
          <Stack direction="row" gap={1}>
            <Select
              size="small"
              displayEmpty
              value={pkg}
              onChange={(e) => setPkg(e.target.value)}
              onOpen={() => { if (!packages.length) loadPackages(); }}
              sx={{ flex: 1 }}
              renderValue={(v) => v || <Typography variant="caption" sx={{ opacity: 0.5 }}>Select package…</Typography>}
            >
              {packages.map((p) => (
                <MenuItem key={p} value={p} sx={{ fontSize: 12 }}>{p}</MenuItem>
              ))}
            </Select>
            <Button size="small" onClick={loadPackages}>Refresh</Button>
          </Stack>
          <TextField
            size="small"
            placeholder="...or enter com.example.app"
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
          />
          <Stack direction="row" gap={0.5} flexWrap="wrap">
            <Button size="small" variant="outlined" disabled={!pkg}
              onClick={() => run(() => api.adbControl(serial, 'launch-app', { package: pkg }))}>
              Launch
            </Button>
            <Button size="small" disabled={!pkg}
              onClick={() => run(() => api.adbControl(serial, 'force-stop', { package: pkg }))}>
              Force stop
            </Button>
            <Button size="small" color="warning" disabled={!pkg}
              onClick={() => {
                if (!confirm(`Clear all data for ${pkg}?`)) return;
                run(() => api.adbControl(serial, 'clear-app', { package: pkg }));
              }}>
              Clear data
            </Button>
          </Stack>
        </Stack>
      </Section>

      <Divider />

      <Section title="Screen recording" icon={FiberManualRecordIcon}>
        {!recording ? (
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<FiberManualRecordIcon />}
            onClick={() =>
              run(async () => {
                await api.adbControl(serial, 'record/start');
                setRecording(true);
              })
            }
          >
            Start recording
          </Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<StopIcon />}
            onClick={stopRecording}
          >
            Stop &amp; download
          </Button>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.6 }}>
          Max 180s per clip (Android limit).
        </Typography>
      </Section>

      <Divider />

      <Section title="Logcat" defaultOpen={false}>
        <Stack gap={1}>
          <Stack direction="row" gap={0.5}>
            <Button size="small" variant="outlined" onClick={loadLog}>
              Fetch last 500
            </Button>
            <Button size="small" onClick={() => run(() => api.adbControl(serial, 'logcat/clear'))}>
              Clear buffer
            </Button>
          </Stack>
          {log && (
            <Box
              component="pre"
              sx={{
                fontSize: 10,
                fontFamily: 'ui-monospace, monospace',
                maxHeight: 220,
                overflow: 'auto',
                m: 0,
                p: 1,
                bgcolor: '#0a0a0a',
                color: '#bbb',
                borderRadius: 1,
                whiteSpace: 'pre-wrap',
              }}
            >
              {log}
            </Box>
          )}
        </Stack>
      </Section>
    </Stack>
  );
}
