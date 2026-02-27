import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

export default function HowItWorks() {
  const { t } = useTranslation();

  const steps = [
    {
      number: '01',
      title: t('landing.howItWorks.step1.title', 'Set Up Your Job Opening'),
      description: t('landing.howItWorks.step1.description', 'Describe your ideal candidate or upload a job description. Specify must-have skills and experience requirements.'),
    },
    {
      number: '02',
      title: t('landing.howItWorks.step2.title', 'Plug Into Your Workflow'),
      description: t('landing.howItWorks.step2.description', 'Integrate with your existing ATS via API or webhooks. No heavy lifting required.'),
    },
    {
      number: '03',
      title: t('landing.howItWorks.step3.title', 'Receive Best Matches'),
      description: t('landing.howItWorks.step3.description', 'Our AI screens every application, conducts interviews, and ranks candidates by fit.'),
    },
    {
      number: '04',
      title: t('landing.howItWorks.step4.title', 'Get Instant Reports'),
      description: t('landing.howItWorks.step4.description', 'Receive comprehensive evaluation reports via webhook with skills assessment and recommendations.'),
    },
  ];

  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: t('landing.howItWorks.title', 'Simple 4-Step Process'),
    description: t('landing.howItWorks.subtitle', 'AI acts as your hiring agent - screening resumes, interviewing candidates, and delivering evaluation reports.'),
    step: steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.title,
      text: step.description,
    })),
  };

  return (
    <section id="how-it-works" className="py-24 lg:py-32">
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(howToSchema)}</script>
      </Helmet>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <p className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            {t('landing.howItWorks.badge', 'How It Works')}
          </p>
          <h2 className="landing-display mt-5 text-3xl font-semibold text-slate-900 sm:text-4xl lg:text-5xl">
            {t('landing.howItWorks.title', 'Simple 4-Step Process')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            {t('landing.howItWorks.subtitle', 'AI acts as your hiring agent - screening resumes, interviewing candidates, and delivering evaluation reports.')}
          </p>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-9 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent xl:block" />

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step) => (
              <article
                key={step.number}
                className="landing-gradient-stroke relative overflow-hidden rounded-3xl bg-white p-6 shadow-[0_28px_52px_-40px_rgba(15,23,42,0.62)]"
              >
                <div className="pointer-events-none absolute right-4 top-3 text-5xl font-bold text-slate-100">
                  {step.number}
                </div>
                <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
                  {step.number}
                </span>
                <h3 className="landing-display relative mt-5 text-xl font-semibold text-slate-900">
                  {step.title}
                </h3>
                <p className="relative mt-3 text-sm leading-relaxed text-slate-600">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
