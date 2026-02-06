import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import LanguageSelector from '../LanguageSelector';

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

const formatRelativeTime = (timestamp: string, t: (key: string, fallback: string, options?: Record<string, unknown>) => string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return t('notifications.justNow', 'just now');
  }
  if (minutes < 60) {
    return t('notifications.minutesAgo', '{{count}}m ago', { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('notifications.hoursAgo', '{{count}}h ago', { count: hours });
  }
  const days = Math.floor(hours / 24);
  return t('notifications.daysAgo', '{{count}}d ago', { count: days });
};

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'invitation':
      return (
        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8V7a2 2 0 00-2-2H5a2 2 0 00-2 2v1m18 0v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0l-9 6-9-6" />
          </svg>
        </div>
      );
    case 'interview':
      return (
        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
  }
};

const getNavLinkClass = (isActive: boolean) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'}`;

export default function DashboardHeader() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const isDashboardActive =
    location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/requests');
  const isStatsActive = location.pathname.startsWith('/dashboard/stats');

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

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const loadNotifications = async () => {
    if (notificationsLoaded || isLoadingNotifications) {
      return;
    }

    setIsLoadingNotifications(true);
    setNotificationsError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests?limit=20`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to load requests');
      }

      const requests: HiringRequestSummary[] = (data.data || []).slice(0, MAX_NOTIFICATION_REQUESTS);
      const detailResponses = await Promise.all(
        requests.map((request) =>
          fetch(`${API_BASE}/api/v1/hiring-requests/${request.id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            credentials: 'include',
          })
        )
      );

      const detailData = await Promise.all(detailResponses.map((res) => res.json()));
      const items: NotificationItem[] = detailData.flatMap((detail: { success: boolean; data?: HiringRequestDetail }) => {
        if (!detail?.success || !detail.data) {
          return [];
        }
        const requestData = detail.data;
        const requestTitle = requestData.title || t('dashboard.requests.title', 'Hiring Request');
        const candidates = requestData.candidates || [];
        return candidates.map((candidate) => {
          const candidateName = candidate.name || candidate.email || t('notifications.candidate', 'Candidate');
          const type: NotificationType = candidate.status === 'screening'
            ? 'invitation'
            : isInterviewStatus(candidate.status)
              ? 'interview'
              : 'match';
          const timestamp = candidate.updatedAt || candidate.createdAt || new Date().toISOString();
          return {
            id: `${candidate.id}-${type}`,
            type,
            title: t(`notifications.${type}`, type),
            description: t('notifications.subtitle', '{{name}} · {{request}}', {
              name: candidateName,
              request: requestTitle,
            }),
            timestamp,
            requestId: requestData.id,
          };
        });
      });

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setNotifications(items.slice(0, MAX_NOTIFICATION_ITEMS));
      setNotificationsLoaded(true);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Failed to load notifications');
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen) {
      void loadNotifications();
    }
  };

  const hasNotifications = notifications.length > 0;

  return (
    <header className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-indigo-600">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>RoboHire</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link to="/dashboard" className={getNavLinkClass(isDashboardActive)}>
              {t('dashboard.nav.dashboard', 'Dashboard')}
            </Link>
            <Link to="/dashboard/stats" className={getNavLinkClass(isStatsActive)}>
              {t('dashboard.nav.stats', 'Statistics')}
            </Link>
            <Link to="/start-hiring" className={getNavLinkClass(location.pathname === '/start-hiring')}>
              {t('dashboard.nav.newHiring', 'New Hiring')}
            </Link>
            <Link to="/dashboard/api-keys" className={getNavLinkClass(location.pathname === '/dashboard/api-keys')}>
              {t('dashboard.nav.apiKeys', 'API Keys')}
            </Link>
            <Link to="/api-playground" className={getNavLinkClass(location.pathname.startsWith('/api-playground'))}>
              {t('dashboard.nav.apiPlayground', 'API Playground')}
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageSelector variant="compact" />

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
                <div className="absolute right-0 mt-3 w-80 bg-white border border-gray-100 shadow-lg rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                      {t('notifications.title', 'Notifications')}
                    </span>
                    <span className="text-xs text-gray-400">
                      {notifications.length}
                    </span>
                  </div>

                  {isLoadingNotifications ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      {t('dashboard.loading', 'Loading...')}
                    </div>
                  ) : notificationsError ? (
                    <div className="p-4 text-sm text-rose-500">
                      {notificationsError}
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      {t('notifications.empty', 'You are all caught up.')}
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map((notification) => (
                        <button
                          key={notification.id}
                          onClick={() => {
                            setNotificationsOpen(false);
                            navigate(`/dashboard/requests/${notification.requestId}`);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3"
                        >
                          {getNotificationIcon(notification.type)}
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900">
                                {notification.title}
                              </p>
                              <span className="text-xs text-gray-400">
                                {formatRelativeTime(notification.timestamp, t)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {notification.description}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                    {t('notifications.viewAll', 'View all activity')}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-indigo-600 font-medium text-xs">
                    {user?.name?.[0] || user?.email?.[0] || 'U'}
                  </span>
                </div>
              )}
              <span className="hidden sm:block text-xs text-gray-700 font-medium">
                {user?.name || user?.email}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-rose-500 transition-colors"
              title={t('dashboard.logout', 'Logout')}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
