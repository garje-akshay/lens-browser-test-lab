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

router.get('/size/:serial', async (req, res) => {
  try {
    const size = await adb.getScreenSize(req.params.serial);
    res.json({ ok: true, ...size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// ---------- Wireless debugging (Android 11+) ----------
// These are registered BEFORE the /:serial/* routes so Express matches the
// literal "wifi" prefix instead of treating it as a serial.
router.post('/wifi/pair', async (req, res) => {
  const { host, port, code } = req.body || {};
  try {
    const r = await adb.wifiPair(host, port, code);
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/wifi/connect', async (req, res) => {
  const { host, port } = req.body || {};
  try {
    const r = await adb.wifiConnect(host, port);
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// QR pairing: start returns a jobId + QR image; poll status via /wifi/qr/:jobId
// to watch it progress awaiting_scan → discovered → pairing → paired.
router.post('/wifi/qr/start', (_req, res) => {
  try {
    const job = adb.startQrPairJob();
    // Return the raw payload string — the frontend renders the QR in-browser
    // (avoids a slow server-side qrcode roundtrip).
    res.json({ ok: true, jobId: job.jobId, payload: job.payload, service: job.service });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/wifi/qr/:jobId', (req, res) => {
  const job = adb.getQrJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({ ok: true, ...job });
});

router.post('/wifi/qr/:jobId/cancel', (req, res) => {
  const ok = adb.cancelQrJob(req.params.jobId);
  res.json({ ok });
});

router.post('/wifi/disconnect', async (req, res) => {
  try {
    const r = await adb.wifiDisconnect(req.body?.target);
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Testing controls ----------
// Small helper: every control route follows the same "POST /:serial/:action,
// pull fields from the body, call the service, return {ok:true, ...result}"
// pattern — this factors it out so we don't repeat the try/catch in every route.
function control(fn) {
  return async (req, res) => {
    const { serial } = req.params;
    if (!serial) return res.status(400).json({ error: 'serial required' });
    try {
      const result = await fn(serial, req.body || {}, req);
      res.json({ ok: true, ...(result || {}) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

router.post('/:serial/rotate', control((serial, body) => adb.setRotation(serial, body.rotation)));
router.post('/:serial/dark', control((serial, body) => adb.setDarkMode(serial, body.on)));
router.post('/:serial/font-scale', control((serial, body) => adb.setFontScale(serial, body.scale)));
router.post('/:serial/density', control((serial, body) => adb.setDensity(serial, body.density)));
router.post('/:serial/wifi', control((serial, body) => adb.setWifi(serial, body.on)));
router.post('/:serial/data', control((serial, body) => adb.setMobileData(serial, body.on)));
router.post('/:serial/show-touches', control((serial, body) => adb.setShowTouches(serial, body.on)));
router.post('/:serial/pointer-location', control((serial, body) => adb.setPointerLocation(serial, body.on)));
router.post('/:serial/battery', control((serial, body) => adb.setBattery(serial, body)));
router.post('/:serial/keyevent', control((serial, body) => adb.keyevent(serial, body.key)));
router.post('/:serial/input-text', control((serial, body) => adb.inputText(serial, body.text)));
router.post('/:serial/clear-app', control((serial, body) => adb.clearAppData(serial, body.package)));
router.post('/:serial/force-stop', control((serial, body) => adb.forceStop(serial, body.package)));
router.post('/:serial/launch-app', control((serial, body) => adb.launchApp(serial, body.package)));

router.get('/:serial/packages', async (req, res) => {
  try {
    const packages = await adb.listPackages(req.params.serial, req.query.filter || '');
    res.json({ ok: true, packages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:serial/record/start', control((serial) => adb.startScreenRecord(serial)));
router.get('/:serial/record/status', (req, res) => {
  res.json({ ok: true, ...adb.screenRecordStatus(req.params.serial) });
});
router.post('/:serial/record/stop', async (req, res) => {
  const { serial } = req.params;
  try {
    const { buffer, filename } = await adb.stopScreenRecord(serial);
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:serial/logcat', async (req, res) => {
  try {
    const out = await adb.getLogcat(req.params.serial, {
      lines: parseInt(req.query.lines, 10) || 500,
      pkg: req.query.package || '',
    });
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post('/:serial/logcat/clear', control((serial) => adb.clearLogcat(serial)));

module.exports = router;
