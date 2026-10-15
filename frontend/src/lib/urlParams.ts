import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';

/**
 * A page tab that can be opened from a link (?tab=suppliers), e.g. from the dashboard search.
 * Unknown or not-allowed values fall back to the page's own default.
 */
export function useTabParam<T extends string>(allowed: readonly T[], fallback: T) {
  const [params] = useSearchParams();
  const { key } = useLocation();
  const wanted = params.get('tab') as T | null;
  const ok = (v: T | null): v is T => v !== null && allowed.includes(v);
  const [tab, setTab] = useState<T>(() => (ok(wanted) ? wanted : fallback));
  const okRef = useRef(ok);
  okRef.current = ok;
  // Following another link to the same page (a new history entry) switches the tab again.
  useEffect(() => {
    if (okRef.current(wanted)) setTab(wanted);
  }, [wanted, key]);
  return [tab, setTab] as const;
}

/**
 * One-off actions from a link (?open=daily-summary, ?open=42): runs once when the page is ready,
 * then drops the parameter so closing the dialog and refreshing doesn't open it again.
 */
export function useOpenParam(onOpen: (value: string) => void, ready = true) {
  const [params, setParams] = useSearchParams();
  const value = params.get('open');
  const handler = useRef(onOpen);
  handler.current = onOpen;
  useEffect(() => {
    if (!value || !ready) return;
    handler.current(value);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
  }, [value, ready, setParams]);
}

/**
 * Scrolls to the section with id `find-<name>` (used with useOpenParam). On a slow phone the
 * section may not exist yet, and content loading above it pushes it down after the scroll, so
 * it waits for the section (up to 5 s) and lines it up again once the page has settled. The
 * header and bottom tabs are kept clear with `scroll-margin` (see index.css).
 */
export function scrollToSection(name: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const started = Date.now();
  const find = () => document.getElementById(`find-${name}`);
  const go = (el: HTMLElement, behavior: ScrollBehavior) => el.scrollIntoView({ block: 'start', behavior });
  const attempt = () => {
    const el = find();
    if (!el) {
      if (Date.now() - started < 5000) window.setTimeout(attempt, 150);
      return;
    }
    go(el, reduce ? 'auto' : 'smooth');
    el.classList.add('find-flash');
    window.setTimeout(() => el.classList.remove('find-flash'), 1600);
    // Images, lists and cards above may still be loading: line it up again, without animation.
    let last = el.getBoundingClientRect().top;
    let checks = 0;
    const settle = window.setInterval(() => {
      const now = find();
      checks += 1;
      if (!now || checks > 8) return window.clearInterval(settle);
      const top = now.getBoundingClientRect().top;
      if (Math.abs(top - last) > 4 && checks > 2) go(now, 'auto');
      last = now.getBoundingClientRect().top;
    }, 250);
  };
  requestAnimationFrame(attempt);
}

/**
 * Tab bars scroll sideways on phones: centre the selected tab so one opened from a link
 * (?tab=suppliers) isn't cut off at the edge. Only the bar scrolls, never the page.
 */
export function revealSelectedTabs(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[role="tablist"]').forEach((list) => {
    const tab = list.querySelector<HTMLElement>('[aria-selected="true"]');
    let box: HTMLElement | null = list;
    while (box && box.scrollWidth <= box.clientWidth) box = box.parentElement === document.body ? null : box.parentElement;
    if (!tab || !box) return;
    const tabBox = tab.getBoundingClientRect();
    const barBox = box.getBoundingClientRect();
    box.scrollLeft += tabBox.left - barBox.left - (barBox.width - tabBox.width) / 2;
  });
}
