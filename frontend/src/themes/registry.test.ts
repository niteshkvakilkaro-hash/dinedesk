import { contrastRatio } from '@/lib/contrast';
import { getTheme, isThemeKey, textSafe, THEME_KEYS, THEMES, themeVars } from './registry';

describe('theme registry', () => {
  it('has the eight themes, each complete', () => {
    expect(THEME_KEYS).toEqual(['haveli', 'ember', 'bistro', 'kulhad', 'qsr', 'street', 'rajwada', 'coastal']);
    for (const key of THEME_KEYS) {
      const def = THEMES[key];
      expect(def.key).toBe(key);
      expect(typeof def.load).toBe('function');
      expect(def.preview).toBeTruthy();
      expect(def.motion.personality.length).toBeGreaterThan(2);
      expect(def.motion.ease).toEqual([0.16, 1, 0.3, 1]);
      expect(['fullbleed', 'royal', 'split', 'editorial']).toContain(def.style.hero);
    }
  });

  it('falls back to Haveli for unknown keys', () => {
    expect(isThemeKey('neon')).toBe(false);
    expect(getTheme('neon').key).toBe('haveli');
    expect(getTheme(undefined).key).toBe('haveli');
  });

  it('meets WCAG AA for text, muted text, links and buttons in every theme', () => {
    for (const key of THEME_KEYS) {
      const c = THEMES[key].tokens.colors;
      for (const surface of [c.bg, c.surface, c.surface2]) {
        expect(contrastRatio(c.text, surface), `${key} text`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.muted, surface), `${key} muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(c.link, c.bg), `${key} link`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onPrimary, c.primary), `${key} button`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onAccent, c.accent), `${key} accent`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('layers owner colours over theme tokens with readable text on them', () => {
    const vars = themeVars(THEMES.bistro, { primary: '#123456' });
    expect(vars['--t-primary']).toBe('#123456');
    expect(vars['--t-on-primary']).toBe('#FFFFFF');
    expect(vars['--t-accent']).toBe(THEMES.bistro.tokens.colors.accent);
    expect(themeVars(THEMES.qsr, { primary: '#F2C94C' })['--t-on-primary']).toBe('#141414');
    expect(themeVars(THEMES.street)['--t-x-mint']).toBe('#7ED9B5');
  });

  it('derives a readable link colour from a light owner colour', () => {
    const link = textSafe('#F2C94C', '#FFF8E9');
    expect(contrastRatio(link, '#FFF8E9')).toBeGreaterThanOrEqual(4.5);
    expect(textSafe('#641E16', '#FFF8E9')).toBe('#641E16');
  });

  it('every theme layout module exports a shell and all five pages', async () => {
    for (const key of THEME_KEYS) {
      const mod = await THEMES[key].load();
      expect(typeof mod.Shell).toBe('function');
      expect(Object.keys(mod.pages).sort()).toEqual(['about', 'contact', 'gallery', 'home', 'menu']);
    }
  }, 60_000); // imports every theme chunk
});
