import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
}

const DEFAULT_TITLE = 'RoboHire - AI-Powered Hiring Platform';
const DEFAULT_DESCRIPTION = 'Hire elite candidates before others. Our AI hiring agent automatically screens resumes, conducts interviews, and delivers comprehensive evaluation reports.';
const DEFAULT_IMAGE = '/og-image.png';
const SITE_URL = 'https://robohire.io';

export default function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url = SITE_URL,
  type = 'website',
  noIndex = false,
}: SEOProps) {
  const fullTitle = title ? `${title} | RoboHire` : DEFAULT_TITLE;
  const imageUrl = image.startsWith('http') ? image : `${SITE_URL}${image}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      
      {/* Canonical URL */}
      <link rel="canonical" href={url} />

      {/* Robots */}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content="RoboHire" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Additional Meta Tags */}
      <meta name="theme-color" content="#4F46E5" />
      <meta name="application-name" content="RoboHire" />
      <meta name="apple-mobile-web-app-title" content="RoboHire" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      
      {/* Keywords */}
      <meta name="keywords" content="AI hiring, recruitment automation, resume screening, interview evaluation, candidate matching, hiring platform, AI recruitment, automated hiring, talent acquisition" />

      {/* Structured Data - Organization */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'RoboHire',
          url: SITE_URL,
          logo: `${SITE_URL}/logo.png`,
          description: DEFAULT_DESCRIPTION,
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
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
            description: 'Free trial available',
          },
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: '4.8',
            ratingCount: '150',
          },
        })}
      </script>
    </Helmet>
  );
}
