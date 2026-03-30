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
import { requestDemoTranslations } from './requestDemo';

type TranslationResource = Record<string, any>;

const composeTranslation = (base: TranslationResource, locale: keyof typeof requestDemoTranslations) => ({
  ...base,
  seo: {
    ...(base.seo ?? {}),
    ...requestDemoTranslations[locale].seo,
  },
  productIntro: productIntroTranslations[locale],
  demo: requestDemoTranslations[locale].demo,
});

const resources = {
  en: { translation: composeTranslation(en, 'en') },
  zh: { translation: composeTranslation(zh, 'zh') },
  'zh-TW': { translation: composeTranslation(zhTW, 'zh-TW') },
  ja: { translation: composeTranslation(ja, 'ja') },
  es: { translation: composeTranslation(es, 'es') },
  fr: { translation: composeTranslation(fr, 'fr') },
  pt: { translation: composeTranslation(pt, 'pt') },
  de: { translation: composeTranslation(de, 'de') },
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
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
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
