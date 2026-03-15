import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SEO from '../components/SEO';
import Breadcrumb from '../components/Breadcrumb';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';

interface Article {
  titleKey: string;
  titleDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
  categoryKey: string;
  categoryDefault: string;
  readTime: string;
  href: string;
}

const ARTICLES: Article[] = [
  {
    titleKey: 'blog.articles.0.title',
    titleDefault: 'How AI is Transforming Recruitment in 2026',
    descriptionKey: 'blog.articles.0.description',
    descriptionDefault: 'Artificial intelligence is reshaping how companies find and hire talent. From automated resume screening to AI-conducted interviews, discover the trends driving the future of recruitment.',
    categoryKey: 'blog.articles.0.category',
    categoryDefault: 'Industry Trends',
    readTime: '8 min',
    href: '/docs/overview',
  },
  {
    titleKey: 'blog.articles.1.title',
    titleDefault: 'Resume Screening Best Practices for Growing Teams',
    descriptionKey: 'blog.articles.1.description',
    descriptionDefault: 'Scaling your hiring process without sacrificing quality is a challenge every growing team faces. Learn proven strategies for efficient resume screening that surface the best candidates.',
    categoryKey: 'blog.articles.1.category',
    categoryDefault: 'Best Practices',
    readTime: '6 min',
    href: '/docs/overview',
  },
  {
    titleKey: 'blog.articles.2.title',
    titleDefault: 'Automated Interviews: A Complete Guide',
    descriptionKey: 'blog.articles.2.description',
    descriptionDefault: 'Everything you need to know about AI-powered interviews — how they work, what candidates experience, and how to interpret evaluation reports for better hiring decisions.',
    categoryKey: 'blog.articles.2.category',
    categoryDefault: 'Guides',
    readTime: '10 min',
    href: '/docs/overview',
  },
  {
    titleKey: 'blog.articles.3.title',
    titleDefault: 'Building with the RoboHire API',
    descriptionKey: 'blog.articles.3.description',
    descriptionDefault: 'A developer-focused walkthrough of integrating RoboHire into your existing systems. Covers authentication, resume matching, interview scheduling, and webhook configuration.',
    categoryKey: 'blog.articles.3.category',
    categoryDefault: 'Engineering',
    readTime: '12 min',
    href: '/developers',
  },
  {
    titleKey: 'blog.articles.4.title',
    titleDefault: 'Multilingual Hiring: Reaching Global Talent',
    descriptionKey: 'blog.articles.4.description',
    descriptionDefault: 'Hiring across borders means evaluating candidates in multiple languages. Learn how RoboHire supports 7 languages to help you tap into a worldwide talent pool.',
    categoryKey: 'blog.articles.4.category',
    categoryDefault: 'Global Hiring',
    readTime: '7 min',
    href: '/docs/api/match-resume',
  },
];

export default function Blog() {
  const { t } = useTranslation();

  const blogSchema = {
    '@type': 'Blog',
    name: 'RoboHire Resources & Insights',
    description: 'Articles, guides, and best practices for AI-powered recruitment.',
    url: 'https://robohire.io/blog',
    publisher: {
      '@type': 'Organization',
      name: 'RoboHire',
      url: 'https://robohire.io',
    },
    blogPost: ARTICLES.map((article, index) => ({
      '@type': 'BlogPosting',
      headline: article.titleDefault,
      description: article.descriptionDefault,
      url: `https://robohire.io/blog#article-${index}`,
      author: {
        '@type': 'Organization',
        name: 'RoboHire',
      },
      publisher: {
        '@type': 'Organization',
        name: 'RoboHire',
      },
      datePublished: '2026-03-01',
    })),
  };

  return (
    <>
      <SEO
        title={t('blog.seo.title', 'Resources & Insights - AI Recruitment Blog')}
        description={t('blog.seo.description', 'Expert articles on AI-powered recruitment, resume screening, automated interviews, and global hiring best practices.')}
        url="https://robohire.io/blog"
        structuredData={blogSchema}
      />

      <div className="min-h-screen bg-white">
        <Navbar />

        <main className="pt-24 lg:pt-28">
          <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
            <Breadcrumb items={[{ label: t('breadcrumb.home', 'Home'), href: '/' }, { label: t('breadcrumb.blog', 'Blog') }]} />
          </div>
          {/* Hero */}
          <section className="relative overflow-hidden pb-16 pt-8 sm:pb-20 sm:pt-12 lg:pb-24 lg:pt-16">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-white" />
            <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-600">
                {t('blog.badge', 'Blog')}
              </p>
              <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 landing-display sm:text-5xl lg:text-6xl">
                {t('blog.title', 'Resources & Insights')}
              </h1>
              <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
                {t('blog.subtitle', 'Explore articles, guides, and best practices to help you hire smarter with AI-powered recruitment tools.')}
              </p>
            </div>
          </section>

          {/* Articles Grid */}
          <section className="pb-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {ARTICLES.map((article, index) => (
                  <Link
                    key={index}
                    to={article.href}
                    id={`article-${index}`}
                    className="landing-gradient-stroke group flex flex-col rounded-[28px] bg-white p-7 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)]"
                  >
                    {/* Category + Read Time */}
                    <div className="mb-4 flex items-center gap-3">
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                        {t(article.categoryKey, article.categoryDefault)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {t('blog.readTime', '{{time}} read', { time: article.readTime })}
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="mb-3 text-lg font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                      {t(article.titleKey, article.titleDefault)}
                    </h2>

                    {/* Description */}
                    <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-600">
                      {t(article.descriptionKey, article.descriptionDefault)}
                    </p>

                    {/* Read More */}
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 transition-colors group-hover:text-blue-700">
                      {t('blog.readMore', 'Read more')}
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* Bottom CTA */}
          <section className="bg-slate-950 py-20">
            <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
              <h2 className="mb-4 text-3xl font-bold text-white landing-display sm:text-4xl">
                {t('blog.cta.title', 'Ready to see RoboHire in action?')}
              </h2>
              <p className="mb-8 text-lg text-slate-400">
                {t('blog.cta.subtitle', 'Put these insights into practice. Start hiring with AI today.')}
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/start-hiring"
                  state={{ fresh: true }}
                  className="w-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-4 font-semibold text-white shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5 sm:w-auto"
                >
                  {t('blog.cta.primary', 'Start hiring free')}
                </Link>
                <Link
                  to="/developers"
                  className="w-full rounded-full border border-slate-600 px-8 py-4 text-center font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
                >
                  {t('blog.cta.secondary', 'Explore the API')}
                </Link>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
