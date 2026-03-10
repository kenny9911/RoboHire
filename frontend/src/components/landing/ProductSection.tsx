import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const products = [
  {
    titleKey: 'landing.product.easyHiring.title',
    titleFallback: 'Easy Hiring',
    descKey: 'landing.product.easyHiring.desc',
    descFallback: 'AI-powered hiring workflow that screens resumes, manages candidates, and streamlines your entire recruitment process.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    tone: 'from-blue-600 to-cyan-500',
    bg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    href: '/product/hiring',
  },
  {
    titleKey: 'landing.product.smartMatching.title',
    titleFallback: 'Smart Matching',
    descKey: 'landing.product.smartMatching.desc',
    descFallback: 'AI matches candidates to jobs with precision scoring, ranking the best fits so you never miss top talent.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    tone: 'from-cyan-500 to-teal-500',
    bg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    href: '/product/talent',
  },
  {
    titleKey: 'landing.product.aiInterview.title',
    titleFallback: 'AI Interview',
    descKey: 'landing.product.aiInterview.desc',
    descFallback: 'AI-led video interviews with natural voice conversation. Candidates talk to our AI interviewer — you review the results.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    tone: 'from-violet-500 to-purple-500',
    bg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    href: '/product/interview',
  },
  {
    titleKey: 'landing.product.evaluation.title',
    titleFallback: 'Evaluation',
    descKey: 'landing.product.evaluation.desc',
    descFallback: 'Multi-agent AI assessment that evaluates skills, experience, culture fit, and delivers comprehensive hiring reports.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    tone: 'from-emerald-500 to-green-500',
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    href: '/product',
  },
];

export default function ProductSection() {
  const { t } = useTranslation();

  return (
    <section id="product" className="relative py-24 lg:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[10%] top-[20%] h-64 w-64 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute right-[15%] bottom-[10%] h-72 w-72 rounded-full bg-cyan-100/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            <span className="text-xs font-bold tracking-wider">AI</span>
            {t('landing.product.badge', 'Product Suite')}
          </div>
          <h2 className="mt-6 text-3xl font-semibold text-slate-900 sm:text-4xl lg:text-5xl">
            {t('landing.product.headline', 'Everything You Need to Hire Smarter')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            {t('landing.product.subheadline', 'Four AI-powered products that work together to transform your hiring from manual screening to intelligent recruitment.')}
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <Link
              key={product.href}
              to={product.href}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.5)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_42px_-28px_rgba(15,23,42,0.6)] hover:border-blue-200"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${product.tone}`} />
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${product.bg} ${product.iconColor} mb-4`}>
                {product.icon}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                {t(product.titleKey, product.titleFallback)}
              </h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                {t(product.descKey, product.descFallback)}
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                {t('landing.product.explore', 'Explore')}
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            to="/product"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_42px_-20px_rgba(37,99,235,0.95)]"
          >
            {t('landing.product.cta', 'Open Product Dashboard')}
          </Link>
        </div>
      </div>
    </section>
  );
}
