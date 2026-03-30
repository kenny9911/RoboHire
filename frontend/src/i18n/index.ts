import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import zh from './locales/zh/translation.json';
import ja from './locales/ja/translation.json';
import es from './locales/es/translation.json';
import fr from './locales/fr/translation.json';
import pt from './locales/pt/translation.json';
import de from './locales/de/translation.json';
import zhTW from './locales/zh-TW/translation.json';
import { productIntroTranslations } from './productIntro';

const resources = {
  en: { translation: { ...en, productIntro: productIntroTranslations.en } },
  zh: { translation: { ...zh, productIntro: productIntroTranslations.zh } },
  'zh-TW': { translation: { ...zhTW, productIntro: productIntroTranslations['zh-TW'] } },
  ja: { translation: { ...ja, productIntro: productIntroTranslations.ja } },
  es: { translation: { ...es, productIntro: productIntroTranslations.es } },
  fr: { translation: { ...fr, productIntro: productIntroTranslations.fr } },
  pt: { translation: { ...pt, productIntro: productIntroTranslations.pt } },
  de: { translation: { ...de, productIntro: productIntroTranslations.de } },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh', 'zh-TW', 'ja', 'es', 'fr', 'pt', 'de'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language || 'en';
}

export default i18n;
