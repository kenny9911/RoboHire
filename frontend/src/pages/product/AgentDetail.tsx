import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import AgentRunDrawer from '../../components/AgentRunDrawer';

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
  jobId: string | null;
  config: Record<string, unknown> | null;
  totalSourced: number;
  totalApproved: number;
  totalRejected: number;
  totalContacted: number;
  // Calibration fields (added in agent-sourcing-redesign)
  calibrationState: 'pending' | 'calibrating' | 'calibrated';
  consecutiveLikes: number;
  calibrationCompletedAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  job: { id: string; title: string } | null;
  _count: { candidates: number };
}

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  profileUrl: string | null;
  headline: string | null;
  matchScore: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  resume: { id: string; name: string; currentRole: string | null; email: string | null } | null;
}

interface RunSummary {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  stats: { sourced?: number; matched?: number } | null;
  createdAt: string;
}

const CALIBRATION_THRESHOLD = 3;
type Tab = 'pending' | 'liked' | 'disliked' | 'contacted' | 'all';

export default function AgentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [latestRun, setLatestRun] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCandidateId, setDrawerCandidateId] = useState<string | null>(null);
  const [runningAgain, setRunningAgain] = useState(false);

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    try {
      const res = await axios.get(`/api/v1/agents/${id}`);
      setAgent(res.data.data);
    } catch {
      // ignore
    }
  }, [id]);

  const fetchCandidates = useCallback(async (statusFilter?: string) => {
    if (!id) return;
    try {
      const params: Record<string, unknown> = { limit: 100 };
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      const res = await axios.get(`/api/v1/agents/${id}/candidates`, { params });
      setCandidates(res.data.data || []);
    } catch {
      // ignore
    }
  }, [id]);

  const fetchLatestRun = useCallback(async () => {
    if (!id) return;
    try {
      const res = await axios.get(`/api/v1/agents/${id}/runs`, { params: { limit: 1 } });
      const list = res.data.data as RunSummary[];
      setLatestRun(list?.[0] ?? null);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchAgent(), fetchCandidates('pending'), fetchLatestRun()]);
      setLoading(false);
    };
    load();
  }, [fetchAgent, fetchCandidates, fetchLatestRun]);

  useEffect(() => {
    fetchCandidates(tab);
  }, [tab, fetchCandidates]);

  // When the workbench drawer closes, refresh stats — the user may have liked
  // or disliked profiles that change the calibration progress + counters.
  const handleDrawerClose = useCallback(async () => {
    setDrawerOpen(false);
    setDrawerCandidateId(null);
    await Promise.all([fetchAgent(), fetchCandidates(tab), fetchLatestRun()]);
  }, [fetchAgent, fetchCandidates, fetchLatestRun, tab]);

  const openCandidateInDrawer = useCallback((candidateId: string) => {
    setDrawerCandidateId(candidateId);
    setDrawerOpen(true);
  }, []);

  const handleStatusChange = async (candidateId: string, newStatus: 'liked' | 'disliked' | 'contacted') => {
    if (!id) return;
    setUpdatingId(candidateId);
    try {
      const res = await axios.patch(`/api/v1/agents/${id}/candidates/${candidateId}`, { status: newStatus });
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? res.data.data : c)));
      // Refresh aggregate state — calibration counter may have moved
      void fetchAgent();
    } catch {
      // ignore
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRunAgain = async () => {
    if (!id || runningAgain) return;
    setRunningAgain(true);
    try {
      await axios.post(`/api/v1/agents/${id}/runs`);
      // Open the workbench so the user sees the live stream
      setDrawerOpen(true);
      void fetchLatestRun();
    } catch {
      // ignore
    } finally {
      setRunningAgain(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!agent || !id) return;
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    try {
      const res = await axios.patch(`/api/v1/agents/${id}`, { status: newStatus });
      setAgent(res.data.data);
    } catch {
      // ignore
    }
  };

  const tabs: Array<{ key: Tab; label: string }> = useMemo(
    () => [
      { key: 'pending', label: t('agents.tab.pending', 'Pending') },
      { key: 'liked', label: t('agents.tab.liked', 'Liked') },
      { key: 'disliked', label: t('agents.tab.skipped', 'Skipped') },
      { key: 'contacted', label: t('agents.tab.contacted', 'Contacted') },
      { key: 'all', label: t('agents.tab.all', 'All') },
    ],
    [t],
  );

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-violet-600" />
      </div>
    );
  }

  const calibrationState = agent.calibrationState ?? 'pending';
  const consecutiveLikes = Math.min(agent.consecutiveLikes ?? 0, CALIBRATION_THRESHOLD);
  const isCalibrated = calibrationState === 'calibrated';
  const pendingCount = candidates.filter((c) => c.status === 'pending').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link to="/product/agents" className="hover:text-slate-700">
          {t('agents.title', 'Agents')}
        </Link>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium text-slate-900">{agent.name}</span>
      </nav>

      {/* Mission Control header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-4 p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50">
              <svg className="h-6 w-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{agent.name}</h1>
                <CalibrationBadge state={calibrationState} />
              </div>
              <p className="mt-1 text-sm text-slate-500">{agent.description}</p>
              {agent.job && (
                <Link
                  to={`/product/jobs/${agent.job.id}`}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25" />
                  </svg>
                  {agent.job.title}
                </Link>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleToggleStatus}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                agent.status === 'active'
                  ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {agent.status === 'active' ? t('agents.pause', 'Pause') : t('agents.resume', 'Resume')}
            </button>
          </div>
        </div>

        {/* Calibration progress bar */}
        {!isCalibrated && (
          <div className="border-t border-slate-100 bg-violet-50/40 px-6 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                {t('agents.calibration.headline', 'Calibrating · approve {{n}} of {{total}} good profiles', {
                  n: consecutiveLikes,
                  total: CALIBRATION_THRESHOLD,
                })}
              </p>
              <span className="text-xs text-slate-500">
                {t('agents.calibration.subtext', 'A skip resets the streak and brings 3 fresh profiles.')}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-violet-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-700 transition-all"
                style={{ width: `${(consecutiveLikes / CALIBRATION_THRESHOLD) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {pendingCount > 0
              ? t('agents.missionControl.reviewPending', 'Review {{n}} pending profile(s)', { count: pendingCount, n: pendingCount })
              : t('agents.missionControl.openWorkbench', 'Open workbench')}
          </button>
          <button
            onClick={handleRunAgain}
            disabled={runningAgain}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {runningAgain
              ? t('agents.missionControl.running', 'Running…')
              : t('agents.missionControl.runAgain', 'Run again')}
            <span className="text-[11px] font-normal text-slate-500">
              {t('agents.missionControl.runAgainHint', '(skips already-seen)')}
            </span>
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('agents.stat.sourced', 'Sourced')} value={agent._count.candidates} tone="slate" />
        <StatCard label={t('agents.stat.liked', 'Liked')} value={agent.totalApproved} tone="green" />
        <StatCard label={t('agents.stat.skipped', 'Skipped')} value={agent.totalRejected} tone="red" />
        <StatCard label={t('agents.stat.contacted', 'Contacted')} value={agent.totalContacted} tone="blue" />
      </div>

      {/* Latest run */}
      {latestRun && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {t('agents.missionControl.latestRun', 'Latest run')}
            </h2>
            <span className="text-xs text-slate-500">{formatRelative(latestRun.createdAt)}</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <RunStatusDot status={latestRun.status} />
            <div className="flex-1 text-sm text-slate-700">
              {t('agents.missionControl.runSummary', '{{sourced}} screened · {{matched}} surfaced · triggered by {{by}}', {
                sourced: latestRun.stats?.sourced ?? 0,
                matched: latestRun.stats?.matched ?? 0,
                by: latestRun.triggeredBy,
              })}
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="text-xs font-medium text-violet-600 hover:text-violet-700"
            >
              {t('agents.missionControl.openRun', 'Open run →')}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200">
        {tabs.map((t_) => (
          <button
            key={t_.key}
            onClick={() => setTab(t_.key)}
            className={`relative pb-2.5 text-sm font-medium transition-colors ${
              tab === t_.key ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {t_.label}
            {tab === t_.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-violet-600" />
            )}
          </button>
        ))}
      </div>

      {/* Candidate list (compact view) */}
      {candidates.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">
          {t('agents.noCandidates', 'No candidates in this category yet.')}
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              role="button"
              tabIndex={0}
              onClick={() => openCandidateInDrawer(candidate.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openCandidateInDrawer(candidate.id);
                }
              }}
              className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:border-violet-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {candidate.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{candidate.name}</span>
                  {candidate.matchScore != null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        candidate.matchScore >= 80
                          ? 'bg-green-50 text-green-700'
                          : candidate.matchScore >= 60
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {Math.round(candidate.matchScore)}%
                    </span>
                  )}
                </div>
                {candidate.headline && <p className="truncate text-sm text-slate-500">{candidate.headline}</p>}
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  {candidate.email && <span>{candidate.email}</span>}
                  {candidate.resume && (
                    <Link
                      to={`/product/talent/${candidate.resume.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-violet-600 hover:text-violet-700"
                    >
                      {t('agents.viewResume', 'View Resume')}
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {candidate.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleStatusChange(candidate.id, 'liked')}
                      disabled={updatingId === candidate.id}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {t('agents.like', 'Like')}
                    </button>
                    <button
                      onClick={() => openCandidateInDrawer(candidate.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {t('agents.review', 'Review')}
                    </button>
                  </>
                )}
                {candidate.status === 'liked' && (
                  <button
                    onClick={() => handleStatusChange(candidate.id, 'contacted')}
                    disabled={updatingId === candidate.id}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t('agents.contact', 'Contact')}
                  </button>
                )}
                {(candidate.status === 'contacted' || candidate.status === 'disliked') && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      candidate.status === 'contacted' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {t(`agents.candidateStatus.${candidate.status}`, candidate.status)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {drawerOpen && (
        <AgentRunDrawer
          agentId={agent.id}
          agentName={agent.name}
          onClose={handleDrawerClose}
          initialCandidateId={drawerCandidateId}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CalibrationBadge({ state }: { state: 'pending' | 'calibrating' | 'calibrated' }) {
  const { t } = useTranslation();
  const palette: Record<typeof state, { dot: string; chip: string; label: string }> = {
    pending: {
      dot: 'bg-slate-400',
      chip: 'border-slate-200 bg-slate-50 text-slate-700',
      label: t('agents.calibration.pending', 'Awaiting first run'),
    },
    calibrating: {
      dot: 'bg-amber-500',
      chip: 'border-amber-200 bg-amber-50 text-amber-700',
      label: t('agents.calibration.calibrating', 'Calibrating'),
    },
    calibrated: {
      dot: 'bg-green-500',
      chip: 'border-green-200 bg-green-50 text-green-700',
      label: t('agents.calibration.calibrated', 'Active · sourcing'),
    },
  };
  const p = palette[state] ?? palette.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${p.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'green' | 'red' | 'blue' }) {
  const palette: Record<typeof tone, { bg: string; num: string; label: string }> = {
    slate: { bg: 'bg-slate-50', num: 'text-slate-900', label: 'text-slate-500' },
    green: { bg: 'bg-green-50', num: 'text-green-700', label: 'text-green-600' },
    red: { bg: 'bg-red-50', num: 'text-red-700', label: 'text-red-600' },
    blue: { bg: 'bg-blue-50', num: 'text-blue-700', label: 'text-blue-600' },
  };
  const p = palette[tone];
  return (
    <div className={`rounded-xl ${p.bg} p-4 text-center`}>
      <div className={`text-2xl font-bold ${p.num}`}>{value}</div>
      <div className={`text-xs ${p.label}`}>{label}</div>
    </div>
  );
}

function RunStatusDot({ status }: { status: string }) {
  const color =
    status === 'completed'
      ? 'bg-green-500'
      : status === 'running' || status === 'queued'
      ? 'bg-amber-500'
      : status === 'failed'
      ? 'bg-red-500'
      : 'bg-slate-400';
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
