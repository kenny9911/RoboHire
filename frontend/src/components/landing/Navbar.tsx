import { useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import LanguageSelector from '../LanguageSelector';

export default function Navbar() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navLinks = [
    { href: '/#services', hash: 'services', label: t('landing.nav.services', 'Services') },
    { href: '/#how-it-works', hash: 'how-it-works', label: t('landing.nav.howItWorks', 'How It Works') },
    { href: '/pricing', label: t('landing.nav.pricing', 'Pricing'), isRoute: true },
    { href: '/developers', label: t('landing.nav.api', 'API'), isRoute: true },
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
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-blue-700 transition-colors hover:text-blue-600">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="landing-display">RoboHire</span>
        </Link>

        <div className="hidden items-center gap-2 lg:flex">
          {navLinks.map((link) => (
            link.isRoute ? (
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
              to="/dashboard"
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
                to="/start-hiring"
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
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => (
              link.isRoute ? (
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
                to="/dashboard"
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
                  to="/start-hiring"
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
