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
//
// We inject a <style> tag on the main HTML page to hide ws-scrcpy's default
// toolbar + settings panel so only the video canvas renders inside our iframe
// (the Lens UI already provides its own device chrome). The canvas is also
// stretched to fill the iframe viewport.
const LENS_SCRCPY_CSS = `
  html, body { margin:0; padding:0; background:#000; overflow:hidden; height:100%; }
  body.stream { display:flex; align-items:center; justify-content:center; }
  body.stream .device-view { position:relative; width:100%; height:100%; }
  body.stream .control-buttons-list,
  body.stream .more-box { display:none !important; }
  body.stream .video {
    position:absolute !important; inset:0 !important;
    width:100% !important; height:100% !important;
  }
  body.stream .video canvas.video-layer,
  body.stream .video canvas.touch-layer {
    width:100% !important; height:100% !important;
    display:block;
  }
`;
const wsScrcpyProxy = createProxyMiddleware({
  target: WSSCRCPY_TARGET,
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/ws-scrcpy': '' },
  selfHandleResponse: true,
  on: {
    proxyRes: (proxyRes, req, res) => {
      const ct = proxyRes.headers['content-type'] || '';
      // Only rewrite the main HTML document; pass through JS/CSS/assets/WS
      // untouched. The stream page returns text/html.
      if (!ct.includes('text/html')) {
        Object.entries(proxyRes.headers).forEach(([k, v]) => res.setHeader(k, v));
        res.statusCode = proxyRes.statusCode || 200;
        proxyRes.pipe(res);
        return;
      }
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        const inject = `<style data-lens>${LENS_SCRCPY_CSS}</style>`;
        body = body.includes('</head>')
          ? body.replace('</head>', `${inject}</head>`)
          : inject + body;
        // Strip content-length so the patched body isn't truncated.
        Object.entries(proxyRes.headers).forEach(([k, v]) => {
          if (k.toLowerCase() === 'content-length') return;
          res.setHeader(k, v);
        });
        res.statusCode = proxyRes.statusCode || 200;
        res.end(body);
      });
    },
  },
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
