import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ProductIntro from './ProductIntro';
import { FloatingAgentAlex } from '../components/agent-alex/FloatingAgentAlex';

const homepageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'RoboHire - AI Interview, AI Recruitment & AI Hiring Platform',
  url: 'https://robohire.io/',
  description:
    'AI-powered recruitment and hiring platform that automates resume screening, conducts AI video interviews, and generates evaluation reports. AI interview, AI recruitment, AI hiring — reduce hiring cycles from 42 days to 3.',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'RoboHire',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '0',
      highPrice: '2799',
      priceCurrency: 'CNY',
      offerCount: '4',
    },
    featureList:
      'AI Resume Screening, AI Video Interviews, AI Interview, AI Recruitment, AI Hiring, Automated Candidate Evaluation, Recruitment Automation, Multi-language Support (7 languages), ATS Integration, Cheating Detection',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '500',
      bestRating: '5',
    },
  },
};

export default function Landing() {
  const location = useLocation();

  useEffect(() => {
    const hash = (location.state as { scrollTo?: string })?.scrollTo;
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  return (
    <>
      <ProductIntro
        showDarkToggle={false}
        showFAQ={true}
        seoUrl="https://robohire.io/"
        seoStructuredData={homepageSchema}
      />
      <FloatingAgentAlex />
    </>
  );
}
