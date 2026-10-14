import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import { DESTINATIONS } from './navigation';
import { normalise, rankDocs, scoreDoc, type SearchDoc } from './search';

const doc = (id: string, title: string, keywords = '', desc = '', extra: Partial<SearchDoc> = {}): SearchDoc => ({ id, title, keywords, desc, ...extra });

describe('normalise', () => {
  it('lower-cases, drops accents and punctuation', () => {
    expect(normalise('  Café & Bar / KOT-Printer ')).toBe('cafe bar kot printer');
  });
  it('keeps Indian scripts (vowel signs included) intact', () => {
    expect(normalise('छुट्टी')).toBe('छुट्टी');
    expect(normalise('ਮੀਨੂ')).toBe('ਮੀਨੂ');
  });
});

describe('ranking', () => {
  const docs = [
    doc('reports', 'Reports', 'report sales hisab', 'Sales, best sellers and busy hours'),
    doc('pos', 'POS', 'bill billing counter cash kot', 'Billing counter: take orders and print bills'),
    doc('printers', 'Printer', 'printer print thermal bill kot', 'Bill and kitchen ticket printer'),
    doc('hours', 'Opening hours & holidays', 'timing band chutti holiday', 'When you are open'),
  ];

  it('puts an exact title first, then title prefixes, then keywords', () => {
    expect(rankDocs(docs, 'printer').map((d) => d.id)[0]).toBe('printers');
    expect(rankDocs(docs, 'pri').map((d) => d.id)[0]).toBe('printers');
    expect(rankDocs(docs, 'pos').map((d) => d.id)).toEqual(['pos']);
  });

  it('finds Hinglish words through keywords', () => {
    expect(rankDocs(docs, 'chutti').map((d) => d.id)).toEqual(['hours']);
    expect(rankDocs(docs, 'hisab').map((d) => d.id)).toEqual(['reports']);
    expect(rankDocs(docs, 'BILL').map((d) => d.id)).toEqual(['pos', 'printers']);
  });

  it('needs every word of the query to match', () => {
    expect(rankDocs(docs, 'bill printer').map((d) => d.id)).toEqual(['printers']);
    expect(rankDocs(docs, 'bill zzz')).toEqual([]);
    expect(scoreDoc(docs[0], '   ')).toBe(0);
  });

  it('searches the English title and keywords alongside the current language', () => {
    const hindi = doc('menu', 'मेन्यू', 'खाना डिश', 'डिश और दाम', { enTitle: 'Menu', enKeywords: 'menu dish item price' });
    expect(rankDocs([hindi], 'मेन्यू')).toHaveLength(1);
    expect(rankDocs([hindi], 'menu')).toHaveLength(1);
    expect(rankDocs([hindi], 'price')).toHaveLength(1);
  });

  it('keeps the original order for equal scores and respects the limit', () => {
    const same = [doc('a', 'Alpha', 'x'), doc('b', 'Beta', 'x'), doc('c', 'Gamma', 'x')];
    expect(rankDocs(same, 'x', 2).map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('the real search index', () => {
  type Items = Record<string, { title?: string; desc: string; keys: string }>;
  const enItems = en.dashboard.find.items as Items;
  const nav = en.dashboard.nav as Record<string, string>;
  const docsFor = (items: Items, navLabels: Record<string, string>, english?: Items) =>
    DESTINATIONS.map((d) => {
      const key = d.title.split('.').slice(-2);
      const title = key[0] === 'nav' ? navLabels[key[1]] : items[d.id].title!;
      return { id: d.id, title, desc: items[d.id].desc, keywords: items[d.id].keys, enKeywords: english?.[d.id].keys ?? '' };
    });

  it('has a title, description and keywords for every destination', () => {
    for (const d of DESTINATIONS) {
      expect(enItems[d.id], d.id).toBeTruthy();
      expect(enItems[d.id].keys.trim(), d.id).not.toBe('');
      if (d.title.includes('.find.')) expect(enItems[d.id].title, d.id).toBeTruthy();
    }
  });

  it.each([
    ['printer', 'printers'],
    ['bill', 'pos'],
    ['kot', 'orders'],
    ['chutti', 'hours'],
    ['band', 'hours'],
    ['kharcha', 'expenses'],
    ['upi', 'payments'],
    ['gst', 'gst'],
    ['qr', 'tableQr'],
    ['offer', 'coupons'],
    ['staff', 'team'],
    ['photo', 'gallery'],
    ['timing', 'hours'],
    ['menu card', 'aiImport'],
    ['ghanti', 'deviceAlerts'],
    ['push', 'deviceAlerts'],
    ['sound', 'deviceAlerts'],
  ])('“%s” finds %s near the top', (query, id) => {
    const top = rankDocs(docsFor(enItems, nav), query, 5).map((d) => d.id);
    expect(top).toContain(id);
  });

  it('puts the billing counter first for “bill”', () => {
    expect(rankDocs(docsFor(enItems, nav), 'bill')[0].id).toBe('pos');
  });

  it('finds things in Hindi, and in English while the UI is in Hindi', () => {
    const docs = docsFor(hi.dashboard.find.items as Items, hi.dashboard.nav as Record<string, string>, enItems);
    expect(rankDocs(docs, 'printer', 5).map((d) => d.id)).toContain('printers');
    expect(rankDocs(docs, hi.dashboard.find.items.printers.title, 3).map((d) => d.id)).toContain('printers');
  });
});
