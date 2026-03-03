import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import SEO from '../components/SEO';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import { useAuth } from '../context/AuthContext';
import { API_BASE, STRIPE_ENABLED } from '../config';

interface PlanFeature {
  text: string;
  subtext?: string;
}

interface Plan {
  id: string;
  name: string;
  subtitle: string;
  monthlyPrice: number | null;
  features: PlanFeature[];
  cta: string;
  popular?: boolean;
  custom?: boolean;
}

type PaidTier = 'starter' | 'growth' | 'business';
type Tier = 'free' | PaidTier | 'custom';
type DisplayCurrency = 'USD' | 'CNY' | 'JPY';
type PricingMatrix = Record<DisplayCurrency, Record<PaidTier, number>>;

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  business: 3,
  custom: 4,
};

const DEFAULT_PRICES: PricingMatrix = {
  USD: { starter: 29, growth: 199, business: 399 },
  CNY: { starter: 199, growth: 1369, business: 2749 },
  JPY: { starter: 4559, growth: 31329, business: 62799 },
};

function resolveDisplayCurrency(language: string): DisplayCurrency {
  const normalized = language.toLowerCase();
  if (normalized.startsWith('zh')) return 'CNY';
  if (normalized.startsWith('ja')) return 'JPY';
  return 'USD';
}

function resolveEffectiveTier(subscriptionTier?: string, subscriptionStatus?: string): Tier {
  const tier = (subscriptionTier || 'free').toLowerCase();
  const status = (subscriptionStatus || 'active').toLowerCase();

  if (tier === 'custom') return 'custom';
  if (tier !== 'free' && status !== 'active' && status !== 'trialing') {
    return 'free';
  }
  if (tier === 'starter' || tier === 'growth' || tier === 'business' || tier === 'free') {
    return tier;
  }

  return 'free';
}

const CHECK_ICON = (
  <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [pricingMatrix, setPricingMatrix] = useState<PricingMatrix>(DEFAULT_PRICES);
  const [discountConfig, setDiscountConfig] = useState<{ enabled: boolean; percentOff: number }>({
    enabled: false,
    percentOff: 0,
  });
  const displayCurrency = useMemo<DisplayCurrency>(
    () => resolveDisplayCurrency(i18n.language || 'en'),
    [i18n.language]
  );
  const effectiveTier = useMemo<Tier>(
    () =>
      resolveEffectiveTier(
        user?.subscriptionTier,
        user?.subscriptionStatus
      ),
    [user?.subscriptionTier, user?.subscriptionStatus]
  );
  const displayPlanPrices = useMemo<Record<PaidTier, number>>(
    () => pricingMatrix[displayCurrency] || DEFAULT_PRICES[displayCurrency],
    [displayCurrency, pricingMatrix]
  );
  const discountPercent = useMemo(
    () => (discountConfig.enabled && discountConfig.percentOff > 0 ? discountConfig.percentOff : 0),
    [discountConfig.enabled, discountConfig.percentOff]
  );

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/config/pricing`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          const next: PricingMatrix = {
            USD: { ...DEFAULT_PRICES.USD },
            CNY: { ...DEFAULT_PRICES.CNY },
            JPY: { ...DEFAULT_PRICES.JPY },
          };

          const incoming = data.data.prices as
            | Partial<Record<DisplayCurrency, Partial<Record<PaidTier, number>>>>
            | undefined;

          if (incoming && typeof incoming === 'object') {
            (['USD', 'CNY', 'JPY'] as DisplayCurrency[]).forEach((currency) => {
              const values = incoming[currency];
              if (!values || typeof values !== 'object') return;
              (['starter', 'growth', 'business'] as PaidTier[]).forEach((tier) => {
                const value = values[tier];
                if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
                  next[currency][tier] = value;
                }
              });
            });
          } else {
            // Backward compatibility for legacy API payloads.
            if (typeof data.data.starter === 'number' && data.data.starter > 0) next.USD.starter = data.data.starter;
            if (typeof data.data.growth === 'number' && data.data.growth > 0) next.USD.growth = data.data.growth;
            if (typeof data.data.business === 'number' && data.data.business > 0) next.USD.business = data.data.business;
          }

          setPricingMatrix(next);

          const discount = data.data.discount as { enabled?: boolean; percentOff?: number } | undefined;
          if (discount && typeof discount === 'object') {
            const enabled = discount.enabled === true;
            const percentOff = typeof discount.percentOff === 'number' && discount.percentOff > 0
              ? Number(discount.percentOff.toFixed(2))
              : 0;
            setDiscountConfig({ enabled, percentOff });
          }
        }
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const plans: Plan[] = [
    {
      id: 'starter',
      name: t('pricing.starter.name', 'Starter'),
      subtitle: t('pricing.starter.subtitle', 'For individuals getting started'),
      monthlyPrice: displayPlanPrices.starter,
      cta: t('pricing.starter.cta', 'Start free trial'),
      features: [
        { text: t('pricing.starter.f1', '1 seat') },
        { text: t('pricing.starter.f2', '3 job roles') },
        { text: t('pricing.starter.f3', '15 interviews') },
        { text: t('pricing.starter.f4', '30 resume matches') },
        { text: t('pricing.starter.f5', 'Interview scoring & assessment') },
        { text: t('pricing.starter.f6', 'Interview summaries') },
      ],
    },
    {
      id: 'growth',
      name: t('pricing.growth.name', 'Growth'),
      subtitle: t('pricing.growth.subtitle', 'For growing teams'),
      monthlyPrice: displayPlanPrices.growth,
      cta: t('pricing.growth.cta', 'Start free trial'),
      features: [
        { text: t('pricing.growth.f1', 'Unlimited seats') },
        { text: t('pricing.growth.f2', 'Unlimited job roles') },
        { text: t('pricing.growth.f3', '120 interviews / month') },
        { text: t('pricing.growth.f4', '240 resume matches / month') },
        { text: t('pricing.growth.f5', 'Everything in Starter') },
        { text: t('pricing.growth.f6', 'RoboHire access'), subtext: t('pricing.growth.f6s', 'Integrate with your systems') },
        { text: t('pricing.growth.f7', '6 interview languages') },
        { text: t('pricing.growth.f8', 'Language proficiency assessment') },
        { text: t('pricing.growth.f9', 'Email support') },
      ],
    },
    {
      id: 'business',
      name: t('pricing.business.name', 'Business'),
      subtitle: t('pricing.business.subtitle', 'For large teams scaling fast'),
      monthlyPrice: displayPlanPrices.business,
      cta: t('pricing.business.cta', 'Start free trial'),
      popular: true,
      features: [
        { text: t('pricing.business.f1', 'Unlimited seats') },
        { text: t('pricing.business.f2', 'Unlimited job roles') },
        { text: t('pricing.business.f3', '280 interviews / month') },
        { text: t('pricing.business.f4', '500 resume matches / month') },
        { text: t('pricing.business.f5', 'Everything in Growth') },
        { text: t('pricing.business.f6', 'Priority support'), subtext: t('pricing.business.f6s', 'Faster response times') },
        { text: t('pricing.business.f7', 'Advanced analytics'), subtext: t('pricing.business.f7s', 'Detailed hiring funnel insights') },
        { text: t('pricing.business.f8', 'White-label interview reports') },
        { text: t('pricing.business.f9', 'Full interview video playback') },
        { text: t('pricing.business.f10', 'Cheating analysis') },
      ],
    },
    {
      id: 'custom',
      name: t('pricing.custom.name', 'Custom'),
      subtitle: t('pricing.custom.subtitle', 'For high-volume organizations'),
      monthlyPrice: null,
      cta: t('pricing.custom.cta', 'Contact us'),
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
      a: t('pricing.faq.a1', 'Yes! All paid plans include a 14-day free trial. No credit card required to get started.'),
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
      q: t('pricing.faq.q5', 'What is included in the pay-per-use pricing?'),
      a: t('pricing.faq.a5', 'Pay-per-use lets you top up a balance and use it for individual resume matches ($0.40) or interviews ($2.00). Each includes the full suite of features: AI scoring, summaries, cheating analysis, and more.'),
    },
    {
      q: t('pricing.faq.q6', 'Is there a contract or commitment?'),
      a: t('pricing.faq.a6', 'No contracts. Monthly plans can be canceled anytime with no early termination fees.'),
    },
    {
      q: t('pricing.faq.q7', 'Do you offer custom plans?'),
      a: t('pricing.faq.a7', 'Yes! Our Custom plan includes unlimited usage, custom workflows, ATS integrations, dedicated support, and more. Contact our sales team for a tailored quote.'),
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

  const handlePlanCta = async (plan: Plan, startTrial = false) => {
    if (plan.custom) {
      navigate('/request-demo');
      return;
    }
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/pricing' }, trial: startTrial, tier: plan.id } });
      return;
    }
    // Show payment method selection modal
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const handlePaymentMethodSelect = async (method: 'stripe' | 'alipay') => {
    if (!selectedPlan) return;
    
    setLoadingTier(selectedPlan.id);
    setCheckoutError(null);
    setShowPaymentModal(false);

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Use different API endpoint based on payment method
      const endpoint = method === 'alipay' ? '/api/v1/checkout/alipay' : '/api/v1/checkout';
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          tier: selectedPlan.id,
          trial: true, // Always start with trial for now
        }),
      });

      if (response.status === 401) {
        navigate('/login', { state: { from: { pathname: '/pricing' }, trial: true, tier: selectedPlan.id } });
        return;
      }

      const data = await response.json();
      
      // Handle Alipay response (code: 0 means success)
      if (method === 'alipay') {
        if (data.code === 0 && data.data?.pay_url) {
          window.location.href = data.data.pay_url;
          return;
        } else {
          setCheckoutError(data.message || data.error || t('pricing.checkoutError', 'Failed to create Alipay order. Please try again.'));
        }
      } else if (data.success && data.data?.url) {
        // Handle Stripe response
        window.location.href = data.data.url;
      } else {
        setCheckoutError(data.error || t('pricing.checkoutError', 'Failed to start checkout. Please try again.'));
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutError(t('pricing.checkoutError', 'Failed to start checkout. Please try again.'));
    } finally {
      setLoadingTier(null);
      setSelectedPlan(null);
    }
  };

  const normalizeCurrencyAmount = (value: number) => {
    if (displayCurrency === 'USD') {
      return Math.round(value * 100) / 100;
    }
    return Math.round(value);
  };

  const applyDiscount = (value: number) => {
    if (discountPercent <= 0) return normalizeCurrencyAmount(value);
    return normalizeCurrencyAmount(value * (1 - discountPercent / 100));
  };

  const formatCurrencyAmount = (value: number) => {
    if (displayCurrency === 'USD') {
      const hasDecimals = Math.round(value * 100) % 100 !== 0;
      return `USD $${value.toLocaleString('en-US', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2,
      })}`;
    }
    if (displayCurrency === 'CNY') {
      return `CNY ¥${value.toLocaleString('zh-CN')}`;
    }
    return `JPY ¥${value.toLocaleString('ja-JP')}`;
  };

  const normalizeCurrencyAmount = (value: number) => {
    if (displayCurrency === 'USD') {
      return Math.round(value * 100) / 100;
    }
    return Math.round(value);
  };

  const applyDiscount = (value: number) => {
    if (discountPercent <= 0) return normalizeCurrencyAmount(value);
    return normalizeCurrencyAmount(value * (1 - discountPercent / 100));
  };

  const formatCurrencyAmount = (value: number) => {
    if (displayCurrency === 'USD') {
      const hasDecimals = Math.round(value * 100) % 100 !== 0;
      return `USD $${value.toLocaleString('en-US', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2,
      })}`;
    }
    if (displayCurrency === 'CNY') {
      return `CNY ¥${value.toLocaleString('zh-CN')}`;
    }
    return `JPY ¥${value.toLocaleString('ja-JP')}`;
  };

  const formatPrice = (plan: Plan) => {
    if (plan.custom) return null;

    const originalValue = normalizeCurrencyAmount(plan.monthlyPrice ?? 0);
    const discountedValue = applyDiscount(originalValue);

    return {
      amount: formatCurrencyAmount(discountedValue),
      originalAmount: discountPercent > 0 ? formatCurrencyAmount(originalValue) : null,
      period: `/ ${t('pricing.month', 'mo')}`,
    };
  };

  const getPlanAvailability = (plan: Plan): { disabled: boolean; isCurrentPlan: boolean } => {
    if (plan.custom || !isAuthenticated) {
      return { disabled: false, isCurrentPlan: false };
    }

    if (plan.id !== 'starter' && plan.id !== 'growth' && plan.id !== 'business') {
      return { disabled: false, isCurrentPlan: false };
    }

    const planTier = plan.id as PaidTier;
    const isCurrentPlan = planTier === effectiveTier;
    const disabled = TIER_RANK[planTier] <= TIER_RANK[effectiveTier];

    return { disabled, isCurrentPlan };
  };

  const schemaPrices = {
    starter: applyDiscount(displayPlanPrices.starter),
    growth: applyDiscount(displayPlanPrices.growth),
    business: applyDiscount(displayPlanPrices.business),
  };

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'RoboHire AI Hiring Platform',
    description: 'AI-powered hiring platform with automated resume screening, interviews, and evaluation reports.',
    url: 'https://robohire.io/pricing',
    brand: { '@type': 'Brand', name: 'RoboHire' },
    offers: [
      {
        '@type': 'Offer', name: 'Starter', priceCurrency: displayCurrency, description: '15 interviews, 30 resume matches per month',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(schemaPrices.starter), priceCurrency: displayCurrency, unitCode: 'MON', billingDuration: 'P1M', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
      },
      {
        '@type': 'Offer', name: 'Growth', priceCurrency: displayCurrency, description: '120 interviews, 240 resume matches per month',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(schemaPrices.growth), priceCurrency: displayCurrency, unitCode: 'MON', billingDuration: 'P1M', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
      },
      {
        '@type': 'Offer', name: 'Business', priceCurrency: displayCurrency, description: '280 interviews, 500 resume matches per month',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(schemaPrices.business), priceCurrency: displayCurrency, unitCode: 'MON', billingDuration: 'P1M', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
      },
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
        description={t('pricing.seo.desc', 'Choose the right RoboHire plan. Starter at $29/mo, Growth at $199/mo, Business at $399/mo, or custom pricing. AI resume matching and interviews included.')}
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
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {t('pricing.subheadline', 'Simple, transparent pricing. Scale as you grow.')}
            </p>
          </section>

          {/* Checkout Error */}
          {checkoutError && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
              <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {checkoutError}
              </div>
            </div>
          )}

          {/* Payment Method Modal */}
          {showPaymentModal && selectedPlan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowPaymentModal(false)} />
              <div className="relative bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {t('pricing.payment.selectMethod', '选择支付方式')}
                </h3>
                <p className="text-gray-600 mb-6">
                  {selectedPlan.name} - ${selectedPlan.monthlyPrice}/{t('pricing.month', 'mo')}
                </p>

                <div className="space-y-3">
                  <button
                    onClick={() => handlePaymentMethodSelect('alipay')}
                    disabled={loadingTier === selectedPlan.id}
                    className="w-full flex items-center justify-between p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src="/alipay_icon.png"
                        alt={t('account.topup.alipay', 'Alipay')}
                        className="w-24 h-8"
                      />
                      <span className="sr-only">
                        {t('account.topup.alipay', 'Alipay')}
                      </span>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {STRIPE_ENABLED && (
                    <button
                      onClick={() => handlePaymentMethodSelect('stripe')}
                      disabled={loadingTier === selectedPlan.id}
                      className="w-full flex items-center justify-between p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-8 h-8" viewBox="0 0 48 48" fill="none">
                          <rect width="48" height="48" rx="8" fill="#635BFF"/>
                          <text x="24" y="30" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">Credit Card</text>
                        </svg>
                        <span className="font-medium text-gray-900">Credit Card</span>
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Plan Cards */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((plan) => {
                const priceInfo = formatPrice(plan);
                const { disabled: planDisabled, isCurrentPlan } = getPlanAvailability(plan);
                const isBusy = loadingTier === plan.id;
                const disableCta = planDisabled || isBusy;
                const isPaidSubscriber = effectiveTier !== 'free';
                const shouldStartTrial = !plan.custom && effectiveTier === 'free';
                const ctaLabel =
                  isPaidSubscriber && !plan.custom
                    ? t('pricing.upgradeCta', 'Upgrade')
                    : plan.cta;
                return (
                  <div
                    key={plan.id}
                    className={`relative h-full rounded-2xl border p-6 flex flex-col transition-all duration-200 hover:shadow-lg ${
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
                    {discountPercent > 0 && !plan.custom && (
                      <div className="absolute -top-3.5 left-4">
                        <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-full">
                          {t('pricing.discountBadge', { defaultValue: '{{percent}}% OFF', percent: discountPercent })}
                        </span>
                      </div>
                    )}

                    <div className="mb-2 min-h-[72px]">
                      <h3 className="text-lg font-semibold leading-tight text-gray-900">{plan.name}</h3>
                      <p className="mt-1 text-sm leading-snug text-gray-500">{plan.subtitle}</p>
                    </div>

                    <div className="mb-6 min-h-[76px]">
                      {plan.custom ? (
                        <div className="flex min-h-[64px] items-end">
                          <span className="whitespace-nowrap text-2xl font-bold leading-tight text-gray-900 sm:text-[2rem]">
                            {t('pricing.customPrice', 'Custom')}
                          </span>
                        </div>
                      ) : (
                        <div className="flex min-h-[76px] flex-col justify-end">
                          {priceInfo?.originalAmount && (
                            <span className="whitespace-nowrap text-sm tabular-nums text-gray-400 line-through">
                              {priceInfo.originalAmount}
                            </span>
                          )}
                          <div className="flex items-end gap-1">
                            <span className="whitespace-nowrap text-2xl font-bold leading-tight text-gray-900 tabular-nums sm:text-[2rem]">
                              {priceInfo?.amount}
                            </span>
                            {priceInfo?.period && (
                              <span className="whitespace-nowrap text-sm tabular-nums text-gray-500">
                                {priceInfo.period}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        if (planDisabled) return;
                        handlePlanCta(plan, shouldStartTrial);
                      }}
                      disabled={disableCta}
                      className={`mb-6 h-12 w-full rounded-xl px-4 text-sm font-semibold transition-colors ${
                        planDisabled
                          ? 'bg-gray-200 text-gray-500'
                          : plan.popular
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : plan.custom
                              ? 'bg-gray-900 text-white hover:bg-gray-800'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {isBusy ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          {t('pricing.redirecting', 'Redirecting...')}
                        </span>
                      ) : planDisabled
                        ? isCurrentPlan
                          ? t('pricing.currentPlanCta', 'Current plan')
                          : t('pricing.upgradeOnlyCta', 'Upgrade required')
                        : ctaLabel}
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
                {t('pricing.cta.subtitle', 'Join 500+ companies using AI to hire faster and smarter.')}
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
