import { useEffect, useState, type RefObject } from 'react';
import { PREVIEW } from './preview';

// Small motion helpers shared by the site (see also site/ui/motion.ts).

/** True while the element is on screen and the tab is visible: loops run only then. */
export function useLoopActive(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '50px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return inView && visible;
}

/** Intros play once per browser session (and never with reduced motion). */
export function useIntroOnce(key: string, allowed: boolean): [boolean, () => void] {
  const storageKey = `dd_intro_${key}`;
  const [play, setPlay] = useState(() => {
    if (!allowed) return false;
    if (PREVIEW) return true; // the theme picker replays the entrance on every switch
    try {
      return sessionStorage.getItem(storageKey) !== '1';
    } catch {
      return true;
    }
  });
  const done = () => {
    try {
      sessionStorage.setItem(storageKey, '1');
    } catch {
      /* ignore */
    }
    setPlay(false);
  };
  useEffect(() => {
    if (!allowed) setPlay(false);
  }, [allowed]);
  return [play, done];
}

/** Desktop-only effects (cursor previews, pinned scroll) need a fine pointer and room. */
export function useDesktopPointer(): boolean {
  const query = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return match;
}
