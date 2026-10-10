import type { ThemeStyle, ThemeTokens } from '../types';

/**
 * Street Pop — street food, momos, chai stalls, youth brands.
 * Chilli always carries white text; mustard and mint always carry ink.
 * Contrast: ink on off-white 17.6:1, white on chilli 5.0:1, ink on mustard 12.1:1, ink on mint 11.0:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#FFF9EC',
    surface: '#FFFFFF',
    surface2: '#FFF1C9',
    text: '#141414',
    muted: '#3D3933',
    primary: '#D7261E',
    onPrimary: '#FFFFFF',
    link: '#C21F18',
    accent: '#FFCB2E',
    onAccent: '#141414',
    line: '#141414',
    overlay: '#141414',
    extra: { mint: '#7ED9B5' },
  },
  fonts: {
    display: "'Archivo Black', 'Mukta', Impact, sans-serif",
    body: "'Archivo Variable', 'Mukta', ui-sans-serif, system-ui, sans-serif",
  },
  accentRole: 'fill',
  radius: { card: '18px', button: '14px', input: '8px' },
  heading: { transform: 'uppercase', tracking: '-0.01em', weight: 400 },
};

export const style: ThemeStyle = { dark: false, hero: 'fullbleed', card: 'sticker', imageMask: 'rounded', playful: true };
