const http = require('http');
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { PORT, CORS_ORIGIN, WSSCRCPY_TARGET } = require('./config');
const adbRouter = require('./routes/adb');
const adb = require('./services/adb');
const adbDevtools = require('./services/adbDevtools');

const app = express();
// Render terminates TLS at the edge and forwards as HTTP — trust x-forwarded-*
// so req.protocol reflects the real scheme (used when rewriting proxy URLs).
app.set('trust proxy', true);
app.use(cors({ origin: CORS_ORIGIN }));

// Reverse-proxy ws-scrcpy at /ws-scrcpy so users only need ONE tunnel to share
// their local setup. This must be mounted BEFORE express.json() — ws-scrcpy
// streams video over WebSocket and we don't want body-parser buffering it.
const wsScrcpyProxy = createProxyMiddleware({
  target: WSSCRCPY_TARGET,
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/ws-scrcpy': '' },
});
app.use('/ws-scrcpy', wsScrcpyProxy);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/adb', adbRouter);

const server = http.createServer(app);
// WebSocket upgrades for /ws-scrcpy bypass the Express stack, so bind them
// directly to the server's 'upgrade' event.
server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/ws-scrcpy')) {
    wsScrcpyProxy.upgrade(req, socket, head);
  }
});

server.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
});

async function shutdown() {
  console.log('[backend] shutting down...');
  adb.closeAll();
  await adbDevtools.closeAll();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
