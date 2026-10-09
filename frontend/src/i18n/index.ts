import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हि' },
] as const;

// English ships with the app; Hindi is fetched the first time someone switches to it
// (English shows meanwhile, as the fallback).
let hindi: Promise<void> | null = null;
function loadHindi() {
  hindi ??= import('./hi.json').then((m) => {
    i18n.addResourceBundle('hi', 'translation', m.default, true, true);
  });
  return hindi;
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng === 'hi' ? 'hi-IN' : 'en-IN';
  if (lng === 'hi' && !i18n.hasResourceBundle('hi', 'translation')) {
    void loadHindi().then(() => i18n.changeLanguage('hi'));
  }
});

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi'],
    interpolation: { escapeValue: false }, // React already escapes
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'dd_lang', caches: ['localStorage'] },
  });

export default i18n;
