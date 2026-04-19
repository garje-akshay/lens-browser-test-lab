module.exports = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  // Local ws-scrcpy to reverse-proxy under /ws-scrcpy so users only need to
  // expose ONE tunnel (the backend) and everything else rides behind it.
  WSSCRCPY_TARGET: process.env.WSSCRCPY_TARGET || 'http://127.0.0.1:8000',
  // Enables /api/adb/* routes. Off by default so a publicly-hosted backend
  // can't exec adb; users flip it on when running locally against their
  // own device.
  ADB_ENABLED: process.env.ADB_ENABLED === '1',
};
