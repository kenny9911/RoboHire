import { useState, useRef, useEffect, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import LanguageSelector from '../LanguageSelector';

export default function Navbar() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProductOpen, setIsProductOpen] = useState(false);
  const [isMobileProductOpen, setIsMobileProductOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const location = useLocation();
  const navigate = useNavigate();

  const productItems = [
    { href: '/agent-alex', label: t('landing.nav.productMenu.requirements', 'Requirements Analysis'), icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', state: { fresh: true } as Record<string, boolean> },
    { href: '/product/agents', label: t('landing.nav.productMenu.agents', 'Agents'), icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z' },
    { href: '/product/talent', label: t('landing.nav.productMenu.resumeScreening', 'Resume Screening'), icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
    { href: '/product/matching', label: t('landing.nav.productMenu.smartMatching', 'Smart Matching'), icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5' },
    { href: '/product/interview', label: t('landing.nav.productMenu.aiInterview', 'AI Interview'), icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' },
    { href: '/product/evaluations', label: t('landing.nav.productMenu.smartEvaluation', 'Smart Evaluation'), icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z' },
    { href: '/developers', label: t('landing.nav.productMenu.api', 'API'), icon: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5' },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setIsProductOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navLinks = [
    { href: '/#services', hash: 'services', label: t('landing.nav.services', 'Services') },
    { href: '/#how-it-works', hash: 'how-it-works', label: t('landing.nav.howItWorks', 'How It Works') },
    { href: '/product', label: t('landing.nav.product', 'Product'), isRoute: true, isDropdown: true },
    { href: '/pricing', label: t('landing.nav.pricing', 'Pricing'), isRoute: true },
    { href: '/docs', label: t('landing.nav.docs', 'Docs'), isRoute: true },
  ];

  const handleHashClick = (e: MouseEvent, hash: string) => {
    e.preventDefault();
    if (location.pathname === '/') {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/', { state: { scrollTo: hash } });
    }
  };

  return (
    <nav className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="landing-glass mx-auto flex h-16 max-w-7xl items-center justify-between rounded-2xl border border-slate-200/80 px-4 shadow-[0_24px_48px_-36px_rgba(15,23,42,0.5)] sm:h-[74px] sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-1 transition-opacity hover:opacity-80">
          <img src="/logo2.png" alt="RoboHire" className="h-8" />
        </Link>

        <div className="hidden items-center gap-2 lg:flex">
          {navLinks.map((link) => (
            link.isDropdown ? (
              <div
                key={link.href}
                ref={productDropdownRef}
                className="relative"
                onMouseEnter={() => {
                  clearTimeout(productTimeoutRef.current);
                  setIsProductOpen(true);
                }}
                onMouseLeave={() => {
                  productTimeoutRef.current = setTimeout(() => setIsProductOpen(false), 150);
                }}
              >
                <button
                  className={`inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isProductOpen ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  {link.label}
                  <svg className={`h-3.5 w-3.5 transition-transform ${isProductOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isProductOpen && (
                  <div className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-xl border border-slate-200/80 bg-white/95 p-2 shadow-xl backdrop-blur-xl">
                    {productItems.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        state={item.state}
                        onClick={() => setIsProductOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                      >
                        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : link.isRoute ? (
              <Link
                key={link.href}
                to={link.href}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => link.hash && handleHashClick(e, link.hash)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                {link.label}
              </a>
            )
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSelector variant="compact" className="rounded-full border border-slate-200 bg-white/90 px-1" />
          {isAuthenticated ? (
            <Link
              to="/product"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-blue-300 hover:text-blue-700"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="h-7 w-7 rounded-full" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-xs font-bold text-blue-700">
                    {user?.name?.[0] || user?.email?.[0] || 'U'}
                  </span>
                </div>
              )}
              <span>{t('landing.nav.dashboard', 'Dashboard')}</span>
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-blue-300 hover:text-blue-700"
              >
                {t('landing.nav.signIn', 'Sign In')}
              </Link>
              <Link
                to="/login"
                state={{ from: { pathname: '/agent-alex' } }}
                className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-16px_rgba(37,99,235,0.9)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-16px_rgba(37,99,235,0.9)]"
              >
                {t('landing.nav.getStarted', 'Get Started')}
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 lg:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="mx-auto mt-2 max-w-7xl rounded-2xl border border-slate-200/90 bg-white/95 px-5 py-5 shadow-[0_28px_52px_-34px_rgba(15,23,42,0.6)] backdrop-blur-xl lg:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              link.isDropdown ? (
                <div key={link.href}>
                  <button
                    onClick={() => setIsMobileProductOpen(prev => !prev)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                  >
                    {link.label}
                    <svg className={`h-4 w-4 transition-transform ${isMobileProductOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {isMobileProductOpen && (
                    <div className="ml-3 flex flex-col gap-0.5 border-l-2 border-blue-100 pl-3">
                      {productItems.map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          state={item.state}
                          onClick={() => { setIsMobileMenuOpen(false); setIsMobileProductOpen(false); }}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                        >
                          <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                          </svg>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : link.isRoute ? (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    setIsMobileMenuOpen(false);
                    if (link.hash) handleHashClick(e, link.hash);
                  }}
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  {link.label}
                </a>
              )
            ))}
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <LanguageSelector />
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4">
            {isAuthenticated ? (
              <Link
                to="/product"
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                {t('landing.nav.dashboard', 'Dashboard')}
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700"
                >
                  {t('landing.nav.signIn', 'Sign In')}
                </Link>
                <Link
                  to="/login"
                  state={{ from: { pathname: '/agent-alex' } }}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  {t('landing.nav.getStarted', 'Get Started')}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
