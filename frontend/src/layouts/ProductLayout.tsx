import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSelector from '../components/LanguageSelector';
import { FloatingAgentAlex } from '../components/agent-alex/FloatingAgentAlex';

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
        path: '/product/hiring', labelKey: 'product.nav.pipeline', fallback: 'Pipeline',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>,
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
    items: [
      {
        path: '/product/contacts', labelKey: 'product.nav.contacts', fallback: 'Contacts',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" /></svg>,
      },
      {
        path: '/product/tasks', labelKey: 'product.nav.tasks', fallback: 'Tasks',
        icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
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
        {navGroups.map((group, gi) => (
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
                    className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <span className={`shrink-0 ${active ? 'text-blue-600' : 'text-slate-500'}`}>{item.icon}</span>
                    {!collapsed && <span className="flex-1">{t(item.labelKey, item.fallback)}</span>}
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

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>

      <FloatingAgentAlex />
    </div>
  );
}
