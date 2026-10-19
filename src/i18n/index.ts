import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import ta from './locales/ta.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ta'],
    load: 'languageOnly',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

// Screen readers, fonts and hyphenation follow <html lang>; keep it in step with the chosen language.
const syncLang = (l: string) => { if (typeof document !== 'undefined') document.documentElement.lang = l?.startsWith('ta') ? 'ta' : 'en'; };
syncLang(i18n.resolvedLanguage ?? i18n.language);
i18n.on('languageChanged', syncLang);

export default i18n;
