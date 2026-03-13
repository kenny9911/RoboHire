import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSelector from '../components/LanguageSelector';

const navItems = [
  {
    path: '/product',
    labelKey: 'product.nav.dashboard',
    fallback: 'Dashboard',
    exact: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    ai: true,
  },
  {
    path: '/product/hiring',
    labelKey: 'product.nav.hiringRequests',
    fallback: 'Hiring Requests',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    path: '/product/talent',
    labelKey: 'product.nav.talentHub',
    fallback: 'Talent Hub',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    path: '/product/jobs',
    labelKey: 'product.nav.jobs',
    fallback: 'Jobs',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    ai: true,
  },
  {
    path: '/product/matching',
    labelKey: 'product.nav.smartMatching',
    fallback: 'Smart Matching',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    ai: true,
  },
  {
    path: '/product/interview',
    labelKey: 'product.nav.aiInterview',
    fallback: 'AI Interview',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    ai: true,
  },
  {
    path: '/product/evaluations',
    labelKey: 'product.nav.evaluations',
    fallback: 'Evaluations',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    ai: true,
  },
  {
    path: '/product/profile',
    labelKey: 'product.nav.settings',
    fallback: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const secondaryLinks = [
  { path: '/dashboard', labelKey: 'product.nav.devDashboard', fallback: 'Dev Dashboard' },
  { path: '/api-playground', labelKey: 'dashboard.nav.apiPlayground', fallback: 'API Playground' },
  { path: '/docs', labelKey: 'dashboard.nav.docs', fallback: 'Documentation' },
];

function getPageTitle(
  pathname: string,
  t: (key: string, fallback: string) => string,
): string {
  if (pathname === '/product/hiring') return t('product.nav.hiringRequests', 'Hiring Requests');
  if (pathname.startsWith('/product/hiring/')) return t('dashboard.detail.title', 'Request Details');
  if (pathname === '/product/talent') return t('product.nav.talentHub', 'Talent Hub');
  if (pathname.startsWith('/product/talent/')) return t('product.nav.candidateDetail', 'Candidate Detail');
  if (pathname === '/product/jobs') return t('product.nav.jobs', 'Jobs');
  if (pathname.startsWith('/product/jobs/')) return t('product.nav.jobDetail', 'Job Detail');
  if (pathname === '/product/interview') return t('product.nav.aiInterview', 'AI Interview');
  if (pathname.startsWith('/product/interview/')) return t('product.nav.interviewRoom', 'Interview Room');
  if (pathname.startsWith('/product/profile')) return t('product.nav.settings', 'Settings');
  if (pathname === '/product/admin') return t('product.nav.admin', 'Admin');
  if (pathname === '/product/matching') return t('product.nav.smartMatching', 'Smart Matching');
  if (pathname === '/product/evaluations') return t('product.nav.evaluations', 'Evaluations');
  return t('product.nav.dashboard', 'Dashboard');
}

export default function ProductLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const pageTitle = getPageTitle(location.pathname, t);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 py-5">
        <Link to="/" className="inline-flex items-center transition-opacity hover:opacity-80">
          <img src="/logo2.png" alt="RoboHire" className="h-7" />
        </Link>
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 px-3 mt-2 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className={active ? 'text-blue-600' : 'text-slate-400'}>{item.icon}</span>
                <span className="flex-1">{t(item.labelKey, item.fallback)}</span>
                {item.ai && (
                  <span className="text-[10px] font-bold tracking-wider text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">AI</span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Admin link (admin only) */}
        {user?.role === 'admin' && (
          <div className="mt-1">
            <Link
              to="/product/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive('/product/admin')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className={isActive('/product/admin') ? 'text-blue-600' : 'text-slate-400'}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <span className="flex-1">{t('product.nav.admin', 'Admin')}</span>
            </Link>
          </div>
        )}

        {/* Separator */}
        <div className="my-4 border-t border-slate-200" />

        {/* Secondary links */}
        <div className="space-y-1">
          {secondaryLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {t(item.labelKey, item.fallback)}
            </Link>
          ))}
        </div>
      </nav>

      {/* User section */}
      <div className="border-t border-slate-200 px-3 py-4">
        <Link
          to="/product/profile"
          className="flex items-center gap-3 rounded-lg px-3 py-2 -my-1 transition-colors hover:bg-slate-100"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="h-9 w-9 rounded-full" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
              <span className="text-sm font-medium text-blue-600">
                {user?.name?.[0] || user?.email?.[0] || 'U'}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user?.name || 'User'}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </Link>
        <button
          onClick={handleLogout}
          className="mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {t('dashboard.logout', 'Logout')}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/80 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto lg:h-screen lg:sticky lg:top-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 landing-glass border-b border-slate-200/80">
          <div className="flex items-center justify-between h-14 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-1.5 -ml-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-base font-semibold text-slate-900">{pageTitle}</h1>
            </div>

            <div className="flex items-center gap-2">
              <LanguageSelector variant="compact" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
