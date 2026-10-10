import type { ThemeStyle, ThemeTokens } from '../types';

/**
 * Bistro Editorial — cafés, bakeries, modern restaurants. A magazine on the table.
 * Terracotta is 4.47:1 on paper (buttons and large type only); small links use a darker ink (5.9:1).
 * Contrast: ink on paper 15.2:1, muted on paper 6.2:1, white on terracotta 5.0:1, olive on paper 5.3:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#F6F3EE',
    surface: '#FFFFFF',
    surface2: '#EFEAE2',
    text: '#1E1D1B',
    muted: '#5F5A52',
    primary: '#B5532D',
    onPrimary: '#FFFFFF',
    link: '#99441F',
    accent: '#5B6B3A',
    onAccent: '#FFFFFF',
    line: '#1E1D1B',
    overlay: '#1E1D1B',
  },
  fonts: {
    display: "'Gloock', 'Mukta', Georgia, serif",
    body: "'Hanken Grotesk Variable', 'Mukta', ui-sans-serif, system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  accentRole: 'ink',
  radius: { card: '0px', button: '0px', input: '0px' },
  heading: { transform: 'none', tracking: '-0.02em', weight: 400 },
};

export const style: ThemeStyle = { dark: false, hero: 'editorial', card: 'rule', imageMask: 'square', playful: false };
