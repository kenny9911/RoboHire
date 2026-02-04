import { Routes, Route, Navigate } from 'react-router-dom';
import { FormDataProvider } from './context/FormDataContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Public Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import StartHiring from './pages/StartHiring';

// Protected Pages
import Dashboard from './pages/Dashboard';
import APIPlayground from './layouts/APIPlayground';

// API Playground Pages (existing)
import MatchResume from './pages/MatchResume';
import InviteCandidate from './pages/InviteCandidate';
import ParseResume from './pages/ParseResume';
import ParseJD from './pages/ParseJD';
import EvaluateInterview from './pages/EvaluateInterview';

function App() {
  return (
    <AuthProvider>
      <FormDataProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/start-hiring" element={<StartHiring />} />

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

          {/* API Playground Routes (Public) */}
          <Route path="/api-playground" element={<APIPlayground />}>
            <Route index element={<Navigate to="match-resume" replace />} />
            <Route path="match-resume" element={<MatchResume />} />
            <Route path="invite" element={<InviteCandidate />} />
            <Route path="parse-resume" element={<ParseResume />} />
            <Route path="parse-jd" element={<ParseJD />} />
            <Route path="evaluate" element={<EvaluateInterview />} />
          </Route>

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </FormDataProvider>
    </AuthProvider>
  );
}

export default App;
