import { useEffect, useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';

/**
 * Shared motion plumbing for the website themes. Rules every theme follows:
 *  - animate only transform, opacity, clip-path and filter
 *  - content is visible without JS; animations start *from* a hidden state,
 *    so a failed or skipped animation never leaves text at opacity 0
 *  - every GSAP tween / ScrollTrigger / SplitText lives in a gsap.context and
 *    is reverted on unmount; Lenis is destroyed on unmount
 *  - loops pause off screen and in background tabs
 */

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);

export { gsap, ScrollTrigger, SplitText, CustomEase };

export function cssEase([x1, y1, x2, y2]: readonly number[]) {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

/** Registers a theme ease once ("haveli", "bistro") from its motion tokens. */
export function themeEase(name: string, [x1, y1, x2, y2]: readonly number[]) {
  if (!CustomEase.get(name)) CustomEase.create(name, `M0,0 C${x1},${y1} ${x2},${y2} 1,1`);
  return name;
}

/**
 * Runs GSAP setup scoped to a container; everything it creates is reverted on
 * unmount or when deps change. Skipped entirely when `enabled` is false.
 */
export function useGsap(scope: RefObject<HTMLElement | null>, setup: (ctx: gsap.Context) => void, deps: DependencyList, enabled = true) {
  useLayoutEffect(() => {
    if (!enabled || !scope.current) return;
    const ctx = gsap.context((self) => setup(self), scope.current);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}

/** Lenis smooth scrolling driven by GSAP's ticker, synced with ScrollTrigger. */
export function useLenis(enabled: boolean, onScroll?: (lenis: Lenis) => void) {
  const cb = useRef(onScroll);
  cb.current = onScroll;
  useEffect(() => {
    if (!enabled) return;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    const raf = (time: number) => lenis.raf(time * 1000);
    lenis.on('scroll', () => {
      ScrollTrigger.update();
      cb.current?.(lenis);
    });
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, [enabled]);
}

export { useDesktopPointer, useIntroOnce, useLoopActive } from './hooks';
