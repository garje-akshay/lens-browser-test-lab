const path = require('path');
const { DEVICES, NETWORK_PROFILES } = require(path.join(__dirname, '../../../shared/devices.js'));

module.exports = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  MAX_SESSIONS: parseInt(process.env.MAX_SESSIONS || '8', 10),
  FRAME_FPS: parseInt(process.env.FRAME_FPS || '4', 10),
  DEVICES,
  NETWORK_PROFILES,
};
