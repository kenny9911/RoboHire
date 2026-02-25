import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import SEO from '../components/SEO';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

interface PlanFeature {
  text: string;
  subtext?: string;
}

interface Plan {
  id: string;
  name: string;
  subtitle: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  features: PlanFeature[];
  cta: string;
  popular?: boolean;
  custom?: boolean;
}

const CHECK_ICON = (
  <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default function Pricing() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const plans: Plan[] = [
    {
      id: 'free',
      name: t('pricing.free.name', 'Free'),
      subtitle: t('pricing.free.subtitle', 'For individuals getting started'),
      monthlyPrice: 0,
      annualPrice: 0,
      cta: t('pricing.free.cta', 'Get started free'),
      features: [
        { text: t('pricing.free.f1', '2 job roles') },
        { text: t('pricing.free.f2', '10 resume matches') },
        { text: t('pricing.free.f3', '2 interviews') },
        { text: t('pricing.free.f4', 'Interview scoring & assessment') },
        { text: t('pricing.free.f5', 'Interview summaries') },
      ],
    },
    {
      id: 'startup',
      name: t('pricing.startup.name', 'Startup'),
      subtitle: t('pricing.startup.subtitle', 'For small teams hiring fast'),
      monthlyPrice: 299,
      annualPrice: 3289,
      cta: t('pricing.startup.cta', 'Start free trial'),
      features: [
        { text: t('pricing.startup.f1', 'Unlimited seats') },
        { text: t('pricing.startup.f2', 'Unlimited job roles') },
        { text: t('pricing.startup.f3', '180 interviews / month') },
        { text: t('pricing.startup.f4', '180 resume matches / month') },
        { text: t('pricing.startup.f5', 'RoboHire API access'), subtext: t('pricing.startup.f5s', 'Integrate with your systems') },
        { text: t('pricing.startup.f6', '6 interview languages') },
        { text: t('pricing.startup.f7', 'Language proficiency assessment') },
        { text: t('pricing.startup.f8', 'Email support') },
      ],
    },
    {
      id: 'business',
      name: t('pricing.business.name', 'Business'),
      subtitle: t('pricing.business.subtitle', 'For large teams scaling fast'),
      monthlyPrice: 599,
      annualPrice: 6589,
      cta: t('pricing.business.cta', 'Start free trial'),
      popular: true,
      features: [
        { text: t('pricing.business.f1', 'Unlimited seats') },
        { text: t('pricing.business.f2', 'Unlimited job roles') },
        { text: t('pricing.business.f3', '400 interviews / month') },
        { text: t('pricing.business.f4', '400 resume matches / month') },
        { text: t('pricing.business.f5', 'Everything in Startup') },
        { text: t('pricing.business.f6', 'Priority support') },
        { text: t('pricing.business.f7', 'Advanced analytics') },
        { text: t('pricing.business.f8', 'White-label reports') },
        { text: t('pricing.business.f9', 'Full video playback') },
        { text: t('pricing.business.f10', 'Cheating analysis') },
      ],
    },
    {
      id: 'custom',
      name: t('pricing.custom.name', 'Enterprise'),
      subtitle: t('pricing.custom.subtitle', 'For high-volume organizations'),
      monthlyPrice: null,
      annualPrice: null,
      cta: t('pricing.custom.cta', 'Contact sales'),
      custom: true,
      features: [
        { text: t('pricing.custom.f1', 'Unlimited everything') },
        { text: t('pricing.custom.f2', 'Everything in Business') },
        { text: t('pricing.custom.f3', 'Custom workflows'), subtext: t('pricing.custom.f3s', 'Match your recruitment process') },
        { text: t('pricing.custom.f4', '45+ ATS integrations'), subtext: t('pricing.custom.f4s', 'Connect your existing tools') },
        { text: t('pricing.custom.f5', 'Custom interview voices') },
        { text: t('pricing.custom.f6', 'Dedicated manager & support') },
      ],
    },
  ];

  const faqs = [
    {
      q: t('pricing.faq.q1', 'Can I try RoboHire for free?'),
      a: t('pricing.faq.a1', 'Yes! Our Free plan includes 10 resume matches and 2 interviews at no cost. No credit card required to get started.'),
    },
    {
      q: t('pricing.faq.q2', 'What payment methods do you accept?'),
      a: t('pricing.faq.a2', 'We accept all major credit and debit cards (Visa, Mastercard, American Express) as well as Alipay. All payments are processed securely through Stripe.'),
    },
    {
      q: t('pricing.faq.q3', 'Can I switch plans at any time?'),
      a: t('pricing.faq.a3', 'Absolutely. You can upgrade or downgrade your plan at any time. When upgrading, you\'ll be charged the prorated difference. When downgrading, the credit will apply to your next billing cycle.'),
    },
    {
      q: t('pricing.faq.q4', 'What happens when I exceed my monthly limits?'),
      a: t('pricing.faq.a4', 'You can use our pay-per-use pricing to continue beyond your plan limits. Resume matches are $0.40 each and interviews are $2.00 each, deducted from your top-up balance.'),
    },
    {
      q: t('pricing.faq.q5', 'Do you offer annual billing discounts?'),
      a: t('pricing.faq.a5', 'Yes! Annual billing saves you approximately 8% compared to monthly billing. You can switch between monthly and annual billing at any time.'),
    },
    {
      q: t('pricing.faq.q6', 'What is included in the pay-per-use pricing?'),
      a: t('pricing.faq.a6', 'Pay-per-use lets you top up a balance and use it for individual resume matches ($0.40) or interviews ($2.00). Each includes the full suite of features: AI scoring, summaries, cheating analysis, and more.'),
    },
    {
      q: t('pricing.faq.q7', 'Is there a contract or commitment?'),
      a: t('pricing.faq.a7', 'No contracts. Monthly plans can be canceled anytime. Annual plans are billed upfront for the year but you can cancel renewal at any time.'),
    },
    {
      q: t('pricing.faq.q8', 'Do you offer custom enterprise plans?'),
      a: t('pricing.faq.a8', 'Yes! Our Enterprise plan includes unlimited usage, custom workflows, ATS integrations, dedicated support, and more. Contact our sales team for a tailored quote.'),
    },
  ];

  const payPerUse = [
    {
      title: t('pricing.ppu.match.title', 'Resume Match'),
      price: '$0.40',
      unit: t('pricing.ppu.match.unit', 'per resume / JD'),
      features: [
        t('pricing.ppu.match.f1', 'Matching decision with insights'),
        t('pricing.ppu.match.f2', 'Must-Have requirements analysis'),
        t('pricing.ppu.match.f3', 'Gap analysis & recommendations'),
        t('pricing.ppu.match.f4', 'Credibility & experience validation'),
        t('pricing.ppu.match.f5', 'Suggested interview questions'),
        t('pricing.ppu.match.f6', 'Areas to probe deeper'),
      ],
    },
    {
      title: t('pricing.ppu.interview.title', 'Interview'),
      price: '$2.00',
      unit: t('pricing.ppu.interview.unit', 'per interview'),
      features: [
        t('pricing.ppu.interview.f1', 'Full video playback'),
        t('pricing.ppu.interview.f2', 'Automatic email invitations'),
        t('pricing.ppu.interview.f3', 'Scoring & structured assessment'),
        t('pricing.ppu.interview.f4', 'Cheating analysis'),
        t('pricing.ppu.interview.f5', 'Interview summaries'),
        t('pricing.ppu.interview.f6', 'Language proficiency assessment'),
      ],
    },
  ];

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handlePlanCta = async (plan: Plan) => {
    if (plan.custom) {
      navigate('/request-demo');
      return;
    }
    if (plan.id === 'free') {
      navigate(isAuthenticated ? '/dashboard' : '/login');
      return;
    }
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/pricing' } } });
      return;
    }
    setLoadingTier(plan.id);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tier: plan.id,
          interval: annual ? 'annual' : 'monthly',
        }),
      });
      const data = await response.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setLoadingTier(null);
    }
  };

  const formatPrice = (plan: Plan) => {
    if (plan.custom) return null;
    const price = annual ? plan.annualPrice : plan.monthlyPrice;
    if (price === 0) return { amount: '$0', period: '' };
    if (annual) {
      const monthlyEquiv = Math.round((price ?? 0) / 12);
      return { amount: `$${monthlyEquiv}`, period: `/ ${t('pricing.month', 'mo')}` };
    }
    return { amount: `$${price}`, period: `/ ${t('pricing.month', 'mo')}` };
  };

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'RoboHire AI Hiring Platform',
    description: 'AI-powered hiring platform with automated resume screening, interviews, and evaluation reports.',
    brand: { '@type': 'Brand', name: 'RoboHire' },
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD', description: '10 resume matches, 2 interviews' },
      { '@type': 'Offer', name: 'Startup', price: '299', priceCurrency: 'USD', billingIncrement: 'P1M', description: '180 interviews & resume matches/month' },
      { '@type': 'Offer', name: 'Business', price: '599', priceCurrency: 'USD', billingIncrement: 'P1M', description: '400 interviews & resume matches/month' },
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };

  return (
    <>
      <SEO
        title={t('pricing.seo.title', 'Pricing - AI Hiring Plans for Every Team')}
        description={t('pricing.seo.desc', 'Choose the right RoboHire plan. Free tier, Startup at $299/mo, Business at $599/mo, or custom enterprise pricing. AI resume matching and interviews included.')}
        url="https://robohire.io/pricing"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(productSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="min-h-screen bg-white">
        <Navbar />

        <main className="pt-24 lg:pt-28">
          {/* Header */}
          <section className="text-center px-4 sm:px-6 lg:px-8 pb-12">
            <p className="text-sm font-semibold tracking-widest text-indigo-600 uppercase mb-3">
              {t('pricing.label', 'Pricing Plan')}
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-4">
              {t('pricing.headline', 'Pricing that ')}<span className="text-indigo-600">{t('pricing.headlineAccent', 'grows with you')}</span>.
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
              {t('pricing.subheadline', 'Start free, scale as you grow. Only pay for what you use.')}
            </p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center gap-3 bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setAnnual(false)}
                className={`px-5 py-2 text-sm font-medium rounded-full transition-all ${
                  !annual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('pricing.monthly', 'Monthly')}
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-5 py-2 text-sm font-medium rounded-full transition-all flex items-center gap-2 ${
                  annual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('pricing.annual', 'Annual')}
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
                  {t('pricing.save', 'Save 8%')}
                </span>
              </button>
            </div>
          </section>

          {/* Plan Cards */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((plan) => {
                const priceInfo = formatPrice(plan);
                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-200 hover:shadow-lg ${
                      plan.popular
                        ? 'border-indigo-600 ring-2 ring-indigo-600 shadow-md'
                        : 'border-gray-200'
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-full">
                          {t('pricing.popular', 'Most Popular')}
                        </span>
                      </div>
                    )}
                    {plan.custom && (
                      <div className="absolute -top-3.5 right-4">
                        <span className="px-3 py-1 text-xs font-semibold bg-gray-900 text-white rounded-full">
                          {t('pricing.customBadge', 'Custom')}
                        </span>
                      </div>
                    )}

                    <div className="mb-5">
                      <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{plan.subtitle}</p>
                    </div>

                    <div className="mb-6">
                      {plan.custom ? (
                        <div>
                          <span className="text-4xl font-bold text-gray-900">
                            {t('pricing.customPrice', 'Custom')}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-gray-900">{priceInfo?.amount}</span>
                          {priceInfo?.period && (
                            <span className="text-base text-gray-500">{priceInfo.period}</span>
                          )}
                        </div>
                      )}
                      {annual && !plan.custom && plan.monthlyPrice !== 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {t('pricing.billedAnnually', 'Billed annually at ')}${plan.annualPrice?.toLocaleString()}/{t('pricing.year', 'yr')}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handlePlanCta(plan)}
                      disabled={loadingTier === plan.id}
                      className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-colors mb-6 ${
                        plan.popular
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : plan.custom
                            ? 'bg-gray-900 text-white hover:bg-gray-800'
                            : plan.id === 'free'
                              ? 'border-2 border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {loadingTier === plan.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          {t('pricing.redirecting', 'Redirecting...')}
                        </span>
                      ) : plan.cta}
                    </button>

                    <div className="border-t border-gray-100 pt-5 flex-1">
                      <ul className="space-y-3">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-3">
                            {CHECK_ICON}
                            <div>
                              <span className="text-sm text-gray-700">{f.text}</span>
                              {f.subtext && (
                                <p className="text-xs text-gray-500 mt-0.5">{f.subtext}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Pay-per-Use */}
          <section className="bg-gray-50 py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-3">
                  {t('pricing.ppu.title', 'Pay-per-use pricing')}
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  {t('pricing.ppu.subtitle', 'Need more flexibility? Top up your balance and only pay for what you use.')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {payPerUse.map((item) => (
                  <div key={item.title} className="bg-white rounded-2xl border border-gray-200 p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{item.title}</h3>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-3xl font-bold text-indigo-600">{item.price}</span>
                      <span className="text-sm text-gray-500">{item.unit}</span>
                    </div>
                    <div className="border-t border-gray-100 mt-5 pt-5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                        {t('pricing.ppu.includes', 'Includes')}
                      </p>
                      <ul className="space-y-3">
                        {item.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-3">
                            {CHECK_ICON}
                            <span className="text-sm text-gray-700">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
                {t('pricing.faq.title', 'Frequently asked questions')}
              </h2>
              <div className="divide-y divide-gray-200">
                {faqs.map((faq, i) => (
                  <div key={i} className="py-5">
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between text-left gap-4"
                    >
                      <span className="text-base font-medium text-gray-900">{faq.q}</span>
                      <svg
                        className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${
                          openFaq === i ? 'rotate-180' : ''
                        }`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-200 ${
                        openFaq === i ? 'max-h-96 mt-3' : 'max-h-0'
                      }`}
                    >
                      <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Bottom CTA */}
          <section className="bg-indigo-600 py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                {t('pricing.cta.title', 'Ready to streamline your hiring?')}
              </h2>
              <p className="text-indigo-100 mb-8 text-lg">
                {t('pricing.cta.subtitle', 'Join thousands of companies using AI to hire faster and smarter.')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/start-hiring"
                  className="px-8 py-3 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-indigo-50 transition-colors"
                >
                  {t('pricing.cta.primary', 'Start hiring now')}
                </Link>
                <Link
                  to="/request-demo"
                  className="px-8 py-3 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors"
                >
                  {t('pricing.cta.secondary', 'Request a demo')}
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
