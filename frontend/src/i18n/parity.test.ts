import en from './en.json';
import { LANGUAGE_CODES } from './locale';

const keys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
const get = (o: object, path: string) => path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o) as string;
const vars = (s: string) => (String(s).match(/{{\s*\w+\s*}}/g) ?? []).map((v) => v.replace(/\s/g, '')).sort();

// Every translation file next to English (hi, bn, mr, te, ta, gu, ur, kn, or, ml, pa).
const files = import.meta.glob<Record<string, unknown>>(['./*.json', '!./en.json'], { eager: true, import: 'default' });
const languages = Object.entries(files).map(([path, data]) => [path.slice(2, -5), data] as const);

describe('translations', () => {
  it('has a file for every language in the menu', () => {
    expect(languages.map(([code]) => code).sort()).toEqual(LANGUAGE_CODES.filter((c) => c !== 'en').sort());
  });

  const e = keys(en).sort();
  describe.each(languages)('%s', (_code, data) => {
    it('has exactly the same keys as English', () => {
      const t = keys(data).sort();
      expect(e.filter((k) => !t.includes(k))).toEqual([]);
      expect(t.filter((k) => !e.includes(k))).toEqual([]);
    });

    it('keeps the same {{placeholders}} and leaves nothing empty', () => {
      expect(e.filter((k) => JSON.stringify(vars(get(en, k))) !== JSON.stringify(vars(get(data, k))))).toEqual([]);
      expect(e.filter((k) => typeof get(data, k) !== 'string' || !get(data, k).trim())).toEqual([]);
    });
  });
});
