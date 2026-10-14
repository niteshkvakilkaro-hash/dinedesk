/**
 * Matching for the dashboard search ("What are you looking for?"). Pure functions so they're
 * easy to test: the palette hands in each destination's title, description and keywords in
 * the current language and in English, and gets them back best match first.
 */

export interface SearchDoc {
  id: string;
  /** Title, description and keywords (space-separated), in the current language. */
  title: string;
  desc: string;
  keywords: string;
  /** The same in English, always searched too (empty when the UI is English). */
  enTitle?: string;
  enKeywords?: string;
}

/** Lower case, accents off (é → e), punctuation to spaces. Indian scripts keep their vowel signs. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

const words = (text: string) => normalise(text).split(' ').filter(Boolean);

/** How well one query word matches a list of words: whole word, start of a word, or inside one. */
function wordScore(token: string, list: string[], exact: number, prefix: number, inside: number) {
  let best = 0;
  for (const w of list) {
    if (w === token) return exact;
    if (w.startsWith(token)) best = Math.max(best, prefix);
    else if (inside && token.length >= 3 && w.includes(token)) best = Math.max(best, inside);
  }
  return best;
}

/** 0 = no match. Every word of the query has to match somewhere. */
export function scoreDoc(doc: SearchDoc, query: string): number {
  const q = normalise(query);
  if (!q) return 0;
  const tokens = q.split(' ');
  const title = [...words(doc.title), ...words(doc.enTitle ?? '')];
  const keywords = [...words(doc.keywords), ...words(doc.enKeywords ?? '')];
  const desc = words(doc.desc);
  let total = 0;
  for (const token of tokens) {
    const s = Math.max(wordScore(token, title, 100, 60, 30), wordScore(token, keywords, 90, 55, 25), wordScore(token, desc, 20, 15, 0));
    if (!s) return 0;
    total += s;
  }
  // The whole query is the title: that comes first.
  const titles = [normalise(doc.title), normalise(doc.enTitle ?? '')].filter(Boolean);
  if (titles.includes(q)) total += 300;
  return total;
}

/** Matching docs, best first (ties keep their original order). */
export function rankDocs<T extends SearchDoc>(docs: T[], query: string, limit = 8): T[] {
  return docs
    .map((doc, i) => ({ doc, i, score: scoreDoc(doc, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.doc);
}

/** Looks like an order number or phone (has digits): only then do we ask the server for orders. */
export const hasDigits = (q: string) => /\d/.test(q);
