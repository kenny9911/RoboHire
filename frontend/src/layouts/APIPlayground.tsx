import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { getEffectiveInterviewLimit, getEffectiveMatchLimit } from '../utils/usageLimits';

type UsageKey = 'matches' | 'interviews';

const navItems: Array<{ path: string; labelKey: string; usageKey?: UsageKey }> = [
  { path: '/api-playground/match-resume', labelKey: 'nav.matchResume', usageKey: 'matches' },
  { path: '/api-playground/invite', labelKey: 'nav.inviteCandidate', usageKey: 'interviews' },
  { path: '/api-playground/evaluate', labelKey: 'nav.evaluateInterview' },
  { path: '/api-playground/parse-resume', labelKey: 'nav.parseResume' },
  { path: '/api-playground/parse-jd', labelKey: 'nav.parseJd' },
  { path: '/api-playground/agents', labelKey: 'nav.agents' },
];

export default function APIPlayground() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white shadow-lg md:min-h-screen flex flex-col">
        <div className="p-4 sm:p-6 border-b">
          <Link to="/" className="inline-flex items-center transition-opacity hover:opacity-80">
            <img src="/logo2.png" alt="RoboHire" className="h-7" />
          </Link>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">{t('apiPlayground.title', 'API Playground')}</p>
        </div>

        {/* Quick Links */}
        <div className="px-4 sm:px-6 py-3 border-b">
          <div className="flex gap-2">
            <Link
              to="/product"
              className="flex-1 text-center px-3 py-2 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              {t('apiPlayground.dashboard', 'Dashboard')}
            </Link>
            <Link
              to="/agent-alex"
              state={{ fresh: true }}
              className="flex-1 text-center px-3 py-2 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              {t('apiPlayground.startHiring', 'Start Hiring')}
            </Link>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 sm:p-4 overflow-auto">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('apiPlayground.endpoints', 'API Endpoints')}
          </p>
          <ul className="flex flex-row md:flex-col gap-2 md:gap-0 md:space-y-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {navItems.map((item) => {
              let usageBadge: React.ReactNode = null;

              if (user && item.usageKey) {
                const limit = item.usageKey === 'matches'
                  ? getEffectiveMatchLimit(user)
                  : getEffectiveInterviewLimit(user);
                const used = item.usageKey === 'matches'
                  ? (user.resumeMatchesUsed ?? 0)
                  : (user.interviewsUsed ?? 0);

                if (limit != null) {
                  const remaining = Math.max(0, limit - used);
                  usageBadge = (
                    <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
                      remaining === 0
                        ? 'bg-red-100 text-red-600'
                        : remaining <= Math.ceil(limit * 0.2)
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                    }`}>
                      {remaining}/{limit}
                    </span>
                  );
                }
              }

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg transition-colors whitespace-nowrap text-sm font-medium ${
                      location.pathname === item.path
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t(item.labelKey)}
                    {usageBadge}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Language Switcher */}
        <div className="border-t">
          <LanguageSwitcher className="px-4 sm:px-6 py-4" />
        </div>

        {/* User section */}
        <div className="border-t border-gray-200 px-3 py-4">
          {user ? (
            <>
              <Link
                to="/dashboard/account"
                className="flex items-center gap-3 px-3 mb-3 rounded-lg py-2 -my-1 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="w-9 h-9 rounded-full" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-indigo-600 font-medium text-sm">
                      {user.name?.[0] || user.email?.[0] || 'U'}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.name || 'User'}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {t('apiPlayground.logout', 'Logout')}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              {t('apiPlayground.signIn', 'Sign In')}
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
        {!user && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm">
              <p className="font-medium text-amber-800">
                {t('apiPlayground.authRequired', 'Authentication Required')}
              </p>
              <p className="mt-1 text-amber-700">
                {t(
                  'apiPlayground.authRequiredDesc',
                  'These API endpoints require authentication. Sign in to try them from the browser, or use an API Key (X-API-Key header) for programmatic access.'
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  to="/login"
                  className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                >
                  {t('apiPlayground.signIn', 'Sign In')}
                </Link>
                <Link
                  to="/dashboard/api-keys"
                  className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-300 hover:bg-amber-50 transition-colors"
                >
                  {t('apiPlayground.getApiKey', 'Get an API Key')}
                </Link>
              </div>
            </div>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
