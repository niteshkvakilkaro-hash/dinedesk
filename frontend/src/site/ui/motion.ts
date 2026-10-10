import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation } from 'react-router';
import { useReduceMotion } from '@/stores/motion';
import { useDesktopPointer } from '../hooks';

/**
 * Site motion without an animation library: CSS transitions driven by a few small hooks.
 * Transform and opacity only; nothing runs with reduced motion (CSS also neutralises .s-reveal).
 */

/**
 * Adds .is-in to every .s-reveal inside `root` as it scrolls into view (once).
 * Watches for elements added later (route changes, data arriving).
 */
export function useRevealAll(root: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const showAll = () => el.querySelectorAll('.s-reveal:not(.is-in)').forEach((n) => n.classList.add('is-in'));
    if (typeof IntersectionObserver === 'undefined') {
      showAll();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    const scan = () => el.querySelectorAll('.s-reveal:not(.is-in)').forEach((n) => io.observe(n));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [root, pathname]);
}

/** Header state: past the first few pixels of the page? */
export function useScrolled(threshold = 12) {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return scrolled;
}

/** Desktop hero parallax: the photo moves at 0.3× the scroll, only while on screen. */
export function useParallax<T extends HTMLElement>(factor = 0.3) {
  const ref = useRef<T>(null);
  const desktop = useDesktopPointer();
  const reduce = useReduceMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || !desktop || reduce) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y > window.innerHeight * 1.2) return;
      el.style.transform = `translate3d(0, ${(y * factor).toFixed(1)}px, 0)`;
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      cancelAnimationFrame(frame);
      el.style.transform = '';
    };
  }, [desktop, reduce, factor]);
  return ref;
}

/** Desktop card tilt toward the pointer (at most `max` degrees). Writes --rx / --ry used by .s-card-hover. */
export function useTilt<T extends HTMLElement>(max = 6) {
  const ref = useRef<T>(null);
  const desktop = useDesktopPointer();
  const reduce = useReduceMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || !desktop || reduce) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`);
      });
    };
    const leave = () => {
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
    };
    el.style.transformStyle = 'preserve-3d';
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      leave();
    };
  }, [desktop, reduce, max]);
  return ref;
}
