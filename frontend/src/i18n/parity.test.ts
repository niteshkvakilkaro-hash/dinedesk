import en from './en.json';
import hi from './hi.json';

const keys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

describe('translations', () => {
  it('English and Hindi have exactly the same keys', () => {
    const e = keys(en).sort();
    const h = keys(hi).sort();
    expect(e.filter((k) => !h.includes(k))).toEqual([]);
    expect(h.filter((k) => !e.includes(k))).toEqual([]);
  });

  it('keeps the same {{placeholders}} in both languages', () => {
    const get = (o: object, path: string) => path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o) as string;
    const vars = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).map((v) => v.replace(/\s/g, '')).sort();
    const mismatched = keys(en).filter((k) => JSON.stringify(vars(get(en, k))) !== JSON.stringify(vars(get(hi, k))));
    expect(mismatched).toEqual([]);
  });
});
