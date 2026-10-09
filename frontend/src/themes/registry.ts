import type { ThemeDefinition, ThemeKey } from './types';
import { tokens as haveliTokens } from './haveli/tokens';
import { motion as haveliMotion } from './haveli/motion';
import haveliPreview from './haveli/preview.png';
import { tokens as bistroTokens } from './bistro/tokens';
import { motion as bistroMotion } from './bistro/motion';
import bistroPreview from './bistro/preview.png';
import { tokens as streetTokens } from './street/tokens';
import { motion as streetMotion } from './street/motion';
import streetPreview from './street/preview.png';

/**
 * Every website theme. Adding one = a folder (tokens.ts, motion.ts,
 * layouts/, preview.png) + one entry here + one entry in the backend's
 * Themes::CATALOGUE. Layouts load lazily, so a visitor only downloads the
 * theme (and fonts) their restaurant uses.
 */
export const THEMES: Record<ThemeKey, ThemeDefinition> = {
  haveli: {
    key: 'haveli',
    name: 'Haveli',
    tokens: haveliTokens,
    motion: haveliMotion,
    preview: haveliPreview,
    load: () => import('./haveli/layouts').then((m) => m.default),
  },
  bistro: {
    key: 'bistro',
    name: 'Bistro',
    tokens: bistroTokens,
    motion: bistroMotion,
    preview: bistroPreview,
    load: () => import('./bistro/layouts').then((m) => m.default),
  },
  street: {
    key: 'street',
    name: 'Street',
    tokens: streetTokens,
    motion: streetMotion,
    preview: streetPreview,
    load: () => import('./street/layouts').then((m) => m.default),
  },
};

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && value in THEMES;
}

export function getTheme(key: unknown): ThemeDefinition {
  return isThemeKey(key) ? THEMES[key] : THEMES.haveli;
}

/** CSS variables for a theme, with the owner's colour choices layered on top. */
export function themeVars(def: ThemeDefinition, overrides: { primary?: string | null; accent?: string | null } = {}): Record<string, string> {
  const c = def.tokens.colors;
  const vars: Record<string, string> = {
    '--t-bg': c.bg,
    '--t-surface': c.surface,
    '--t-text': c.text,
    '--t-muted': c.muted,
    '--t-primary': overrides.primary || c.primary,
    '--t-on-primary': overrides.primary ? '#FFFFFF' : c.onPrimary,
    '--t-accent': overrides.accent || c.accent,
    '--t-on-accent': c.onAccent,
    '--t-line': c.line,
    '--t-radius': def.tokens.radius,
    '--t-font-display': def.tokens.fonts.display,
    '--t-font-body': def.tokens.fonts.body,
    '--t-font-mono': def.tokens.fonts.mono ?? def.tokens.fonts.body,
  };
  for (const [name, value] of Object.entries(c.extra ?? {})) vars[`--t-x-${name}`] = value;
  return vars;
}
