import type { ThemeStyle, ThemeTokens } from '../types';

/**
 * Coastal — South Indian and coastal kitchens: dosa and idli, meals on a banana leaf, filter
 * coffee, Kerala, Udupi, Chettinad, Mangalore and Goan seafood.
 * Coconut cream, banana-leaf green, turmeric gold and a deep sea teal. Turmeric (#EBA72B) is a
 * fill / decoration colour only (too light for text on cream); text-level gold uses "gold-ink".
 * Contrast: ink on cream 14.6:1, muted on leaf-tint 6.1:1, white on leaf green 7.0:1, ink on
 * turmeric 8.1:1, teal on cream 7.6:1, cream on deep teal 10.6:1, turmeric on deep teal 5.1:1.
 */
export const tokens: ThemeTokens = {
  colors: {
    bg: '#FBF8F0',
    surface: '#FFFFFF',
    surface2: '#EEF2E3',
    text: '#132A1F',
    muted: '#475A4E',
    primary: '#15663B',
    onPrimary: '#FFFFFF',
    link: '#15663B',
    accent: '#EBA72B',
    onAccent: '#132A1F',
    line: '#E2DCC6',
    overlay: '#0A3138',
    extra: { teal: '#0B5866', 'teal-deep': '#08414B', 'gold-ink': '#875807', cream: '#FBF8F0' },
  },
  fonts: {
    display: "'Baloo 2 Variable', 'Mukta', 'Noto Sans Tamil', 'Noto Sans Malayalam', 'Noto Sans Kannada', 'Noto Sans Telugu', ui-rounded, system-ui, sans-serif",
    body: "'Geist Variable', 'Mukta', 'Noto Sans Tamil', 'Noto Sans Malayalam', 'Noto Sans Kannada', 'Noto Sans Telugu', ui-sans-serif, system-ui, sans-serif",
  },
  accentRole: 'fill',
  radius: { card: '22px', button: '14px', input: '12px' },
  heading: { transform: 'none', tracking: '-0.015em', weight: 700 },
};

export const style: ThemeStyle = { dark: false, hero: 'split', card: 'flat', imageMask: 'rounded', playful: false };
