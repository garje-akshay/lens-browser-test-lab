// Keep in sync with /shared/devices.js. ES-module copy for the Next.js bundle.
export const DEVICES = [
  // iPhones
  { id: 'iphone-se', name: 'iPhone SE', category: 'phone', os: 'ios', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 },
  { id: 'iphone-12', name: 'iPhone 12', category: 'phone', os: 'ios', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  { id: 'iphone-13-mini', name: 'iPhone 13 mini', category: 'phone', os: 'ios', viewport: { width: 375, height: 812 }, deviceScaleFactor: 3 },
  { id: 'iphone-14-pro', name: 'iPhone 14 Pro', category: 'phone', os: 'ios', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
  { id: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', category: 'phone', os: 'ios', viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 },
  { id: 'iphone-15-pro', name: 'iPhone 15 Pro', category: 'phone', os: 'ios', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
  { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', category: 'phone', os: 'ios', viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 },

  // Pixel
  { id: 'pixel-5', name: 'Pixel 5', category: 'phone', os: 'android', viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75 },
  { id: 'pixel-7', name: 'Pixel 7', category: 'phone', os: 'android', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625 },
  { id: 'pixel-8', name: 'Pixel 8', category: 'phone', os: 'android', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625 },

  // Samsung Galaxy
  { id: 'galaxy-s20', name: 'Galaxy S20', category: 'phone', os: 'android', viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 },
  { id: 'galaxy-s22', name: 'Galaxy S22', category: 'phone', os: 'android', viewport: { width: 360, height: 780 }, deviceScaleFactor: 3 },
  { id: 'galaxy-s23-ultra', name: 'Galaxy S23 Ultra', category: 'phone', os: 'android', viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5 },
  { id: 'galaxy-fold', name: 'Galaxy Z Fold (folded)', category: 'phone', os: 'android', viewport: { width: 344, height: 882 }, deviceScaleFactor: 2.5 },

  // Other Android
  { id: 'oneplus-11', name: 'OnePlus 11', category: 'phone', os: 'android', viewport: { width: 412, height: 919 }, deviceScaleFactor: 3 },
  { id: 'xiaomi-13', name: 'Xiaomi 13', category: 'phone', os: 'android', viewport: { width: 393, height: 873 }, deviceScaleFactor: 2.75 },

  // Tablets
  { id: 'ipad-mini', name: 'iPad mini', category: 'tablet', os: 'ios', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 },
  { id: 'ipad-10', name: 'iPad (Gen 10)', category: 'tablet', os: 'ios', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 },
  { id: 'ipad-pro-11', name: 'iPad Pro 11"', category: 'tablet', os: 'ios', viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2 },
  { id: 'galaxy-tab-s8', name: 'Galaxy Tab S8', category: 'tablet', os: 'android', viewport: { width: 753, height: 1205 }, deviceScaleFactor: 2 },
];

export const NETWORK_PROFILES = {
  online: { name: 'Online' },
  '4g': { name: '4G' },
  '3g': { name: '3G' },
  slow3g: { name: 'Slow 3G' },
  '2g': { name: '2G' },
};
