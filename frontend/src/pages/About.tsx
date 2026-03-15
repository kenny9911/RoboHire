import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SEO from '../components/SEO';
import Breadcrumb from '../components/Breadcrumb';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';

export default function About() {
  const { t } = useTranslation();

  const techItems = [
    {
      title: t('about.tech.items.0.title', 'Resume Parsing'),
      description: t('about.tech.items.0.description', 'Our AI extracts structured data from resumes in any format — PDF, Word, or plain text — understanding context, not just keywords.'),
    },
    {
      title: t('about.tech.items.1.title', 'Matching Algorithms'),
      description: t('about.tech.items.1.description', 'Advanced language models compare candidate profiles against job requirements with nuanced understanding of skills, experience, and potential.'),
    },
    {
      title: t('about.tech.items.2.title', 'Automated Interviews'),
      description: t('about.tech.items.2.description', 'AI-conducted video interviews adapt in real-time, asking follow-up questions and evaluating responses with human-level comprehension.'),
    },
    {
      title: t('about.tech.items.3.title', 'Evaluation Reports'),
      description: t('about.tech.items.3.description', 'Comprehensive scoring reports with detailed breakdowns, cheating analysis, and actionable recommendations for every candidate.'),
    },
  ];

  const stats = [
    {
      value: t('about.stats.companies.value', '500+'),
      label: t('about.stats.companies.label', 'Companies'),
    },
    {
      value: t('about.stats.languages.value', '7'),
      label: t('about.stats.languages.label', 'Languages'),
    },
    {
      value: t('about.stats.timeSaved.value', '90%'),
      label: t('about.stats.timeSaved.label', 'Time Saved'),
    },
    {
      value: t('about.stats.availability.value', '24/7'),
      label: t('about.stats.availability.label', 'Availability'),
    },
  ];

  const comparisonRows = [
    {
      feature: t('about.comparison.features.setup', 'Setup Time'),
      robohire: t('about.comparison.robohire.setup', 'Minutes'),
      manual: t('about.comparison.manual.setup', 'Weeks'),
      ats: t('about.comparison.ats.setup', 'Days'),
    },
    {
      feature: t('about.comparison.features.screening', 'Resume Screening'),
      robohire: t('about.comparison.robohire.screening', 'AI-powered, instant'),
      manual: t('about.comparison.manual.screening', 'Manual, hours per resume'),
      ats: t('about.comparison.ats.screening', 'Keyword-based filtering'),
    },
    {
      feature: t('about.comparison.features.interviews', 'Interview Process'),
      robohire: t('about.comparison.robohire.interviews', 'Automated AI interviews'),
      manual: t('about.comparison.manual.interviews', 'Schedule & conduct manually'),
      ats: t('about.comparison.ats.interviews', 'Scheduling only'),
    },
    {
      feature: t('about.comparison.features.evaluation', 'Candidate Evaluation'),
      robohire: t('about.comparison.robohire.evaluation', 'Comprehensive AI reports'),
      manual: t('about.comparison.manual.evaluation', 'Subjective notes'),
      ats: t('about.comparison.ats.evaluation', 'Basic scorecards'),
    },
    {
      feature: t('about.comparison.features.multilingual', 'Multilingual Support'),
      robohire: t('about.comparison.robohire.multilingual', '7 languages built-in'),
      manual: t('about.comparison.manual.multilingual', 'Depends on team'),
      ats: t('about.comparison.ats.multilingual', 'Limited or none'),
    },
    {
      feature: t('about.comparison.features.bias', 'Bias Reduction'),
      robohire: t('about.comparison.robohire.bias', 'Consistent AI evaluation'),
      manual: t('about.comparison.manual.bias', 'Prone to unconscious bias'),
      ats: t('about.comparison.ats.bias', 'Keyword bias'),
    },
    {
      feature: t('about.comparison.features.cost', 'Cost'),
      robohire: t('about.comparison.robohire.cost', 'From $29/mo'),
      manual: t('about.comparison.manual.cost', 'High (recruiter hours)'),
      ats: t('about.comparison.ats.cost', '$200-500/mo+'),
    },
  ];

  const trustItems = [
    {
      title: t('about.trust.items.encryption.title', 'End-to-End Encryption'),
      description: t('about.trust.items.encryption.description', 'All data is encrypted in transit (TLS 1.3) and at rest (AES-256). Your candidate data never leaves our secure infrastructure.'),
    },
    {
      title: t('about.trust.items.privacy.title', 'Privacy Compliance'),
      description: t('about.trust.items.privacy.description', 'Fully compliant with GDPR, CCPA, and other major privacy regulations. We process data only as instructed and support data deletion requests.'),
    },
    {
      title: t('about.trust.items.soc2.title', 'SOC 2 Compliant'),
      description: t('about.trust.items.soc2.description', 'Our infrastructure and processes meet SOC 2 Type II standards for security, availability, and confidentiality.'),
    },
  ];

  return (
    <>
      <SEO
        title={t('about.seo.title', 'About RoboHire - AI-Powered Recruitment Platform')}
        description={t('about.seo.description', 'Learn about RoboHire\'s mission to democratize hiring with AI. Discover how our technology helps companies find and hire the best talent faster.')}
        url="https://robohire.io/about"
        structuredData={{
          '@type': 'AboutPage',
          name: 'About RoboHire',
          description: 'AI-powered recruitment platform that automates resume screening, interviews, and candidate evaluation.',
          url: 'https://robohire.io/about',
          mainEntity: {
            '@type': 'Organization',
            name: 'RoboHire',
            url: 'https://robohire.io',
          },
        }}
      />

      <div className="min-h-screen bg-white">
        <Navbar />

        <main className="pt-24 lg:pt-28">
          <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
            <Breadcrumb items={[{ label: t('breadcrumb.home', 'Home'), href: '/' }, { label: t('breadcrumb.about', 'About') }]} />
          </div>
          {/* Hero */}
          <section className="relative overflow-hidden pb-16 pt-8 sm:pb-20 sm:pt-12 lg:pb-24 lg:pt-16">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-white" />
            <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
              <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 landing-display sm:text-5xl lg:text-6xl">
                {t('about.hero.title', 'About RoboHire')}
              </h1>
              <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
                {t('about.hero.subtitle', 'We are building the future of recruitment. Our AI-powered platform helps companies find, evaluate, and hire the best talent — faster, fairer, and smarter than ever before.')}
              </p>
            </div>
          </section>

          {/* Mission / Vision */}
          <section className="py-16 sm:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div className="landing-gradient-stroke rounded-[28px] bg-white p-8 shadow-[0_28px_52px_-40px_rgba(15,23,42,0.62)] sm:p-10">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                    <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h2 className="mb-3 text-2xl font-bold text-slate-900 landing-display">
                    {t('about.mission.title', 'Our Mission')}
                  </h2>
                  <p className="text-slate-600 leading-relaxed">
                    {t('about.mission.text', 'To democratize hiring with AI. We believe every company — regardless of size or resources — deserves access to intelligent recruitment tools that eliminate bias, save time, and surface the best candidates.')}
                  </p>
                </div>

                <div className="landing-gradient-stroke rounded-[28px] bg-white p-8 shadow-[0_28px_52px_-40px_rgba(15,23,42,0.62)] sm:p-10">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100">
                    <svg className="h-6 w-6 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <h2 className="mb-3 text-2xl font-bold text-slate-900 landing-display">
                    {t('about.vision.title', 'Our Vision')}
                  </h2>
                  <p className="text-slate-600 leading-relaxed">
                    {t('about.vision.text', 'A world where every company hires the best talent. Where hiring decisions are driven by data and insight — not gut feelings and guesswork. Where candidates are evaluated fairly on their true abilities.')}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Technology */}
          <section className="bg-slate-50 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-bold text-slate-900 landing-display sm:text-4xl">
                  {t('about.tech.title', 'How Our AI Works')}
                </h2>
                <p className="mx-auto max-w-2xl text-lg text-slate-600">
                  {t('about.tech.subtitle', 'RoboHire combines state-of-the-art language models with recruitment expertise to automate every step of the hiring pipeline.')}
                </p>
              </div>

              <div className="grid gap-8 sm:grid-cols-2">
                {techItems.map((item, index) => (
                  <div
                    key={index}
                    className="landing-gradient-stroke rounded-[28px] bg-white p-7 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)]"
                  >
                    <div className="mb-4 h-2 w-2 rounded-full bg-blue-600" />
                    <h3 className="mb-2 text-lg font-semibold text-slate-900">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="py-16 sm:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                {stats.map((stat, index) => (
                  <div
                    key={index}
                    className="landing-gradient-stroke rounded-[28px] bg-white p-6 text-center shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] sm:p-8"
                  >
                    <div className="mb-2 text-3xl font-bold text-blue-600 sm:text-4xl">{stat.value}</div>
                    <div className="text-sm font-medium text-slate-600">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Comparison Table — RoboHire vs Manual Hiring vs Traditional ATS */}
          <section className="bg-slate-50 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-bold text-slate-900 landing-display sm:text-4xl">
                  {t('about.comparison.title', 'Why RoboHire vs Alternatives')}
                </h2>
                <p className="mx-auto max-w-2xl text-lg text-slate-600">
                  {t('about.comparison.subtitle', 'See how RoboHire compares to manual hiring processes and traditional applicant tracking systems.')}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-4 text-left text-sm font-semibold text-slate-500 sm:px-6">
                        {t('about.comparison.header.feature', 'Feature')}
                      </th>
                      <th className="rounded-t-2xl bg-blue-600 px-4 py-4 text-left text-sm font-semibold text-white sm:px-6">
                        {t('about.comparison.header.robohire', 'RoboHire')}
                      </th>
                      <th className="px-4 py-4 text-left text-sm font-semibold text-slate-500 sm:px-6">
                        {t('about.comparison.header.manual', 'Manual Hiring')}
                      </th>
                      <th className="px-4 py-4 text-left text-sm font-semibold text-slate-500 sm:px-6">
                        {t('about.comparison.header.ats', 'Traditional ATS')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {comparisonRows.map((row, index) => (
                      <tr key={index} className="transition-colors hover:bg-slate-100/50">
                        <td className="px-4 py-4 text-sm font-medium text-slate-900 sm:px-6">{row.feature}</td>
                        <td className="bg-blue-50 px-4 py-4 text-sm font-medium text-blue-700 sm:px-6">{row.robohire}</td>
                        <td className="px-4 py-4 text-sm text-slate-600 sm:px-6">{row.manual}</td>
                        <td className="px-4 py-4 text-sm text-slate-600 sm:px-6">{row.ats}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 text-center">
                <Link
                  to="/start-hiring"
                  state={{ fresh: true }}
                  className="inline-flex rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-3.5 font-semibold text-white shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5"
                >
                  {t('about.comparison.cta', 'Start hiring smarter')}
                </Link>
              </div>
            </div>
          </section>

          {/* Trust & Security */}
          <section className="py-16 sm:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-bold text-slate-900 landing-display sm:text-4xl">
                  {t('about.trust.title', 'Trust & Security')}
                </h2>
                <p className="mx-auto max-w-2xl text-lg text-slate-600">
                  {t('about.trust.subtitle', 'Your data security is our top priority. We employ enterprise-grade security measures to protect every piece of information.')}
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-3">
                {trustItems.map((item, index) => (
                  <div
                    key={index}
                    className="landing-gradient-stroke rounded-[28px] bg-white p-7 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)]"
                  >
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                      <svg className="h-5 w-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-slate-900">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Bottom CTA */}
          <section className="bg-slate-950 py-20">
            <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
              <h2 className="mb-4 text-3xl font-bold text-white landing-display sm:text-4xl">
                {t('about.cta.title', 'Ready to transform your hiring?')}
              </h2>
              <p className="mb-8 text-lg text-slate-400">
                {t('about.cta.subtitle', 'Join hundreds of companies already hiring smarter with RoboHire.')}
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/start-hiring"
                  state={{ fresh: true }}
                  className="w-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-4 font-semibold text-white shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5 sm:w-auto"
                >
                  {t('about.cta.primary', 'Get started free')}
                </Link>
                <Link
                  to="/request-demo"
                  className="w-full rounded-full border border-slate-600 px-8 py-4 text-center font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
                >
                  {t('about.cta.secondary', 'Request a demo')}
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
