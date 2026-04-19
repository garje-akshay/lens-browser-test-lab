const http = require('http');
const express = require('express');
const cors = require('cors');
const { PORT, CORS_ORIGIN } = require('./config');
const apiRouter = require('./routes/api');
const proxyRouter = require('./routes/proxy');
const { attachWebSocket } = require('./services/wsHub');
const { closeAll } = require('./services/sessionManager');

const app = express();
// Render terminates TLS at the edge and forwards as HTTP — trust x-forwarded-*
// so req.protocol reflects the real scheme (used when rewriting proxy URLs).
app.set('trust proxy', true);
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', apiRouter);
app.use('/proxy', proxyRouter);

const server = http.createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
});

async function shutdown() {
  console.log('[backend] shutting down...');
  await closeAll();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
