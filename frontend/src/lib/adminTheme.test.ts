import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio } from './contrast';

/** Reads the dashboard's dark-mode colours straight from the stylesheet. */
function darkTokens(): Record<string, string> {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8');
  const block = css.match(/:root\[data-dd-theme='dark'\] \{([^}]*)\}/)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/--dd-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

describe('dashboard dark mode', () => {
  const c = darkTokens();

  it('defines every colour the light theme has', () => {
    for (const k of ['ink', 'paper', 'surface', 'line', 'muted', 'brand', 'brand-soft', 'success', 'success-soft', 'warn', 'warn-soft', 'danger', 'danger-soft']) {
      expect(c[k], k).toMatch(/^#/);
    }
  });

  it('keeps text readable (WCAG AA)', () => {
    const pairs: [string, string][] = [
      ['ink', 'paper'],
      ['ink', 'surface'],
      ['muted', 'paper'],
      ['muted', 'surface'],
      ['brand', 'paper'],
      ['brand', 'surface'],
      ['brand', 'brand-soft'],
      ['success', 'success-soft'],
      ['warn', 'warn-soft'],
      ['danger', 'danger-soft'],
      ['danger', 'surface'],
    ];
    for (const [fg, bg] of pairs) expect(contrastRatio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    // Dark text on the bright brand / status fills.
    for (const bg of ['brand', 'success', 'danger', 'warn']) expect(contrastRatio('#1a0f08', c[bg]), `text on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

/** Colours set by one CSS block, e.g. :root[data-dd-palette='haveli']. */
function block(selector: string): Record<string, string> {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8');
  const start = css.indexOf(`${selector} {`);
  const body = start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--dd-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

describe('dashboard palettes', () => {
  const light = block(':root');
  const dark = darkTokens();
  for (const p of ['haveli', 'royal', 'ocean']) {
    it(`${p}: readable in light and dark mode`, () => {
      const l = { ...light, ...block(`:root[data-dd-palette='${p}']`) };
      for (const [fg, bg] of [['ink', 'paper'], ['muted', 'paper'], ['muted', 'surface'], ['brand', 'paper'], ['brand', 'surface'], ['brand', 'brand-soft']]) {
        expect(contrastRatio(l[fg], l[bg]), `${p} light: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      // White text on brand buttons, and the sidebar's own text.
      expect(contrastRatio('#ffffff', l.brand), `${p}: white on brand`).toBeGreaterThanOrEqual(4.5);
      for (const [fg, bg] of [['side-ink', 'side'], ['side-muted', 'side'], ['side-active-ink', 'side-active']]) {
        expect(contrastRatio(l[fg], l[bg]), `${p} light: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      const d = { ...dark, ...block(`:root[data-dd-theme='dark'][data-dd-palette='${p}']`) };
      for (const [fg, bg] of [['brand', 'paper'], ['brand', 'surface'], ['brand', 'brand-soft'], ['side-ink', 'side'], ['side-muted', 'side'], ['side-active-ink', 'side-active']]) {
        expect(contrastRatio(d[fg], d[bg]), `${p} dark: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio('#1a0f08', d.brand), `${p} dark: text on brand`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
