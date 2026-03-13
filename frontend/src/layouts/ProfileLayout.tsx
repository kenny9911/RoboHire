import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  path: string;
  labelKey: string;
  fallback: string;
  exact?: boolean;
  icon: React.ReactNode;
}

interface NavSection {
  labelKey: string;
  fallback: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    labelKey: 'product.settings.user',
    fallback: 'User',
    items: [
      {
        path: '/product/profile',
        labelKey: 'product.settings.general',
        fallback: 'General',
        exact: true,
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
      },
      {
        path: '/product/profile/security',
        labelKey: 'product.settings.security',
        fallback: 'Security',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      },
    ],
  },
  {
    labelKey: 'product.settings.account',
    fallback: 'Account',
    items: [
      {
        path: '/product/profile/usage',
        labelKey: 'product.settings.usage',
        fallback: 'Usage & Billing',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        path: '/product/profile/api-keys',
        labelKey: 'product.settings.apiKeys',
        fallback: 'API Keys',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        ),
      },
    ],
  },
  {
    labelKey: 'product.settings.workspace',
    fallback: 'Workspace',
    items: [
      {
        path: '/product/profile/integrations',
        labelKey: 'product.settings.integrations',
        fallback: 'ATS Integrations',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        ),
      },
    ],
  },
];

export default function ProfileLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const tierLabel: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    growth: 'Growth',
    business: 'Business',
    custom: 'Custom',
  };

  const tier = user?.subscriptionTier || 'free';

  return (
    <div className="flex gap-0 -m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        {/* User mini-card */}
        <div className="px-4 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="h-9 w-9 rounded-full" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
                <span className="text-sm font-semibold text-blue-600">
                  {user?.name?.[0] || user?.email?.[0] || 'U'}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user?.name || 'User'}</p>
              <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 rounded">
                {tierLabel[tier] || tier}
              </span>
            </div>
          </div>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {sections.map((section, idx) => (
            <div key={section.labelKey} className={idx > 0 ? 'mt-5' : ''}>
              <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t(section.labelKey, section.fallback)}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.path, item.exact);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                        active
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span className={active ? 'text-blue-600' : 'text-slate-400'}>{item.icon}</span>
                      {t(item.labelKey, item.fallback)}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile nav (horizontal tabs) */}
      <div className="md:hidden fixed top-14 left-0 right-0 z-20 bg-white border-b border-slate-200 overflow-x-auto">
        <div className="flex px-4 gap-1 py-2">
          {sections.flatMap((section) =>
            section.items.map((item) => {
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  {t(item.labelKey, item.fallback)}
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8 md:pt-6 pt-16">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
