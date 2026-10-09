import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { gsap } from '@/site/motion';

/** One carved door leaf: maroon panel with gold inlay arches and a jaali window. */
function DoorLeaf({ side }: { side: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 200 400" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="400" fill="#641E16" />
      <rect x="6" y="6" width="188" height="388" fill="none" stroke="#C9A45C" strokeWidth="3" />
      <path d="M26 380V120c0-40 34-70 74-70s74 30 74 70v260Z" fill="#4E1711" stroke="#C9A45C" strokeWidth="2.5" />
      <path d="M46 360V130c0-28 24-52 54-52s54 24 54 52v230Z" fill="none" stroke="#C9A45C" strokeWidth="1.5" opacity=".7" />
      <g stroke="#C9A45C" strokeWidth="1.2" fill="none" opacity=".55">
        {Array.from({ length: 6 }, (_, r) =>
          Array.from({ length: 3 }, (_, c) => <path key={`${r}-${c}`} d={`M${70 + c * 30} ${150 + r * 30}l15 15-15 15-15-15Z`} />),
        )}
      </g>
      {[60, 200, 340].map((y) => (
        <circle key={y} cx={side === 'left' ? 188 : 12} cy={y} r="5" fill="#C9A45C" />
      ))}
      <circle cx={side === 'left' ? 176 : 24} cy="210" r="9" fill="none" stroke="#C9A45C" strokeWidth="3" />
    </svg>
  );
}

/**
 * Haveli entrance: two carved doors swing open (rotateY ±105°, 1.2s) onto
 * golden light while the hero settles from 1.15× to 1. The page underneath is
 * fully rendered and readable; this overlay only sits on top and removes itself.
 */
export function DoorsIntro({ onDone, heroSelector }: { onDone: () => void; heroSelector: string }) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const finish = () => done.current();
    const ctx = gsap.context(() => {
      const hero = document.querySelector(heroSelector);
      const tl = gsap.timeline({ onComplete: finish, defaults: { ease: 'haveli' } });
      tl.to('[data-light]', { opacity: 1, scale: 1, duration: 0.5 }, 0.1)
        .to('[data-door=left]', { rotateY: -105, duration: 1.2 }, 0.35)
        .to('[data-door=right]', { rotateY: 105, duration: 1.2 }, 0.35)
        .to('[data-light]', { opacity: 0, scale: 1.6, duration: 0.8 }, 1.05)
        .to(root.current, { opacity: 0, duration: 0.45 }, 1.35);
      if (hero) tl.fromTo(hero, { scale: 1.15 }, { scale: 1, duration: 1.6, clearProps: 'transform' }, 0.35);
    }, root);
    // Safety net: never leave the overlay up, even if the timeline is interrupted.
    const safety = window.setTimeout(finish, 3500);
    return () => {
      window.clearTimeout(safety);
      ctx.revert();
    };
  }, [heroSelector]);

  return (
    <div ref={root} className="fixed inset-0 z-[70] overflow-hidden" style={{ perspective: '1600px' }} role="presentation">
      <div data-light className="absolute inset-0 scale-75 opacity-0" style={{ background: 'radial-gradient(ellipse at center, #FFE6A8 0%, #E7B95A 35%, rgba(100,30,22,0) 70%)' }} />
      <div data-door="left" className="absolute inset-y-0 left-0 w-1/2 origin-left" style={{ transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}>
        <DoorLeaf side="left" />
      </div>
      <div data-door="right" className="absolute inset-y-0 right-0 w-1/2 origin-right" style={{ transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}>
        <DoorLeaf side="right" />
      </div>
      <button type="button" onClick={() => done.current()} className="absolute right-4 top-4 z-10 min-h-11 rounded-full border border-[#C9A45C] bg-[#3F110C]/80 px-4 text-sm font-semibold text-[#FFF8E9] hover:bg-[#3F110C]">
        {t('site.skipIntro')}
      </button>
    </div>
  );
}
