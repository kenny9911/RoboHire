import { useTranslation } from 'react-i18next';

export default function Features() {
  const { t } = useTranslation();

  const features = [
    {
      title: t('landing.features.aiScreening.title', 'AI Resume Screening'),
      description: t('landing.features.aiScreening.description', 'Our AI analyzes every resume against your requirements, identifying must-have skills and experience gaps.'),
    },
    {
      title: t('landing.features.autoInterviews.title', 'Automated Interviews'),
      description: t('landing.features.autoInterviews.description', 'AI conducts initial screening interviews 24/7, asking relevant questions and evaluating responses.'),
    },
    {
      title: t('landing.features.evalReports.title', 'Evaluation Reports'),
      description: t('landing.features.evalReports.description', 'Get comprehensive reports with skill assessments, interview analysis, and hiring recommendations.'),
    },
    {
      title: t('landing.features.timeSavings.title', '90% Time Savings'),
      description: t('landing.features.timeSavings.description', 'Stop spending hours reviewing mismatched candidates. Focus only on the best fits.'),
    },
    {
      title: t('landing.features.apiAccess.title', 'Developer API'),
      description: t('landing.features.apiAccess.description', 'Full REST API access for parsing, matching, and evaluation. Integrate AI hiring into your systems.'),
    },
    {
      title: t('landing.features.webhooks.title', 'Webhook Delivery'),
      description: t('landing.features.webhooks.description', 'Receive shortlisted candidates and evaluation reports automatically via webhooks.'),
    },
    {
      title: t('landing.features.multilingual.title', 'Multilingual Support'),
      description: t('landing.features.multilingual.description', 'Support for 7 languages including English, Chinese, Japanese, Spanish, French, Portuguese, and German.'),
    },
    {
      title: t('landing.features.cheatingDetection.title', 'Cheating Detection'),
      description: t('landing.features.cheatingDetection.description', 'Advanced AI analysis to detect AI-assisted answers, ensuring genuine candidate evaluation.'),
    },
  ];

  return (
    <section id="features" className="relative py-24 lg:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-blue-50/50 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <p className="inline-flex rounded-full border border-cyan-100 bg-cyan-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            {t('landing.features.badge', 'Features')}
          </p>
          <h2 className="landing-display mt-5 text-3xl font-semibold text-slate-900 sm:text-4xl lg:text-5xl">
            {t('landing.features.title', 'Everything You Need to Hire Smarter')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            {t('landing.features.subtitle', 'From AI screening to automated interviews, we provide all the tools to transform your hiring process.')}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {features.map((feature, index) => (
            <article
              key={feature.title}
              className="group landing-gradient-stroke rounded-3xl bg-white p-6 shadow-[0_26px_52px_-44px_rgba(15,23,42,0.72)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_34px_66px_-38px_rgba(15,23,42,0.6)]"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white transition-colors duration-300 group-hover:bg-blue-600">
                {(index + 1).toString().padStart(2, '0')}
              </div>
              <h3 className="landing-display mt-5 text-lg font-semibold text-slate-900">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
