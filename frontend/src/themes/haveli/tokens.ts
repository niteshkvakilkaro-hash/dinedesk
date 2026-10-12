import type { ThemeStyle, ThemeTokens } from '../types';

/**
 * Haveli Royal — heritage, fine dining, heritage hotels.
 * Gold is for dividers, icons and borders only — never text on cream (2.2:1).
 * Contrast: ink on cream 14.9:1, muted on cream 6.2:1, cream on maroon 11.4:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#FFF8E9',
    surface: '#FFFFFF',
    surface2: '#FBF0DA',
    text: '#2B2118',
    muted: '#6B5A4A',
    primary: '#641E16',
    onPrimary: '#FFF8E9',
    link: '#641E16',
    accent: '#C9A45C',
    onAccent: '#2B2118',
    line: '#E9DCC0',
    overlay: '#2B1410',
  },
  fonts: {
    display: "'Rozha One', 'Mukta', Georgia, serif",
    body: "'Mukta', ui-sans-serif, system-ui, sans-serif",
  },
  accentRole: 'fill',
  radius: { card: '20px', button: '999px', input: '8px' },
  heading: { transform: 'none', tracking: '-0.005em', weight: 400 },
};

export const style: ThemeStyle = { dark: false, hero: 'royal', card: 'flat', imageMask: 'arch', playful: false };
