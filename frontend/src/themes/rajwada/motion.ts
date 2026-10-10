import type { ThemeMotion } from '../types';

// Calm and stately: transform / opacity only.
export const motion: ThemeMotion = {
  ease: [0.16, 1, 0.3, 1],
  duration: { fast: 0.3, base: 0.65, slow: 1 },
  stagger: 0.07,
  personality: [
    'Forest-green bar with gold pill navigation',
    'Rounded photos settle in; serif headlines with a gold accent',
    'Cards lift gently on hover; gold rules between sections',
  ],
};
