import { useEffect, useState, useSyncExternalStore } from 'react';

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
 * Colour palette of the dashboard (the sidebar, accents and page tint). Saved per browser like
 * light / dark, so every counter can keep the look its staff like. Values live in index.css.
 */
export const PALETTES = ['classic', 'haveli', 'royal', 'ocean'] as const;
export type AdminPalette = (typeof PALETTES)[number];

const PALETTE_KEY = 'dd_admin_palette';
let paletteMemo: AdminPalette | null = null;

function currentPalette(): AdminPalette {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    if ((PALETTES as readonly string[]).includes(v ?? '')) return v as AdminPalette;
  } catch {
    // fall through
  }
  return paletteMemo ?? 'classic';
}

export function setAdminPalette(palette: AdminPalette) {
  paletteMemo = palette;
  try {
    localStorage.setItem(PALETTE_KEY, palette);
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
  const palette = useSyncExternalStore(subscribe, currentPalette, () => 'classic' as AdminPalette);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ddTheme = theme;
    root.dataset.ddPalette = palette;
    return () => {
      delete root.dataset.ddTheme;
      delete root.dataset.ddPalette;
    };
  }, [theme, palette]);
  return [theme, setAdminTheme];
}

/** The chosen palette (for the appearance menu and for charts that need real colour values). */
export function useAdminPalette(): [AdminPalette, (p: AdminPalette) => void] {
  return [useSyncExternalStore(subscribe, currentPalette, () => 'classic' as AdminPalette), setAdminPalette];
}

/** Resolved colours of the current theme for charts (SVG attributes can't read CSS variables). */
export function useThemeColors(names: string[]): Record<string, string> {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as AdminTheme);
  const palette = useSyncExternalStore(subscribe, currentPalette, () => 'classic' as AdminPalette);
  const read = () => {
    const style = typeof window === 'undefined' ? null : getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => [n, style?.getPropertyValue(`--dd-${n}`).trim() || '#888888']));
  };
  const [colors, setColors] = useState(read);
  const key = names.join('|');
  useEffect(() => {
    // Next frame: the layout has written the new theme / palette to <html> by then.
    const id = requestAnimationFrame(() => setColors(read()));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, palette, key]);
  return colors;
}
