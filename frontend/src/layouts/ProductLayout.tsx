import { useEffect, useState, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSelector from '../components/LanguageSelector';
import { FloatingAgentAlex } from '../components/agent-alex/FloatingAgentAlex';
import axios from '../lib/axios';

interface NavItem {
  path: string;
  labelKey: string;
  fallback: string;
  exact?: boolean;
  icon: React.ReactNode;
  ai?: boolean;
  roles?: string[]; // if set, only show for these roles
}

interface NavGroup {
  categoryKey: string;
  categoryFallback: string;
  roles?: string[]; // if set, entire category is only shown for these roles
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    categoryKey: 'product.nav.category.main',
    categoryFallback: 'Main Menu',
    items: [
      {
        path: '/product', labelKey: 'product.nav.dashboard', fallback: 'Dashboard', exact: true,
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>,
      },
      {
        path: '/product/talent', labelKey: 'product.nav.candidates', fallback: 'Candidates',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
      },
      {
        path: '/product/jobs', labelKey: 'product.nav.jobs', fallback: 'Jobs',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
      },
    ],
  },
  {
    categoryKey: 'product.nav.category.ai',
    categoryFallback: 'AI',
    items: [
      {
        path: '/product/agents', labelKey: 'product.nav.agents', fallback: 'AI Agents',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>,
      },
      {
        path: '/product/matching', labelKey: 'product.nav.smartMatching', fallback: 'AI Screening',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
      },
      {
        path: '/product/interview', labelKey: 'product.nav.aiInterview', fallback: 'AI Interview',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
      },
      {
        path: '/product/interview-hub', labelKey: 'product.nav.interviewHub', fallback: 'Interview Hub',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
        roles: ['admin', 'internal'],
      },
      {
        path: '/product/evaluations', labelKey: 'product.nav.evaluations', fallback: 'AI Evaluations',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
      },
      {
        path: '/product/quick-invite', labelKey: 'product.nav.quickInvite', fallback: 'Instant Invite',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>,
      },
    ],
  },
  {
    categoryKey: 'product.nav.category.client',
    categoryFallback: 'Client Management',
    roles: ['agency', 'admin'],
    items: [
      {
        path: '/product/contacts', labelKey: 'product.nav.contacts', fallback: 'Contacts',
        roles: ['agency', 'admin'],
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" /></svg>,
      },
    ],
  },
  {
    categoryKey: 'product.nav.category.system',
    categoryFallback: 'System',
    items: [
      {
        path: '/product/profile', labelKey: 'product.nav.settings', fallback: 'Settings',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      },
    ],
  },
];


export default function ProductLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [taskCount, setTaskCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Fetch task stats and notification count
  const fetchCounts = useCallback(async () => {
    try {
      const [statsRes, notifRes] = await Promise.all([
        axios.get('/api/v1/tasks/stats').catch(() => null),
        axios.get('/api/v1/tasks/notifications/unread-count').catch(() => null),
      ]);
      if (statsRes?.data?.stats) setTaskCount(statsRes.data.stats.actionRequired || 0);
      if (notifRes?.data) setUnreadNotifications(notifRes.data.count || 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void fetchCounts();
    const interval = setInterval(fetchCounts, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchCounts]);

  const openNotifications = async () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      try {
        const res = await axios.get('/api/v1/tasks/notifications/list', { params: { limit: '10' } });
        setNotifications(res.data.notifications || []);
      } catch { /* silent */ }
    }
  };

  const markAllRead = async () => {
    try {
      await axios.post('/api/v1/tasks/notifications/mark-all-read');
      setUnreadNotifications(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch { /* silent */ }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await axios.patch(`/api/v1/tasks/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadNotifications((prev) => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={`py-5 ${collapsed ? 'px-3 flex justify-center' : 'px-5'}`}>
        <Link to="/" className="inline-flex items-center transition-opacity hover:opacity-80">
          <img src="/logo2.png" alt="RoboHire" className={collapsed ? 'h-6' : 'h-7'} />
        </Link>
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 px-3 mt-2 overflow-y-auto">
        {navGroups
          .filter((group) => !group.roles || group.roles.includes(user?.role || 'user'))
          .map((group, gi) => (
          <div key={group.categoryKey}>
            {gi > 0 && <div className="my-3 border-t border-slate-200" />}
            {!collapsed && (
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t(group.categoryKey, group.categoryFallback)}
              </p>
            )}
            {collapsed && gi > 0 && <div className="h-1" />}
            <div className="space-y-0.5">
              {group.items.filter((item) => !item.roles || item.roles.includes(user?.role || 'user')).map((item) => {
                const active = isActive(item.path, item.exact);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={collapsed ? t(item.labelKey, item.fallback) : undefined}
                    className={`relative flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <span className={`shrink-0 ${active ? 'text-blue-600' : 'text-slate-500'}`}>{item.icon}</span>
                    {!collapsed && <span className="flex-1">{t(item.labelKey, item.fallback)}</span>}
                    {/* Task count badge */}
                    {item.path === '/product/tasks' && taskCount > 0 && !collapsed && (
                      <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white min-w-[18px] text-center">
                        {taskCount > 99 ? '99+' : taskCount}
                      </span>
                    )}
                    {item.path === '/product/tasks' && taskCount > 0 && collapsed && (
                      <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500" />
                    )}
                      </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Admin link (admin only) */}
        {user?.role === 'admin' && (
          <div className="mt-1">
            <Link
              to="/product/admin"
              title={collapsed ? t('product.nav.admin', 'Admin') : undefined}
              className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive('/product/admin')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <span className={`shrink-0 ${isActive('/product/admin') ? 'text-blue-600' : 'text-slate-500'}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              {!collapsed && <span className="flex-1">{t('product.nav.admin', 'Admin')}</span>}
            </Link>
          </div>
        )}

        {/* Agent Manager — admin has full access, internal has read-only.
            Shown separately so internal users (who don't see the full admin
            dashboard) still have an entry point to the manager. Admins see
            both links; the Agent Manager link gives them a faster shortcut
            past the admin dashboard tab shuffle. */}
        {(user?.role === 'admin' || user?.role === 'internal') && (
          <div className="mt-1">
            <Link
              to="/product/admin/agent-manager"
              title={collapsed ? t('product.nav.agentManager', 'Agent Manager') : undefined}
              className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive('/product/admin/agent-manager')
                  ? 'bg-violet-50 text-violet-700'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <span className={`shrink-0 ${isActive('/product/admin/agent-manager') ? 'text-violet-600' : 'text-slate-500'}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              {!collapsed && (
                <span className="flex-1">
                  {t('product.nav.agentManager', 'Agent Manager')}
                  {user?.role === 'internal' && (
                    <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                      {t('product.nav.readOnly', 'view')}
                    </span>
                  )}
                </span>
              )}
            </Link>
          </div>
        )}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className="hidden lg:flex border-t border-slate-200 px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center ${collapsed ? 'justify-center w-full' : 'justify-center w-full'} gap-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors`}
          title={collapsed ? t('product.nav.expandSidebar', 'Expand sidebar') : t('product.nav.collapseSidebar', 'Collapse sidebar')}
        >
          <svg className={`w-5 h-5 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* User section */}
      <div className="border-t border-slate-200 px-3 py-4">
        <Link
          to="/product/profile"
          title={collapsed ? (user?.name || 'User') : undefined}
          className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 -my-1 transition-colors hover:bg-slate-100`}
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="h-9 w-9 rounded-full shrink-0" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 shrink-0">
              <span className="text-sm font-medium text-blue-600">
                {user?.name?.[0] || user?.email?.[0] || 'U'}
              </span>
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user?.name || 'User'}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          )}
        </Link>
        <button
          onClick={handleLogout}
          title={collapsed ? t('dashboard.logout', 'Logout') : undefined}
          className={`mt-2 w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors`}
        >
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && t('dashboard.logout', 'Logout')}
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
        className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200/80 flex flex-col transform transition-all duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto lg:h-screen lg:sticky lg:top-0 ${
          collapsed ? 'lg:w-[4.5rem] w-52' : 'w-52'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        {/* Mobile-only top bar */}
        <header className="sticky top-0 z-30 landing-glass border-b border-slate-200/80 lg:hidden">
          <div className="flex items-center justify-between h-12 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <LanguageSelector variant="compact" />
          </div>
        </header>

        {/* Desktop notification bell (top-right) */}
        <div className="hidden lg:flex items-center justify-end px-6 py-2 gap-2">
          {/* Tasks icon — to the left of the notifications bell */}
          <Link
            to="/product/tasks"
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title={t('product.nav.tasks', 'Tasks')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            {taskCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] flex items-center justify-center rounded-full text-[9px] font-bold bg-red-500 text-white px-1">
                {taskCount > 99 ? '99+' : taskCount}
              </span>
            )}
          </Link>
          <div className="relative">
            <button
              onClick={openNotifications}
              className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title={t('notifications.title', 'Notifications')}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] flex items-center justify-center rounded-full text-[9px] font-bold bg-red-500 text-white px-1">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div className="absolute right-0 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900">{t('notifications.title', 'Notifications')}</h3>
                    {unreadNotifications > 0 && (
                      <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        {t('notifications.markAllRead', 'Mark all read')}
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-400">
                        {t('notifications.empty', 'No notifications')}
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.read) void markNotificationRead(n.id);
                            if (n.actionUrl) { navigate(n.actionUrl); setShowNotifications(false); }
                          }}
                          className={`px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read && <div className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm ${!n.read ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{n.title}</p>
                              {n.message && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{n.message}</p>}
                              <p className="text-[10px] text-slate-400 mt-1">
                                {new Date(n.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <Link
                    to="/product/tasks"
                    onClick={() => setShowNotifications(false)}
                    className="block text-center py-2.5 text-xs font-medium text-blue-600 hover:bg-blue-50 border-t border-slate-100"
                  >
                    {t('notifications.viewAll', 'View all tasks')}
                  </Link>
                </div>
              </>
            )}
          </div>
          <LanguageSelector variant="compact" />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>

      <FloatingAgentAlex />
    </div>
  );
}
