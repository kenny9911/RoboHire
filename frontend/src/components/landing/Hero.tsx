import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 -z-10" />
      
      {/* Decorative Elements - pointer-events-none to not block clicks */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse pointer-events-none" />
      <div className="absolute top-40 right-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse delay-1000 pointer-events-none" />
      <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse delay-500 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 rounded-full text-indigo-700 text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
            </span>
            {t('landing.hero.badge', 'AI-Powered Hiring Platform')}
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
            {t('landing.hero.headline', 'Hire Elite Candidates')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              {t('landing.hero.headlineHighlight', 'Before Others')}
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            {t('landing.hero.subheadline', 'Say goodbye to spending long hours going through piles of resumes. Our AI hiring agent vets candidates, conducts interviews, and delivers comprehensive evaluation reports automatically.')}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 relative z-20">
            <Link
              to="/start-hiring"
              className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-[0_4px_14px_0_rgba(79,70,229,0.4)] hover:shadow-[0_6px_20px_0_rgba(79,70,229,0.5)] hover:-translate-y-1 active:translate-y-0 active:shadow-[0_2px_8px_0_rgba(79,70,229,0.4)]"
            >
              {t('landing.hero.ctaPrimary', 'Start Easy Hiring')}
            </Link>
            <Link
              to="/developers"
              className="w-full sm:w-auto px-8 py-4 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 transition-all duration-200 cursor-pointer relative z-20 shadow-[0_4px_14px_0_rgba(0,0,0,0.10)] hover:shadow-[0_6px_20px_0_rgba(0,0,0,0.15)] hover:-translate-y-1 active:translate-y-0 active:shadow-[0_2px_8px_0_rgba(0,0,0,0.10)] text-center"
            >
              {t('landing.hero.ctaSecondary', 'Explore API')}
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {[
              { value: '90%', label: t('landing.hero.stat1', 'Time Saved') },
              { value: '10x', label: t('landing.hero.stat2', 'Faster Screening') },
              { value: '500+', label: t('landing.hero.stat3', 'Companies') },
              { value: '24/7', label: t('landing.hero.stat4', 'Always Available') },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl lg:text-4xl font-bold text-indigo-600 mb-1">
                  {stat.value}
                </div>
                <div className="text-gray-500 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
