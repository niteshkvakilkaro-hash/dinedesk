/** The app's languages: English, Hindi and ten more Indian languages. */
export const LANGUAGE_CODES = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'or', 'ml', 'pa'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

const base = (lang?: string | null) => (lang ?? 'en').toLowerCase().split('-')[0];

/** A supported language code ("bn" from "bn-IN"), or English. */
export function languageCode(lang?: string | null): LanguageCode {
  const b = base(lang);
  return (LANGUAGE_CODES as readonly string[]).includes(b) ? (b as LanguageCode) : 'en';
}

/**
 * Locale for dates and numbers ("ta-IN", "bn-IN" …) with Western digits: rupee amounts, phone
 * numbers and times stay 0–9 in every language (Bengali or Marathi digits on a bill confuse people).
 */
export function intlLocale(lang?: string | null) {
  return `${languageCode(lang)}-IN-u-nu-latn`;
}

/** For <html lang> and hreflang. */
export function htmlLang(lang?: string | null) {
  return `${languageCode(lang)}-IN`;
}

/** Urdu reads right to left. */
export function isRtl(lang?: string | null) {
  return languageCode(lang) === 'ur';
}
