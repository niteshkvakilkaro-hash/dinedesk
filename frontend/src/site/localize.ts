import { languageCode } from '@/i18n/locale';

/** Owner content in the site languages other than English and Hindi: { ta: { name: '…', description: '…' } }. */
export type Translations = Partial<Record<string, Partial<Record<string, string>>>>;

const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

/**
 * An owner-written field in the visitor's language: Hindi from `<field>_hi`, the other languages
 * from `translations[lang][field]`, else the English field. Empty text counts as missing.
 */
export function localize(obj: object | null | undefined, field: string, lang?: string | null): string | null {
  if (!obj) return null;
  const rec = obj as Record<string, unknown>;
  const code = languageCode(lang);
  const own = code === 'en' ? null : code === 'hi' ? text(rec[`${field}_hi`]) : text((rec.translations as Translations | undefined)?.[code]?.[field]);
  return own ?? text(rec[field]);
}
