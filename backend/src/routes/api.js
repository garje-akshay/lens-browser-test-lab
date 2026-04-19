const express = require('express');
const { DEVICES, NETWORK_PROFILES } = require('../config');
const { createSession, getSession } = require('../services/sessionManager');

const router = express.Router();

router.get('/devices', (_req, res) => {
  res.json({ devices: DEVICES, networkProfiles: NETWORK_PROFILES });
});

router.post('/sessions', async (req, res) => {
  const { deviceId, url, networkProfile } = req.body || {};
  if (!deviceId || !url) return res.status(400).json({ error: 'deviceId and url required' });
  try {
    const session = await createSession({ deviceId, url, networkProfile });
    res.json({ sessionId: session.id, deviceId, url, networkProfile: session.networkProfile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions/:id/navigate', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  await session.navigate(req.body?.url);
  res.json({ ok: true });
});

router.post('/sessions/:id/reload', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  await session.reload();
  res.json({ ok: true });
});

router.post('/sessions/:id/network', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  await session.applyNetworkProfile(req.body?.profile || 'online');
  res.json({ ok: true, networkProfile: session.networkProfile });
});

router.get('/sessions/:id/logs', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  res.json({ logs: session.logs });
});

router.delete('/sessions/:id/logs', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  session.logs = [];
  res.json({ ok: true });
});

router.get('/sessions/:id/screenshot', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  const png = await session.screenshot();
  if (!png) return res.status(500).json({ error: 'screenshot failed' });
  res.set('Content-Type', 'image/png');
  res.send(png);
});

router.delete('/sessions/:id', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  await session.close();
  res.json({ ok: true });
});

module.exports = router;
