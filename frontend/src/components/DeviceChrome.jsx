'use client';
import { memo, useEffect, useState } from 'react';
import { Box } from '@mui/material';

// OS-aware bezel + status bar for the emulator view.
// Renders status bar (clock + system icons) over the screen so it looks like
// a real phone. The child element is the live surface (iframe or img).
//
// Phones get a thick rounded bezel + island/camera cutout + home indicator.
// Tablets get a flatter bezel. iOS uses SF-like fonts; Android uses Roboto.

function DeviceChrome({ device, width, height, children }) {
  const isIOS = device.os === 'ios';
  const isTablet = device.category === 'tablet';
  const hasIsland = isIOS && !isTablet && device.viewport.height >= 812; // iPhone X+

  const skinClasses = [
    'skin',
    isIOS ? 'skin-ios' : 'skin-android',
    isTablet ? 'tablet' : '',
    hasIsland ? 'has-island' : '',
  ].filter(Boolean).join(' ');

  return (
    <Box className={skinClasses} sx={{ width: width + 28, height: height + 28, contain: 'layout paint' }}>
      <Box className="screen" sx={{ width, height }}>
        <StatusBar os={device.os} width={width} hasIsland={hasIsland} />
        {children}
      </Box>
    </Box>
  );
}

export default memo(DeviceChrome);

const StatusBar = memo(function StatusBar({ os, width, hasIsland }) {
  const time = useClock();
  // Narrow phones hide some icons so text doesn't collide with the island.
  const narrow = width < 360;

  if (os === 'ios') {
    return (
      <Box className="status-bar" sx={{ px: hasIsland ? '32px' : '18px' }}>
        <span className="left">{time}</span>
        <span className="right">
          {!narrow && <span className="sb-icon sb-signal" />}
          <span className="sb-icon sb-wifi" />
          <span className="sb-battery" />
        </span>
      </Box>
    );
  }

  return (
    <Box className="status-bar android">
      <span className="left">{time}</span>
      <span className="right">
        <span className="sb-icon sb-signal" />
        <span className="sb-icon sb-wifi" />
        <span className="sb-battery" />
      </span>
    </Box>
  );
});

function useClock() {
  const [t, setT] = useState('');
  useEffect(() => {
    setT(formatTime(new Date()));
    const id = setInterval(() => setT(formatTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function formatTime(d) {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const suffix = h >= 12 ? '' : '';
  h = h % 12 || 12;
  return `${h}:${m}${suffix}`;
}
