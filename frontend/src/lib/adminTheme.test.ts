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
