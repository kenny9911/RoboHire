import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';
import SEO from '../components/SEO';
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  DollarSign,
  Mail,
  Rocket,
  Scale,
  Search,
  Shield,
  Star,
  Users,
  Video,
  MessageSquare,
  BarChart3,
  FileText,
} from 'lucide-react';

const STEP_ICONS = [MessageSquare, FileText, Search, Mail, Video, BarChart3];
const STEP_COLORS = ['bg-blue-600', 'bg-purple-600', 'bg-emerald-600', 'bg-blue-600', 'bg-purple-600', 'bg-emerald-600'];
const PROBLEM_ICONS = [Clock, DollarSign, Users, Scale];
const PROBLEM_COLORS = ['text-amber-600 bg-amber-50', 'text-red-600 bg-red-50', 'text-blue-600 bg-blue-50', 'text-purple-600 bg-purple-50'];
const DIFF_ICONS = [Rocket, Brain, CheckCircle2, Star];
const DIFF_ACCENTS = ['border-blue-500', 'border-purple-500', 'border-emerald-500', 'border-amber-500'];
const TIMELINE_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500'];

type DisplayCurrency = 'USD' | 'CNY' | 'JPY' | 'TWD';
type PaidTier = 'starter' | 'growth' | 'business';

const DEFAULT_PRICES: Record<DisplayCurrency, Record<PaidTier, number>> = {
  USD: { starter: 29, growth: 199, business: 399 },
  CNY: { starter: 199, growth: 1369, business: 2749 },
  JPY: { starter: 4559, growth: 31329, business: 62799 },
  TWD: { starter: 899, growth: 6199, business: 12399 },
};

const CURRENCY_SYMBOLS: Record<DisplayCurrency, string> = {
  USD: '$', CNY: '¥', JPY: '¥', TWD: 'NT$',
};

function resolveDisplayCurrency(language: string): DisplayCurrency {
  const n = language.toLowerCase();
  if (n === 'zh-tw') return 'TWD';
  if (n.startsWith('zh')) return 'CNY';
  if (n.startsWith('ja')) return 'JPY';
  return 'USD';
}

export default function SalesKit() {
  const { t, i18n } = useTranslation();

  const displayCurrency = useMemo(() => resolveDisplayCurrency(i18n.language || 'en'), [i18n.language]);
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [discountPercent, setDiscountPercent] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/config/pricing`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.prices) {
          const next = { ...DEFAULT_PRICES };
          for (const cur of ['USD', 'CNY', 'JPY', 'TWD'] as DisplayCurrency[]) {
            const v = data.data.prices[cur];
            if (v && typeof v === 'object') {
              next[cur] = {
                starter: (typeof v.starter === 'number' && v.starter > 0) ? v.starter : DEFAULT_PRICES[cur].starter,
                growth: (typeof v.growth === 'number' && v.growth > 0) ? v.growth : DEFAULT_PRICES[cur].growth,
                business: (typeof v.business === 'number' && v.business > 0) ? v.business : DEFAULT_PRICES[cur].business,
              };
            }
          }
          setPrices(next);
          const d = data.data.discount;
          if (d?.enabled && typeof d.percentOff === 'number' && d.percentOff > 0) {
            setDiscountPercent(d.percentOff);
          }
        }
      })
      .catch(() => {});
  }, []);

  const planPrices = prices[displayCurrency];
  const sym = CURRENCY_SYMBOLS[displayCurrency];

  const fmt = (value: number) => {
    const discounted = discountPercent > 0 ? Math.round(value * (1 - discountPercent / 100)) : value;
    if (displayCurrency === 'USD') return `${sym}${discounted}`;
    return `${sym}${discounted.toLocaleString()}`;
  };

  const fmtOriginal = (value: number) => `${sym}${value.toLocaleString()}`;

  return (
    <>
      <SEO
        title={t('salesKit.seoTitle', 'Sales Kit - Partner Materials')}
        description={t('salesKit.seoDesc', 'RoboHire partner sales kit — product overview, pricing, and resources for startup founders and HR leaders.')}
        url="https://robohire.io/sales-kit"
        keywords="RoboHire, AI recruiting, partner, sales kit, startup hiring"
        type="website"
      />

      {/* ── Hero ── */}
      <section className="relative bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-transparent to-purple-900/20" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <div className="flex items-center gap-2 mb-6">
            <span className="px-3 py-1 rounded-full bg-blue-600/20 text-blue-400 text-xs font-semibold tracking-wider uppercase">{t('salesKit.badge', 'Partner Sales Kit')}</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight max-w-3xl">
            {t('salesKit.heroTitle', 'AI-Powered Recruiting\nfor Modern Teams')}
          </h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl">
            {t('salesKit.heroSubtitle', 'From role brief to final shortlist, hiring moves on autopilot. Help your partners hire smarter, faster, and more consistently.')}
          </p>
          <div className="mt-8 flex flex-wrap gap-8">
            {(['timeSaved', 'avgHire', 'languages', 'availability'] as const).map((key, i) => (
              <div key={key}>
                <div className="text-2xl font-bold text-blue-400">{t(`salesKit.stat${i + 1}Num`)}</div>
                <div className="text-sm text-slate-500">{t(`salesKit.stat${i + 1}Label`)}</div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex items-center gap-6">
            <a href="https://robohire.io" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              {t('salesKit.ctaButton', 'Start Free Trial')} <ArrowRight className="h-4 w-4" />
            </a>
            <img src="/robohire-qr.png" alt="Scan to visit robohire.io" className="h-20 w-20 rounded-lg border border-slate-700 bg-white p-1" />
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-slate-900">{t('salesKit.problemTitle', 'The Hiring Problem')}</h2>
        <p className="mt-2 text-slate-500 max-w-2xl">{t('salesKit.problemSubtitle', 'Startups are competing for talent against companies with 10x their recruiting budget.')}</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => {
            const Icon = PROBLEM_ICONS[i];
            return (
              <div key={i} className="flex items-start gap-4 rounded-xl border border-slate-200 p-5">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${PROBLEM_COLORS[i]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{t(`salesKit.problem${i + 1}Title`)}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{t(`salesKit.problem${i + 1}Desc`)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Solution ── */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold text-slate-900">{t('salesKit.solutionTitle', 'What is RoboHire?')}</h2>
          <div className="mt-6 rounded-xl bg-slate-900 p-6">
            <div className="flex items-start gap-4">
              <Brain className="h-6 w-6 text-purple-400 shrink-0 mt-1" />
              <div>
                <p className="text-lg font-semibold text-white">{t('salesKit.solutionHeadline', 'An AI recruiting platform that runs the first 80% of hiring autonomously.')}</p>
                <p className="text-slate-400 mt-1">{t('salesKit.solutionSub', 'From role definition to candidate shortlist — your team only focuses on the final decision.')}</p>
              </div>
            </div>
          </div>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="text-left px-4 py-3 font-semibold rounded-tl-lg">{t('salesKit.compColStage', 'Hiring Stage')}</th>
                  <th className="text-center px-4 py-3 font-semibold">{t('salesKit.compColTraditional', 'Traditional')}</th>
                  <th className="text-center px-4 py-3 font-semibold rounded-tr-lg">RoboHire</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-3 text-slate-700">{t(`salesKit.comp${i + 1}Stage`)}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{t(`salesKit.comp${i + 1}Trad`)}</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">{t(`salesKit.comp${i + 1}Robo`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 6 Steps ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-slate-900">{t('salesKit.stepsTitle', 'How It Works')}</h2>
        <p className="mt-2 text-slate-500">{t('salesKit.stepsSubtitle', '6 steps to your next great hire')}</p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const Icon = STEP_ICONS[i];
            const num = String(i + 1).padStart(2, '0');
            return (
              <div key={i} className="rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${STEP_COLORS[i]} text-white text-sm font-bold`}>{num}</div>
                  <Icon className="h-5 w-5 text-slate-400" />
                </div>
                <h3 className="font-semibold text-slate-900">{t(`salesKit.step${i + 1}Title`)}</h3>
                <p className="text-sm text-slate-500 mt-1">{t(`salesKit.step${i + 1}Desc`)}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Differentiators ── */}
      <section className="bg-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold text-white">{t('salesKit.diffTitle', 'Why Startups Choose RoboHire')}</h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
            {[0, 1, 2, 3].map((i) => {
              const Icon = DIFF_ICONS[i];
              return (
                <div key={i} className={`rounded-xl bg-slate-800 p-6 border-l-4 ${DIFF_ACCENTS[i]}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <Icon className="h-5 w-5 text-white" />
                    <h3 className="font-semibold text-white">{t(`salesKit.diff${i + 1}Title`)}</h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{t(`salesKit.diff${i + 1}Desc`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Case Study ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-slate-900">{t('salesKit.caseTitle', 'Real-World: Campus Recruiting')}</h2>
        <p className="mt-2 text-lg font-semibold text-blue-600">{t('salesKit.caseSubtitle', '150 applicants \u2192 4 finalists in 3 days')}</p>
        <div className="mt-8 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className={`h-3 w-3 rounded-full ${TIMELINE_COLORS[i]}`} />
                {i < 3 && <div className="w-0.5 h-full min-h-[40px] bg-slate-200" />}
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">{t(`salesKit.timeline${i + 1}Time`)}</span>
                <p className="text-sm text-slate-500">{t(`salesKit.timeline${i + 1}Action`)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl bg-slate-100 p-6">
          <p className="text-sm italic text-slate-600">{t('salesKit.testimonial')}</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{t('salesKit.testimonialAttr')}</p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold text-slate-900">{t('salesKit.pricingTitle', 'Simple, Transparent Pricing')}</h2>
          <p className="mt-2 text-slate-500">{t('salesKit.pricingSubtitle', '14-day free trial \u2022 No credit card required')}</p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {([
              { key: 'starter', tier: 'starter' as PaidTier, pi: 1 },
              { key: 'growth', tier: 'growth' as PaidTier, pi: 2 },
              { key: 'business', tier: 'business' as PaidTier, pi: 3 },
              { key: 'enterprise', tier: null, pi: 4 },
            ]).map(({ key, tier, pi }) => {
              const isPopular = key === 'business';
              const price = tier ? fmt(planPrices[tier]) : t('salesKit.plan4Price', 'Custom');
              const period = tier ? ` / ${t('salesKit.perMonth', 'mo')}` : '';
              return (
                <div key={key} className={`rounded-xl border-2 p-6 flex flex-col ${isPopular ? 'border-blue-600 bg-white shadow-lg relative' : 'border-slate-200 bg-white'}`}>
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">{t('salesKit.mostPopular', 'MOST POPULAR')}</span>
                  )}
                  <h3 className="text-lg font-bold text-slate-900">{t(`salesKit.plan${pi}Name`)}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{t(`salesKit.plan${pi}Desc`)}</p>
                  <div className="mt-4">
                    {tier && discountPercent > 0 && (
                      <span className="text-sm text-slate-400 line-through mr-2">{fmtOriginal(planPrices[tier])}</span>
                    )}
                    <span className="text-2xl font-bold text-slate-900">{price}</span>
                    <span className="text-sm text-slate-500">{period}</span>
                    {discountPercent > 0 && tier && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">{discountPercent}% OFF</span>
                    )}
                  </div>
                  <ul className="mt-4 space-y-2 flex-1">
                    {([1, 2, 3, 4] as const).map((fi) => {
                      const feat = t(`salesKit.plan${pi}F${fi}`, '');
                      if (!feat) return null;
                      return (
                        <li key={fi} className="flex items-start gap-2 text-sm text-slate-600">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          {feat}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Security ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-slate-900">{t('salesKit.securityTitle', 'Security & Compliance')}</h2>
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-blue-600 shrink-0" />
              <span className="text-slate-700">{t(`salesKit.security${i}`)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <Rocket className="h-10 w-10 text-blue-400 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white">{t('salesKit.ctaTitle', 'Start Hiring Smarter Today')}</h2>
          <p className="mt-3 text-slate-400 max-w-xl mx-auto">{t('salesKit.ctaDesc', 'Let AI handle the repetitive 80%. Keep your team focused on what humans do best.')}</p>
          <div className="mt-8 flex flex-col items-center gap-6">
            <a href="https://robohire.io" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-8 py-3.5 bg-blue-600 text-white rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors">
              {t('salesKit.ctaButton', 'Start Free Trial')} <ArrowRight className="h-5 w-5" />
            </a>
            <img src="/robohire-qr.png" alt="Scan to visit robohire.io" className="h-28 w-28 rounded-xl border border-slate-700 bg-white p-2" />
            <p className="text-sm text-slate-500">{t('salesKit.scanQr', 'Scan to visit robohire.io')}</p>
          </div>
          <p className="mt-8 text-slate-500 text-sm">support@robohire.io</p>
        </div>
      </section>
    </>
  );
}
