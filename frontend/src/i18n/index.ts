import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import { htmlLang, isRtl, languageCode, LANGUAGE_CODES } from './locale';

/** Each language in its own script (what people look for in a language menu). */
export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हि' },
  { code: 'bn', label: 'বাংলা', short: 'বা' },
  { code: 'mr', label: 'मराठी', short: 'म' },
  { code: 'te', label: 'తెలుగు', short: 'తె' },
  { code: 'ta', label: 'தமிழ்', short: 'த' },
  { code: 'gu', label: 'ગુજરાતી', short: 'ગુ' },
  { code: 'ur', label: 'اردو', short: 'ار' },
  { code: 'kn', label: 'ಕನ್ನಡ', short: 'ಕ' },
  { code: 'or', label: 'ଓଡ଼ିଆ', short: 'ଓ' },
  { code: 'ml', label: 'മലയാളം', short: 'മ' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', short: 'ਪੰ' },
] as const satisfies readonly { code: (typeof LANGUAGE_CODES)[number]; label: string; short: string }[];

// English ships with the app; every other language is fetched the first time someone switches
// to it (English shows meanwhile, as the fallback). Each is its own small file.
const bundles = import.meta.glob<Record<string, unknown>>(['./*.json', '!./en.json'], { import: 'default' });
const loading = new Map<string, Promise<void>>();
function load(code: string) {
  const loader = bundles[`./${code}.json`]!;
  if (!loading.has(code)) loading.set(code, loader().then((data) => void i18n.addResourceBundle(code, 'translation', data, true, true)));
  return loading.get(code)!;
}

/** Makes sure a language's texts are loaded (English always is). Used by the server renderer. */
export function loadLanguage(code: string): Promise<void> {
  return bundles[`./${code}.json`] ? load(code) : Promise.resolve();
}

i18n.on('languageChanged', (lng) => {
  // Also runs at build time when pages are pre-rendered (no document there).
  if (typeof document !== 'undefined') {
    document.documentElement.lang = htmlLang(lng);
    document.documentElement.dir = isRtl(lng) ? 'rtl' : 'ltr';
  }
  // Base code only ('en-US' → 'en', 'ta-IN' → 'ta'), and re-apply only after a file really
  // loaded: otherwise a regional English like 'en-US' would re-trigger this handler forever.
  const code = languageCode(lng);
  if (bundles[`./${code}.json`] && !i18n.hasResourceBundle(code, 'translation')) {
    void load(code).then(() => i18n.changeLanguage(lng));
  }
});

/**
 * Whether this device already had a language of its own (dd_lang) before this page load. Read
 * before init: i18next stores the detected (browser) language there as soon as it starts.
 */
export const languageChosenOnDevice = (() => {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage.getItem('dd_lang');
  } catch {
    return false;
  }
})();

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGE_CODES],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false }, // React already escapes
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'dd_lang', caches: ['localStorage'] },
  });

export default i18n;
