const express = require('express');
const { ADB_ENABLED } = require('../config');
const adb = require('../services/adb');
const devtools = require('../services/adbDevtools');

const router = express.Router();

// All routes return a uniform "feature disabled" response when ADB_ENABLED is
// off — including on Render, where adb and scrcpy aren't installed. Keeps the
// frontend's code path simple (it can always call /api/adb/devices and react
// to the disabled flag in the response).
router.use((_req, res, next) => {
  if (!ADB_ENABLED) return res.json({ enabled: false, devices: [] });
  next();
});

router.get('/devices', async (_req, res) => {
  try {
    const devices = await adb.listDevices();
    res.json({ enabled: true, devices });
  } catch (err) {
    res.status(500).json({ enabled: true, devices: [], error: err.message });
  }
});

router.post('/launch', (req, res) => {
  const serial = req.body?.serial;
  if (!serial) return res.status(400).json({ error: 'serial required' });
  try {
    const result = adb.launchScrcpy(serial);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/close', (req, res) => {
  const serial = req.body?.serial;
  if (!serial) return res.status(400).json({ error: 'serial required' });
  res.json({ ok: true, ...adb.closeScrcpy(serial) });
});

router.post('/navigate', async (req, res) => {
  const { serial, url } = req.body || {};
  if (!serial || !url) return res.status(400).json({ error: 'serial and url required' });
  try {
    await adb.openUrl(serial, url);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DevTools: attach CDP to Chrome on the device and start capturing network
// events. Idempotent — re-calling returns the existing session.
router.post('/devtools/attach', async (req, res) => {
  const serial = req.body?.serial;
  if (!serial) return res.status(400).json({ error: 'serial required' });
  try {
    const cap = await devtools.attach(serial);
    res.json({ ok: true, pageUrl: cap.pageUrl, port: cap.port });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/devtools/detach', async (req, res) => {
  const serial = req.body?.serial;
  if (!serial) return res.status(400).json({ error: 'serial required' });
  try { await devtools.detach(serial); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/devtools/:serial/entries', (req, res) => {
  const cap = devtools.get(req.params.serial);
  if (!cap) return res.status(404).json({ error: 'not attached' });
  res.json({ ok: true, pageUrl: cap.pageUrl, entries: cap.summary() });
});

router.post('/devtools/:serial/clear', (req, res) => {
  const cap = devtools.get(req.params.serial);
  if (!cap) return res.status(404).json({ error: 'not attached' });
  cap.clear();
  res.json({ ok: true });
});

router.get('/devtools/:serial/har', (req, res) => {
  const cap = devtools.get(req.params.serial);
  if (!cap) return res.status(404).json({ error: 'not attached' });
  const har = cap.toHar();
  res.set('Content-Type', 'application/json');
  res.set('Content-Disposition', `attachment; filename="lens-${req.params.serial}-${Date.now()}.har"`);
  res.send(JSON.stringify(har, null, 2));
});

router.get('/screenshot', async (req, res) => {
  const serial = req.query.serial;
  if (!serial) return res.status(400).json({ error: 'serial required' });
  try {
    const png = await adb.screenshot(serial);
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
