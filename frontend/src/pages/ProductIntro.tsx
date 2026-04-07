import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SEO from '../components/SEO';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import FAQ from '../components/landing/FAQ';

export interface ProductIntroProps {
  showDarkToggle?: boolean;
  showFAQ?: boolean;
  seoUrl?: string;
  seoStructuredData?: Record<string, unknown>;
}

type IconProps = {
  className?: string;
};

/* SVG icon helpers */
/* ── Step icons (monochrome, modern geometric) ── */
const IconBriefcase = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v.01" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h8m4 0h8" />
  </svg>
);
const IconLayers = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2 17l10 5 10-5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2 12l10 5 10-5" />
  </svg>
);
const IconCameraAI = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 11.5l1.5 1.5 3-3" />
  </svg>
);
const IconClipboardCheck = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4" />
  </svg>
);
const IconCheck = ({ className = '' }: IconProps) => (
  <svg className={`h-5 w-5 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
  </svg>
);
const IconX = ({ className = '' }: IconProps) => (
  <svg className={`h-5 w-5 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconArrow = ({ className = '' }: IconProps) => (
  <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
);
const IconSun = ({ className = '' }: IconProps) => (
  <svg className={`h-4 w-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2.25M12 18.75V21M4.929 4.929l1.591 1.591M17.48 17.48l1.591 1.591M3 12h2.25M18.75 12H21M4.929 19.071l1.591-1.591M17.48 6.52l1.591-1.591M15.75 12A3.75 3.75 0 118.25 12a3.75 3.75 0 017.5 0z" />
  </svg>
);
const IconMoon = ({ className = '' }: IconProps) => (
  <svg className={`h-4 w-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12.79A9 9 0 1111.21 3c-.132.577-.21 1.177-.21 1.79 0 4.97 4.03 9 9 9 .613 0 1.213-.078 1.79-.21z" />
  </svg>
);

const lightAccents = [
  {
    glow: 'from-transparent via-cyan-500/60 to-transparent',
    iconWrap: 'border-cyan-200 bg-cyan-50',
    shadow: 'hover:shadow-[0_34px_80px_-46px_rgba(34,211,238,0.28)]',
  },
  {
    glow: 'from-transparent via-sky-500/60 to-transparent',
    iconWrap: 'border-sky-200 bg-sky-50',
    shadow: 'hover:shadow-[0_34px_80px_-46px_rgba(56,189,248,0.26)]',
  },
  {
    glow: 'from-transparent via-blue-500/55 to-transparent',
    iconWrap: 'border-blue-200 bg-blue-50',
    shadow: 'hover:shadow-[0_34px_80px_-46px_rgba(59,130,246,0.24)]',
  },
  {
    glow: 'from-transparent via-indigo-500/55 to-transparent',
    iconWrap: 'border-indigo-200 bg-indigo-50',
    shadow: 'hover:shadow-[0_34px_80px_-46px_rgba(99,102,241,0.24)]',
  },
] as const;

const darkAccents = [
  {
    glow: 'from-transparent via-cyan-300/80 to-transparent',
    iconWrap: 'border-cyan-400/20 bg-cyan-500/15',
    shadow: 'hover:shadow-[0_36px_88px_-52px_rgba(34,211,238,0.5)]',
  },
  {
    glow: 'from-transparent via-sky-300/80 to-transparent',
    iconWrap: 'border-sky-400/20 bg-sky-500/15',
    shadow: 'hover:shadow-[0_36px_88px_-52px_rgba(56,189,248,0.45)]',
  },
  {
    glow: 'from-transparent via-blue-300/80 to-transparent',
    iconWrap: 'border-blue-400/20 bg-blue-500/15',
    shadow: 'hover:shadow-[0_36px_88px_-52px_rgba(59,130,246,0.45)]',
  },
  {
    glow: 'from-transparent via-indigo-300/80 to-transparent',
    iconWrap: 'border-indigo-400/20 bg-indigo-500/15',
    shadow: 'hover:shadow-[0_36px_88px_-52px_rgba(99,102,241,0.4)]',
  },
] as const;

export default function ProductIntro({
  showDarkToggle = true,
  showFAQ = false,
  seoUrl,
  seoStructuredData,
}: ProductIntroProps = {}) {
  const { t, i18n } = useTranslation();
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const currentLanguage = i18n.resolvedLanguage || i18n.language || 'en';
  const isChineseHero = currentLanguage === 'zh' || currentLanguage === 'zh-TW';

  const isLight = showDarkToggle ? themeMode === 'light' : true;
  const accents = isLight ? lightAccents : darkAccents;

  const pageShellClass = isLight
    ? 'relative min-h-screen overflow-hidden bg-[#f6fbff] text-slate-900'
    : 'relative min-h-screen overflow-hidden bg-[#020617] text-slate-100';
  const pageBackdropClass = isLight
    ? 'absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_82%_10%,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(99,102,241,0.12),transparent_36%)]'
    : 'absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_80%_12%,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(79,70,229,0.12),transparent_36%)]';
  const pageGlowClass = isLight
    ? 'absolute left-1/2 top-0 h-[680px] w-[680px] -translate-x-1/2 rounded-full bg-cyan-200/60 blur-[140px]'
    : 'absolute left-1/2 top-0 h-[680px] w-[680px] -translate-x-1/2 rounded-full bg-cyan-500/8 blur-[140px]';
  const pageGridClass = isLight ? 'absolute inset-0 opacity-[0.12]' : 'absolute inset-0 opacity-20';
  const heroSectionClass = isLight
    ? 'relative overflow-hidden border-b border-slate-200/80 pb-20 pt-10 sm:pb-28 sm:pt-16 lg:pb-32 lg:pt-20'
    : 'relative overflow-hidden border-b border-white/5 pb-20 pt-10 sm:pb-28 sm:pt-16 lg:pb-32 lg:pt-20';
  const heroOverlayClass = isLight
    ? 'absolute inset-0 bg-gradient-to-b from-white/70 via-white/20 to-sky-50/80'
    : 'absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/20 to-slate-950/60';
  const themeToggleClass = isLight
    ? 'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_16px_36px_-28px_rgba(37,99,235,0.35)] backdrop-blur-md transition-colors hover:border-sky-300 hover:text-sky-700'
    : 'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-200 backdrop-blur-md transition-colors hover:border-cyan-300/40 hover:text-white';
  const heroBadgeClass = isLight
    ? 'mb-6 inline-flex rounded-full border border-sky-200 bg-white/90 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700 shadow-[0_14px_28px_-24px_rgba(37,99,235,0.35)]'
    : 'mb-6 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200';
  const heroTitleClass = isLight
    ? `landing-display text-4xl font-bold text-slate-900 sm:text-5xl ${isChineseHero ? 'tracking-[-0.035em] lg:text-[2.9rem] lg:leading-[1.12] xl:text-[3.7rem] xl:leading-[1.08]' : 'tracking-tight lg:text-[3.2rem] lg:leading-[1.08] xl:text-[4.1rem] xl:leading-[1.02]'}`
    : `landing-display text-4xl font-bold text-white sm:text-5xl ${isChineseHero ? 'tracking-[-0.035em] lg:text-[2.9rem] lg:leading-[1.12] xl:text-[3.7rem] xl:leading-[1.08]' : 'tracking-tight lg:text-[3.2rem] lg:leading-[1.08] xl:text-[4.1rem] xl:leading-[1.02]'}`;
  const heroTitleLineClass = isChineseHero ? 'block lg:whitespace-nowrap' : 'block';
  const heroTitleSecondLineClass = isChineseHero ? 'mt-4 lg:mt-5' : 'mt-3';
  const heroGradientClass = isLight
    ? 'bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 bg-clip-text text-transparent'
    : 'bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300 bg-clip-text text-transparent';
  const heroSubtitleClass = isLight
    ? 'mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl'
    : 'mt-6 max-w-2xl text-lg leading-relaxed text-slate-300 sm:text-xl';
  const primaryCtaClass = isLight
    ? 'w-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-[0_24px_60px_-24px_rgba(59,130,246,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_32px_84px_-30px_rgba(37,99,235,0.65)] sm:w-auto'
    : 'w-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-[0_24px_60px_-24px_rgba(59,130,246,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_32px_84px_-30px_rgba(14,165,233,0.95)] sm:w-auto';
  const secondaryCtaClass = isLight
    ? 'w-full rounded-full border border-slate-200 bg-white/92 px-8 py-4 text-base font-semibold text-slate-700 shadow-[0_20px_42px_-34px_rgba(37,99,235,0.25)] transition-all duration-300 hover:border-sky-300 hover:text-sky-700 sm:w-auto'
    : 'w-full rounded-full border border-white/15 bg-white/[0.05] px-8 py-4 text-base font-semibold text-white/90 backdrop-blur-md transition-all duration-300 hover:border-cyan-300/40 hover:bg-white/[0.08] hover:text-white sm:w-auto';
  const heroStatCardClass = isLight
    ? 'rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 shadow-[0_20px_48px_-36px_rgba(37,99,235,0.22)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5'
    : 'rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5';
  const heroStatValueClass = isLight ? 'text-2xl font-bold text-slate-900 sm:text-3xl' : 'text-2xl font-bold text-white sm:text-3xl';
  const heroStatLabelClass = isLight
    ? 'mt-2 text-xs font-medium uppercase tracking-[0.18em] leading-snug text-slate-500'
    : 'mt-2 text-xs font-medium uppercase tracking-[0.18em] leading-snug text-slate-400';
  const heroPanelGlowClass = isLight
    ? 'absolute -inset-6 rounded-full bg-sky-300/30 blur-3xl'
    : 'absolute -inset-6 rounded-full bg-cyan-400/10 blur-3xl';
  const glassCardClass = isLight
    ? 'rounded-[30px] border border-white/90 bg-white/88 shadow-[0_30px_80px_-52px_rgba(37,99,235,0.28)] backdrop-blur-xl'
    : 'rounded-[30px] border border-white/10 bg-white/[0.05] shadow-[0_30px_80px_-52px_rgba(8,145,178,0.45)] backdrop-blur-xl';
  const hairlineClass = isLight
    ? 'absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent'
    : 'absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent';
  const heroBlobClass = isLight
    ? 'absolute -right-16 top-10 h-40 w-40 rounded-full bg-sky-300/35 blur-3xl'
    : 'absolute -right-16 top-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl';
  const panelEyebrowClass = isLight
    ? 'text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'
    : 'text-xs font-semibold uppercase tracking-[0.24em] text-slate-400';
  const panelTitleClass = isLight ? 'mt-3 text-2xl font-semibold text-slate-900' : 'mt-3 text-2xl font-semibold text-white';
  const panelBodyClass = isLight ? 'mt-2 text-sm leading-relaxed text-slate-600' : 'mt-2 text-sm leading-relaxed text-slate-400';
  const cycleBadgeClass = isLight
    ? 'rounded-2xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-right'
    : 'rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-right';
  const cycleEyebrowClass = isLight
    ? 'text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80'
    : 'text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80';
  const cycleValueClass = isLight ? 'mt-1 text-xl font-bold text-slate-900' : 'mt-1 text-xl font-bold text-white';
  const heroMiniCardClass = isLight
    ? 'rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_38px_-32px_rgba(37,99,235,0.18)] transition-colors duration-300 hover:border-sky-300/50 hover:bg-white'
    : 'rounded-2xl border border-white/10 bg-slate-950/60 p-4 transition-colors duration-300 hover:border-cyan-300/20 hover:bg-slate-900/80';
  const miniMetaClass = isLight
    ? 'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'
    : 'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500';
  const miniTitleClass = isLight ? 'mt-2 text-sm font-semibold text-slate-900' : 'mt-2 text-sm font-semibold text-white';
  const sectionHeadingClass = isLight
    ? 'landing-display text-3xl font-bold text-slate-900 sm:text-4xl'
    : 'landing-display text-3xl font-bold text-white sm:text-4xl';
  const sectionHeadingLargeClass = isLight
    ? 'landing-display text-3xl font-bold text-slate-900 sm:text-4xl lg:text-5xl'
    : 'landing-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl';
  const sectionBodyClass = isLight ? 'mt-4 text-lg text-slate-600' : 'mt-4 text-lg text-slate-400';
  const sectionAltClass = isLight
    ? 'relative border-y border-slate-200/80 bg-slate-50/80'
    : 'relative border-y border-white/5 bg-slate-950/35';
  const standardCardClass = isLight
    ? 'group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(37,99,235,0.18)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-sky-300/40'
    : 'group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-white/[0.07]';
  const standardCardTextClass = isLight ? 'text-sm leading-relaxed text-slate-600' : 'text-sm leading-relaxed text-slate-400';
  const standardCardTitleClass = isLight ? 'mb-2 text-base font-semibold text-slate-900' : 'mb-2 text-base font-semibold text-white';
  const stepCardClass = isLight
    ? 'group relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-white p-7 shadow-[0_26px_72px_-48px_rgba(37,99,235,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-sky-300/40'
    : 'group relative overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/70 p-7 shadow-[0_26px_72px_-52px_rgba(15,23,42,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-slate-900/80 hover:shadow-[0_34px_94px_-56px_rgba(59,130,246,0.55)]';
  const stepNumberClass = isLight
    ? 'absolute right-6 top-6 select-none text-[3.5rem] font-bold leading-none text-slate-100'
    : 'absolute right-6 top-6 select-none text-[3.5rem] font-bold leading-none text-white/[0.06]';
  const stepTitleClass = isLight ? 'relative mb-2 text-lg font-bold text-slate-900' : 'relative mb-2 text-lg font-bold text-white';
  const stepSubtitleClass = isLight
    ? 'relative mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400'
    : 'relative mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500';
  const stepTextClass = isLight ? 'relative text-sm leading-relaxed text-slate-600' : 'relative text-sm leading-relaxed text-slate-300';
  const scenarioBadgeClass = isLight
    ? 'mb-6 inline-flex rounded-full border border-sky-200 bg-white/90 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700'
    : 'mb-6 inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-blue-200';
  const scenarioCardClass = `${glassCardClass} relative overflow-hidden p-8 sm:p-10`;
  const scenarioBodyTextClass = isLight ? 'space-y-6 text-base leading-relaxed text-slate-700' : 'space-y-6 text-base leading-relaxed text-slate-300';
  const scenarioStripClass = isLight
    ? 'mt-8 flex items-center justify-between gap-4 rounded-[26px] border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 px-6 py-5'
    : 'mt-8 flex items-center justify-between gap-4 rounded-[26px] border border-cyan-400/15 bg-gradient-to-r from-cyan-400/10 to-blue-500/10 px-6 py-5';
  const scenarioBeforeValueClass = isLight ? 'text-2xl font-bold text-slate-400 line-through' : 'text-2xl font-bold text-slate-500 line-through';
  const scenarioAfterLabelClass = isLight ? 'text-sm text-sky-700' : 'text-sm text-cyan-200';
  const scenarioAfterValueClass = isLight ? 'text-2xl font-bold text-slate-900' : 'text-2xl font-bold text-white';
  const comparisonWrapClass = isLight
    ? 'overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_28px_80px_-50px_rgba(37,99,235,0.16)]'
    : 'overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/70 shadow-[0_28px_80px_-50px_rgba(15,23,42,0.95)] backdrop-blur-xl';
  const comparisonHeadRowClass = isLight ? 'bg-slate-50/90' : 'bg-white/[0.04]';
  const comparisonHeadCellClass = isLight ? 'px-5 py-4 text-left text-sm font-semibold text-slate-500' : 'px-5 py-4 text-left text-sm font-semibold text-slate-400';
  const comparisonFeatureClass = isLight ? 'px-5 py-4 text-sm font-medium text-slate-900' : 'px-5 py-4 text-sm font-medium text-white';
  const comparisonOldClass = isLight ? 'px-5 py-4 text-sm text-slate-600' : 'px-5 py-4 text-sm text-slate-400';
  const comparisonRoboClass = isLight ? 'bg-sky-50 px-5 py-4 text-sm font-medium text-sky-700' : 'bg-cyan-400/[0.06] px-5 py-4 text-sm font-medium text-cyan-50';
  const comparisonRowClass = isLight ? 'transition-colors hover:bg-slate-50' : 'transition-colors hover:bg-white/[0.03]';
  const testimonialBodyClass = isLight ? 'text-base leading-relaxed text-slate-700 sm:text-lg' : 'text-base leading-relaxed text-slate-300 sm:text-lg';
  const testimonialMarkClass = isLight
    ? 'absolute -top-4 left-8 select-none text-6xl font-serif leading-none text-sky-200'
    : 'absolute -top-4 left-8 select-none text-6xl font-serif leading-none text-cyan-300/30';
  const testimonialBadgeClass = isLight
    ? 'flex h-11 w-11 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sm font-bold text-sky-700'
    : 'flex h-11 w-11 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/15 text-sm font-bold text-cyan-200';
  const authorNameClass = isLight ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-white';
  const authorMetaClass = isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500';
  const audienceTitleClass = isLight ? 'mb-2 text-base font-bold text-slate-900' : 'mb-2 text-base font-bold text-white';
  const pricingNormalClass = isLight
    ? 'rounded-[28px] border border-slate-200/80 bg-white p-6 text-center text-slate-900 shadow-[0_24px_60px_-42px_rgba(37,99,235,0.18)] transition-all duration-300 hover:-translate-y-1 hover:border-sky-300/40'
    : 'rounded-[28px] border border-white/10 bg-white/[0.05] p-6 text-center text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-white/[0.07]';
  const pricingHighlightClass = isLight
    ? 'rounded-[28px] border border-sky-300/70 bg-gradient-to-b from-sky-50 via-white to-indigo-50 p-6 text-center text-slate-900 shadow-[0_34px_94px_-48px_rgba(56,189,248,0.3)] transition-all duration-300 hover:-translate-y-1'
    : 'rounded-[28px] border border-cyan-300/30 bg-gradient-to-b from-sky-500/20 via-blue-500/20 to-indigo-600/25 p-6 text-center text-white shadow-[0_34px_94px_-48px_rgba(56,189,248,0.6)] transition-all duration-300 hover:-translate-y-1';
  const pricingPopularClass = isLight
    ? 'mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-700'
    : 'mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-200';
  const pricingNameMutedClass = isLight ? 'text-sm font-semibold text-slate-500' : 'text-sm font-semibold text-slate-400';
  const pricingNameHighlightClass = isLight ? 'text-sm font-semibold text-sky-700' : 'text-sm font-semibold text-sky-100';
  const pricingValueClass = isLight ? 'mt-2 text-3xl font-bold text-slate-900' : 'mt-2 text-3xl font-bold text-white';
  const pricingPeriodMutedClass = isLight ? 'text-base font-medium text-slate-400' : 'text-base font-medium text-slate-500';
  const pricingPeriodHighlightClass = isLight ? 'text-base font-medium text-sky-700/70' : 'text-base font-medium text-sky-100/80';
  const pricingDescMutedClass = isLight ? 'mt-2 text-sm text-slate-600' : 'mt-2 text-sm text-slate-400';
  const pricingDescHighlightClass = isLight ? 'mt-2 text-sm text-slate-700' : 'mt-2 text-sm text-sky-100/90';
  const pricingLinkClass = isLight
    ? 'inline-flex items-center gap-2 text-base font-semibold text-sky-700 transition-colors hover:text-sky-900'
    : 'inline-flex items-center gap-2 text-base font-semibold text-cyan-200 transition-colors hover:text-white';
  const ctaSectionClass = isLight
    ? 'relative overflow-hidden border-t border-slate-200/80 py-24 sm:py-28'
    : 'relative overflow-hidden border-t border-white/5 py-24 sm:py-28';
  const ctaBackdropClass = isLight
    ? 'absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.2),transparent_26%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(239,246,255,0.95)_100%)]'
    : 'absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.18),transparent_30%),linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0.7)_100%)]';
  const ctaLeftBlobClass = isLight
    ? 'absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-cyan-200/70 blur-[120px]'
    : 'absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-cyan-400/10 blur-[120px]';
  const ctaRightBlobClass = isLight
    ? 'absolute bottom-0 right-1/4 h-[420px] w-[420px] rounded-full bg-indigo-200/60 blur-[120px]'
    : 'absolute bottom-0 right-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-[120px]';
  const ctaTitleClass = isLight
    ? 'landing-display text-3xl font-bold text-slate-900 sm:text-4xl lg:text-5xl'
    : 'landing-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl';
  const ctaBodyClass = isLight ? 'mx-auto mt-5 max-w-2xl text-lg text-slate-600' : 'mx-auto mt-5 max-w-2xl text-lg text-slate-400';
  const ctaPillClass = isLight
    ? 'rounded-full border border-slate-200/80 bg-white/90 px-4 py-1.5 text-xs font-medium text-slate-600 backdrop-blur-sm'
    : 'rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-sm';
  const checkIconClass = isLight ? 'text-sky-600' : 'text-cyan-300';
  const xIconClass = isLight ? 'text-slate-300' : 'text-slate-500';
  const arrowAccentClass = isLight ? 'text-sky-700' : 'text-cyan-200';
  const themeToggleLabel = isLight
    ? t('productIntro.theme.dark', 'Dark mode')
    : t('productIntro.theme.light', 'Light mode');

  const painPoints = [
    {
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      ),
      title: t('productIntro.pain.unclear.title', '需求不清，反复沟通'),
      text: t('productIntro.pain.unclear.text', '用人部门一句"招个厉害的人"，HR 要来回确认岗位职责、硬性要求、团队偏好，需求澄清本身就耗掉好几天'),
    },
    {
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.243 1.007-2.25 2.25-2.25h13.5" />
        </svg>
      ),
      title: t('productIntro.pain.resumes.title', '简历堆积如山'),
      text: t('productIntro.pain.resumes.text', '一个岗位收到 200+ 份简历，逐份看完要花一整周，但真正匹配的可能只有 10 个人'),
    },
    {
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: t('productIntro.pain.scheduling.title', '重复事务拖住团队'),
      text: t('productIntro.pain.scheduling.text', '排面试、催进度、补记录，80% 的时间花在行政事务上。协调候选人和面试官的日程就要来回好几天，优秀候选人早被竞对抢走。'),
    },
    {
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
        </svg>
      ),
      title: t('productIntro.pain.evaluation.title', '评估全靠"感觉"'),
      text: t('productIntro.pain.evaluation.text', '不同面试官标准不一，主观判断多，事后复盘缺乏数据支撑，难以做出客观的录用决策'),
    },
    {
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      ),
      title: t('productIntro.pain.language.title', '跨语言招聘更难'),
      text: t('productIntro.pain.language.text', '全球化团队需要多语言面试能力，传统方式根本无法覆盖不同语言和时区的候选人'),
    },
    {
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      ),
      title: t('productIntro.pain.nohr.title', '小公司没有招聘能力'),
      text: t('productIntro.pain.nohr.text', '初创团队和成长型小微企业没有专职 HR、没有合格的面试官，无力配备专业招聘角色，却同样需要找到优秀人才'),
    },
  ];

  const steps = [
    {
      num: '01',
      icon: <IconBriefcase />,
      color: 'from-slate-400 via-slate-500 to-slate-600',
      lightBg: 'bg-slate-100 ring-1 ring-inset ring-slate-200',
      lightIconColor: 'text-slate-700',
      darkBg: 'bg-white/10 ring-1 ring-inset ring-white/20',
      darkIconColor: 'text-white',
      title: t('productIntro.steps.clarify.title', '从需求到 JD，一步到位'),
      subtitle: t('productIntro.steps.clarify.subtitle', 'AI Recruiting Consultant'),
      text: t('productIntro.steps.clarify.text', 'AI 招聘顾问通过对话式交互梳理岗位需求——职责范围、核心技能、薪资区间、不可妥协项，10 分钟输出结构化岗位画像，并自动生成完整 JD，确认即可发布。'),
    },
    {
      num: '02',
      icon: <IconLayers />,
      color: 'from-slate-400 via-slate-500 to-slate-600',
      lightBg: 'bg-slate-100 ring-1 ring-inset ring-slate-200',
      lightIconColor: 'text-slate-700',
      darkBg: 'bg-white/10 ring-1 ring-inset ring-white/20',
      darkIconColor: 'text-white',
      title: t('productIntro.steps.screen.title', 'AI 智能简历筛选'),
      subtitle: t('productIntro.steps.screen.subtitle', 'AI Resume Screening Agent'),
      text: t('productIntro.steps.screen.text', '批量上传简历，AI Agents 立即启动。不是关键词匹配——AI 真正看懂经历、技能相关性、经验深度和潜力信号，几分钟处理 200+ 份简历，给出带理由的排序结果。'),
    },
    {
      num: '03',
      icon: <IconCameraAI />,
      color: 'from-slate-400 via-slate-500 to-slate-600',
      lightBg: 'bg-slate-100 ring-1 ring-inset ring-slate-200',
      lightIconColor: 'text-slate-700',
      darkBg: 'bg-white/10 ring-1 ring-inset ring-white/20',
      darkIconColor: 'text-white',
      title: t('productIntro.steps.interview.title', 'AI 视频面试官'),
      subtitle: t('productIntro.steps.interview.subtitle', 'AI Video Interviewer'),
      text: t('productIntro.steps.interview.text', '筛选通过的候选人自动收到面试链接。AI 面试官 7×24 在线，结构化提问、实时追问，支持中英日西法葡德 7 种语言。候选人点开即面，无需额外安装。'),
    },
    {
      num: '04',
      icon: <IconClipboardCheck />,
      color: 'from-slate-400 via-slate-500 to-slate-600',
      lightBg: 'bg-slate-100 ring-1 ring-inset ring-slate-200',
      lightIconColor: 'text-slate-700',
      darkBg: 'bg-white/10 ring-1 ring-inset ring-white/20',
      darkIconColor: 'text-white',
      title: t('productIntro.steps.evaluate.title', '看报告，做决策'),
      subtitle: t('productIntro.steps.evaluate.subtitle', 'Multi-Agent Evaluation'),
      text: t('productIntro.steps.evaluate.text', '每场面试自动生成结构化评估报告：技能匹配、经验深度、优势短板、录用建议、风险提示和 AI 作弊检测。团队只需要把时间留给最后几位候选人。'),
    },
  ];

  const comparisonRows = [
    {
      feature: t('productIntro.compare.row.clarify', '需求梳理'),
      old: t('productIntro.compare.old.clarify', '多轮会议，邮件往返'),
      robo: t('productIntro.compare.robo.clarify', 'AI 对话式澄清，10 分钟输出岗位画像'),
    },
    {
      feature: t('productIntro.compare.row.jd', '写 JD'),
      old: t('productIntro.compare.old.jd', 'HR 手写，反复修改'),
      robo: t('productIntro.compare.robo.jd', 'AI 自动生成，确认即发布'),
    },
    {
      feature: t('productIntro.compare.row.screen', '筛选 200 份简历'),
      old: t('productIntro.compare.old.screen', '3–5 天，逐一阅读'),
      robo: t('productIntro.compare.robo.screen', '几分钟，AI 自动匹配排序'),
    },
    {
      feature: t('productIntro.compare.row.invite', '面试邀约'),
      old: t('productIntro.compare.old.invite', '逐个联系，协调排期'),
      robo: t('productIntro.compare.robo.invite', 'AI 自动发送，候选人自助完成'),
    },
    {
      feature: t('productIntro.compare.row.interview', '初轮面试'),
      old: t('productIntro.compare.old.interview', '2 周排期，面试官逐个面'),
      robo: t('productIntro.compare.robo.interview', '48 小时内，AI 完成全部初面'),
    },
    {
      feature: t('productIntro.compare.row.eval', '评估一致性'),
      old: t('productIntro.compare.old.eval', '不同面试官标准不同'),
      robo: t('productIntro.compare.robo.eval', '统一 AI 标准，每人维度相同'),
    },
    {
      feature: t('productIntro.compare.row.timezone', '覆盖时区'),
      old: t('productIntro.compare.old.timezone', '仅限工作时间'),
      robo: t('productIntro.compare.robo.timezone', '7×24 小时，全球随时面试'),
    },
    {
      feature: t('productIntro.compare.row.language', '语言能力'),
      old: t('productIntro.compare.old.language', '受限于面试官语言'),
      robo: t('productIntro.compare.robo.language', '支持 7 种语言'),
    },
    {
      feature: t('productIntro.compare.row.data', '数据沉淀'),
      old: t('productIntro.compare.old.data', '散落在邮件和表格中'),
      robo: t('productIntro.compare.robo.data', '统一人才库，智能标签，可检索可复用'),
    },
    {
      feature: t('productIntro.compare.row.cost', '综合成本'),
      old: t('productIntro.compare.old.cost', '高人力 + 猎头费用'),
      robo: t('productIntro.compare.robo.cost', '从 ¥199/月 起'),
    },
  ];

  const differentiators = [
    {
      title: t('productIntro.diff.agents.title', '不是工具，是 AI 招聘团队'),
      text: t('productIntro.diff.agents.text', '传统软件只帮你管信息 — 存简历、排日程、发邮件。RoboHire 的 AI Agents 真正替你"干活"：从需求梳理到面试评估，全流程自动驱动。你不是在用一个软件，而是拥有了一支不知疲倦的 AI 招聘团队。'),
      icon: '🤖',
    },
    {
      title: t('productIntro.diff.semantic.title', '深度理解，不是表面匹配'),
      text: t('productIntro.diff.semantic.text', '普通工具做"关键词匹配" — 简历里有 Python 就通过，没有就淘汰。RoboHire 的 AI 真正理解语义：它能识别"3 年机器学习项目经验"和"精通 TensorFlow"之间的关联，能在面试中根据回答做实时追问，评估真实能力。'),
      icon: '🧠',
    },
    {
      title: t('productIntro.diff.fair.title', '公平、一致、可追溯'),
      text: t('productIntro.diff.fair.text', '每位候选人接受相同标准的评估。没有"面试官心情不好"的变量，没有无意识偏见。所有评估数据可追溯，满足合规审计要求。让招聘决策经得起检验。'),
      icon: '⚖️',
    },
    {
      title: t('productIntro.diff.barrier.title', '大大降低专业招聘门槛'),
      text: t('productIntro.diff.barrier.text', '不需要专职 HR，不需要专业面试官，不需要猎头预算。初创团队和小微企业以极低成本拥有完整的 AI 招聘能力。过去只有大公司才负担得起的专业招聘流程，现在人人都能用。'),
      icon: '🌱',
    },
  ];

  const audiences = [
    {
      title: t('productIntro.audience.startup.title', '初创公司与创业团队'),
      text: t('productIntro.audience.startup.text', '没有专职 HR，没有合格面试官，RoboHire 让你以极低成本拥有专业级 AI 招聘能力'),
      icon: '🌱',
    },
    {
      title: t('productIntro.audience.tech.title', '快速成长的科技公司'),
      text: t('productIntro.audience.tech.text', '同时开 10+ 岗位，HR 团队人手不够，需要规模化筛选和面试'),
      icon: '🚀',
    },
    {
      title: t('productIntro.audience.global.title', '跨国企业'),
      text: t('productIntro.audience.global.text', '全球招聘，需要多语言面试能力和统一的评估标准'),
      icon: '🌐',
    },
    {
      title: t('productIntro.audience.agency.title', '猎头与 RPO'),
      text: t('productIntro.audience.agency.text', '大量候选人初筛，提高人效比，缩短交付周期'),
      icon: '🏢',
    },
    {
      title: t('productIntro.audience.smb.title', '中小企业'),
      text: t('productIntro.audience.smb.text', '没有专职 HR 团队，需要低成本、高质量的专业招聘方案'),
      icon: '💼',
    },
  ];

  const heroStats = [
    { value: '90%', label: t('productIntro.stats.time', '时间节省') },
    { value: '7×24', label: t('productIntro.stats.avail', '全天候服务') },
    { value: '7', label: t('productIntro.stats.lang', '种语言支持') },
    { value: '500+', label: t('productIntro.stats.companies', '企业客户') },
  ];

  const pricingPlans = [
    { name: t('productIntro.pricing.names.starter', '入门版'), price: '¥199', period: t('productIntro.pricing.mo', '/月'), desc: t('productIntro.pricing.starter', '小团队起步'), highlight: false },
    { name: t('productIntro.pricing.names.growth', '成长版'), price: '¥1,399', period: t('productIntro.pricing.mo', '/月'), desc: t('productIntro.pricing.growth', '成长期团队'), highlight: false },
    { name: t('productIntro.pricing.names.business', '商业版'), price: '¥2,799', period: t('productIntro.pricing.mo', '/月'), desc: t('productIntro.pricing.business', '规模化招聘'), highlight: true },
    { name: t('productIntro.pricing.names.enterprise', '企业版'), price: t('productIntro.pricing.custom', '定制'), period: '', desc: t('productIntro.pricing.enterprise', '大型企业'), highlight: false },
  ];

  return (
    <>
      <SEO
        title={t('productIntro.seo.title', 'RoboHire | 让 AI 把招聘流程跑起来')}
        description={t('productIntro.seo.description', '从岗位澄清、JD 生成、简历初筛，到自动邀约、AI 面试和评估报告，RoboHire 帮你把 42 天的招聘周期压缩到 3 天。')}
        url={seoUrl || 'https://robohire.io/product-intro'}
        keywords="AI招聘,智能招聘,AI面试,简历筛选,招聘自动化,AI hiring,AI recruitment,AI interview,AI resume screening,AI candidate evaluation,automated hiring,recruitment automation,AI video interview,intelligent recruitment"
        {...(seoStructuredData ? { structuredData: seoStructuredData } : {})}
      />

      <div className={pageShellClass}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={pageBackdropClass} />
          <div className={pageGlowClass} />
          <div
            className={pageGridClass}
            style={{
              backgroundImage:
                'linear-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.16) 1px, transparent 1px)',
              backgroundSize: '5.5rem 5.5rem',
            }}
          />
        </div>

        <Navbar />

        <main className="relative pt-24 lg:pt-28">
          <section className={heroSectionClass}>
            <div className={heroOverlayClass} />

            <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {showDarkToggle && (
                <div className="mb-8 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setThemeMode((current) => (current === 'light' ? 'dark' : 'light'))}
                    aria-label={themeToggleLabel}
                    className={themeToggleClass}
                  >
                    {isLight ? <IconMoon className="text-slate-600" /> : <IconSun className="text-amber-300" />}
                    <span>{themeToggleLabel}</span>
                  </button>
                </div>
              )}

              <div className={`grid gap-12 lg:items-center ${isChineseHero ? 'lg:grid-cols-[1.14fr_0.86fr]' : 'lg:grid-cols-[1.05fr_0.95fr]'}`}>
                <div className="max-w-3xl">
                  <p className={heroBadgeClass}>{t('productIntro.hero.badge', 'AI 招聘代理')}</p>

                  <h1 className={heroTitleClass}>
                    <span className={heroTitleLineClass}>
                      {t('productIntro.hero.title1', '从需求到录用')}
                    </span>
                    <span className={`${heroTitleLineClass} ${heroTitleSecondLineClass} ${heroGradientClass}`}>
                      {t('productIntro.hero.title2', '全流程 AI 自动化')}
                    </span>
                  </h1>

                  <p className={heroSubtitleClass}>
                    {t('productIntro.hero.subtitle', 'RoboHire 用 AI Agents 驱动招聘全流程 — 需求澄清、简历筛选、自动邀约、AI 面试、评估决策。过去需要 42 天的招聘周期，现在只要几天。')}
                  </p>

                  <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <Link to="/agent-alex" state={{ fresh: true }} className={primaryCtaClass}>
                      {t('productIntro.hero.cta1', '免费开始使用')}
                    </Link>
                    <Link to="/request-demo" className={secondaryCtaClass}>
                      {t('productIntro.hero.cta2', '预约产品演示')}
                    </Link>
                    <Link
                      to="/quick-invite"
                      className={`w-full rounded-full border px-8 py-4 text-base font-semibold transition-all duration-300 hover:-translate-y-0.5 sm:w-auto ${isLight ? 'border-amber-200 bg-amber-50 text-amber-700 shadow-[0_20px_42px_-34px_rgba(217,119,6,0.35)] hover:border-amber-300 hover:bg-amber-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-300 hover:border-amber-400/50 hover:bg-amber-500/20'}`}
                    >
                      <svg className="mr-2 -mt-0.5 inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      {t('productIntro.hero.cta3', '一键邀约')}
                    </Link>
                  </div>

                  <div className="mt-12 grid max-w-3xl grid-cols-2 gap-4 xl:grid-cols-4">
                    {heroStats.map((stat, index) => (
                      <div
                        key={stat.label}
                        className={`${heroStatCardClass} ${accents[index % accents.length].shadow}`}
                      >
                        <div className={heroStatValueClass}>{stat.value}</div>
                        <div className={heroStatLabelClass}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className={heroPanelGlowClass} />
                  <div className={`${glassCardClass} relative overflow-hidden p-6 sm:p-8`}>
                    <div className={hairlineClass} />
                    <div className={heroBlobClass} />

                    <div className="relative flex items-start justify-between gap-4">
                      <div>
                        <p className={panelEyebrowClass}>
                          {t('productIntro.hero.panelLabel', '招聘流程总览')}
                        </p>
                        <h2 className={panelTitleClass}>
                          {t('productIntro.steps.title', '四个环节，一路自动推进')}
                        </h2>
                        <p className={panelBodyClass}>
                          {t('productIntro.steps.subtitle', 'RoboHire 的 AI 招聘代理自动驱动每一个环节，你只需做最终决定。')}
                        </p>
                      </div>

                      <div className={cycleBadgeClass}>
                        <p className={cycleEyebrowClass}>
                          {t('productIntro.hero.cycleLabel', '周期缩短')}
                        </p>
                        <p className={`${cycleValueClass} whitespace-nowrap`}>42 → 3</p>
                      </div>
                    </div>

                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                      {steps.slice(0, 4).map((step) => (
                        <div key={step.num} className={heroMiniCardClass}>
                          <div className="flex items-start gap-4">
                            <div
                              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                                isLight ? step.lightBg : step.darkBg
                              } ${isLight ? step.lightIconColor : step.darkIconColor}`}
                            >
                              {step.icon}
                            </div>
                            <div className="min-w-0">
                              <p className={miniMetaClass}>
                                {step.num} • {step.subtitle}
                              </p>
                              <h3 className={miniTitleClass}>{step.title}</h3>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      className={
                        isLight
                          ? 'mt-8 rounded-[26px] border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-5'
                          : 'mt-8 rounded-[26px] border border-cyan-400/15 bg-gradient-to-r from-cyan-400/10 via-blue-500/10 to-indigo-500/10 p-5'
                      }
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className={cycleEyebrowClass}>
                            {t('productIntro.hero.snapshotLabel', '效果摘要')}
                          </p>
                          <p className={isLight ? 'mt-2 text-xl font-semibold text-slate-900' : 'mt-2 text-xl font-semibold text-white'}>
                            {t('productIntro.scenario.title', '从 150 人到 4 人，3 天完成')}
                          </p>
                        </div>
                        <div
                          className={
                            isLight
                              ? 'rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-right'
                              : 'rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-right'
                          }
                        >
                          <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-400'}>
                            {t('productIntro.scenario.after', '使用 RoboHire')}
                          </p>
                          <p className={isLight ? 'text-2xl font-bold text-sky-700' : 'text-2xl font-bold text-cyan-200'}>
                            3 {t('productIntro.scenario.days', '天')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative py-20 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className={sectionHeadingClass}>
                  {t('productIntro.pain.title', '招聘，不该这么难')}
                </h2>
                <p className={sectionBodyClass}>
                  {t('productIntro.pain.subtitle', '招到一个合适的人，平均需要 42 天。招聘成本居高不下，HR 团队疲于奔命，而小微企业甚至连开始专业招聘的门槛都迈不过去。')}
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {painPoints.map((point, index) => {
                  const accent = accents[index % accents.length];

                  return (
                    <div key={point.title} className={`${standardCardClass} flex flex-col ${accent.shadow}`}>
                      <div className={`absolute inset-x-6 top-0 h-px bg-gradient-to-r ${accent.glow}`} />
                      <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${isLight ? 'bg-slate-900 text-white' : 'bg-white/10 text-white'}`}>
                        {point.icon}
                      </div>
                      <h3 className={standardCardTitleClass}>{point.title}</h3>
                      <p className={`${standardCardTextClass} flex-1`}>{point.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section id="services" className={`${sectionAltClass} py-20 sm:py-28`}>
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-16 max-w-3xl text-center">
                <p className={heroBadgeClass}>
                  {t('productIntro.steps.badge', '全流程自动化')}
                </p>
                <h2 className={sectionHeadingLargeClass}>
                  {t('productIntro.steps.title', '四个环节，一路自动推进')}
                </h2>
                <p className={sectionBodyClass}>
                  {t('productIntro.steps.subtitle', 'RoboHire 的 AI 招聘代理自动驱动每一个环节，你只需做最终决定。')}
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {steps.map((step) => (
                  <div key={step.num} className={`${stepCardClass} flex flex-col`}>
                    <div className={stepNumberClass}>{step.num}</div>

                    <div
                      className={`relative mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${
                        isLight ? step.lightBg : step.darkBg
                      } ${isLight ? step.lightIconColor : step.darkIconColor}`}
                    >
                      {step.icon}
                    </div>

                    <h3 className={stepTitleClass}>{step.title}</h3>
                    <p className={stepSubtitleClass}>{step.subtitle}</p>
                    <p className={`${stepTextClass} flex-1`}>{step.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="how-it-works" className="relative py-20 sm:py-24">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <div className="mb-10 text-center">
                <p className={scenarioBadgeClass}>
                  {t('productIntro.scenario.badge', '真实场景')}
                </p>
                <h2 className={sectionHeadingClass}>
                  {t('productIntro.scenario.title', '从 150 人到 4 人，3 天完成')}
                </h2>
              </div>

              <div className={scenarioCardClass}>
                <div
                  className={
                    isLight
                      ? 'absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent'
                      : 'absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent'
                  }
                />
                <div className={isLight ? 'absolute bottom-0 right-0 h-44 w-44 rounded-full bg-sky-300/35 blur-3xl' : 'absolute bottom-0 right-0 h-44 w-44 rounded-full bg-blue-500/10 blur-3xl'} />

                <div className={scenarioBodyTextClass}>
                  <p>
                    <span className={isLight ? 'font-semibold text-sky-700' : 'font-semibold text-cyan-300'}>
                      {t('productIntro.scenario.day1label', '周一上午')}
                    </span>
                    {t('productIntro.scenario.day1', '，你告诉 AI 招聘顾问"我们需要招一个高级产品经理"。AI 通过几轮对话帮你梳理清楚岗位要求，自动生成 JD 并发布。你上传了 150 份候选人简历，午饭前 AI 已完成全部筛选，给出 Top 15 的匹配排名和详细分析。')}
                  </p>
                  <p>
                    <span className={isLight ? 'font-semibold text-blue-700' : 'font-semibold text-sky-300'}>
                      {t('productIntro.scenario.day1pmlabel', '周一下午')}
                    </span>
                    {t('productIntro.scenario.day1pm', '，AI 自动向 15 位候选人发送面试邀请，每人收到专属面试链接和二维码。')}
                  </p>
                  <p>
                    <span className={isLight ? 'font-semibold text-indigo-700' : 'font-semibold text-indigo-300'}>
                      {t('productIntro.scenario.day3label', '周三')}
                    </span>
                    {t('productIntro.scenario.day3', '，12 人完成了 AI 视频面试，每人都有一份包含技能评估、经验分析、优劣势和录用建议的完整报告。你只需要花半天时间，约见最终的 3-4 位候选人做终面。')}
                  </p>
                </div>

                <div className={scenarioStripClass}>
                  <div>
                    <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-400'}>
                      {t('productIntro.scenario.before', '传统方式')}
                    </p>
                    <p className={scenarioBeforeValueClass}>3 {t('productIntro.scenario.weeks', '周')}</p>
                  </div>
                  <div>
                    <IconArrow className={arrowAccentClass} />
                  </div>
                  <div className="text-right">
                    <p className={scenarioAfterLabelClass}>{t('productIntro.scenario.after', '使用 RoboHire')}</p>
                    <p className={scenarioAfterValueClass}>3 {t('productIntro.scenario.days', '天')}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={`${sectionAltClass} py-20 sm:py-24`}>
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className={sectionHeadingClass}>
                  {t('productIntro.compare.title', '为什么选择 RoboHire？')}
                </h2>
                <p className={sectionBodyClass}>
                  {t('productIntro.compare.subtitle', '全流程对比，差距一目了然。')}
                </p>
              </div>

              <div className={comparisonWrapClass}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse">
                    <thead>
                      <tr className={comparisonHeadRowClass}>
                        <th className={comparisonHeadCellClass}>
                          {t('productIntro.compare.header.feature', '环节')}
                        </th>
                        <th className={comparisonHeadCellClass}>
                          {t('productIntro.compare.header.old', '传统招聘')}
                        </th>
                        <th className="bg-gradient-to-r from-sky-500/95 to-indigo-600/95 px-5 py-4 text-left text-sm font-semibold text-white">
                          RoboHire
                        </th>
                      </tr>
                    </thead>
                    <tbody className={isLight ? 'divide-y divide-slate-200' : 'divide-y divide-white/8'}>
                      {comparisonRows.map((row) => (
                        <tr key={row.feature} className={comparisonRowClass}>
                          <td className={comparisonFeatureClass}>{row.feature}</td>
                          <td className={comparisonOldClass}>
                            <span className="inline-flex items-center gap-1.5">
                              <IconX className={xIconClass} />
                              {row.old}
                            </span>
                          </td>
                          <td className={comparisonRoboClass}>
                            <span className="inline-flex items-center gap-1.5">
                              <IconCheck className={checkIconClass} />
                              {row.robo}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section className="relative py-20 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className={sectionHeadingClass}>
                  {t('productIntro.diff.title', '四个关键差异')}
                </h2>
              </div>

              <div className="grid gap-8 sm:grid-cols-2">
                {differentiators.map((item, index) => {
                  const accent = accents[index % accents.length];

                  return (
                    <div key={item.title} className={`${standardCardClass} p-8 ${accent.shadow}`}>
                      <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r ${accent.glow}`} />
                      <div className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border text-3xl ${accent.iconWrap}`}>
                        {item.icon}
                      </div>
                      <h3 className={isLight ? 'mb-3 text-xl font-bold text-slate-900' : 'mb-3 text-xl font-bold text-white'}>
                        {item.title}
                      </h3>
                      <p className={standardCardTextClass}>{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="relative py-20 sm:py-24">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-10 max-w-3xl text-center">
                <h2 className={sectionHeadingClass}>
                  {t('productIntro.testimonial.title', '客户真实反馈')}
                </h2>
              </div>

              <div className={`${glassCardClass} relative overflow-hidden p-8 sm:p-10`}>
                <div className={isLight ? 'absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent' : 'absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent'} />
                <div className={testimonialMarkClass}>&ldquo;</div>

                <blockquote className="relative">
                  <p className={testimonialBodyClass}>
                    {t('productIntro.testimonial.quote', '校招季的时候我们简历量巨大，而且初面官的提问水平参差不齐，容易漏掉好的人，或者让候选人体验不好。RoboHire 的 AI 面试能确保每一位候选人都被问到同样核心的问题，评估标准完全一致，而且系统会总结候选人的意向和软实力。')}
                  </p>
                  <footer className="mt-6 flex items-center gap-3">
                    <div className={testimonialBadgeClass}>HR</div>
                    <div>
                      <p className={authorNameClass}>
                        {t('productIntro.testimonial.author', '某互联网公司 HR 负责人')}
                      </p>
                      <p className={authorMetaClass}>
                        {t('productIntro.testimonial.context', '校园招聘场景')}
                      </p>
                    </div>
                  </footer>
                </blockquote>
              </div>
            </div>
          </section>

          <section className={`${sectionAltClass} py-20 sm:py-24`}>
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className={sectionHeadingClass}>
                  {t('productIntro.audience.title', '谁在用 RoboHire？')}
                </h2>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {audiences.map((audience, index) => {
                  const accent = accents[index % accents.length];

                  return (
                    <div key={audience.title} className={`${standardCardClass} text-center ${accent.shadow}`}>
                      <div className={`absolute inset-x-6 top-0 h-px bg-gradient-to-r ${accent.glow}`} />
                      <div className={`mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border text-3xl ${accent.iconWrap}`}>
                        {audience.icon}
                      </div>
                      <h3 className={audienceTitleClass}>{audience.title}</h3>
                      <p className={standardCardTextClass}>{audience.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="relative py-20 sm:py-24">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className={sectionHeadingClass}>
                  {t('productIntro.pricing.title', '灵活定价，按需选择')}
                </h2>
                <p className={sectionBodyClass}>
                  {t('productIntro.pricing.subtitle', '14 天免费试用，无需信用卡。')}
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {pricingPlans.map((plan, index) => (
                  <div
                    key={plan.name}
                    className={`${plan.highlight ? pricingHighlightClass : pricingNormalClass} ${
                      !plan.highlight ? accents[index % accents.length].shadow : ''
                    }`}
                  >
                    {plan.highlight && (
                      <p className={pricingPopularClass}>
                        {t('productIntro.pricing.popular', 'Most Popular')}
                      </p>
                    )}
                    <h3 className={plan.highlight ? pricingNameHighlightClass : pricingNameMutedClass}>
                      {plan.name}
                    </h3>
                    <div className={pricingValueClass}>
                      {plan.price}
                      <span className={plan.highlight ? pricingPeriodHighlightClass : pricingPeriodMutedClass}>
                        {plan.period}
                      </span>
                    </div>
                    <p className={plan.highlight ? pricingDescHighlightClass : pricingDescMutedClass}>
                      {plan.desc}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 text-center">
                <Link to="/pricing" className={pricingLinkClass}>
                  {t('productIntro.pricing.viewAll', '查看完整定价方案')}
                  <IconArrow className={isLight ? 'text-sky-700' : ''} />
                </Link>
              </div>
            </div>
          </section>

          <section className={ctaSectionClass}>
            <div className={ctaBackdropClass} />
            <div className={ctaLeftBlobClass} />
            <div className={ctaRightBlobClass} />

            <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
              <h2 className={ctaTitleClass}>
                {t('productIntro.cta.title', '让 AI 处理 80% 的重复工作')}
              </h2>
              <p className={ctaBodyClass}>
                {t('productIntro.cta.subtitle', '你的团队专注于最有价值的 20% — 识别文化契合、做最终的录用决策。')}
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link to="/agent-alex" state={{ fresh: true }} className={primaryCtaClass}>
                  {t('productIntro.cta.primary', '免费开始使用')}
                </Link>
                <Link to="/request-demo" className={secondaryCtaClass}>
                  {t('productIntro.cta.secondary', '预约产品演示')}
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                {[
                  t('productIntro.cta.pill1', '14 天免费试用'),
                  t('productIntro.cta.pill2', '无需信用卡'),
                  t('productIntro.cta.pill3', '即刻开始'),
                ].map((pill) => (
                  <span key={pill} className={ctaPillClass}>
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </main>

        {showFAQ && <FAQ />}

        <Footer />
      </div>
    </>
  );
}
