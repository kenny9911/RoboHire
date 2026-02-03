import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { FormDataProvider } from './context/FormDataContext';
import MatchResume from './pages/MatchResume';
import InviteCandidate from './pages/InviteCandidate';
import ParseResume from './pages/ParseResume';
import ParseJD from './pages/ParseJD';
import EvaluateInterview from './pages/EvaluateInterview';

const navItems = [
  { path: '/', label: 'Match Resume', icon: '🎯' },
  { path: '/invite', label: 'Invite Candidate', icon: '✉️' },
  { path: '/evaluate', label: 'Evaluate Interview', icon: '📊' },
  { path: '/parse-resume', label: 'Parse Resume', icon: '📄' },
  { path: '/parse-jd', label: 'Parse JD', icon: '📋' },
];

function App() {
  const location = useLocation();

  return (
    <FormDataProvider>
      <div className="min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-lg">
          <div className="p-6 border-b">
            <h1 className="text-xl font-bold text-indigo-600">GoHire API</h1>
            <p className="text-sm text-gray-500">Admin Dashboard</p>
          </div>
          <nav className="p-4">
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      location.pathname === item.path
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-auto">
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
