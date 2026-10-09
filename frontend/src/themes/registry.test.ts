import { contrastRatio } from '@/lib/contrast';
import { getTheme, isThemeKey, THEME_KEYS, THEMES, themeVars } from './registry';

describe('theme registry', () => {
  it('has the three themes, each complete', () => {
    expect(THEME_KEYS).toEqual(['haveli', 'bistro', 'street']);
    for (const key of THEME_KEYS) {
      const def = THEMES[key];
      expect(def.key).toBe(key);
      expect(typeof def.load).toBe('function');
      expect(def.preview).toBeTruthy();
      expect(def.motion.personality.length).toBeGreaterThan(2);
      expect(def.motion.ease).toHaveLength(4);
    }
  });

  it('falls back to Haveli for unknown keys', () => {
    expect(isThemeKey('neon')).toBe(false);
    expect(getTheme('neon').key).toBe('haveli');
    expect(getTheme(undefined).key).toBe('haveli');
  });

  it('meets WCAG AA for body text, muted text and buttons in every theme', () => {
    for (const key of THEME_KEYS) {
      const c = THEMES[key].tokens.colors;
      expect(contrastRatio(c.text, c.bg), `${key} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.muted, c.bg), `${key} muted`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onPrimary, c.primary), `${key} button`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onAccent, c.accent), `${key} accent`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('layers owner colours over theme tokens', () => {
    const vars = themeVars(THEMES.bistro, { primary: '#123456' });
    expect(vars['--t-primary']).toBe('#123456');
    expect(vars['--t-on-primary']).toBe('#FFFFFF');
    expect(vars['--t-accent']).toBe(THEMES.bistro.tokens.colors.accent);
    expect(vars['--t-x-stone']).toBe('#8C877F');
  });

  it('every theme layout module exports a shell and all five pages', async () => {
    for (const key of THEME_KEYS) {
      const mod = await THEMES[key].load();
      expect(typeof mod.Shell).toBe('function');
      expect(Object.keys(mod.pages).sort()).toEqual(['about', 'contact', 'gallery', 'home', 'menu']);
    }
  }, 30_000); // imports all three theme chunks
});
