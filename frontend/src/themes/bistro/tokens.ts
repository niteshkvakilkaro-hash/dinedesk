import type { ThemeTokens } from '../types';

/**
 * Bistro — modern café / fine dining, a magazine on the table.
 * Stone (#8C877F) is for large or decorative type only; body muted text is darker.
 * Contrast: charcoal on paper 15.2:1, muted on paper 6.9:1, white on terracotta 5.0:1,
 * olive on paper 5.3:1, stone on paper 3.2:1 (large text only).
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#F6F3EE',
    surface: '#FFFFFF',
    text: '#1E1D1B',
    muted: '#57534D',
    primary: '#B5532D',
    onPrimary: '#FFFFFF',
    accent: '#5B6B3A',
    onAccent: '#FFFFFF',
    line: '#1E1D1B',
    // Terracotta is 4.47:1 on paper: fine for buttons/large type, so small text uses this darker ink.
    extra: { stone: '#8C877F', primaryInk: '#99441F' },
  },
  fonts: {
    display: "'Gloock', 'Mukta', Georgia, serif",
    body: "'Hanken Grotesk Variable', 'Mukta', ui-sans-serif, system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  accentRole: 'ink',
  radius: '0px',
};
