import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gsap, ScrollTrigger, SplitText, useGsap, useLoopActive } from '@/site/motion';
import { useReduceMotion } from '@/stores/motion';

/** Shared between the Bistro shell and its pages. */
export const BistroContext = createContext<{ introPlaying: boolean; scroll: { velocity: number } }>({ introPlaying: false, scroll: { velocity: 0 } });
export const useBistro = () => useContext(BistroContext);

/**
 * Bistro entrance: the name arrives in giant letters (chars slide up out of
 * masks), then the whole word shrinks into the navbar logo's exact spot.
 * The page is rendered underneath; this overlay only sits on top.
 */
export function NameIntro({ name, onDone }: { name: string; onDone: () => void }) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const size = typeof window === 'undefined' ? 160 : Math.max(48, Math.min(220, (window.innerWidth * 0.92) / Math.max(4, name.length * 0.56)));

  useLayoutEffect(() => {
    const finish = () => done.current();
    const ctx = gsap.context(() => {
      const big = root.current!.querySelector<HTMLElement>('[data-big]')!;
      const target = document.querySelector<HTMLElement>('[data-nav-logo]');
      const split = SplitText.create(big, { type: 'chars', mask: 'chars' });
      const tl = gsap.timeline({ onComplete: finish, defaults: { ease: 'bistro' } });
      tl.from(split.chars, { yPercent: 110, duration: 0.8, stagger: 0.04 });
      if (target) {
        const from = big.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const scale = to.height / from.height;
        tl.to(big, { x: to.left - from.left, y: to.top - from.top, scale, transformOrigin: '0 0', duration: 0.9 }, '+=0.35');
      }
      tl.to('[data-sheet]', { opacity: 0, duration: 0.5 }, '<0.2');
    }, root);
    const safety = window.setTimeout(finish, 4000);
    return () => {
      window.clearTimeout(safety);
      ctx.revert();
    };
  }, []);

  return (
    <div ref={root} className="fixed inset-0 z-[70]" role="presentation">
      <div data-sheet className="absolute inset-0 bg-t-bg" />
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-[4vw]">
        <span data-big className="block whitespace-nowrap font-display leading-[0.9] text-t-text" style={{ fontSize: `${size}px` }} aria-hidden="true">
          {name}
        </span>
      </div>
      <button type="button" onClick={() => done.current()} className="mono absolute right-4 top-4 z-10 min-h-11 border border-t-line bg-t-bg px-4 text-xs uppercase hover:bg-t-text hover:text-t-bg">
        {t('site.skipIntro')}
      </button>
    </div>
  );
}

/** Lines rise out of masks as they scroll in ([data-lines]); headings and paragraphs. */
export function useLineReveal(scope: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  const reduce = useReduceMotion();
  const { introPlaying } = useBistro();
  useGsap(
    scope,
    () => {
      gsap.utils.toArray<HTMLElement>('[data-lines]').forEach((el) => {
        const split = SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'none' });
        gsap.from(split.lines, { yPercent: 105, duration: 0.9, stagger: 0.08, ease: 'bistro', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
      });
      gsap.utils.toArray<HTMLElement>('[data-wipe]').forEach((el) => {
        gsap.fromTo(el, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'bistro', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
      });
      gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
        gsap.fromTo(el, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
      ScrollTrigger.refresh();
    },
    [...deps],
    !reduce && !introPlaying,
  );
}

/** Odometer: each digit is a column of 0–9 that rolls to its value when on screen. */
export function Odometer({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReduceMotion();
  const digits = String(value).split('');
  useGsap(
    ref,
    () => {
      gsap.utils.toArray<HTMLElement>('[data-digit]').forEach((col, i) => {
        const d = Number(col.dataset.digit);
        gsap.fromTo(col, { yPercent: 0 }, { yPercent: -d * 10, duration: 1.4 + i * 0.15, ease: 'bistro', scrollTrigger: { trigger: ref.current, start: 'top 90%', once: true } });
      });
    },
    [value],
    !reduce,
  );
  return (
    <span ref={ref} className={`inline-flex overflow-hidden tabular-nums ${className}`} aria-label={String(value)} role="img">
      {digits.map((d, i) => (
        <span key={i} className="relative inline-block h-[1em] overflow-hidden leading-none" aria-hidden="true">
          {/* Without motion the column simply sits at its digit. */}
          <span data-digit={d} className="flex flex-col" style={reduce ? { transform: `translateY(-${Number(d) * 10}%)` } : undefined}>
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n} className="block h-[1em] leading-none">
                {n}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Specials marquee whose speed (and direction) follows scroll velocity.
 * Paused off screen / in background tabs; a static wrapped list with reduced motion.
 */
export function VelocityMarquee({ items, label }: { items: string[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReduceMotion();
  const active = useLoopActive(ref);
  const { scroll } = useBistro();

  useEffect(() => {
    if (reduce || !active || !track.current) return;
    const el = track.current;
    let x = Number(gsap.getProperty(el, 'x')) || 0;
    let dir = -1;
    const tick = (_t: number, dt: number) => {
      const v = scroll.velocity;
      if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
      const speed = 40 + Math.min(Math.abs(v) * 30, 600); // px per second
      const half = el.scrollWidth / 2;
      x += (dir * speed * dt) / 1000;
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      gsap.set(el, { x });
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [reduce, active, scroll, items.length]);

  if (!items.length) return null;
  if (reduce) {
    return (
      <div className="border-y border-t-line py-4" aria-label={label}>
        <p className="mono px-4 text-center text-sm uppercase">{items.join('  ✶  ')}</p>
      </div>
    );
  }
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((name, i) => (
        <span key={i} className="flex items-center whitespace-nowrap px-6 font-display text-3xl leading-none sm:text-5xl">
          {name}
          <span className="ml-12 text-t-primary" aria-hidden="true">
            ✶
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <div ref={ref} className="flex h-20 items-center overflow-hidden border-y border-t-line sm:h-24" role="marquee" aria-label={label}>
      <div ref={track} className="flex w-max will-change-transform">
        {row(false)}
        {row(true)}
        {row(true)}
        {row(true)}
      </div>
    </div>
  );
}

/** Desktop-only floating photo that follows the cursor over menu rows. */
export function useCursorPreview(enabled: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<React.ReactNode>(null);
  useEffect(() => {
    if (!enabled || !box.current) return;
    const el = box.current;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
    const move = (e: PointerEvent) => {
      xTo(e.clientX + 24);
      yTo(e.clientY - 120);
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      gsap.killTweensOf(el);
    };
  }, [enabled]);

  const show = (node: React.ReactNode) => {
    if (!enabled || !box.current) return;
    setContent(node);
    gsap.to(box.current, { opacity: 1, scale: 1, duration: 0.35, ease: 'bistro' });
  };
  const hide = () => {
    if (!box.current) return;
    gsap.to(box.current, { opacity: 0, scale: 0.85, duration: 0.25, ease: 'bistro' });
  };
  const node = enabled ? (
    <div ref={box} className="pointer-events-none fixed left-0 top-0 z-50 h-56 w-56 scale-[0.85] overflow-hidden border border-t-line bg-t-surface opacity-0" aria-hidden="true">
      {content}
    </div>
  ) : null;
  return { node, show, hide };
}
