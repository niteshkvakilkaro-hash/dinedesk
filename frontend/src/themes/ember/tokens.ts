import type { ThemeStyle, ThemeTokens } from '../types';

/**
 * Ember — dark, live-fire, bars, premium dinner.
 * Contrast: ink on bg 17.1:1, muted on bg 7.4:1 (6.6:1 on surface-2), dark text on ember 6.1:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#0C0A09',
    surface: '#15110F',
    surface2: '#1C1714',
    text: '#F3EEE8',
    muted: '#A79C92',
    primary: '#E8692C',
    onPrimary: '#0C0A09',
    link: '#F07C42',
    accent: '#F0A35E',
    onAccent: '#0C0A09',
    line: 'rgba(243, 238, 232, 0.14)',
    overlay: '#0C0A09',
  },
  fonts: {
    display: "'Unbounded', 'Mukta', ui-sans-serif, sans-serif",
    body: "'Geist Variable', 'Mukta', ui-sans-serif, system-ui, sans-serif",
    mono: "'Geist Mono Variable', ui-monospace, monospace",
  },
  accentRole: 'ink',
  radius: { card: '20px', button: '14px', input: '8px' },
  heading: { transform: 'uppercase', tracking: '-0.02em', weight: 600 },
};

export const style: ThemeStyle = { dark: true, hero: 'fullbleed', card: 'glass', imageMask: 'rounded', playful: false };
