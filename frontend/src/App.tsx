import { Routes, Route, Navigate } from 'react-router-dom';
import { FormDataProvider } from './context/FormDataContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Public Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import StartHiring from './pages/StartHiring';
import APILanding from './pages/APILanding';
import Pricing from './pages/Pricing';
import RequestDemo from './pages/RequestDemo';
import QuickInvite from './pages/QuickInvite';

// Dashboard layout + pages
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import APIKeys from './pages/APIKeys';
import DashboardStats from './pages/DashboardStats';
import UsageDashboard from './pages/UsageDashboard';
import Account from './pages/Account';
import AdminDashboard from './pages/AdminDashboard';

// API Playground layout
import APIPlayground from './layouts/APIPlayground';

// API Playground Pages (existing)
import MatchResume from './pages/MatchResume';
import InviteCandidate from './pages/InviteCandidate';
import ParseResume from './pages/ParseResume';
import ParseJD from './pages/ParseJD';
import EvaluateInterview from './pages/EvaluateInterview';

// Documentation Layout and Pages
import DocsLayout from './layouts/DocsLayout';
import {
  DocsOverview,
  DocsQuickStart,
  DocsAuthentication,
  DocsMatchResume,
  DocsParseResume,
  DocsParseJD,
  DocsInviteCandidate,
  DocsEvaluateInterview,
  DocsWebhooks,
  DocsErrorHandling,
} from './pages/docs';

function App() {
  return (
    <AuthProvider>
      <FormDataProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/start-hiring" element={<StartHiring />} />
          <Route path="/developers" element={<APILanding />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/request-demo" element={<RequestDemo />} />
          <Route path="/quick-invite" element={<QuickInvite />} />

          {/* Dashboard (protected, shared sidebar layout) */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="requests/:id" element={<Dashboard />} />
            <Route path="api-keys" element={<APIKeys />} />
            <Route path="stats" element={<DashboardStats />} />
            <Route path="usage" element={<UsageDashboard />} />
            <Route path="account" element={<Account />} />
            <Route path="admin" element={<AdminDashboard />} />
          </Route>

          {/* API Playground Routes (Public) */}
          <Route path="/api-playground" element={<APIPlayground />}>
            <Route index element={<Navigate to="match-resume" replace />} />
            <Route path="match-resume" element={<MatchResume />} />
            <Route path="invite" element={<InviteCandidate />} />
            <Route path="parse-resume" element={<ParseResume />} />
            <Route path="parse-jd" element={<ParseJD />} />
            <Route path="evaluate" element={<EvaluateInterview />} />
          </Route>

          {/* Documentation Routes (Public) */}
          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<DocsOverview />} />
            <Route path="quick-start" element={<DocsQuickStart />} />
            <Route path="authentication" element={<DocsAuthentication />} />
            <Route path="api/match-resume" element={<DocsMatchResume />} />
            <Route path="api/parse-resume" element={<DocsParseResume />} />
            <Route path="api/parse-jd" element={<DocsParseJD />} />
            <Route path="api/invite-candidate" element={<DocsInviteCandidate />} />
            <Route path="api/evaluate-interview" element={<DocsEvaluateInterview />} />
            <Route path="webhooks" element={<DocsWebhooks />} />
            <Route path="errors" element={<DocsErrorHandling />} />
          </Route>

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </FormDataProvider>
    </AuthProvider>
  );
}

export default App;
