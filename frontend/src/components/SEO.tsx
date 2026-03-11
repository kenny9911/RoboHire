import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
  keywords?: string;
  structuredData?: Record<string, unknown>;
}

const SITE_URL = 'https://robohire.io';
const DEFAULT_IMAGE = '/robohire.png';
const SUPPORTED_LANGS = ['en', 'zh', 'zh-TW', 'ja', 'es', 'fr', 'pt', 'de'];

const LANG_LOCALE_MAP: Record<string, string> = {
  en: 'en_US', zh: 'zh_CN', 'zh-TW': 'zh_TW', ja: 'ja_JP',
  es: 'es_ES', fr: 'fr_FR', pt: 'pt_BR', de: 'de_DE',
};
function langToLocale(lang: string) { return LANG_LOCALE_MAP[lang] || `${lang}_${lang.toUpperCase()}`; }

export default function SEO({
  title,
  description,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  noIndex = false,
  keywords,
  structuredData,
}: SEOProps) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'en';

  const defaultTitle = t('seo.defaultTitle', 'RoboHire - AI-Powered Hiring Platform');
  const defaultDesc = t('seo.defaultDescription', 'Hire elite candidates before others. Our AI hiring agent automatically screens resumes, conducts interviews, and delivers comprehensive evaluation reports.');
  const defaultKeywords = t('seo.defaultKeywords', 'AI hiring, recruitment automation, resume screening, interview evaluation, candidate matching, hiring platform, AI recruitment, automated hiring, talent acquisition');

  const fullTitle = title ? `${title} | RoboHire` : defaultTitle;
  const finalDesc = description || defaultDesc;
  const finalKeywords = keywords || defaultKeywords;
  const imageUrl = image.startsWith('http') ? image : `${SITE_URL}${image}`;
  const pageUrl = url || SITE_URL;

  // Build hreflang path from URL
  const urlPath = pageUrl.replace(SITE_URL, '') || '/';

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <html lang={currentLang} />
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={finalDesc} />
      <meta name="keywords" content={finalKeywords} />

      {/* Canonical URL */}
      <link rel="canonical" href={pageUrl} />

      {/* Robots */}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}

      {/* hreflang — GEO: tell search engines about all language versions */}
      {!noIndex && SUPPORTED_LANGS.map(lang => (
        <link
          key={lang}
          rel="alternate"
          hrefLang={lang}
          href={`${SITE_URL}${urlPath}?lang=${lang}`}
        />
      ))}
      {!noIndex && (
        <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}${urlPath}`} />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={finalDesc} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content="RoboHire" />
      <meta property="og:locale" content={langToLocale(currentLang)} />
      {SUPPORTED_LANGS.filter(l => l !== currentLang).map(lang => (
        <meta key={lang} property="og:locale:alternate" content={langToLocale(lang)} />
      ))}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={pageUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={finalDesc} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Mobile / PWA */}
      <meta name="theme-color" content="#4F46E5" />
      <meta name="application-name" content="RoboHire" />
      <meta name="apple-mobile-web-app-title" content="RoboHire" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />

      {/* Structured Data - Organization */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'RoboHire',
          url: SITE_URL,
          logo: `${SITE_URL}/logo2.png`,
          description: defaultDesc,
          foundingDate: '2024',
          sameAs: [
            'https://twitter.com/robohireio',
            'https://linkedin.com/company/robohire',
            'https://github.com/robohire',
          ],
        })}
      </script>

      {/* Structured Data - Software Application */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'RoboHire',
          url: SITE_URL,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          featureList: 'AI Resume Screening, Automated Interviews, Candidate Evaluation Reports, ATS Integration, Multi-language Support',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
            description: 'Free trial available',
          },
        })}
      </script>

      {/* Structured Data - WebSite with SearchAction + SpeakableSpecification */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'RoboHire',
          url: SITE_URL,
          description: defaultDesc,
          inLanguage: SUPPORTED_LANGS,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${SITE_URL}/docs?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
          speakable: {
            '@type': 'SpeakableSpecification',
            cssSelector: ['h1', 'meta[name="description"]'],
          },
        })}
      </script>

      {/* Page-specific Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData['@context'] ? structuredData : { '@context': 'https://schema.org', ...structuredData })}
        </script>
      )}
    </Helmet>
  );
}
