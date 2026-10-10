import type { ThemeMotion } from '../types';

// Subtle and premium: transform / opacity only, cubic-bezier(0.16, 1, 0.3, 1).
export const motion: ThemeMotion = {
  ease: [0.16, 1, 0.3, 1],
  duration: { fast: 0.3, base: 0.6, slow: 0.9 },
  stagger: 0.06,
  personality: [
    "Warm radial glow behind the hero dish",
    "Glass cards over dark surfaces, hairline borders",
    "Headlines rise; slow hero parallax on desktop",
  ],
};
