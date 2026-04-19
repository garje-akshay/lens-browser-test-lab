'use client';
import { useMemo } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { buildTheme } from './theme';
import { useLabStore } from '../store/useLabStore';
import EmotionRegistry from './EmotionRegistry';

export default function ThemeRegistry({ children }) {
  const theme = useLabStore((s) => s.theme);
  const mui = useMemo(() => buildTheme(theme), [theme]);
  return (
    <EmotionRegistry>
      <ThemeProvider theme={mui}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </EmotionRegistry>
  );
}
