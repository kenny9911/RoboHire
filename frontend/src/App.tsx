import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { FormDataProvider } from './context/FormDataContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { useActivityTracker } from './hooks/useActivityTracker';

// Public Pages (eagerly loaded — critical for SEO & first paint)
import Landing from './pages/Landing';
import Login from './pages/Login';
import APILanding from './pages/APILanding';
import Pricing from './pages/Pricing';
import NotFound from './pages/NotFound';

// Lazy-loaded public pages
const StartHiring = lazy(() => import('./pages/StartHiring'));
const RequestDemo = lazy(() => import('./pages/RequestDemo'));
const QuickInvite = lazy(() => import('./pages/QuickInvite'));
const About = lazy(() => import('./pages/About'));
// ProductIntro is now rendered inline by Landing.tsx as the homepage
const InterviewRoom = lazy(() => import('./pages/InterviewRoom'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const Blog = lazy(() => import('./pages/Blog'));

// Lazy-loaded product app
const ProductLayout = lazy(() => import('./layouts/ProductLayout'));
const ProductDashboard = lazy(() => import('./pages/product/ProductDashboard'));
const ProductHiringRequests = lazy(() => import('./pages/product/HiringRequests'));
const ProductAgents = lazy(() => import('./pages/product/Agents'));
const ProductAgentDetail = lazy(() => import('./pages/product/AgentDetail'));
const ProductTalentHub = lazy(() => import('./pages/product/TalentHub'));
const ProductJobs = lazy(() => import('./pages/product/Jobs'));
const ProductJobDetail = lazy(() => import('./pages/product/JobDetail'));
const ProductSmartMatching = lazy(() => import('./pages/product/SmartMatching'));
const ProductAIInterview = lazy(() => import('./pages/product/AIInterview'));
const ProductEvaluationCenter = lazy(() => import('./pages/product/EvaluationCenter'));
const EvaluationSharedReport = lazy(() => import('./pages/EvaluationSharedReport'));
const ProductInterviewHub = lazy(() => import('./pages/product/InterviewHub'));
const ProductGoHireEvaluation = lazy(() => import('./pages/product/GoHireEvaluation'));
const ProductProfile = lazy(() => import('./pages/product/Profile'));
const ProfileLayout = lazy(() => import('./layouts/ProfileLayout'));
const ProfileSecurity = lazy(() => import('./pages/product/ProfileSecurity'));

// Lazy-loaded dashboard
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const APIKeys = lazy(() => import('./pages/APIKeys'));
const DashboardStats = lazy(() => import('./pages/DashboardStats'));
const UsageDashboard = lazy(() => import('./pages/UsageDashboard'));
const CallDetail = lazy(() => import('./pages/CallDetail'));
const Account = lazy(() => import('./pages/Account'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUserDetail = lazy(() => import('./pages/AdminUserDetail'));
const ResumeDetail = lazy(() => import('./pages/ResumeDetail'));
const ATSIntegrations = lazy(() => import('./pages/ATSIntegrations'));

// Lazy-loaded API Playground
const APIPlayground = lazy(() => import('./layouts/APIPlayground'));
const MatchResume = lazy(() => import('./pages/MatchResume'));
const InviteCandidate = lazy(() => import('./pages/InviteCandidate'));
const ParseResume = lazy(() => import('./pages/ParseResume'));
const ParseJD = lazy(() => import('./pages/ParseJD'));
const EvaluateInterview = lazy(() => import('./pages/EvaluateInterview'));

// Lazy-loaded Documentation
const DocsLayout = lazy(() => import('./layouts/DocsLayout'));
const DocsHub = lazy(() => import('./pages/docs/DocsHub'));
const DocsProductGuide = lazy(() => import('./pages/docs/DocsProductGuide'));
const DocsCommunity = lazy(() => import('./pages/docs/DocsCommunity'));
const DocsOverview = lazy(() => import('./pages/docs/DocsOverview'));
const DocsQuickStart = lazy(() => import('./pages/docs/DocsQuickStart'));
const DocsAuthentication = lazy(() => import('./pages/docs/DocsAuthentication'));
const DocsMatchResume = lazy(() => import('./pages/docs/DocsMatchResume'));
const DocsParseResume = lazy(() => import('./pages/docs/DocsParseResume'));
const DocsParseJD = lazy(() => import('./pages/docs/DocsParseJD'));
const DocsInviteCandidate = lazy(() => import('./pages/docs/DocsInviteCandidate'));
const DocsEvaluateInterview = lazy(() => import('./pages/docs/DocsEvaluateInterview'));
const DocsWebhooks = lazy(() => import('./pages/docs/DocsWebhooks'));
const DocsErrorHandling = lazy(() => import('./pages/docs/DocsErrorHandling'));
const DocsATSIntegrations = lazy(() => import('./pages/docs/DocsATSIntegrations'));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" /></div>}>
      {children}
    </Suspense>
  );
}

function ActivityTracker() {
  useActivityTracker();
  return null;
}

function App() {
  return (
    <AuthProvider>
      <FormDataProvider>
        <ActivityTracker />
        <SuspenseWrapper>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/start-hiring" element={<StartHiring />} />
            <Route path="/developers" element={<APILanding />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/request-demo" element={<RequestDemo />} />
            <Route path="/quick-invite" element={<QuickInvite />} />
            <Route path="/about" element={<About />} />
            <Route path="/product-intro" element={<Navigate to="/" replace />} />
            <Route path="/product-info" element={<Navigate to="/" replace />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/interview-room" element={<InterviewRoom />} />
            <Route path="/interview-room/:accessToken" element={<InterviewRoom />} />
            <Route path="/evaluation-report/:token" element={<EvaluationSharedReport />} />

            {/* Product App (protected, sidebar layout) */}
            <Route
              path="/product"
              element={
                <ProtectedRoute>
                  <ProductLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<ProductDashboard />} />
              <Route path="hiring" element={<ProductHiringRequests />} />
              <Route path="hiring/:id" element={<Dashboard />} />
              <Route path="agents" element={<ProductAgents />} />
              <Route path="agents/:id" element={<ProductAgentDetail />} />
              <Route path="talent" element={<ProductTalentHub />} />
              <Route path="talent/:id" element={<ResumeDetail />} />
              <Route path="jobs" element={<ProductJobs />} />
              <Route path="jobs/:id" element={<ProductJobDetail />} />
              <Route path="matching" element={<ProductSmartMatching />} />
              <Route path="interview" element={<ProductAIInterview />} />
              <Route path="interview-hub" element={<ProductInterviewHub />} />
              <Route path="interview-hub/:id" element={<ProductGoHireEvaluation />} />
              <Route path="evaluations" element={<ProductEvaluationCenter />} />
              <Route path="profile" element={<ProfileLayout />}>
                <Route index element={<ProductProfile />} />
                <Route path="security" element={<ProfileSecurity />} />
                <Route path="usage" element={<UsageDashboard />} />
                <Route path="usage/calls/:id" element={<CallDetail />} />
                <Route path="api-keys" element={<APIKeys />} />
                <Route path="integrations" element={<ATSIntegrations />} />
              </Route>
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="admin/users/:userId" element={<AdminUserDetail />} />
            </Route>

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
              {/* Redirect old request detail routes to /product/hiring */}
              <Route path="requests/:id" element={<Navigate to="/product/hiring" replace />} />
              {/* Redirect old resume routes to /product/talent */}
              <Route path="resumes" element={<Navigate to="/product/talent" replace />} />
              <Route path="resumes/:id" element={<Navigate to="/product/talent" replace />} />
              <Route path="api-keys" element={<APIKeys />} />
              <Route path="stats" element={<DashboardStats />} />
              <Route path="usage" element={<UsageDashboard />} />
              <Route path="usage/calls/:id" element={<CallDetail />} />
              <Route path="account" element={<Account />} />
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="integrations" element={<ATSIntegrations />} />
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

            {/* Documentation Hub (standalone, no sidebar) */}
            <Route path="/docs" element={<DocsHub />} />
            <Route path="/docs/quick-start" element={<DocsProductGuide />} />
            <Route path="/docs/community" element={<DocsCommunity />} />

            {/* API Documentation (with sidebar layout) */}
            <Route path="/docs/api" element={<DocsLayout />}>
              <Route index element={<DocsOverview />} />
              <Route path="quick-start" element={<DocsQuickStart />} />
              <Route path="authentication" element={<DocsAuthentication />} />
              <Route path="match-resume" element={<DocsMatchResume />} />
              <Route path="parse-resume" element={<DocsParseResume />} />
              <Route path="parse-jd" element={<DocsParseJD />} />
              <Route path="invite-candidate" element={<DocsInviteCandidate />} />
              <Route path="evaluate-interview" element={<DocsEvaluateInterview />} />
              <Route path="webhooks" element={<DocsWebhooks />} />
              <Route path="ats-integrations" element={<DocsATSIntegrations />} />
              <Route path="errors" element={<DocsErrorHandling />} />
            </Route>

            {/* Old docs URL redirects */}
            <Route path="/docs/overview" element={<Navigate to="/docs/api" replace />} />
            <Route path="/docs/authentication" element={<Navigate to="/docs/api/authentication" replace />} />
            <Route path="/docs/webhooks" element={<Navigate to="/docs/api/webhooks" replace />} />
            <Route path="/docs/ats-integrations" element={<Navigate to="/docs/api/ats-integrations" replace />} />
            <Route path="/docs/errors" element={<Navigate to="/docs/api/errors" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SuspenseWrapper>
      </FormDataProvider>
    </AuthProvider>
  );
}

export default App;
