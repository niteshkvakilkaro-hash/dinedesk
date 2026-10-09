import type { ThemeTokens } from '../types';

/**
 * Haveli — royal Rajasthani. Gold is decorative only: never text on cream.
 * Contrast: brown on cream 14.9:1, muted on cream 6.9:1, cream on maroon 11.4:1,
 * brown on gold 6.7:1 (gold on cream is only 2.2:1, hence decorative only).
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#FFF8E9',
    surface: '#FFFDF6',
    text: '#2B2118',
    muted: '#66533F',
    primary: '#641E16',
    onPrimary: '#FFF8E9',
    accent: '#C9A45C',
    onAccent: '#2B2118',
    line: '#E8D7B0',
    extra: { maroonDeep: '#3F110C', goldSoft: '#F1E2BC' },
  },
  fonts: {
    display: "'Rozha One', 'Mukta', Georgia, serif",
    body: "'Mukta', ui-sans-serif, system-ui, sans-serif",
  },
  accentRole: 'fill',
  radius: '4px',
};
