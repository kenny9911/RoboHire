import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';
import RecruiterTeamFilter, { type RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';

interface DashboardData {
  periodStats: { newResumes: number; newMatches: number; newJobs: number; newRequests: number };
  cumulativeStats: { totalResumes: number; matchedResumes: number; totalJobs: number; activeRequests: number; totalRequests: number };
  interviewStats: { invitations: number; completed: number; passed: number; offers: number; onboarded: number; rejectedOffers: number };
  pipeline: { new: number; screening: number; matched: number; interviewing: number; evaluated: number; offered: number };
  pendingItems: { pendingCandidates: number; pendingProjects: number; pendingEvaluations: number };
  clients: string[];
}

interface EnhancedData {
  kpiScorecard: {
    uploads: number;
    invitationsSent: number;
    completedInterviews: number;
    matchesCreated: number;
    verdicts: { strongHire: number; hire: number; leanHire: number; leanNoHire: number; noHire: number };
  };
  todoItems: Array<{
    type: string;
    count: number;
    items: Array<{ id: string; label: string; subLabel?: string; href: string }>;
  }>;
  agentPerformance: {
    activeAgents: number;
    totalSourced: number;
    totalApproved: number;
    totalContacted: number;
    topAgents: Array<{ id: string; name: string; jobTitle: string | null; totalSourced: number; totalApproved: number; totalContacted: number }>;
  };
  recentActivity: Array<{ type: string; timestamp: string; data: Record<string, any> }>;
  conversionFunnel: {
    totalMatched: number;
    totalInvited: number;
    totalCompleted: number;
    totalPassed: number;
    matchToInviteRate: number;
    inviteToCompleteRate: number;
    completeToPassRate: number;
  };
}

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year';

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

const verdictColor: Record<string, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700',
  hire: 'bg-green-100 text-green-700',
  lean_hire: 'bg-lime-100 text-lime-700',
  lean_no_hire: 'bg-amber-100 text-amber-700',
  no_hire: 'bg-rose-100 text-rose-700',
};

export default function ProductDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [data, setData] = usePageState<DashboardData | null>('prodDash.data', null);
  const [enhanced, setEnhanced] = usePageState<EnhancedData | null>('prodDash.enhanced', null);
  const [period, setPeriod] = usePageState<Period>('prodDash.period', 'month');
  const [client, setClient] = usePageState<string>('prodDash.client', '');
  const [recruiterFilter, setRecruiterFilter] = usePageState<RecruiterTeamFilterValue>('prodDash.recruiterFilter', {});
  const [loading, setLoading] = useState(!data);

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = { period };
      if (client) params.client = client;
      if (recruiterFilter.filterUserId) params.filterUserId = recruiterFilter.filterUserId;
      if (recruiterFilter.filterTeamId) params.filterTeamId = recruiterFilter.filterTeamId;
      if (recruiterFilter.teamView) params.teamView = 'true';
      const res = await axios.get('/api/v1/dashboard/stats', { params });
      const d = res.data.data;
      if (d) {
        const { enhanced: enhancedData, ...statsData } = d;
        setData(statsData);
        if (enhancedData) setEnhanced(enhancedData);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period, client, recruiterFilter]);

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
      href: '/agent-alex', fresh: true,
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
          {/* Recruiter / Team filter */}
          <RecruiterTeamFilter value={recruiterFilter} onChange={setRecruiterFilter} />
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
      {loading && !data && (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 border-l-4 border-l-slate-200">
                <div className="h-3 w-20 rounded bg-slate-200 mb-2" />
                <div className="h-7 w-12 rounded bg-slate-200" />
              </div>
            ))}
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="h-4 w-32 rounded bg-slate-200 mb-4" />
                  <div className="grid grid-cols-5 gap-3">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="rounded-lg bg-slate-50 py-3 px-2 text-center">
                        <div className="h-6 w-8 rounded bg-slate-200 mx-auto mb-1" />
                        <div className="h-3 w-12 rounded bg-slate-100 mx-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="h-4 w-28 rounded bg-slate-200 mb-4" />
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j} className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-200" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-3/4 rounded bg-slate-200" />
                          <div className="h-2.5 w-1/2 rounded bg-slate-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!(loading && !data) && <>
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

      {/* ══════════ Enhanced Dashboard Sections ══════════ */}

      {/* ── KPI Scorecard ── */}
      {enhanced?.kpiScorecard && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.dashboard.kpiScorecard', 'Performance Scorecard')}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: t('product.dashboard.kpiUploads', 'Uploads'), value: enhanced.kpiScorecard.uploads, icon: '↑', accent: 'border-indigo-400 bg-indigo-50' },
              { label: t('product.dashboard.kpiInvitationsSent', 'Invitations Sent'), value: enhanced.kpiScorecard.invitationsSent, icon: '✉', accent: 'border-blue-400 bg-blue-50' },
              { label: t('product.dashboard.kpiCompletedInterviews', 'Completed'), value: enhanced.kpiScorecard.completedInterviews, icon: '✓', accent: 'border-emerald-400 bg-emerald-50' },
              { label: t('product.dashboard.kpiMatchesCreated', 'Matches'), value: enhanced.kpiScorecard.matchesCreated, icon: '⚡', accent: 'border-cyan-400 bg-cyan-50' },
            ].map((kpi) => (
              <div key={kpi.label} className={`rounded-xl border-l-4 ${kpi.accent} p-4`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{kpi.icon}</span>
                  <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
              </div>
            ))}
            {/* Verdicts card */}
            <div className="rounded-xl border-l-4 border-violet-400 bg-violet-50 p-4">
              <span className="text-xs font-medium text-slate-500">{t('product.dashboard.kpiVerdicts', 'Verdicts')}</span>
              <div className="mt-2 space-y-1">
                {[
                  { key: 'strongHire', label: t('product.dashboard.kpiVerdictStrongHire', 'Strong Hire'), color: 'bg-emerald-500' },
                  { key: 'hire', label: t('product.dashboard.kpiVerdictHire', 'Hire'), color: 'bg-green-500' },
                  { key: 'leanHire', label: t('product.dashboard.kpiVerdictLeanHire', 'Lean Hire'), color: 'bg-lime-500' },
                  { key: 'leanNoHire', label: t('product.dashboard.kpiVerdictLeanNoHire', 'Lean No'), color: 'bg-amber-500' },
                  { key: 'noHire', label: t('product.dashboard.kpiVerdictNoHire', 'No Hire'), color: 'bg-rose-500' },
                ].map((vd) => {
                  const count = enhanced.kpiScorecard.verdicts[vd.key as keyof typeof enhanced.kpiScorecard.verdicts] || 0;
                  if (!count) return null;
                  return (
                    <div key={vd.key} className="flex items-center gap-2 text-xs">
                      <span className={`inline-block w-2 h-2 rounded-full ${vd.color}`} />
                      <span className="text-slate-600">{vd.label}</span>
                      <span className="font-bold text-slate-800 ml-auto">{count}</span>
                    </div>
                  );
                })}
                {Object.values(enhanced.kpiScorecard.verdicts).every((v) => !v) && (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Conversion Funnel + Action Items / Agent Performance ── */}
      {enhanced && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Conversion Funnel Rates */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.dashboard.conversionFunnel', 'Conversion Rates')}</h3>
              <div className="flex items-center gap-1">
                {[
                  { label: t('product.dashboard.funnelMatched', 'Matched'), value: enhanced.conversionFunnel.totalMatched, bg: 'bg-cyan-100 text-cyan-800' },
                  { label: t('product.dashboard.funnelInvited', 'Invited'), value: enhanced.conversionFunnel.totalInvited, bg: 'bg-blue-100 text-blue-800', rate: enhanced.conversionFunnel.matchToInviteRate },
                  { label: t('product.dashboard.funnelCompleted', 'Completed'), value: enhanced.conversionFunnel.totalCompleted, bg: 'bg-indigo-100 text-indigo-800', rate: enhanced.conversionFunnel.inviteToCompleteRate },
                  { label: t('product.dashboard.funnelPassed', 'Passed'), value: enhanced.conversionFunnel.totalPassed, bg: 'bg-emerald-100 text-emerald-800', rate: enhanced.conversionFunnel.completeToPassRate },
                ].map((step, i) => (
                  <div key={step.label} className="flex-1 flex items-center">
                    {i > 0 && (
                      <div className="flex flex-col items-center mx-1 shrink-0">
                        <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" /></svg>
                        <span className="text-[10px] font-bold text-slate-500">{step.rate}%</span>
                      </div>
                    )}
                    <div className={`flex-1 rounded-lg py-3 px-2 text-center ${step.bg}`}>
                      <p className="text-lg font-bold">{step.value}</p>
                      <p className="text-xs font-medium mt-0.5">{step.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Items */}
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">{t('product.dashboard.todoList', 'Action Items')}</h3>
              </div>
              {enhanced.todoItems.filter((td) => td.count > 0).length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <div className="text-3xl mb-2">&#10003;</div>
                  <p className="text-sm font-medium text-slate-700">{t('product.dashboard.todoAllClear', 'All Caught Up!')}</p>
                  <p className="text-xs text-slate-500 mt-1">{t('product.dashboard.todoAllClearDesc', 'No pending action items. Great work!')}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {enhanced.todoItems.filter((td) => td.count > 0).map((td) => {
                    const configs: Record<string, { title: string; desc: string; color: string; href: string; icon: string }> = {
                      stale_request: {
                        title: t('product.dashboard.todoStaleRequests', 'Stale Hiring Requests'),
                        desc: t('product.dashboard.todoStaleRequestsDesc', '{{count}} request(s) with no activity for 7+ days', { count: td.count }),
                        color: 'bg-amber-100 text-amber-700',
                        href: '/product/hiring',
                        icon: '⏱',
                      },
                      unreviewed_match: {
                        title: t('product.dashboard.todoUnreviewedMatches', 'Unreviewed Matches'),
                        desc: t('product.dashboard.todoUnreviewedMatchesDesc', '{{count}} match(es) awaiting review', { count: td.count }),
                        color: 'bg-blue-100 text-blue-700',
                        href: '/product/matching',
                        icon: '🔍',
                      },
                      awaiting_followup: {
                        title: t('product.dashboard.todoAwaitingFollowup', 'Awaiting Follow-up'),
                        desc: t('product.dashboard.todoAwaitingFollowupDesc', '{{count}} passed candidate(s) need follow-up', { count: td.count }),
                        color: 'bg-rose-100 text-rose-700',
                        href: '/product/evaluations',
                        icon: '📋',
                      },
                      needs_evaluation: {
                        title: t('product.dashboard.todoNeedsEvaluation', 'Needs Evaluation'),
                        desc: t('product.dashboard.todoNeedsEvaluationDesc', '{{count}} interview(s) awaiting evaluation', { count: td.count }),
                        color: 'bg-violet-100 text-violet-700',
                        href: '/product/evaluations',
                        icon: '📝',
                      },
                    };
                    const cfg = configs[td.type];
                    if (!cfg) return null;
                    return (
                      <div key={td.type} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{cfg.icon}</span>
                            <span className="text-sm font-semibold text-slate-800">{cfg.title}</span>
                            <span className={`inline-flex items-center justify-center h-5 min-w-[20px] rounded-full text-xs font-bold px-1.5 ${cfg.color}`}>
                              {td.count}
                            </span>
                          </div>
                          <Link to={cfg.href} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                            {t('product.dashboard.todoViewAll', 'View all')} →
                          </Link>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">{cfg.desc}</p>
                        {td.items.length > 0 && (
                          <div className="space-y-1">
                            {td.items.map((item) => (
                              <Link
                                key={item.id}
                                to={cfg.href}
                                className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-700 transition-colors py-0.5"
                              >
                                <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                                <span className="truncate font-medium">{item.label}</span>
                                {item.subLabel && <span className="text-slate-400 truncate">· {item.subLabel}</span>}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right 1/3: Agent Performance */}
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{t('product.dashboard.agentPerformance', 'AI Agent Performance')}</h3>
                {enhanced.agentPerformance.activeAgents > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-violet-100 text-violet-700 text-xs font-bold px-1.5">
                    {enhanced.agentPerformance.activeAgents} {t('product.dashboard.agentActive', 'Active')}
                  </span>
                )}
              </div>
              {enhanced.agentPerformance.activeAgents === 0 ? (
                <div className="px-5 py-8 text-center">
                  <div className="text-3xl mb-2">🤖</div>
                  <p className="text-sm font-medium text-slate-700">{t('product.dashboard.agentNone', 'No agents deployed yet.')}</p>
                  <p className="text-xs text-slate-500 mt-1">{t('product.dashboard.agentCreateDesc', 'Deploy an AI agent to start sourcing candidates automatically.')}</p>
                  <Link to="/product/agents" className="inline-block mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    {t('product.dashboard.agentViewAll', 'View all agents')} →
                  </Link>
                </div>
              ) : (
                <div>
                  {/* Aggregate metrics */}
                  <div className="grid grid-cols-3 gap-px bg-slate-100">
                    {[
                      { label: t('product.dashboard.agentSourced', 'Sourced'), value: enhanced.agentPerformance.totalSourced, color: 'text-violet-700' },
                      { label: t('product.dashboard.agentApproved', 'Approved'), value: enhanced.agentPerformance.totalApproved, color: 'text-emerald-700' },
                      { label: t('product.dashboard.agentContacted', 'Contacted'), value: enhanced.agentPerformance.totalContacted, color: 'text-blue-700' },
                    ].map((m) => (
                      <div key={m.label} className="bg-white text-center py-3">
                        <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                        <p className="text-xs text-slate-500">{m.label}</p>
                      </div>
                    ))}
                  </div>
                  {/* Top agents list */}
                  {enhanced.agentPerformance.topAgents.length > 0 && (
                    <div className="px-5 py-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">{t('product.dashboard.agentTopAgents', 'Top Agents')}</p>
                      <div className="space-y-2">
                        {enhanced.agentPerformance.topAgents.map((agent) => (
                          <Link
                            key={agent.id}
                            to={`/product/agents/${agent.id}`}
                            className="flex items-center justify-between py-1.5 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{agent.name}</p>
                              {agent.jobTitle && <p className="text-xs text-slate-400 truncate">{agent.jobTitle}</p>}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-xs">
                              <span className="text-violet-600 font-bold">{agent.totalSourced}</span>
                              <span className="text-emerald-600 font-bold">{agent.totalApproved}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="px-5 py-3 border-t border-slate-100">
                    <Link to="/product/agents" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      {t('product.dashboard.agentViewAll', 'View all agents')} →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Activity Feed ── */}
      {enhanced?.recentActivity && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">{t('product.dashboard.recentActivity', 'Recent Activity')}</h3>
          </div>
          {enhanced.recentActivity.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-500">{t('product.dashboard.activityEmpty', 'No recent activity in this period.')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {enhanced.recentActivity.map((item, i) => {
                const iconMap: Record<string, { icon: string; bg: string }> = {
                  interview_completed: { icon: '🎤', bg: 'bg-blue-50' },
                  evaluation_completed: { icon: '📊', bg: 'bg-emerald-50' },
                  new_match: { icon: '⚡', bg: 'bg-cyan-50' },
                  agent_discovery: { icon: '🤖', bg: 'bg-violet-50' },
                };
                const style = iconMap[item.type] || { icon: '•', bg: 'bg-slate-50' };

                let text = '';
                if (item.type === 'interview_completed') {
                  text = t('product.dashboard.activityInterviewCompleted', '{{name}} completed interview for {{job}}', {
                    name: item.data.candidateName || '—',
                    job: item.data.jobTitle || '—',
                  });
                } else if (item.type === 'evaluation_completed') {
                  text = t('product.dashboard.activityEvaluationCompleted', '{{name}} evaluated — {{verdict}}', {
                    name: item.data.candidateName || '—',
                    verdict: item.data.verdict?.replace(/_/g, ' ') || '—',
                  });
                } else if (item.type === 'new_match') {
                  text = t('product.dashboard.activityNewMatch', '{{resume}} matched to {{request}}', {
                    resume: item.data.resumeName || '—',
                    request: item.data.requestTitle || '—',
                  });
                } else if (item.type === 'agent_discovery') {
                  text = t('product.dashboard.activityAgentDiscovery', 'Agent {{agent}} found {{name}}', {
                    agent: item.data.agentName || '—',
                    name: item.data.candidateName || '—',
                  });
                }

                return (
                  <div key={`${item.type}-${i}`} className="flex items-start gap-3 px-5 py-3">
                    <div className={`mt-0.5 h-7 w-7 rounded-lg ${style.bg} flex items-center justify-center text-sm shrink-0`}>
                      {style.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700">{text}</p>
                      {item.type === 'evaluation_completed' && item.data.verdict && (
                        <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${verdictColor[item.data.verdict] || 'bg-slate-100 text-slate-600'}`}>
                          {item.data.verdict.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      )}
                      {item.type === 'new_match' && item.data.fitScore != null && (
                        <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">
                          {item.data.fitGrade || `${item.data.fitScore}%`}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 mt-1 font-medium">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  );
}
