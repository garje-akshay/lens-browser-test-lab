/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // doubles renders+effects in dev — disable for smoother devex
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000',
    NEXT_PUBLIC_BACKEND_WS: process.env.NEXT_PUBLIC_BACKEND_WS || 'ws://localhost:4000',
  },
  // Tree-shake MUI barrels at build time — massively shrinks client bundle
  // and speeds up HMR by making each @mui/material and @mui/icons-material
  // import hit only the exact file it needs.
  modularizeImports: {
    '@mui/material': {
      transform: '@mui/material/{{member}}',
    },
    '@mui/icons-material': {
      transform: '@mui/icons-material/{{member}}',
    },
  },
  compiler: {
    // Drop React DevTools runtime info in prod + strip `data-test` attrs.
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },
};
module.exports = nextConfig;
