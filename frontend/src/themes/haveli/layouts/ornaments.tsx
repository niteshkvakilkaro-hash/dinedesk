import { useId, useRef } from 'react';
import { gsap, ScrollTrigger, SplitText, useGsap, useLoopActive } from '@/site/motion';
import { useReduceMotion } from '@/stores/motion';

/** Jaali (carved lattice) pattern, gold lines at low opacity over maroon or cream. */
export function Jaali({ className = '', opacity = 0.16 }: { className?: string; opacity?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true">
      <defs>
        <pattern id={`jaali-${id}`} width="48" height="48" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#C9A45C" strokeWidth="1.2" opacity={opacity}>
            <path d="M24 2 46 24 24 46 2 24Z" />
            <circle cx="24" cy="24" r="8" />
            <path d="M24 16c3 3 3 13 0 16-3-3-3-13 0-16ZM16 24c3-3 13-3 16 0-3 3-13 3-16 0Z" />
            <circle cx="0" cy="0" r="5" />
            <circle cx="48" cy="0" r="5" />
            <circle cx="0" cy="48" r="5" />
            <circle cx="48" cy="48" r="5" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#jaali-${id})`} />
    </svg>
  );
}

/** Jharokha (arched window) silhouette, used as a CSS clip-path mask. */
export const JHAROKHA_CLIP = 'url(#haveli-jharokha)';

export function JharokhaDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="haveli-jharokha" clipPathUnits="objectBoundingBox">
          <path d="M0,1 V0.36 C0,0.3 0.04,0.26 0.08,0.25 C0.1,0.14 0.2,0.08 0.3,0.07 C0.36,0.02 0.44,0 0.5,0 C0.56,0 0.64,0.02 0.7,0.07 C0.8,0.08 0.9,0.14 0.92,0.25 C0.96,0.26 1,0.3 1,0.36 V1 Z" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Gold line + lotus divider. The lines draw out from the centre when it scrolls into view. */
export function LotusDivider({ className = '', light = false }: { className?: string; light?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduceMotion();
  useGsap(
    ref,
    () => {
      gsap.from('[data-line]', { scaleX: 0, duration: 1.1, ease: 'haveli', scrollTrigger: { trigger: ref.current, start: 'top 90%', once: true } });
      gsap.from('[data-lotus]', { scale: 0.4, opacity: 0, rotate: -20, duration: 0.9, ease: 'haveli', scrollTrigger: { trigger: ref.current, start: 'top 90%', once: true } });
    },
    [],
    !reduce,
  );
  const stroke = light ? '#E9D3A0' : '#C9A45C';
  return (
    <div ref={ref} className={`flex items-center justify-center gap-3 ${className}`} aria-hidden="true">
      <span data-line className="h-px w-16 origin-right sm:w-28" style={{ background: `linear-gradient(to left, ${stroke}, transparent)` }} />
      <svg data-lotus viewBox="0 0 40 24" className="h-6 w-10">
        <g fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round">
          <path d="M20 3c4 5 4 12 0 18-4-6-4-13 0-18Z" />
          <path d="M20 21c-3-5-9-8-15-7 2 5 8 8 15 7ZM20 21c3-5 9-8 15-7-2 5-8 8-15 7Z" />
          <path d="M20 21c-6 0-12-2-17-6M20 21c6 0 12-2 17-6" opacity=".6" />
        </g>
      </svg>
      <span data-line className="h-px w-16 origin-left sm:w-28" style={{ background: `linear-gradient(to right, ${stroke}, transparent)` }} />
    </div>
  );
}

/** A diya whose flame flickers (CSS keyframes on transform/opacity), paused off screen. */
export function Diya({ className = '' }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const active = useLoopActive(ref);
  return (
    <svg ref={ref} viewBox="0 0 64 64" className={className} aria-hidden="true" data-paused={!active}>
      <defs>
        <radialGradient id="diya-glow">
          <stop offset="0" stopColor="#FFD27A" stopOpacity=".9" />
          <stop offset="1" stopColor="#FFD27A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="22" r="18" fill="url(#diya-glow)" className="haveli-glow" />
      <path d="M32 6c5 7 6 13 0 20-6-7-5-13 0-20Z" fill="#F4A62A" className="haveli-flame" />
      <path d="M32 13c2.4 3.4 2.8 6.6 0 10-2.8-3.4-2.4-6.6 0-10Z" fill="#FFF1C1" className="haveli-flame" />
      <path d="M10 34c4 12 14 18 22 18s18-6 22-18Z" fill="#9A4A1E" stroke="#641E16" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 34h48" stroke="#641E16" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 42h20" stroke="#C9A45C" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Wraps an image: a cream curtain lifts off it as it scrolls into view. */
export function CurtainReveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduceMotion();
  useGsap(
    ref,
    () => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: ref.current, start: 'top 85%', once: true } });
      tl.fromTo('[data-curtain]', { scaleY: 1 }, { scaleY: 0, duration: 1.1, ease: 'haveli' }).from('[data-curtain-img]', { scale: 1.15, duration: 1.4, ease: 'haveli' }, 0);
    },
    [],
    !reduce,
  );
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <div data-curtain-img className="h-full w-full">
        {children}
      </div>
      {/* The curtain starts lifted (scaleY 0) without JS or with reduced motion, so the image is never hidden. */}
      <div data-curtain className="pointer-events-none absolute inset-0 origin-top bg-t-bg" style={{ transform: reduce ? 'scaleY(0)' : undefined }} aria-hidden="true" />
    </div>
  );
}

/** Headings rise word by word (0.08s stagger) when they scroll into view. */
export function useWordRise(scope: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  const reduce = useReduceMotion();
  useGsap(
    scope,
    () => {
      gsap.utils.toArray<HTMLElement>('[data-rise]').forEach((el) => {
        const split = SplitText.create(el, { type: 'words', mask: 'words', aria: 'none' });
        gsap.from(split.words, {
          yPercent: 110,
          duration: 0.9,
          stagger: 0.08,
          ease: 'haveli',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      });
      ScrollTrigger.refresh();
    },
    deps,
    !reduce,
  );
}
