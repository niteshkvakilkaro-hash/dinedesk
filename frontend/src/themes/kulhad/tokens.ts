import type { ThemeStyle, ThemeTokens } from '../types';

/**
 * Kulhad Warm — chai cafés, breakfast, desserts.
 * Chai (#C58646) is decorative / a fill under dark text only (2.6:1 on the page).
 * Contrast: ink on bg 14.2:1, muted on bg 5.9:1, white on clay 6.4:1, clay on bg 5.5:1, ink on chai 5.4:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#F4EDE4',
    surface: '#FBF7F1',
    surface2: '#EFE4D6',
    text: '#2E1A10',
    muted: '#6E5546',
    primary: '#9C4524',
    onPrimary: '#FFFFFF',
    link: '#9C4524',
    accent: '#C58646',
    onAccent: '#2E1A10',
    line: 'rgba(46, 26, 16, 0.14)',
    overlay: '#2E1A10',
  },
  fonts: {
    display: "'Young Serif', 'Mukta', Georgia, serif",
    body: "'Geist Variable', 'Mukta', ui-sans-serif, system-ui, sans-serif",
  },
  accentRole: 'fill',
  radius: { card: '18px', button: '14px', input: '8px' },
  heading: { transform: 'none', tracking: '-0.01em', weight: 400 },
};

export const style: ThemeStyle = { dark: false, hero: 'split', card: 'soft', imageMask: 'rounded', playful: false };
