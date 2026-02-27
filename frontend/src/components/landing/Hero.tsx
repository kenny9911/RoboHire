import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Hero() {
  const { t } = useTranslation();

  const stats = [
    { value: '90%', label: t('landing.hero.stat1', 'Time Saved') },
    { value: '10x', label: t('landing.hero.stat2', 'Faster Screening') },
    { value: '500+', label: t('landing.hero.stat3', 'Companies') },
    { value: '24/7', label: t('landing.hero.stat4', 'Always Available') },
  ];

  const showcaseItems = [
    {
      title: t('landing.services.hiring.title', 'Start Hiring'),
      detail: t('landing.services.hiring.feature1', 'Automated resume screening'),
      tone: 'from-blue-600 to-cyan-500',
      href: '/start-hiring',
      cta: t('landing.services.hiring.cta', 'Start Hiring Now'),
    },
    {
      title: t('landing.services.quickInvite.title', 'Quick Interview Invite'),
      detail: t('landing.services.quickInvite.feature4', 'One-click email invitations'),
      tone: 'from-cyan-600 to-teal-500',
      href: '/quick-invite',
      cta: t('landing.services.quickInvite.cta', 'Start Inviting'),
    },
    {
      title: t('landing.services.api.subtitle', 'For Developers'),
      detail: t('landing.services.api.feature4', 'RESTful API endpoints'),
      tone: 'from-slate-700 to-blue-700',
      href: '/developers',
      cta: t('landing.services.api.cta', 'Explore API'),
    },
  ];

  return (
    <section className="relative overflow-hidden pb-24 pt-36 lg:pb-32 lg:pt-44">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-8%] top-[18%] h-72 w-72 rounded-full bg-blue-200/45 blur-3xl" />
        <div className="absolute right-[-10%] top-[-6%] h-80 w-80 rounded-full bg-cyan-200/45 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[35%] h-96 w-96 rounded-full bg-slate-200/40 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            {t('landing.hero.badge', 'AI-Powered Hiring Platform')}
          </div>

          <h1 className="landing-display mt-6 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
            {t('landing.hero.headline', 'Hire Elite Candidates')}{' '}
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent">
              {t('landing.hero.headlineHighlight', 'Before Others')}
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            {t('landing.hero.definition', 'RoboHire is an AI-powered recruitment platform that automates resume screening, conducts AI-led interviews, and delivers structured evaluation reports for every candidate.')}{' '}
            {t('landing.hero.subheadline', 'Say goodbye to spending long hours going through piles of resumes. Our AI hiring agent vets candidates, conducts interviews, and delivers comprehensive evaluation reports automatically.')}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_42px_-20px_rgba(37,99,235,0.95)]"
            >
              {t('landing.hero.ctaPrimary', 'Start Free Trial')}
            </Link>
            <Link
              to="/start-hiring"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 shadow-[0_16px_30px_-26px_rgba(15,23,42,0.7)] transition-all hover:border-blue-300 hover:text-blue-700"
            >
              {t('landing.hero.ctaSecondary', 'Start Easy Hiring')}
            </Link>
          </div>

          <div className="mt-10 grid max-w-xl grid-cols-2 gap-3 sm:gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] backdrop-blur">
                <p className="landing-display text-2xl font-semibold text-slate-900 sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[560px]">
          <div className="landing-gradient-stroke relative overflow-hidden rounded-[32px] bg-white p-5 shadow-[0_40px_72px_-48px_rgba(15,23,42,0.8)] sm:p-7">
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-blue-50 via-cyan-50 to-transparent" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {t('landing.hero.badge', 'AI-Powered Hiring Platform')}
              </div>
            </div>

            <div className="relative mt-6 space-y-3">
              {showcaseItems.map((item) => (
                <Link
                  key={item.title}
                  to={item.href}
                  className="group/item flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-300 hover:bg-blue-50/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="truncate text-sm text-slate-500">{item.detail}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className={`h-2.5 w-20 rounded-full bg-gradient-to-r ${item.tone}`} />
                    <span className="inline-flex items-center gap-1 text-right text-[11px] font-semibold leading-4 text-blue-700 transition-colors group-hover/item:text-blue-800">
                      {item.cta}
                      <svg className="h-3.5 w-3.5 transition-transform group-hover/item:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="relative mt-5 grid grid-cols-2 gap-3">
              {stats.slice(0, 2).map((stat) => (
                <div key={stat.label} className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
                  <p className="landing-display text-xl font-semibold">{stat.value}</p>
                  <p className="text-xs text-slate-300">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
