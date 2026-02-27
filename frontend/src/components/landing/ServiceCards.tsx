import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ServiceCards() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const services = [
    {
      id: 'start-hiring',
      title: t('landing.services.hiring.title', 'Start Hiring'),
      subtitle: t('landing.services.hiring.subtitle', 'AI Hiring Agent'),
      description: t('landing.services.hiring.description', 'Let AI handle the heavy lifting. Our hiring agent screens resumes, conducts interviews, and delivers evaluation reports automatically.'),
      features: [
        t('landing.services.hiring.feature1', 'Automated resume screening'),
        t('landing.services.hiring.feature2', 'AI-powered interviews'),
        t('landing.services.hiring.feature3', 'Comprehensive evaluation reports'),
        t('landing.services.hiring.feature4', 'Webhook integration'),
      ],
      cta: t('landing.services.hiring.cta', 'Start Hiring Now'),
      href: '/start-hiring',
      accentColor: 'indigo',
      badge: t('landing.services.hiring.badge', 'Most Popular'),
    },
    {
      id: 'quick-invite',
      title: t('landing.services.quickInvite.title', 'Quick Interview Invite'),
      subtitle: t('landing.services.quickInvite.subtitle', 'One-Click Batch Invite'),
      description: t('landing.services.quickInvite.description', 'Upload resumes and job descriptions, then send interview invitations with QR codes and links to all candidates in one click.'),
      features: [
        t('landing.services.quickInvite.feature1', 'Batch resume upload (PDF)'),
        t('landing.services.quickInvite.feature2', 'AI-powered resume parsing'),
        t('landing.services.quickInvite.feature3', 'QR code interview links'),
        t('landing.services.quickInvite.feature4', 'One-click email invitations'),
      ],
      cta: t('landing.services.quickInvite.cta', 'Start Inviting'),
      href: '/quick-invite',
      accentColor: 'amber',
      badge: t('landing.services.quickInvite.badge', 'New'),
    },
    {
      id: 'api',
      title: t('landing.services.api.title', 'RoboHire'),
      subtitle: t('landing.services.api.subtitle', 'For Developers'),
      description: t('landing.services.api.description', 'Integrate powerful AI recruitment capabilities into your existing systems. Parse resumes, match candidates, and evaluate interviews.'),
      features: [
        t('landing.services.api.feature1', 'Resume & JD parsing'),
        t('landing.services.api.feature2', 'AI candidate matching'),
        t('landing.services.api.feature3', 'Interview evaluation'),
        t('landing.services.api.feature4', 'RESTful API endpoints'),
      ],
      cta: t('landing.services.api.cta', 'Explore API'),
      href: '/developers',
      accentColor: 'emerald',
      badge: null,
    },
  ] as const;

  const toneStyles = {
    indigo: {
      accent: 'from-blue-600 to-indigo-600',
      chip: 'text-blue-700 bg-blue-50 border-blue-100',
      bullet: 'bg-blue-500',
      cta: 'text-blue-700 group-hover:text-blue-800',
    },
    amber: {
      accent: 'from-amber-500 to-orange-500',
      chip: 'text-amber-700 bg-amber-50 border-amber-100',
      bullet: 'bg-amber-500',
      cta: 'text-amber-700 group-hover:text-amber-800',
    },
    emerald: {
      accent: 'from-emerald-500 to-teal-500',
      chip: 'text-emerald-700 bg-emerald-50 border-emerald-100',
      bullet: 'bg-emerald-500',
      cta: 'text-emerald-700 group-hover:text-emerald-800',
    },
  } as const;

  return (
    <section id="services" className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="landing-display text-3xl font-semibold text-slate-900 sm:text-4xl lg:text-5xl">
            {t('landing.services.title', 'Three Powerful Ways to Hire')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            {t('landing.services.subtitle', 'Choose the solution that fits your needs.')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const tone = toneStyles[service.accentColor];
            return (
              <article
                key={service.id}
                className="group landing-gradient-stroke relative flex h-full flex-col overflow-hidden rounded-[28px] bg-white p-7 shadow-[0_28px_56px_-42px_rgba(15,23,42,0.7)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_34px_64px_-36px_rgba(15,23,42,0.58)] lg:p-8"
              >
                <div className={`absolute inset-x-0 top-0 h-1 rounded-t-[28px] bg-gradient-to-r ${tone.accent}`} />

                {service.badge && (
                  <span className={`absolute right-6 top-6 rounded-full border px-3 py-1 text-xs font-semibold ${tone.chip}`}>
                    {service.badge}
                  </span>
                )}

                <div className="mb-8 min-h-[240px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {service.subtitle}
                  </p>
                  <h3 className="landing-display mt-3 text-2xl font-semibold text-slate-900">
                    {service.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-slate-600">
                    {service.description}
                  </p>
                </div>

                <ul className="space-y-3">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm font-medium text-slate-600">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.bullet}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(service.href);
                    }}
                    className={`inline-flex items-center gap-2 text-lg font-semibold transition-colors ${tone.cta}`}
                  >
                    {service.cta}
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-current/25">
                      <svg
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
