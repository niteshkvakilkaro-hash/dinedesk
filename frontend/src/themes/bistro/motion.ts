import type { ThemeMotion } from '../types';

export const motion: ThemeMotion = {
  ease: [0.76, 0, 0.24, 1],
  duration: { fast: 0.5, base: 0.8, slow: 1.1, intro: 1.6 },
  stagger: 0.04,
  personality: [
    'The name arrives in giant letters, then shrinks into the navbar logo — once per visit, skippable',
    'Hero photo wipes in from the left (clip-path inset)',
    'Hovering a dish floats its photo by the cursor (desktop); tap to expand on mobile',
    'Lines rise out of masks; numbers roll like an odometer',
    '"Today\'s specials" marquee speeds up with your scroll',
    'Lenis smooth scrolling with gentle parallax. No bounce, ever',
  ],
};

export const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
