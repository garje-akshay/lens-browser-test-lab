'use client';
import { Box, Stack, Typography, Chip } from '@mui/material';
import AndroidIcon from '@mui/icons-material/Android';
import UsbIcon from '@mui/icons-material/Usb';
import { useLabStore } from '../store/useLabStore';
import AdbDeviceFrame from './AdbDeviceFrame';

const canvasSx = { p: { xs: 2, md: 4 }, minHeight: '100%' };
const framesStackSx = { gap: { xs: 3, md: 5 }, rowGap: 5 };

export default function DeviceGrid() {
  const selectedAdbSerials = useLabStore((s) => s.selectedAdbSerials);

  if (selectedAdbSerials.length === 0) return <EmptyState />;

  return (
    <Box sx={canvasSx}>
      <Stack direction="row" sx={framesStackSx} flexWrap="wrap" alignItems="flex-start">
        {selectedAdbSerials.map((serial) => (
          <AdbDeviceFrame key={`adb:${serial}`} serial={serial} />
        ))}
      </Stack>
    </Box>
  );
}

function EmptyState() {
  return (
    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Stack alignItems="center" gap={2.5} sx={{ maxWidth: 560, textAlign: 'center' }}>
        <Chip
          size="small"
          label="Lens · by KnickLab"
          sx={{
            height: 22, fontWeight: 600, letterSpacing: 0.2,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(34,211,238,0.12))',
            border: (t) => `1px solid ${t.palette.divider}`,
          }}
        />
        <Typography variant="h4" fontWeight={700}>
          Test on your real Android device
        </Typography>
        <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Lens streams the screen of any Android device over ADB, captures real network traffic,
          and exports HAR — all from a phone plugged into your own laptop. No fake viewports.
        </Typography>

        <Stack direction="row" gap={3} mt={1} flexWrap="wrap" justifyContent="center">
          <Step n={1} icon={<UsbIcon />} title="Plug in" body="Connect an Android phone with USB debugging on, or start an emulator." />
          <Step n={2} icon={<AndroidIcon sx={{ color: '#3ddc84' }} />} title="Install the agent" body="brew tap garje-akshay/lens && brew install lens-agent && lens-agent start" />
          <Step n={3} icon={<Chip label="☁" size="small" />} title="Connect" body="Click the cloud icon, paste the printed tunnel URL." />
        </Stack>

        <Typography variant="caption" sx={{ opacity: 0.5, mt: 2 }}>
          A product of{' '}
          <Box component="a" href="https://www.knicklab.com/" target="_blank" rel="noopener noreferrer"
            sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, '&:hover': { color: 'primary.main' } }}>
            www.knicklab.com
          </Box>
        </Typography>
      </Stack>
    </Box>
  );
}

function Step({ n, icon, title, body }) {
  return (
    <Stack alignItems="center" gap={0.75} sx={{ maxWidth: 160 }}>
      <Box sx={{
        width: 42, height: 42, borderRadius: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(34,211,238,0.15))',
        color: 'primary.main',
      }}>{icon}</Box>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>{n}. {title}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        {body}
      </Typography>
    </Stack>
  );
}
