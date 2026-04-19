'use client';
import { createTheme } from '@mui/material/styles';

export function buildTheme(mode) {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: '#6366f1', light: '#818cf8', dark: '#4f46e5' },
      secondary: { main: '#22d3ee', light: '#67e8f9', dark: '#0891b2' },
      success: { main: '#10b981' },
      warning: { main: '#f59e0b' },
      error: { main: '#ef4444' },
      background: {
        default: dark ? '#0a0b10' : '#f5f7fa',
        paper: dark ? '#12141b' : '#ffffff',
      },
      divider: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.12)',
      text: {
        primary: dark ? '#e6e9ef' : '#0f172a',
        secondary: dark ? 'rgba(230,233,239,0.68)' : 'rgba(15,23,42,0.72)',
        disabled: dark ? 'rgba(230,233,239,0.4)' : 'rgba(15,23,42,0.45)',
      },
      action: {
        hover: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
        selected: dark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.08)',
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      h1: { fontWeight: 700, letterSpacing: -0.8 },
      h2: { fontWeight: 700, letterSpacing: -0.6 },
      h3: { fontWeight: 700, letterSpacing: -0.5 },
      h4: { fontWeight: 700, letterSpacing: -0.4 },
      h5: { fontWeight: 700, letterSpacing: -0.3 },
      h6: { fontWeight: 700, letterSpacing: -0.2 },
      subtitle1: { fontWeight: 600, letterSpacing: -0.1 },
      subtitle2: { fontWeight: 600, letterSpacing: -0.1 },
      body1: { letterSpacing: -0.05 },
      body2: { letterSpacing: -0.05 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: -0.1 },
      caption: { letterSpacing: 0 },
      overline: { fontWeight: 600, letterSpacing: 1.2 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.12)',
            borderRadius: 10,
            border: '2px solid transparent',
            backgroundClip: 'content-box',
          },
          '*::-webkit-scrollbar-thumb:hover': {
            background: dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.22)',
            backgroundClip: 'content-box',
          },
          body: {
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, paddingInline: 14 },
          containedPrimary: {
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #4338ca)' },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: 8 },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: dark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)',
            '& fieldset': { borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.16)' },
            '&:hover fieldset': { borderColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.32)' },
            '&.Mui-focused fieldset': { borderColor: '#6366f1' },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            fontWeight: 600,
            color: dark ? 'rgba(230,233,239,0.7)' : 'rgba(15,23,42,0.7)',
            borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.12)',
            '&.Mui-selected': {
              background: dark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.12)',
              color: dark ? '#a5b4fc' : '#4338ca',
              '&:hover': { background: dark ? 'rgba(99,102,241,0.28)' : 'rgba(99,102,241,0.18)' },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: 11,
            fontWeight: 500,
            background: dark ? 'rgba(15,17,23,0.96)' : 'rgba(15,23,42,0.92)',
            backdropFilter: 'blur(8px)',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 16 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: { borderRadius: 8, marginInline: 4 },
        },
      },
    },
  });
}
