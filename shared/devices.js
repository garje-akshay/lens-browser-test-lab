// Single source of truth for device descriptors.
// Shared between frontend (iframe mode) and backend (Playwright mode).
// `playwrightDescriptor` names map to entries in `playwright.devices`.

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA_PIXEL =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const ANDROID_UA_SAMSUNG =
  'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const DEVICES = [
  // --- iPhones ---
  { id: 'iphone-se', name: 'iPhone SE', category: 'phone', os: 'ios',
    viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: IOS_UA, playwrightDescriptor: 'iPhone SE' },
  { id: 'iphone-12', name: 'iPhone 12', category: 'phone', os: 'ios',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: IOS_UA, playwrightDescriptor: 'iPhone 12' },
  { id: 'iphone-13-mini', name: 'iPhone 13 mini', category: 'phone', os: 'ios',
    viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: IOS_UA, playwrightDescriptor: 'iPhone 13 Mini' },
  { id: 'iphone-14-pro', name: 'iPhone 14 Pro', category: 'phone', os: 'ios',
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: IOS_UA, playwrightDescriptor: 'iPhone 14 Pro' },
  { id: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', category: 'phone', os: 'ios',
    viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: IOS_UA, playwrightDescriptor: 'iPhone 14 Pro Max' },
  { id: 'iphone-15-pro', name: 'iPhone 15 Pro', category: 'phone', os: 'ios',
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: IOS_UA, playwrightDescriptor: 'iPhone 14 Pro' },
  { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', category: 'phone', os: 'ios',
    viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: IOS_UA, playwrightDescriptor: 'iPhone 14 Pro Max' },

  // --- Google Pixel ---
  { id: 'pixel-5', name: 'Pixel 5', category: 'phone', os: 'android',
    viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true,
    userAgent: ANDROID_UA_PIXEL, playwrightDescriptor: 'Pixel 5' },
  { id: 'pixel-7', name: 'Pixel 7', category: 'phone', os: 'android',
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
    userAgent: ANDROID_UA_PIXEL, playwrightDescriptor: 'Pixel 7' },
  { id: 'pixel-8', name: 'Pixel 8', category: 'phone', os: 'android',
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
    userAgent: ANDROID_UA_PIXEL, playwrightDescriptor: 'Pixel 7' },

  // --- Samsung Galaxy ---
  { id: 'galaxy-s20', name: 'Galaxy S20', category: 'phone', os: 'android',
    viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: ANDROID_UA_SAMSUNG, playwrightDescriptor: 'Galaxy S9+' },
  { id: 'galaxy-s22', name: 'Galaxy S22', category: 'phone', os: 'android',
    viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: ANDROID_UA_SAMSUNG, playwrightDescriptor: 'Galaxy S9+' },
  { id: 'galaxy-s23-ultra', name: 'Galaxy S23 Ultra', category: 'phone', os: 'android',
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true,
    userAgent: ANDROID_UA_SAMSUNG, playwrightDescriptor: 'Galaxy S9+' },
  { id: 'galaxy-fold', name: 'Galaxy Z Fold (folded)', category: 'phone', os: 'android',
    viewport: { width: 344, height: 882 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true,
    userAgent: ANDROID_UA_SAMSUNG, playwrightDescriptor: 'Galaxy S9+' },

  // --- Other Android ---
  { id: 'oneplus-11', name: 'OnePlus 11', category: 'phone', os: 'android',
    viewport: { width: 412, height: 919 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; PHB110) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    playwrightDescriptor: 'Pixel 7' },
  { id: 'xiaomi-13', name: 'Xiaomi 13', category: 'phone', os: 'android',
    viewport: { width: 393, height: 873 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; 2211133C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    playwrightDescriptor: 'Pixel 7' },

  // --- Tablets ---
  { id: 'ipad-mini', name: 'iPad mini', category: 'tablet', os: 'ios',
    viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: IPAD_UA, playwrightDescriptor: 'iPad Mini' },
  { id: 'ipad-10', name: 'iPad (Gen 10)', category: 'tablet', os: 'ios',
    viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: IPAD_UA, playwrightDescriptor: 'iPad (gen 7)' },
  { id: 'ipad-pro-11', name: 'iPad Pro 11"', category: 'tablet', os: 'ios',
    viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: IPAD_UA, playwrightDescriptor: 'iPad Pro 11' },
  { id: 'galaxy-tab-s8', name: 'Galaxy Tab S8', category: 'tablet', os: 'android',
    viewport: { width: 753, height: 1205 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    playwrightDescriptor: 'Galaxy Tab S4' },
];

const NETWORK_PROFILES = {
  online: { name: 'Online', downloadKbps: 0, uploadKbps: 0, latencyMs: 0 },
  '4g': { name: '4G', downloadKbps: 9000, uploadKbps: 9000, latencyMs: 170 },
  '3g': { name: '3G', downloadKbps: 1600, uploadKbps: 750, latencyMs: 300 },
  slow3g: { name: 'Slow 3G', downloadKbps: 500, uploadKbps: 500, latencyMs: 400 },
  '2g': { name: '2G', downloadKbps: 250, uploadKbps: 150, latencyMs: 800 },
};

module.exports = { DEVICES, NETWORK_PROFILES };
