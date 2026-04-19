'use client';
import { useState, useMemo } from 'react';
import {
  Paper, Stack, Typography, Select, MenuItem, TextField, Button, Box,
} from '@mui/material';

const LEVEL_COLORS = {
  log: 'grey.400',
  info: 'info.light',
  debug: 'secondary.light',
  warn: 'warning.light',
  error: 'error.light',
};

export default function LogPanel({ logs, onClear, height = 180 }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filter === 'warn+' && !['warn', 'error'].includes(l.level)) return false;
      if (filter === 'error' && l.level !== 'error') return false;
      if (query && !(l.message || '').toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [logs, filter, query]);

  return (
    <Paper
      variant="outlined"
      sx={{ mt: 1, bgcolor: 'grey.900', color: 'grey.100', overflow: 'hidden' }}
    >
      <Stack
        direction="row"
        alignItems="center"
        gap={1}
        sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'grey.800' }}
      >
        <Typography variant="caption" fontWeight={600}>Console</Typography>
        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          ({filtered.length}/{logs.length})
        </Typography>
        <Select
          size="small"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ ml: 1, minWidth: 90, color: 'grey.100', fontSize: 12, '.MuiOutlinedInput-notchedOutline': { borderColor: 'grey.700' } }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="warn+">Warn+</MenuItem>
          <MenuItem value="error">Errors</MenuItem>
        </Select>
        <TextField
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter…"
          sx={{
            flex: 1,
            input: { color: 'grey.100', fontSize: 12, py: 0.5 },
            '.MuiOutlinedInput-notchedOutline': { borderColor: 'grey.700' },
          }}
        />
        <Button onClick={onClear} size="small" variant="outlined" color="inherit" sx={{ minWidth: 0 }}>
          Clear
        </Button>
      </Stack>
      <Box
        sx={{
          overflowY: 'auto',
          px: 1.5,
          py: 0.75,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11,
          lineHeight: 1.5,
          height: typeof height === 'number' ? `${height}px` : height,
          scrollbarWidth: 'thin',
        }}
      >
        {filtered.length === 0 ? (
          <Box sx={{ py: 1, textAlign: 'center', opacity: 0.6 }}>No logs</Box>
        ) : (
          filtered.map((l, i) => (
            <Box
              key={i}
              sx={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: LEVEL_COLORS[l.level] || 'grey.300',
              }}
            >
              <Box component="span" sx={{ opacity: 0.6 }}>{formatTime(l.ts)}</Box>{' '}
              <Box component="span" sx={{ opacity: 0.7 }}>[{l.source}]</Box> {l.message}
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
}
