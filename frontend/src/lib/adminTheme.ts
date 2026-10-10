import { useEffect, useSyncExternalStore } from 'react';

/** Light or dark for the restaurant dashboard. Saved per browser; until chosen, it follows the device. */
export type AdminTheme = 'light' | 'dark';

const KEY = 'dd_admin_theme';
const listeners = new Set<() => void>();
let memo: AdminTheme | null = null;

function saved(): AdminTheme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : memo;
  } catch {
    return memo;
  }
}

function system(): AdminTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function current(): AdminTheme {
  return saved() ?? system();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', cb);
  return () => {
    listeners.delete(cb);
    mq?.removeEventListener?.('change', cb);
  };
}

export function setAdminTheme(theme: AdminTheme) {
  memo = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: the choice lasts until the page reloads.
  }
  listeners.forEach((cb) => cb());
}

/**
 * The dashboard's theme, applied to <html> while the dashboard is on screen and removed when it
 * leaves (the public website and the kitchen screen keep their own looks).
 */
export function useAdminTheme(): [AdminTheme, (t: AdminTheme) => void] {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as AdminTheme);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ddTheme = theme;
    return () => {
      delete root.dataset.ddTheme;
    };
  }, [theme]);
  return [theme, setAdminTheme];
}
