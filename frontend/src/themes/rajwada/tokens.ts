import type { ThemeStyle, ThemeTokens } from '../types';

/**
 * Rajwada Royal — royal Rajasthani haveli for hotels with restaurants and fine dining.
 * Dark forest green, antique gold, warm cream. Gold (#F4D49A) is a fill / on-green colour only
 * (too light for text on cream); text-level gold uses the darker "gold-ink".
 * Contrast: ink on cream 13.2:1, muted on cream 5.8:1, cream on green 10.9:1, green on gold 8.7:1,
 * gold-ink on cream 5.0:1, gold on green 8.7:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#F7F0E5',
    surface: '#FFFCF6',
    surface2: '#EFE5D3',
    text: '#1C2A21',
    muted: '#56604F',
    primary: '#24392D',
    onPrimary: '#F7F0E5',
    link: '#24392D',
    accent: '#F4D49A',
    onAccent: '#24392D',
    line: '#E2D5BE',
    overlay: '#13211A',
    extra: { 'gold-ink': '#86601C', green: '#24392D', 'green-deep': '#1B2C22', gold: '#F4D49A' },
  },
  fonts: {
    display: "'Playfair Display', 'Rozha One', Georgia, serif",
    body: "'Mukta', ui-sans-serif, system-ui, sans-serif",
  },
  accentRole: 'fill',
  radius: { card: '18px', button: '12px', input: '10px' },
  heading: { transform: 'none', tracking: '-0.01em', weight: 600 },
};

export const style: ThemeStyle = { dark: false, hero: 'royal', card: 'soft', imageMask: 'rounded', playful: false };
