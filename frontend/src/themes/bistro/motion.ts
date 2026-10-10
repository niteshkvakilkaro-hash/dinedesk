import type { ThemeMotion } from '../types';

// Subtle and premium: transform / opacity only, cubic-bezier(0.16, 1, 0.3, 1).
export const motion: ThemeMotion = {
  ease: [0.16, 1, 0.3, 1],
  duration: { fast: 0.3, base: 0.6, slow: 0.9 },
  stagger: 0.06,
  personality: [
    "Huge serif type in a magazine grid with 1px rules",
    "Square photos settle from a slight zoom",
    "Quiet fades; nothing bounces",
  ],
};
