import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function CTA() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[34px] bg-slate-950 px-6 py-14 text-center shadow-[0_44px_74px_-48px_rgba(2,6,23,0.92)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
          <div className="pointer-events-none absolute -left-24 top-[-35%] h-72 w-72 rounded-full bg-blue-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-[-30%] h-80 w-80 rounded-full bg-cyan-500/25 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(148,163,184,0.08),transparent_45%,rgba(59,130,246,0.18))]" />

          <div className="relative mx-auto max-w-3xl">
            <h2 className="landing-display text-3xl font-semibold text-white sm:text-4xl lg:text-5xl">
              {t('landing.cta.title', 'Ready to Hire Smarter?')}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
              {t('landing.cta.subtitle', 'Join 500+ companies using AI to find elite candidates faster. Start your free trial today.')}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={() => navigate('/pricing')}
                type="button"
                className="inline-flex w-full items-center justify-center rounded-full bg-white px-8 py-3.5 text-base font-semibold text-slate-900 transition-all hover:bg-slate-100 sm:w-auto"
              >
                {t('landing.cta.primary', 'Start Free Trial')}
              </button>
              <button
                onClick={() => navigate('/request-demo')}
                type="button"
                className="inline-flex w-full items-center justify-center rounded-full border border-slate-600 px-8 py-3.5 text-base font-semibold text-white transition-all hover:border-slate-400 hover:bg-white/5 sm:w-auto"
              >
                {t('landing.cta.secondary', 'Talk to Sales')}
              </button>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-300">
              <span className="rounded-full border border-slate-700/80 bg-slate-900/65 px-4 py-2">
                {t('landing.cta.benefit1', 'No credit card required')}
              </span>
              <span className="rounded-full border border-slate-700/80 bg-slate-900/65 px-4 py-2">
                {t('landing.cta.benefit2', '14-day free trial')}
              </span>
              <span className="rounded-full border border-slate-700/80 bg-slate-900/65 px-4 py-2">
                {t('landing.cta.benefit3', 'Cancel anytime')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
