import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FormDataProvider } from './context/FormDataContext';
import MatchResume from './pages/MatchResume';
import InviteCandidate from './pages/InviteCandidate';
import ParseResume from './pages/ParseResume';
import ParseJD from './pages/ParseJD';
import EvaluateInterview from './pages/EvaluateInterview';
import LanguageSwitcher from './components/LanguageSwitcher';

const navItems = [
  { path: '/', labelKey: 'nav.matchResume' },
  { path: '/invite', labelKey: 'nav.inviteCandidate' },
  { path: '/evaluate', labelKey: 'nav.evaluateInterview' },
  { path: '/parse-resume', labelKey: 'nav.parseResume' },
  { path: '/parse-jd', labelKey: 'nav.parseJd' },
];

function App() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <FormDataProvider>
      <div className="min-h-screen flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-white shadow-lg md:min-h-screen">
          <div className="p-4 sm:p-6 border-b">
            <h1 className="text-lg sm:text-xl font-bold text-indigo-600">{t('app.title')}</h1>
            <p className="text-xs sm:text-sm text-gray-500">{t('app.subtitle')}</p>
          </div>
          <LanguageSwitcher />
          <nav className="p-2 sm:p-4">
            <ul className="flex flex-row md:flex-col gap-2 md:gap-0 md:space-y-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
              {navItems.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center px-3 py-2 sm:px-4 sm:py-3 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base ${
                      location.pathname === item.path
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-medium">{t(item.labelKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<MatchResume />} />
            <Route path="/invite" element={<InviteCandidate />} />
            <Route path="/parse-resume" element={<ParseResume />} />
            <Route path="/parse-jd" element={<ParseJD />} />
            <Route path="/evaluate" element={<EvaluateInterview />} />
          </Routes>
        </main>
      </div>
    </FormDataProvider>
  );
}

export default App;
