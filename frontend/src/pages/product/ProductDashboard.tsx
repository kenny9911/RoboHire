import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';

interface DashboardData {
  periodStats: { newResumes: number; newMatches: number; newJobs: number; newRequests: number };
  cumulativeStats: { totalResumes: number; matchedResumes: number; totalJobs: number; activeRequests: number; totalRequests: number };
  interviewStats: { invitations: number; completed: number; passed: number; offers: number; onboarded: number; rejectedOffers: number };
  pipeline: { new: number; screening: number; matched: number; interviewing: number; evaluated: number; offered: number };
  pendingItems: { pendingCandidates: number; pendingProjects: number; pendingEvaluations: number };
  clients: string[];
}

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year';

export default function ProductDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [data, setData] = usePageState<DashboardData | null>('prodDash.data', null);
  const [period, setPeriod] = usePageState<Period>('prodDash.period', 'month');
  const [client, setClient] = usePageState<string>('prodDash.client', '');
  const [loading, setLoading] = useState(!data);

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = { period };
      if (client) params.client = client;
      const res = await axios.get('/api/v1/dashboard/stats', { params });
      setData(res.data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period, client]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: t('product.dashboard.periodToday', 'Today') },
    { key: 'week', label: t('product.dashboard.periodWeek', 'This Week') },
    { key: 'month', label: t('product.dashboard.periodMonth', 'This Month') },
    { key: 'quarter', label: t('product.dashboard.periodQuarter', 'This Quarter') },
    { key: 'year', label: t('product.dashboard.periodYear', 'This Year') },
  ];

  const ps = data?.periodStats;
  const cs = data?.cumulativeStats;
  const is = data?.interviewStats;
  const pl = data?.pipeline;
  const pi = data?.pendingItems;

  const pendingTotal = (pi?.pendingCandidates || 0) + (pi?.pendingProjects || 0) + (pi?.pendingEvaluations || 0);

  // Pipeline visualization
  const pipelineStages = [
    { label: t('product.dashboard.pipeline.new', 'New'), count: pl?.new || 0, color: 'bg-slate-400' },
    { label: t('product.dashboard.pipeline.screening', 'Screening'), count: pl?.screening || 0, color: 'bg-blue-400' },
    { label: t('product.dashboard.pipeline.matched', 'Matched'), count: pl?.matched || 0, color: 'bg-cyan-400' },
    { label: t('product.dashboard.pipeline.interviewing', 'Interviewing'), count: pl?.interviewing || 0, color: 'bg-amber-400' },
    { label: t('product.dashboard.pipeline.evaluated', 'Evaluated'), count: pl?.evaluated || 0, color: 'bg-emerald-400' },
    { label: t('product.dashboard.pipeline.offered', 'Offered'), count: pl?.offered || 0, color: 'bg-green-500' },
  ];
  const pipelineMax = Math.max(1, ...pipelineStages.map((s) => s.count));

  // Interview funnel
  const funnelStages = [
    { label: t('product.dashboard.invitations', 'Invitations'), value: is?.invitations || 0, color: 'bg-blue-100 text-blue-700' },
    { label: t('product.dashboard.completedInterviews', 'Completed'), value: is?.completed || 0, color: 'bg-blue-200 text-blue-800' },
    { label: t('product.dashboard.passedInterviews', 'Passed'), value: is?.passed || 0, color: 'bg-emerald-100 text-emerald-700' },
    { label: t('product.dashboard.offers', 'Offers'), value: is?.offers || 0, color: 'bg-emerald-200 text-emerald-800' },
    { label: t('product.dashboard.onboarded', 'Onboarded'), value: is?.onboarded || 0, color: 'bg-emerald-300 text-emerald-900' },
  ];

  const v = (n: number | undefined) => loading ? '...' : String(n ?? 0);

  const quickActions = [
    {
      title: t('product.dashboard.createHiringRequest', 'Hiring Request'),
      desc: t('product.dashboard.createHiringRequestDesc', 'Describe your hiring needs and let AI handle the rest.'),
      href: '/start-hiring', fresh: true,
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
      color: 'bg-indigo-50 text-indigo-600',
    },
    {
      title: t('product.dashboard.agents', 'Agents'),
      desc: t('product.dashboard.agentsDesc', 'Deploy AI agents to source and screen candidates automatically.'),
      href: '/product/agents', fresh: false,
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />,
      color: 'bg-violet-50 text-violet-600',
    },
    {
      title: t('product.dashboard.createJob', 'Create a Job'),
      desc: t('product.dashboard.createJobDesc', 'Post a new position and let AI help you write the job description.'),
      href: '/product/jobs', fresh: false,
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      title: t('product.dashboard.uploadResumes', 'Upload Resumes'),
      desc: t('product.dashboard.uploadResumesDesc', 'Add candidates to your talent pool for AI matching.'),
      href: '/product/talent', fresh: false,
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: t('product.dashboard.runMatching', 'Run AI Matching'),
      desc: t('product.dashboard.runMatchingDesc', 'Match candidates against your open positions automatically.'),
      href: '/product/matching', fresh: false,
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      title: t('product.dashboard.startInterview', 'Start AI Interview'),
      desc: t('product.dashboard.startInterviewDesc', 'Launch an AI-powered video interview with a candidate.'),
      href: '/product/interview', fresh: false,
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />,
      color: 'bg-purple-50 text-purple-600',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header + Filters ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {t('product.dashboard.welcome', 'Welcome back')}{user?.name ? `, ${user.name}` : ''}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {t('product.dashboard.welcomeDesc', 'Your AI hiring command center. Let AI agents handle the heavy lifting.')}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period pills */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {periods.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Client filter */}
          {data?.clients && data.clients.length > 0 && (
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            >
              <option value="">{t('product.dashboard.allClients', 'All Clients')}</option>
              {data.clients.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Period Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('product.dashboard.newResumes', 'New Resumes'), value: ps?.newResumes, accent: 'border-l-indigo-400' },
          { label: t('product.dashboard.newMatches', 'New Matches'), value: ps?.newMatches, accent: 'border-l-cyan-400' },
          { label: t('product.dashboard.newJobs', 'New Jobs'), value: ps?.newJobs, accent: 'border-l-amber-400' },
          { label: t('product.dashboard.newRequests', 'New Requests'), value: ps?.newRequests, accent: 'border-l-emerald-400' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border border-slate-200 bg-white p-4 border-l-4 ${s.accent}`}>
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{v(s.value)}</p>
          </div>
        ))}
      </div>

      {/* ── Main Content: 2/3 + 1/3 ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cumulative Stats */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.dashboard.cumulativeStats', 'Cumulative Stats')}</h3>
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: t('product.dashboard.totalResumes', 'Resumes'), value: cs?.totalResumes },
                { label: t('product.dashboard.matchedResumes', 'Matched'), value: cs?.matchedResumes },
                { label: t('product.dashboard.totalJobs', 'Jobs'), value: cs?.totalJobs },
                { label: t('product.dashboard.activeRequests', 'Active Req.'), value: cs?.activeRequests },
                { label: t('product.dashboard.totalRequests', 'Total Req.'), value: cs?.totalRequests },
              ].map((s) => (
                <div key={s.label} className="text-center rounded-lg bg-slate-50 py-3 px-2">
                  <p className="text-xl font-bold text-slate-900">{v(s.value)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Interview Funnel */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">{t('product.dashboard.interviewFunnel', 'Interview Funnel')}</h3>
              {(is?.rejectedOffers || 0) > 0 && (
                <span className="text-xs text-rose-500 font-medium">
                  {is?.rejectedOffers} {t('product.dashboard.rejectedOffers', 'rejected')}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {funnelStages.map((stage, i) => (
                <div key={stage.label} className="flex-1 text-center">
                  <div className={`rounded-lg py-3 px-1 ${stage.color} relative`}>
                    <p className="text-lg font-bold">{v(stage.value)}</p>
                    {i < funnelStages.length - 1 && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 text-slate-300">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" /></svg>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 font-medium">{stage.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline Overview */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.dashboard.pipelineOverview', 'Pipeline Overview')}</h3>
            <div className="space-y-3">
              {pipelineStages.map((stage) => (
                <div key={stage.label} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 w-24 shrink-0 text-right">{stage.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
                      style={{ width: `${Math.max(stage.count > 0 ? 8 : 0, (stage.count / pipelineMax) * 100)}%` }}
                    >
                      {stage.count > 0 && (
                        <span className="text-xs font-bold text-white drop-shadow-sm">{stage.count}</span>
                      )}
                    </div>
                  </div>
                  {stage.count === 0 && <span className="text-xs text-slate-400 w-6">0</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Pending Items */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{t('product.dashboard.pendingItems', 'Pending Items')}</h3>
              {pendingTotal > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-rose-100 text-rose-600 text-xs font-bold px-1.5">
                  {pendingTotal}
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { label: t('product.dashboard.pendingCandidates', 'Pending Candidates'), count: pi?.pendingCandidates || 0, href: '/product/hiring', color: 'bg-amber-100 text-amber-700' },
                { label: t('product.dashboard.pendingProjects', 'Active Projects'), count: pi?.pendingProjects || 0, href: '/product/hiring', color: 'bg-blue-100 text-blue-700' },
                { label: t('product.dashboard.pendingEvaluations', 'Pending Evaluations'), count: pi?.pendingEvaluations || 0, href: '/product/evaluations', color: 'bg-violet-100 text-violet-700' },
              ].map((item) => (
                <Link
                  key={item.label}
                  to={item.href}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm text-slate-700">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center h-6 min-w-[24px] rounded-full text-xs font-bold px-2 ${item.color}`}>
                      {v(item.count)}
                    </span>
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">{t('product.dashboard.quickActions', 'Quick Actions')}</h3>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  to={action.href}
                  state={action.fresh ? { fresh: true } : undefined}
                  className="group flex flex-col items-center gap-2 rounded-xl p-3 hover:bg-slate-50 transition-colors text-center"
                >
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${action.color}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {action.icon}
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-slate-700 group-hover:text-blue-700 leading-tight">{action.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
