import { Routes, Route, Navigate } from 'react-router-dom';
import { FormDataProvider } from './context/FormDataContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Public Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import StartHiring from './pages/StartHiring';
import APILanding from './pages/APILanding';

// Protected Pages
import Dashboard from './pages/Dashboard';
import APIKeys from './pages/APIKeys';
import APIPlayground from './layouts/APIPlayground';
import DashboardStats from './pages/DashboardStats';

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

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/requests/:id"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/api-keys"
            element={
              <ProtectedRoute>
                <APIKeys />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/stats"
            element={
              <ProtectedRoute>
                <DashboardStats />
              </ProtectedRoute>
            }
          />

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
