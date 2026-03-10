import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../lib/axios';

interface Stats {
  activeJobs: number;
  totalCandidates: number;
  interviewsThisWeek: number;
  avgMatchScore: number | null;
  completedInterviews: number;
  pendingEvaluations: number;
  hiringRequests: number;
}

export default function ProductDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    activeJobs: 0,
    totalCandidates: 0,
    interviewsThisWeek: 0,
    avgMatchScore: null,
    completedInterviews: 0,
    pendingEvaluations: 0,
    hiringRequests: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [jobsRes, resumesRes, interviewsRes, hiringRes] = await Promise.allSettled([
          axios.get('/api/v1/jobs', { params: { status: 'open', limit: 1 } }),
          axios.get('/api/v1/resumes', { params: { limit: 1 } }),
          axios.get('/api/v1/interviews', { params: { limit: 50 } }),
          axios.get('/api/v1/hiring-requests', { params: { limit: 1 } }),
        ]);

        const activeJobs = jobsRes.status === 'fulfilled' ? (jobsRes.value.data.meta?.total || jobsRes.value.data.data?.length || 0) : 0;
        const totalCandidates = resumesRes.status === 'fulfilled' ? (resumesRes.value.data.meta?.total || resumesRes.value.data.data?.length || 0) : 0;
        const hiringRequests = hiringRes.status === 'fulfilled' ? (hiringRes.value.data.meta?.total || hiringRes.value.data.data?.length || 0) : 0;

        let interviewsThisWeek = 0;
        let completedInterviews = 0;
        let pendingEvaluations = 0;
        if (interviewsRes.status === 'fulfilled') {
          const interviews = interviewsRes.value.data.data || [];
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          interviewsThisWeek = interviews.filter((i: any) => new Date(i.createdAt) >= weekAgo).length;
          completedInterviews = interviews.filter((i: any) => i.status === 'completed').length;
          pendingEvaluations = interviews.filter((i: any) => i.status === 'completed' && !i.evaluation).length;
        }

        setStats({
          activeJobs,
          totalCandidates,
          interviewsThisWeek,
          avgMatchScore: null,
          completedInterviews,
          pendingEvaluations,
          hiringRequests,
        });
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const quickActions = [
    {
      title: t('product.dashboard.createJob', 'Create a Job'),
      description: t('product.dashboard.createJobDesc', 'Post a new position and let AI help you write the job description.'),
      href: '/product/jobs',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
      ),
      color: 'bg-blue-50 text-blue-600',
    },
    {
      title: t('product.dashboard.uploadResumes', 'Upload Resumes'),
      description: t('product.dashboard.uploadResumesDesc', 'Add candidates to your talent pool for AI matching.'),
      href: '/product/talent',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: t('product.dashboard.runMatching', 'Run AI Matching'),
      description: t('product.dashboard.runMatchingDesc', 'Match candidates against your open positions automatically.'),
      href: '/product/matching',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      color: 'bg-amber-50 text-amber-600',
    },
    {
      title: t('product.dashboard.startInterview', 'Start AI Interview'),
      description: t('product.dashboard.startInterviewDesc', 'Launch an AI-powered video interview with a candidate.'),
      href: '/product/interview',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-purple-50 text-purple-600',
    },
  ];

  const pipelineStages = [
    { label: t('product.dashboard.pipeline.new', 'New'), count: stats.totalCandidates, color: 'bg-slate-300' },
    { label: t('product.dashboard.pipeline.screening', 'Screening'), count: stats.hiringRequests, color: 'bg-blue-400' },
    { label: t('product.dashboard.pipeline.matched', 'Matched'), count: stats.activeJobs, color: 'bg-cyan-400' },
    { label: t('product.dashboard.pipeline.interviewing', 'Interviewing'), count: stats.interviewsThisWeek, color: 'bg-amber-400' },
    { label: t('product.dashboard.pipeline.evaluated', 'Evaluated'), count: stats.completedInterviews, color: 'bg-emerald-400' },
    { label: t('product.dashboard.pipeline.offered', 'Offered'), count: 0, color: 'bg-green-500' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t('product.dashboard.welcome', 'Welcome back')}{user?.name ? `, ${user.name}` : ''}
        </h2>
        <p className="mt-1 text-slate-600">
          {t('product.dashboard.welcomeDesc', 'Your AI hiring command center. Let AI agents handle the heavy lifting.')}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('product.dashboard.activeJobs', 'Active Jobs'), value: loading ? '...' : String(stats.activeJobs) },
          { label: t('product.dashboard.totalCandidates', 'Total Candidates'), value: loading ? '...' : String(stats.totalCandidates) },
          { label: t('product.dashboard.interviewsThisWeek', 'Interviews This Week'), value: loading ? '...' : String(stats.interviewsThisWeek) },
          { label: t('product.dashboard.avgMatchScore', 'Avg Match Score'), value: stats.avgMatchScore != null ? String(stats.avgMatchScore) : '--' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* AI Action Queue */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-bold tracking-wider text-blue-500 bg-blue-50 px-2 py-0.5 rounded">AI</span>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('product.dashboard.actionQueue', 'Action Queue')}
          </h3>
        </div>
        {stats.pendingEvaluations > 0 ? (
          <div className="space-y-2">
            <Link
              to="/product/evaluations"
              className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/50 p-4 hover:bg-amber-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {stats.pendingEvaluations} {t('product.dashboard.pendingEvals', 'interview(s) awaiting AI evaluation')}
                  </p>
                  <p className="text-xs text-slate-500">{t('product.dashboard.runEvalNow', 'Run evaluations to get hiring recommendations')}</p>
                </div>
              </div>
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">{t('product.dashboard.noActions', 'No pending actions. Create a job to get started!')}</p>
          </div>
        )}
      </div>

      {/* Pipeline Overview */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          {t('product.dashboard.pipelineOverview', 'Pipeline Overview')}
        </h3>
        <div className="flex gap-2">
          {pipelineStages.map((stage) => (
            <div key={stage.label} className="flex-1 text-center">
              <div className={`h-2 rounded-full ${stage.color} mb-2`} />
              <p className="text-xs font-medium text-slate-600">{stage.label}</p>
              <p className="text-lg font-bold text-slate-900">{loading ? '...' : stage.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          {t('product.dashboard.quickActions', 'Quick Actions')}
        </h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              to={action.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-blue-200"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${action.color} mb-3`}>
                {action.icon}
              </div>
              <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">{action.title}</h4>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{action.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
