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

/** Scrolls to the section with id `find-<name>` (used with useOpenParam). */
export function scrollToSection(name: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`find-${name}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.add('find-flash');
    window.setTimeout(() => el.classList.remove('find-flash'), 1600);
  });
}
