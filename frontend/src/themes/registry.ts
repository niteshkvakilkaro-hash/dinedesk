import { contrastRatio, HEX_RE, readableOn } from '@/lib/contrast';
import type { ThemeDefinition, ThemeKey, ThemeMotion, ThemeStyle, ThemeTokens } from './types';
import * as haveli from './haveli/tokens';
import { motion as haveliMotion } from './haveli/motion';
import haveliPreview from './haveli/preview.png';
import * as ember from './ember/tokens';
import { motion as emberMotion } from './ember/motion';
import emberPreview from './ember/preview.png';
import * as bistro from './bistro/tokens';
import { motion as bistroMotion } from './bistro/motion';
import bistroPreview from './bistro/preview.png';
import * as kulhad from './kulhad/tokens';
import { motion as kulhadMotion } from './kulhad/motion';
import kulhadPreview from './kulhad/preview.png';
import * as qsr from './qsr/tokens';
import { motion as qsrMotion } from './qsr/motion';
import qsrPreview from './qsr/preview.png';
import * as street from './street/tokens';
import { motion as streetMotion } from './street/motion';
import streetPreview from './street/preview.png';
import * as rajwada from './rajwada/tokens';
import { motion as rajwadaMotion } from './rajwada/motion';
import rajwadaPreview from './rajwada/preview.png';
import * as coastal from './coastal/tokens';
import { motion as coastalMotion } from './coastal/motion';
import coastalPreview from './coastal/preview.png';

const def = (
  key: ThemeKey,
  name: string,
  t: { tokens: ThemeTokens; style: ThemeStyle },
  motion: ThemeMotion,
  preview: string,
  load: ThemeDefinition['load'],
): ThemeDefinition => ({ key, name, tokens: t.tokens, style: t.style, motion, preview, load });

/**
 * Every website theme. Adding one = a folder (tokens.ts, motion.ts, fonts.ts,
 * layouts/, preview.png) + one entry here + one entry in the backend's
 * Themes::CATALOGUE. All themes share the page structure in src/site/ui;
 * layouts load lazily, so a visitor only downloads their theme's fonts.
 */
export const THEMES: Record<ThemeKey, ThemeDefinition> = {
  haveli: def('haveli', 'Haveli Royal', haveli, haveliMotion, haveliPreview, () => import('./haveli/layouts').then((m) => m.default)),
  ember: def('ember', 'Ember', ember, emberMotion, emberPreview, () => import('./ember/layouts').then((m) => m.default)),
  bistro: def('bistro', 'Bistro Editorial', bistro, bistroMotion, bistroPreview, () => import('./bistro/layouts').then((m) => m.default)),
  kulhad: def('kulhad', 'Kulhad Warm', kulhad, kulhadMotion, kulhadPreview, () => import('./kulhad/layouts').then((m) => m.default)),
  qsr: def('qsr', 'Modern QSR', qsr, qsrMotion, qsrPreview, () => import('./qsr/layouts').then((m) => m.default)),
  street: def('street', 'Street Pop', street, streetMotion, streetPreview, () => import('./street/layouts').then((m) => m.default)),
  rajwada: def('rajwada', 'Rajwada Royal', rajwada, rajwadaMotion, rajwadaPreview, () => import('./rajwada/layouts').then((m) => m.default)),
  coastal: def('coastal', 'Coastal', coastal, coastalMotion, coastalPreview, () => import('./coastal/layouts').then((m) => m.default)),
};

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && value in THEMES;
}

export function getTheme(key: unknown): ThemeDefinition {
  return isThemeKey(key) ? THEMES[key] : THEMES.haveli;
}

/**
 * A version of `color` that is readable as small text on `bg` (≥ 4.5:1): the colour itself when
 * it already is, otherwise mixed step by step towards black or white.
 */
export function textSafe(color: string, bg: string): string {
  if (!HEX_RE.test(color) || !HEX_RE.test(bg) || contrastRatio(color, bg) >= 4.5) return color;
  const target = readableOn(bg) === '#FFFFFF' ? 255 : 0;
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let step = 1; step <= 10; step++) {
    const mixed = '#' + rgb.map((c) => Math.round(c + (target - c) * step * 0.1).toString(16).padStart(2, '0')).join('').toUpperCase();
    if (contrastRatio(mixed, bg) >= 4.5) return mixed;
  }
  return readableOn(bg);
}

/** CSS variables for a theme, with the owner's colour choices layered on top. */
export function themeVars(def: ThemeDefinition, overrides: { primary?: string | null; accent?: string | null } = {}): Record<string, string> {
  const { colors: c, radius, fonts, heading } = def.tokens;
  const primary = overrides.primary && HEX_RE.test(overrides.primary) ? overrides.primary : null;
  const accent = overrides.accent && HEX_RE.test(overrides.accent) ? overrides.accent : null;
  const [x1, y1, x2, y2] = def.motion.ease;
  const vars: Record<string, string> = {
    '--t-bg': c.bg,
    '--t-surface': c.surface,
    '--t-surface-2': c.surface2,
    '--t-text': c.text,
    '--t-muted': c.muted,
    '--t-primary': primary ?? c.primary,
    // The owner's colour gets whichever of white / ink reads better on it.
    '--t-on-primary': primary ? readableOn(primary) : c.onPrimary,
    '--t-link': primary ? textSafe(primary, c.bg) : c.link,
    '--t-accent': accent ?? c.accent,
    '--t-on-accent': accent ? readableOn(accent) : c.onAccent,
    '--t-line': c.line,
    '--t-overlay': c.overlay,
    '--t-radius': radius.card,
    '--t-radius-card': radius.card,
    '--t-radius-btn': radius.button,
    '--t-radius-input': radius.input,
    '--t-font-display': fonts.display,
    '--t-font-body': fonts.body,
    '--t-font-mono': fonts.mono ?? fonts.body,
    '--t-h-transform': heading.transform,
    '--t-h-tracking': heading.tracking,
    '--t-h-weight': String(heading.weight),
    '--t-h-stretch': heading.stretch ?? 'normal',
    '--t-ease': `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`,
    '--t-dur': `${def.motion.duration.base}s`,
    '--t-stagger': `${def.motion.stagger * 1000}ms`,
  };
  for (const [name, value] of Object.entries(c.extra ?? {})) vars[`--t-x-${name}`] = value;
  return vars;
}
