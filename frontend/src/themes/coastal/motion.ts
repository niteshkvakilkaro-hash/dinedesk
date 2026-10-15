import type { ThemeMotion } from '../types';

// Fresh and unhurried: transform / opacity only.
export const motion: ThemeMotion = {
  ease: [0.16, 1, 0.3, 1],
  duration: { fast: 0.3, base: 0.6, slow: 0.95 },
  stagger: 0.06,
  personality: [
    'Leaf-shaped hero photo on a sea-teal leaf',
    'Kasavu gold borders, kolam dot motifs and a wave into the sea-teal footer',
    'Rounded Baloo headings; cards and photos rise gently',
  ],
};
