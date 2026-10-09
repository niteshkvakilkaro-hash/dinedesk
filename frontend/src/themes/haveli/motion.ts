import type { ThemeMotion } from '../types';

export const motion: ThemeMotion = {
  ease: [0.22, 1, 0.36, 1],
  duration: { fast: 0.6, base: 0.9, slow: 1.2, intro: 1.2 },
  stagger: 0.08,
  personality: [
    'Carved doors swing open (rotateY ±105°, 1.2s) onto golden light; hero settles from 1.15× — once per visit, skippable',
    'Headings rise word by word (0.08s stagger); gold lotus dividers draw out from the centre',
    'A diya flickers by the hours (paused when off screen)',
    'Photos are revealed by a cream curtain lifting',
    'Our story scrolls sideways as a pinned timeline on desktop',
  ],
};

export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
