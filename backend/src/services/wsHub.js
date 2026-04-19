const { WebSocketServer } = require('ws');
const { getSession } = require('./sessionManager');

// One WS endpoint: /stream?sessionId=...
// Client receives { type: 'frame', data: base64-jpeg } at FRAME_FPS.
// Client can send { type: 'scroll'|'tap'|'navigate'|'reload', ... } to drive
// the real browser — used in "real browser" mode for sync-scroll and taps.
function attachWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== '/stream') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, url.searchParams.get('sessionId'));
    });
  });

  wss.on('connection', (ws, _req, sessionId) => {
    const session = getSession(sessionId);
    if (!session) {
      ws.send(JSON.stringify({ type: 'error', message: 'session not found' }));
      ws.close();
      return;
    }
    session.attach(ws);
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      try {
        if (msg.type === 'scroll') await session.scroll({ x: msg.x, y: msg.y });
        else if (msg.type === 'tap') await session.tap({ x: msg.x, y: msg.y });
        else if (msg.type === 'navigate' && msg.url) await session.navigate(msg.url);
        else if (msg.type === 'reload') await session.reload();
      } catch {
        // swallow — page may have closed
      }
    });
    ws.on('close', () => session.detach(ws));
  });
}

module.exports = { attachWebSocket };
