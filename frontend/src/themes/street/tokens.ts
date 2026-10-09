import type { ThemeTokens } from '../types';

/**
 * Street — loud, playful street food. Chilli always carries white text;
 * mustard and mint always carry ink.
 * Contrast: ink on off-white 17.6:1, white on chilli 5.0:1, ink on mustard 12.1:1,
 * ink on mint 11.0:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#FFF9EC',
    surface: '#FFFFFF',
    text: '#141414',
    muted: '#3D3933',
    primary: '#D7261E',
    onPrimary: '#FFFFFF',
    accent: '#FFCB2E',
    onAccent: '#141414',
    line: '#141414',
    extra: { mint: '#7ED9B5', mustard: '#FFCB2E' },
  },
  fonts: {
    display: "'Archivo Black', 'Mukta', Impact, sans-serif",
    body: "'Space Mono', 'Mukta', ui-monospace, monospace",
    mono: "'Space Mono', ui-monospace, monospace",
  },
  accentRole: 'fill',
  radius: '14px',
};
