import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import LanguageSelector from '../components/LanguageSelector';

type NotificationType = 'match' | 'invitation' | 'interview';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string;
  requestId: string;
}

interface HiringRequestSummary {
  id: string;
  title: string;
}

interface HiringRequestDetail extends HiringRequestSummary {
  candidates?: Candidate[];
}

interface Candidate {
  id: string;
  name?: string | null;
  email?: string | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const MAX_NOTIFICATION_REQUESTS = 5;
const MAX_NOTIFICATION_ITEMS = 8;

const isInterviewStatus = (status?: string | null) =>
  status === 'interviewed' || status === 'shortlisted' || status === 'rejected';

const formatRelativeTime = (
  timestamp: string,
  t: (key: string, fallback: string, options?: Record<string, unknown>) => string,
) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('notifications.justNow', 'just now');
  if (minutes < 60) return t('notifications.minutesAgo', '{{count}}m ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.hoursAgo', '{{count}}h ago', { count: hours });
  const days = Math.floor(hours / 24);
  return t('notifications.daysAgo', '{{count}}d ago', { count: days });
};

const getNotificationIcon = (type: NotificationType) => {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center';
  switch (type) {
    case 'invitation':
      return (
        <div className={`${base} bg-amber-100 text-amber-700`}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8V7a2 2 0 00-2-2H5a2 2 0 00-2 2v1m18 0v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0l-9 6-9-6" />
          </svg>
        </div>
      );
    case 'interview':
      return (
        <div className={`${base} bg-emerald-100 text-emerald-700`}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    default:
      return (
        <div className={`${base} bg-indigo-100 text-indigo-700`}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
  }
};

const navItems = [
  {
    path: '/dashboard',
    labelKey: 'dashboard.nav.dashboard',
    fallback: 'Overview',
    exact: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    path: '/dashboard/api-keys',
    labelKey: 'dashboard.nav.apiKeys',
    fallback: 'API Keys',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    path: '/dashboard/usage',
    labelKey: 'dashboard.nav.usage',
    fallback: 'Usage',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    path: '/dashboard/stats',
    labelKey: 'dashboard.nav.stats',
    fallback: 'Statistics',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    path: '/dashboard/account',
    labelKey: 'dashboard.nav.account',
    fallback: 'Account',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

const secondaryLinks = [
  { path: '/start-hiring', labelKey: 'dashboard.nav.newHiring', fallback: 'Start Hiring' },
  { path: '/api-playground', labelKey: 'dashboard.nav.apiPlayground', fallback: 'API Playground' },
  { path: '/docs', labelKey: 'dashboard.nav.docs', fallback: 'Documentation' },
  { path: '/developers', labelKey: 'dashboard.nav.developers', fallback: 'Developers' },
];

const PLAN_LIMITS: Record<string, { interviews: number; matches: number }> = {
  free: { interviews: 0, matches: 0 },
  starter: { interviews: 15, matches: 30 },
  growth: { interviews: 120, matches: 240 },
  business: { interviews: 280, matches: 500 },
  custom: { interviews: Infinity, matches: Infinity },
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  business: 'Business',
  custom: 'Enterprise',
  enterprise: 'Enterprise',
};

function getPageTitle(
  pathname: string,
  t: (key: string, fallback: string) => string,
): string {
  if (pathname.startsWith('/dashboard/requests/')) return t('dashboard.detail.title', 'Request Details');
  if (pathname === '/dashboard/api-keys') return t('apiKeys.title', 'API Keys');
  if (pathname === '/dashboard/usage') return t('dashboard.nav.usage', 'Usage');
  if (pathname === '/dashboard/stats') return t('dashboard.nav.stats', 'Statistics');
  if (pathname === '/dashboard/account') return t('dashboard.nav.account', 'Account');
  if (pathname === '/dashboard/admin') return 'Admin';
  return t('dashboard.nav.dashboard', 'Overview');
}

export default function DashboardLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [usageSummaryOpen, setUsageSummaryOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const usageSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!notificationsOpen) return;
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!usageSummaryOpen) return;
      if (usageSummaryRef.current && !usageSummaryRef.current.contains(event.target as Node)) {
        setUsageSummaryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [usageSummaryOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const loadNotifications = async () => {
    if (notificationsLoaded || isLoadingNotifications) return;
    setIsLoadingNotifications(true);
    setNotificationsError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests?limit=20`, {
        headers,
        credentials: 'include',
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to load requests');

      const requests: HiringRequestSummary[] = (data.data || []).slice(0, MAX_NOTIFICATION_REQUESTS);
      const detailResponses = await Promise.all(
        requests.map((r) =>
          fetch(`${API_BASE}/api/v1/hiring-requests/${r.id}`, { headers, credentials: 'include' }),
        ),
      );
      const detailData = await Promise.all(detailResponses.map((res) => res.json()));
      const items: NotificationItem[] = detailData.flatMap(
        (detail: { success: boolean; data?: HiringRequestDetail }) => {
          if (!detail?.success || !detail.data) return [];
          const rd = detail.data;
          const requestTitle = rd.title || t('dashboard.requests.title', 'Hiring Request');
          return (rd.candidates || []).map((c) => {
            const name = c.name || c.email || t('notifications.candidate', 'Candidate');
            const type: NotificationType = c.status === 'screening'
              ? 'invitation'
              : isInterviewStatus(c.status) ? 'interview' : 'match';
            return {
              id: `${c.id}-${type}`,
              type,
              title: t(`notifications.${type}`, type),
              description: t('notifications.subtitle', '{{name}} · {{request}}', { name, request: requestTitle }),
              timestamp: c.updatedAt || c.createdAt || new Date().toISOString(),
              requestId: rd.id,
            };
          });
        },
      );
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setNotifications(items.slice(0, MAX_NOTIFICATION_ITEMS));
      setNotificationsLoaded(true);
    } catch (err) {
      setNotificationsError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const toggleNotifications = () => {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (next) void loadNotifications();
  };

  const hasNotifications = notifications.length > 0;
  const tier = (user?.subscriptionTier || 'free').toLowerCase();
  const tierLabel = PLAN_LABELS[tier] || tier.charAt(0).toUpperCase() + tier.slice(1);
  const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free;
  const interviewsUsed = user?.interviewsUsed ?? 0;
  const resumeMatchesUsed = user?.resumeMatchesUsed ?? 0;
  const interviewRemaining = limits.interviews === Infinity ? '∞' : String(Math.max(0, limits.interviews - interviewsUsed));
  const resumeMatchRemaining = limits.matches === Infinity ? '∞' : String(Math.max(0, limits.matches - resumeMatchesUsed));
  const creditBalance = (user?.topUpBalance ?? 0).toFixed(2);

  const isActive = (path: string, exact?: boolean) => {
    if (exact) {
      return location.pathname === path || location.pathname.startsWith('/dashboard/requests');
    }
    return location.pathname === path;
  };

  const pageTitle = getPageTitle(location.pathname, t);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-semibold text-indigo-600">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>RoboHire</span>
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
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className={active ? 'text-indigo-600' : 'text-gray-400'}>{item.icon}</span>
                {t(item.labelKey, item.fallback)}
              </Link>
            );
          })}
          {user?.role === 'admin' && (
            <Link
              to="/dashboard/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive('/dashboard/admin')
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className={isActive('/dashboard/admin') ? 'text-indigo-600' : 'text-gray-400'}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              Admin
            </Link>
          )}
        </div>

        {/* Separator */}
        <div className="my-4 border-t border-gray-200" />

        {/* Secondary links */}
        <div className="space-y-1">
          {secondaryLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {t(item.labelKey, item.fallback)}
            </Link>
          ))}
        </div>
      </nav>

      {/* User section */}
      <div className="border-t border-gray-200 px-3 py-4">
        <div className="relative mb-3" ref={usageSummaryRef}>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/account"
              onClick={() => setUsageSummaryOpen(false)}
              className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 -my-1 transition-colors hover:bg-gray-100"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="h-9 w-9 rounded-full" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100">
                  <span className="text-sm font-medium text-indigo-600">
                    {user?.name?.[0] || user?.email?.[0] || 'U'}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                <p className="truncate text-xs text-gray-500">{user?.email}</p>
                <p className="mt-1 text-[11px] font-semibold tracking-wide text-indigo-600">
                  {tierLabel}
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setUsageSummaryOpen((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
              aria-label={t('dashboard.accountUsage', 'View usage and credit')}
              aria-expanded={usageSummaryOpen}
              title={t('dashboard.accountUsage', 'View usage and credit')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 20h16M7 16V8m5 8V4m5 12v-6" />
              </svg>
            </button>
          </div>
          {usageSummaryOpen && (
            <div className="absolute bottom-full right-0 z-20 mb-2 w-60 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.75)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('dashboard.quickUsage', 'Quick Usage')}
              </p>
              <div className="mt-2 space-y-2 text-xs text-gray-600">
                <div className="flex items-center justify-between gap-3">
                  <span>{t('dashboard.interviews', 'Interviews')}</span>
                  <span className="font-medium text-gray-900">
                    {interviewsUsed} {t('dashboard.used', 'used')} / {interviewRemaining} {t('dashboard.unused', 'unused')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t('dashboard.resumeMatches', 'Resume Matches')}</span>
                  <span className="font-medium text-gray-900">
                    {resumeMatchesUsed} {t('dashboard.used', 'used')} / {resumeMatchRemaining} {t('dashboard.unused', 'unused')}
                  </span>
                </div>
                <div className="my-1 border-t border-gray-100" />
                <div className="flex items-center justify-between gap-3">
                  <span>{t('dashboard.creditBalance', 'Credit Balance')}</span>
                  <span className="font-semibold text-emerald-700">${creditBalance}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar -- mobile: slide-over, desktop: static */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto lg:h-screen lg:sticky lg:top-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200">
          <div className="flex items-center justify-between h-14 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-1.5 -ml-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-base font-semibold text-gray-900">{pageTitle}</h1>
            </div>

            <div className="flex items-center gap-2">
              <LanguageSelector variant="compact" />

              {/* Notifications */}
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={toggleNotifications}
                  className="relative w-9 h-9 rounded-full border border-gray-200 bg-white hover:border-indigo-300 text-gray-500 hover:text-indigo-600 transition-colors flex items-center justify-center"
                  aria-label={t('notifications.title', 'Notifications')}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0h6z" />
                  </svg>
                  {hasNotifications && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-100 shadow-lg rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">
                        {t('notifications.title', 'Notifications')}
                      </span>
                      <span className="text-xs text-gray-400">{notifications.length}</span>
                    </div>

                    {isLoadingNotifications ? (
                      <div className="p-6 text-center text-sm text-gray-500">
                        {t('dashboard.loading', 'Loading...')}
                      </div>
                    ) : notificationsError ? (
                      <div className="p-4 text-sm text-rose-500">{notificationsError}</div>
                    ) : notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-gray-500">
                        {t('notifications.empty', 'You are all caught up.')}
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => {
                              setNotificationsOpen(false);
                              navigate(`/dashboard/requests/${n.requestId}`);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3"
                          >
                            {getNotificationIcon(n.type)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900">{n.title}</p>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                  {formatRelativeTime(n.timestamp, t)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">{n.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
