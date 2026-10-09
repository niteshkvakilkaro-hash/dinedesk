import type { ThemeMotion } from '../types';

export const motion: ThemeMotion = {
  ease: [0.34, 1.56, 0.64, 1],
  duration: { fast: 0.25, base: 0.4, slow: 0.6, intro: 0.9 },
  stagger: 0.03,
  spring: { stiffness: 400, damping: 15 },
  personality: [
    'Food stickers drop in on springs (stiffness 400, damping 15)',
    'Headline letters pop with overshoot (0.03s stagger)',
    'Buttons squash when pressed',
    'Sections skew with scroll speed',
    'Angled marquees that never sit still (until you ask them to)',
    'Add-to-cart confetti and the combo builder arrive with ordering (Phase 3)',
  ],
};

export const SPRING = { type: 'spring' as const, stiffness: 400, damping: 15 };
