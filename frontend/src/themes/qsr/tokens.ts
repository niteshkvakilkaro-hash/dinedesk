import type { ThemeStyle, ThemeTokens } from '../types';

/**
 * Modern QSR — burgers, pizza, fast-casual chains, cloud kitchens.
 * Red is 4.4:1 on the page (buttons and big numbers only); small links use a deeper red (6.0:1).
 * Contrast: ink on bg 16.3:1, muted on bg 6.3:1, white on red 5.0:1, ink on bun gold 8.7:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#F3F1EC',
    surface: '#FFFFFF',
    surface2: '#EAE6DD',
    text: '#141414',
    muted: '#5A5853',
    primary: '#D2302A',
    onPrimary: '#FFFFFF',
    link: '#B0241F',
    accent: '#E8A54B',
    onAccent: '#141414',
    line: 'rgba(20, 20, 20, 0.12)',
    overlay: '#141414',
  },
  fonts: {
    display: "'Archivo Variable', 'Mukta', Impact, sans-serif",
    body: "'Geist Variable', 'Mukta', ui-sans-serif, system-ui, sans-serif",
  },
  accentRole: 'fill',
  radius: { card: '24px', button: '999px', input: '8px' },
  heading: { transform: 'uppercase', tracking: '-0.01em', weight: 800, stretch: '125%' },
};

export const style: ThemeStyle = { dark: false, hero: 'fullbleed', card: 'soft', imageMask: 'rounded', playful: false };
