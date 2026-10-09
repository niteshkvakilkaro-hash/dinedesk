/** WCAG 2.x contrast maths (same as backend App\Modules\Website\Support\Contrast). */

export const HEX_RE = /^#[0-9a-f]{6}$/i;

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever reads better on the given background. */
export function readableOn(bg: string): '#FFFFFF' | '#141414' {
  return contrastRatio(bg, '#FFFFFF') >= contrastRatio(bg, '#141414') ? '#FFFFFF' : '#141414';
}

export interface ContrastWarning {
  field: 'primary_color' | 'accent_color';
  ratio: number;
  required: number;
}

/**
 * Mirrors Themes::contrastWarnings on the server:
 *  - primary carries white button text → 4.5:1
 *  - accent "fill" (dark text sits on it) → accent vs text 4.5:1
 *  - accent "ink"  (used as text on the page) → accent vs background 4.5:1
 */
export function contrastWarnings(
  theme: { background: string; text: string; accentRole: 'fill' | 'ink' },
  primary: string | null,
  accent: string | null,
): ContrastWarning[] {
  const out: ContrastWarning[] = [];
  if (primary && HEX_RE.test(primary)) {
    const ratio = contrastRatio(primary, '#FFFFFF');
    if (ratio < 4.5) out.push({ field: 'primary_color', ratio: Math.round(ratio * 100) / 100, required: 4.5 });
  }
  if (accent && HEX_RE.test(accent)) {
    const ratio = contrastRatio(accent, theme.accentRole === 'fill' ? theme.text : theme.background);
    if (ratio < 4.5) out.push({ field: 'accent_color', ratio: Math.round(ratio * 100) / 100, required: 4.5 });
  }
  return out;
}
