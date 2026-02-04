import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

const navItems = [
  { path: '/api-playground/match-resume', labelKey: 'nav.matchResume', icon: '🎯' },
  { path: '/api-playground/invite', labelKey: 'nav.inviteCandidate', icon: '📧' },
  { path: '/api-playground/evaluate', labelKey: 'nav.evaluateInterview', icon: '📊' },
  { path: '/api-playground/parse-resume', labelKey: 'nav.parseResume', icon: '📄' },
  { path: '/api-playground/parse-jd', labelKey: 'nav.parseJd', icon: '📋' },
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
          <Link to="/" className="flex items-center gap-2 text-lg sm:text-xl font-bold text-indigo-600">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{t('app.title')}</span>
          </Link>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">{t('apiPlayground.title', 'API Playground')}</p>
        </div>

        {/* User Info */}
        {user ? (
          <div className="px-4 sm:px-6 py-4 border-b bg-gray-50">
            <div className="flex items-center gap-3">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-indigo-600 font-medium">
                    {user.name?.[0] || user.email?.[0] || 'U'}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-4 border-b bg-gray-50">
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              {t('apiPlayground.signIn', 'Sign In')}
            </Link>
          </div>
        )}

        {/* Quick Links */}
        <div className="px-4 sm:px-6 py-3 border-b">
          <div className="flex gap-2">
            <Link
              to="/dashboard"
              className="flex-1 text-center px-3 py-2 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              {t('apiPlayground.dashboard', 'Dashboard')}
            </Link>
            <Link
              to="/start-hiring"
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
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg transition-colors whitespace-nowrap text-sm ${
                    location.pathname === item.path
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span className="font-medium">{t(item.labelKey)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Language Switcher */}
        <div className="border-t">
          <LanguageSwitcher />
        </div>

        {/* Logout - only show if logged in */}
        {user && (
          <div className="p-4 border-t">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('apiPlayground.logout', 'Logout')}
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
