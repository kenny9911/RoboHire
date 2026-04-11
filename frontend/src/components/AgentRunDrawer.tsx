import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import { useAgentRunStream, type RunCandidate, type RunActivity } from '../hooks/useAgentRunStream';
import { useAgentActivityStream } from '../hooks/useAgentActivityStream';
import ReviewProfilesView from './ReviewProfilesView';
import AutoGrowTextarea from './AutoGrowTextarea';
import AgentCriteriaModal, { type AgentCriterion } from './AgentCriteriaModal';
import IdealProfileCard from './IdealProfileCard';
import HardRequirementsEditor, { type HardRequirement } from './HardRequirementsEditor';
import HardRequirementsWarning, { type DryRunResult } from './HardRequirementsWarning';
import RegenerateProfileModal from './RegenerateProfileModal';
import { useIdealProfile } from '../hooks/useIdealProfile';

type SourceMode = 'instant_search' | 'internal_minio' | 'external_api';
type SchedulePreset = 'off' | 'hourly' | 'daily' | 'weekly' | 'custom';
const SCHEDULE_PRESETS: Record<'hourly' | 'daily' | 'weekly', string> = {
  hourly: '0 * * * *',
  daily: '0 9 * * *',
  weekly: '0 9 * * 1',
};

interface JobOption {
  id: string;
  title: string;
  user?: { id: string; name: string | null; email: string } | null;
}

interface Props {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

interface RunSummary {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  stats: { sourced?: number; matched?: number } | null;
  createdAt: string;
  _count?: { candidates: number; activities: number };
}

type Tab = 'results' | 'runs' | 'activity' | 'settings';
type ResultsFilter = 'all' | 'pending' | 'liked' | 'disliked';
type ResultsView = 'list' | 'review';

interface AgentDetail {
  id: string;
  name: string;
  description: string;
  instructions: string | null;
  taskType: string;
  status: string;
  jobId: string | null;
  job: { id: string; title: string } | null;
  source: { modes?: string[]; externalApiConfigId?: string } | null;
  autonomy: string;
  schedule: string | null;
  scheduleEnabled: boolean;
  config: Record<string, unknown> | null;
}

export default function AgentRunDrawer({ agentId, agentName, onClose }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('results');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [starting, setStarting] = useState(false);
  const [filter, setFilter] = useState<ResultsFilter>('pending');
  const [view, setView] = useState<ResultsView>('list');
  const [triageOverrides, setTriageOverrides] = useState<Record<string, string>>({});
  // Activity tab now uses SSE for instant + live updates instead of one-shot REST.
  // The hook only opens its EventSource when the Activity tab is active.
  const [activityActive, setActivityActive] = useState(false);
  const activityStream = useAgentActivityStream(activityActive ? agentId : null);

  const stream = useAgentRunStream(agentId, activeRunId);
  const ideal = useIdealProfile(agentId);

  // HR dry-run guardrail state. When the user clicks "Run now", we first POST
  // to `/hard-requirements/dry-run`; if too many candidates would be excluded,
  // we show a warning modal and block (or soft-block with override).
  const [dryRunWarning, setDryRunWarning] = useState<{ result: DryRunResult; blocking: boolean } | null>(null);

  // Load past runs (used by Runs tab and to auto-select the latest one)
  const loadRuns = useCallback(async () => {
    try {
      const res = await axios.get(`/api/v1/agents/${agentId}/runs`, { params: { limit: 20 } });
      const list = (res.data.data as RunSummary[]) || [];
      setRuns(list);
      // Auto-select the most recent run if none is active
      if (!activeRunId && list.length > 0) setActiveRunId(list[0].id);
    } catch {
      // ignore
    }
  }, [agentId, activeRunId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // Reload runs when the stream ends so stats/status on the Runs tab are fresh
  useEffect(() => {
    if (stream.status === 'ended') loadRuns();
  }, [stream.status, loadRuns]);

  // While any run is in-flight, poll the runs list every 4 seconds so the
  // running card flips to "completed" promptly. Stops when nothing is live.
  useEffect(() => {
    const hasLive = runs.some((r) => r.status === 'running' || r.status === 'queued');
    if (!hasLive) return;
    const iv = setInterval(loadRuns, 4000);
    return () => clearInterval(iv);
  }, [runs, loadRuns]);

  const startRunActual = useCallback(async () => {
    setStarting(true);
    try {
      const res = await axios.post(`/api/v1/agents/${agentId}/runs`);
      const newRunId = res.data?.data?.runId as string;
      if (newRunId) {
        setActiveRunId(newRunId);
        setTab('results');
        setTriageOverrides({});
        loadRuns();
      }
    } catch {
      // TODO surface error
    } finally {
      setStarting(false);
    }
  }, [agentId, loadRuns]);

  const handleRunNow = async () => {
    // Pre-run guardrail: ask the backend how many candidates would survive the
    // current hard requirements. If 0, block. If < 10% of the pool, warn with
    // an override. Backend response shape:
    //   { poolSize, passedCount, rejectedCount, topRejectionReasons: [{rule:{id,description},count}] }
    // We map it to the frontend `DryRunResult` shape that <HardRequirementsWarning>
    // already expects (totalCandidates / passed / rejected / rejectionsByRule).
    try {
      const dry = await axios.post(`/api/v1/agents/${agentId}/hard-requirements/dry-run`, {});
      const raw = (dry.data?.data ?? dry.data) as {
        poolSize?: number;
        passedCount?: number;
        rejectedCount?: number;
        topRejectionReasons?: Array<{ rule: { id: string; description: string }; count: number }>;
      };
      if (raw && typeof raw.poolSize === 'number' && raw.poolSize > 0) {
        const result: DryRunResult = {
          totalCandidates: raw.poolSize,
          passed: raw.passedCount ?? 0,
          rejected: raw.rejectedCount ?? 0,
          rejectionsByRule: Object.fromEntries(
            (raw.topRejectionReasons ?? []).map((r) => [
              r.rule.id,
              { count: r.count, description: r.rule.description },
            ]),
          ),
        };
        const survivorRatio = result.passed / result.totalCandidates;
        if (result.passed === 0) {
          setDryRunWarning({ result, blocking: true });
          return;
        }
        if (survivorRatio < 0.1) {
          setDryRunWarning({ result, blocking: false });
          return;
        }
      }
    } catch {
      // Endpoint unavailable or no HR configured — fall through and start the run.
    }
    await startRunActual();
  };

  const handleCancel = async () => {
    if (!activeRunId) return;
    try {
      await axios.post(`/api/v1/agents/${agentId}/runs/${activeRunId}/cancel`);
    } catch {
      // ignore
    }
  };

  const triageMutation = async (candidateId: string, status: 'liked' | 'disliked') => {
    setTriageOverrides((prev) => ({ ...prev, [candidateId]: status }));
    try {
      await axios.patch(`/api/v1/agents/${agentId}/candidates/${candidateId}`, { status });
    } catch {
      setTriageOverrides((prev) => {
        const next = { ...prev };
        delete next[candidateId];
        return next;
      });
    }
  };

  // Toggle the activity SSE subscription based on the active tab. Closing the
  // EventSource when the user navigates away keeps server resources tidy.
  useEffect(() => {
    setActivityActive(tab === 'activity');
  }, [tab]);

  // Derive the candidate list to render: stream + triage overrides
  const candidates: RunCandidate[] = useMemo(() => {
    return stream.candidates.map((c) => {
      const override = triageOverrides[c.id];
      return override ? { ...c, status: override } : c;
    });
  }, [stream.candidates, triageOverrides]);

  const filteredCandidates = useMemo(() => {
    if (filter === 'all') return candidates;
    return candidates.filter((c) => c.status === filter);
  }, [candidates, filter]);

  const counts = useMemo(() => {
    return {
      all: candidates.length,
      pending: candidates.filter((c) => c.status === 'pending').length,
      liked: candidates.filter((c) => c.status === 'liked').length,
      disliked: candidates.filter((c) => c.status === 'disliked').length,
    };
  }, [candidates]);

  const activeRun = runs.find((r) => r.id === activeRunId);
  const isRunning = stream.status === 'streaming' || stream.status === 'connecting' || activeRun?.status === 'running' || activeRun?.status === 'queued';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{agentName}</h2>
            <p className="text-xs text-slate-500">
              {activeRun
                ? t('agents.workbench.drawer.runStatus', '{{status}} · {{triggered}}', {
                    status: activeRun.status,
                    triggered: activeRun.triggeredBy,
                  })
                : t('agents.workbench.drawer.noRuns', 'No runs yet')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* ICP usage pill — "Using ideal profile v3" or empty state */}
            {!isRunning && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  ideal.profile
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
                title={
                  ideal.profile
                    ? t('agents.workbench.icp.badgeUsingTooltip', 'Filters by hard requirements, then scores using this ICP.')
                    : t('agents.workbench.icp.badgeNoneTooltip', 'Like or dislike candidates to teach the agent.')
                }
              >
                {ideal.profile ? '✨' : '○'}{' '}
                {ideal.profile
                  ? t('agents.workbench.icp.badgeUsing', 'Using ideal profile v{{n}}', { n: ideal.profile.version })
                  : t('agents.workbench.icp.badgeNone', 'No ideal profile yet — using JD only')}
              </span>
            )}
            {isRunning ? (
              <button
                onClick={handleCancel}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('agents.workbench.drawer.cancel', 'Cancel')}
              </button>
            ) : (
              <button
                onClick={handleRunNow}
                disabled={starting}
                className="rounded-xl bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {starting
                  ? t('agents.workbench.drawer.starting', 'Starting…')
                  : t('agents.workbench.drawer.runNow', 'Run now')}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 px-6">
          <div className="flex gap-4">
            {(['results', 'runs', 'activity', 'settings'] as Tab[]).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative py-3 text-sm font-medium transition-colors ${
                  tab === key ? 'text-violet-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t(`agents.workbench.drawer.tabs.${key}`, key)}
                {tab === key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-violet-600" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {tab === 'results' && view === 'review' ? (
            <ReviewProfilesView
              agentId={agentId}
              candidates={candidates}
              onApprove={(id) => triageMutation(id, 'liked')}
              onReject={(id) => triageMutation(id, 'disliked')}
              onBack={() => setView('list')}
              onDone={() => setView('list')}
            />
          ) : (
            <div className="h-full overflow-y-auto">
              {tab === 'results' && (
                <ResultsTab
                  agentId={agentId}
                  runId={activeRunId}
                  counts={counts}
                  filter={filter}
                  onFilter={setFilter}
                  view={view}
                  onView={setView}
                  candidates={filteredCandidates}
                  onLike={(id) => triageMutation(id, 'liked')}
                  onDislike={(id) => triageMutation(id, 'disliked')}
                  streamStatus={stream.status}
                  hasRun={!!activeRunId}
                  onFindMore={handleRunNow}
                />
              )}
              {tab === 'runs' && (
                <RunsTab
                  runs={runs}
                  activeRunId={activeRunId}
                  agentId={agentId}
                  onSelectRun={(id) => {
                    setActiveRunId(id);
                    setTab('results');
                    setTriageOverrides({});
                  }}
                  onRefresh={loadRuns}
                />
              )}
              {tab === 'activity' && (
                <ActivityTab
                  activities={activityStream.events}
                  agentName={activityStream.agentName}
                  status={activityStream.status}
                />
              )}
              {tab === 'settings' && <SettingsTab agentId={agentId} onDeleted={onClose} />}
            </div>
          )}
        </div>
      </div>

      {dryRunWarning && (
        <HardRequirementsWarning
          result={dryRunWarning.result}
          blocking={dryRunWarning.blocking}
          onCancel={() => setDryRunWarning(null)}
          onEdit={() => {
            setDryRunWarning(null);
            setTab('settings');
          }}
          onOverride={() => {
            setDryRunWarning(null);
            void startRunActual();
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ResultsTab({
  agentId,
  runId,
  counts,
  filter,
  onFilter,
  view,
  onView,
  candidates,
  onLike,
  onDislike,
  streamStatus,
  hasRun,
  onFindMore,
}: {
  agentId: string;
  runId: string | null;
  counts: Record<'all' | 'pending' | 'liked' | 'disliked', number>;
  filter: ResultsFilter;
  onFilter: (f: ResultsFilter) => void;
  view: ResultsView;
  onView: (v: ResultsView) => void;
  candidates: RunCandidate[];
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  streamStatus: string;
  hasRun: boolean;
  onFindMore: () => void;
}) {
  const { t } = useTranslation();

  if (!hasRun) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-3 rounded-2xl bg-slate-100 p-4">
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-700">
          {t('agents.workbench.drawer.empty.title', 'No runs yet')}
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          {t('agents.workbench.drawer.empty.desc', 'Click "Run now" in the header to start the first execution.')}
        </p>
      </div>
    );
  }

  const showIntro = streamStatus === 'ended' && counts.pending > 0;
  // Defined below — pulls /summary for the active run when it's completed
  const showSummary = streamStatus === 'ended';

  return (
    <div className="px-6 py-5">
      {/* Run summary card — appears once a run completes */}
      {showSummary && runId && (
        <RunSummaryCard agentId={agentId} runId={runId} onFindMore={onFindMore} />
      )}

      {/* Initial matches intro card — shown when the run just ended and there are pending profiles */}
      {showIntro && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50 via-white to-white px-5 py-5">
          <p className="text-base font-medium text-slate-900">
            {t(
              'agents.workbench.review.introTitle',
              "I've found initial matches. Please review these profiles and share your feedback.",
            )}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t('agents.workbench.review.introDesc', 'Approve all {{count}} profiles to continue.', {
              count: counts.pending,
            })}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => onView('review')}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              {t('agents.workbench.review.reviewProfiles', 'Review Profiles')}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* View mode toggle + filter bar */}
      <div className="mb-4 flex items-center gap-2">
        {(['pending', 'liked', 'disliked', 'all'] as ResultsFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => onFilter(f)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? 'border-violet-500 bg-violet-50 text-violet-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t(`agents.workbench.drawer.filter.${f}`, f)}
            <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">{counts[f]}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-slate-500">
            {streamStatus === 'connecting' && t('agents.workbench.drawer.connecting', 'Connecting…')}
            {streamStatus === 'streaming' && t('agents.workbench.drawer.streaming', 'Streaming results…')}
            {streamStatus === 'ended' && t('agents.workbench.drawer.runComplete', 'Run complete')}
            {streamStatus === 'error' && t('agents.workbench.drawer.streamError', 'Stream disconnected')}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            <button
              onClick={() => onView('list')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                view === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              aria-label={t('agents.workbench.review.viewList', 'List view')}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => onView('review')}
              disabled={counts.pending === 0}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                view === 'review'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40'
              }`}
              aria-label={t('agents.workbench.review.viewReview', 'Review view')}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Candidate list */}
      <div className="space-y-2">
        {candidates.length === 0 && streamStatus === 'connecting' ? (
          <CandidateListSkeleton label={t('agents.workbench.drawer.loadingResults', 'Loading results…')} />
        ) : candidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            {t('agents.workbench.drawer.noMatches', 'No candidates in this view yet.')}
          </div>
        ) : (
          candidates.map((c) => <CandidateCard key={c.id} candidate={c} onLike={onLike} onDislike={onDislike} />)
        )}
      </div>
    </div>
  );
}

function CandidateListSkeleton({ label }: { label: string }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        <svg className="h-3.5 w-3.5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span>{label}</span>
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-10 w-10 flex-none animate-pulse rounded-full bg-slate-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  onLike,
  onDislike,
}: {
  candidate: RunCandidate;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
}) {
  const { t } = useTranslation();
  const disabled = candidate.status !== 'pending';

  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-violet-50 text-sm font-semibold text-violet-700">
        {candidate.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">{candidate.name}</p>
          {typeof candidate.matchScore === 'number' && (
            <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {Math.round(candidate.matchScore)}
            </span>
          )}
          {candidate.source && (
            <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {candidate.source}
            </span>
          )}
        </div>
        {candidate.headline && (
          <p className="mt-0.5 truncate text-xs text-slate-500">{candidate.headline}</p>
        )}
        {candidate.reason && (
          <p className="mt-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] leading-snug text-slate-100">
            {candidate.reason}
          </p>
        )}
      </div>
      <div className="flex flex-none items-center gap-1.5">
        <button
          onClick={() => onDislike(candidate.id)}
          disabled={disabled}
          className={`rounded-full border p-2 transition-colors ${
            candidate.status === 'disliked'
              ? 'border-red-500 bg-red-50 text-red-600'
              : 'border-slate-200 text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40'
          }`}
          aria-label={t('agents.workbench.drawer.dislike', 'Dislike')}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
          </svg>
        </button>
        <button
          onClick={() => onLike(candidate.id)}
          disabled={disabled}
          className={`rounded-full border p-2 transition-colors ${
            candidate.status === 'liked'
              ? 'border-green-500 bg-green-50 text-green-600'
              : 'border-slate-200 text-slate-500 hover:border-green-300 hover:bg-green-50 hover:text-green-600 disabled:opacity-40'
          }`}
          aria-label={t('agents.workbench.drawer.like', 'Like')}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.105 1.79l.05.025A4 4 0 008.945 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface RunProgressPayload {
  run: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    triggeredBy: string;
    durationMs: number;
    // Admin-only — scrubbed by backend for non-admin users
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    llmCallCount?: number;
    avgLatencyMs?: number;
  };
  elapsedMs: number;
  lastActivity: {
    eventType: string;
    message: string | null;
    severity: string;
    createdAt: string;
    payload: unknown;
  } | null;
  live: {
    scored: number;
    matched: number;
    errors: number;
    sourceHits: number;
    // Admin-only
    llmCallCount?: number;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    avgLatencyMs?: number;
  };
}

function RunsTab({
  runs,
  activeRunId,
  agentId,
  onSelectRun,
  onRefresh,
}: {
  runs: RunSummary[];
  activeRunId: string | null;
  agentId: string;
  onSelectRun: (id: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  if (runs.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-sm text-slate-500">
        {t('agents.workbench.drawer.noRunsYet', 'No runs yet. Click "Run now" in the header.')}
      </div>
    );
  }

  return (
    <div className="space-y-3 px-6 py-5">
      {runs.map((run) => {
        const isLive = run.status === 'running' || run.status === 'queued';
        if (isLive) {
          return (
            <LiveRunCard
              key={run.id}
              run={run}
              agentId={agentId}
              isActive={run.id === activeRunId}
              onSelect={() => onSelectRun(run.id)}
              onTransitioned={onRefresh}
            />
          );
        }
        return (
          <button
            key={run.id}
            onClick={() => onSelectRun(run.id)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
              run.id === activeRunId ? 'border-violet-300 bg-violet-50' : 'border-slate-200'
            }`}
          >
            <StatusDot status={run.status} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">
                  {t(`agents.workbench.drawer.runStatusLabel.${run.status}`, run.status)}
                </span>
                <span className="text-xs text-slate-500">· {run.triggeredBy}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{new Date(run.createdAt).toLocaleString()}</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>
                {t('agents.workbench.drawer.matchedCount', '{{count}} matched', {
                  count: run._count?.candidates ?? 0,
                })}
              </div>
              <div className="text-[10px] text-slate-400">
                {t('agents.workbench.drawer.activityCount', '{{count}} events', {
                  count: run._count?.activities ?? 0,
                })}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Rich live card for in-flight runs. Polls /agents/:id/runs/:runId/progress
// every 2 seconds for elapsed time, last activity, scored/matched counts,
// and LLM tokens/cost so far. Token/cost only render for admin users.
function LiveRunCard({
  run,
  agentId,
  isActive,
  onSelect,
  onTransitioned,
}: {
  run: RunSummary;
  agentId: string;
  isActive: boolean;
  onSelect: () => void;
  onTransitioned: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [progress, setProgress] = useState<RunProgressPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    let iv: ReturnType<typeof setInterval> | null = null;
    const fetchProgress = async () => {
      try {
        const res = await axios.get(`/api/v1/agents/${agentId}/runs/${run.id}/progress`);
        if (cancelled) return;
        const payload = res.data.data as RunProgressPayload;
        setProgress(payload);
        // If the run actually finished, stop polling and ask the parent to
        // reload the runs list so this card transitions to the regular row.
        const status = payload.run?.status;
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          if (iv) {
            clearInterval(iv);
            iv = null;
          }
          onTransitioned();
        }
      } catch {
        /* ignore */
      }
    };
    fetchProgress();
    iv = setInterval(fetchProgress, 2000);
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
    };
  }, [agentId, run.id, onTransitioned]);

  // Sensible zero-defaults so the card body always renders even before the
  // first poll returns. Avoids the "header-only orphan" state that previously
  // showed just "运行中 0ms" with no body.
  const elapsed = progress?.elapsedMs ?? 0;
  const live = progress?.live ?? { scored: 0, matched: 0, errors: 0, sourceHits: 0 };
  const last = progress?.lastActivity ?? null;
  const hasProgress = progress !== null;

  return (
    <button
      onClick={onSelect}
      className={`w-full overflow-hidden rounded-xl border bg-gradient-to-br from-violet-50/70 via-white to-white text-left transition-all ${
        isActive ? 'border-violet-400 ring-2 ring-violet-200' : 'border-violet-200'
      }`}
    >
      {/* Top stripe — live indicator */}
      <div className="flex items-center gap-2 border-b border-violet-100 bg-violet-50/60 px-4 py-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-600" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          {t(`agents.workbench.drawer.runStatusLabel.${run.status}`, run.status)}
        </span>
        <span className="text-[11px] text-slate-500">· {run.triggeredBy}</span>
        <span className="ml-auto font-mono text-xs text-violet-700">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* Body — always renders, even before the first poll returns */}
      <div className="px-4 py-3">
        {/* Last activity line — placeholder when no event has fired yet */}
        <div className="mb-3 flex items-start gap-2">
          <svg className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          <div className="min-w-0 flex-1">
            {last ? (
              <>
                <span className="font-mono text-[10px] text-slate-500">{last.eventType}</span>
                {last.message && <p className="truncate text-xs text-slate-700">{last.message}</p>}
              </>
            ) : (
              <p className="text-xs italic text-slate-500">
                {hasProgress
                  ? t('agents.workbench.drawer.live.warmingUp', 'Warming up…')
                  : t('agents.workbench.drawer.connecting', 'Connecting…')}
              </p>
            )}
          </div>
        </div>

        {/* Live count grid — always renders. Non-admin: 3 cols. Admin: 4 cols. */}
        <div className={`grid gap-3 ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <Metric label={t('agents.workbench.drawer.live.matched', 'matched')} value={live.matched} accent="emerald" />
          <Metric label={t('agents.workbench.drawer.live.scored', 'scored')} value={live.scored} accent="violet" />
          <Metric label={t('agents.workbench.drawer.live.errors', 'errors')} value={live.errors} accent={live.errors > 0 ? 'amber' : 'violet'} />
          {isAdmin && (
            <Metric
              label={t('agents.workbench.drawer.live.cost', 'cost')}
              value={(live.costUsd ?? 0) > 0 ? `$${(live.costUsd ?? 0).toFixed(4)}` : '—'}
              accent="amber"
            />
          )}
        </div>

        {/* Admin-only token line — only renders when we have at least one call */}
        {isAdmin && (live.llmCallCount ?? 0) > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 font-mono text-[10px] text-slate-600">
            <span>{(live.tokensIn ?? 0).toLocaleString()}↑ in · {(live.tokensOut ?? 0).toLocaleString()}↓ out</span>
            <span>{live.llmCallCount} calls · avg {live.avgLatencyMs ?? 0}ms</span>
          </div>
        )}
      </div>
    </button>
  );
}

function Metric({ label, value, accent }: { label: string; value: number | string; accent: 'emerald' | 'violet' | 'amber' }) {
  const valueColor =
    accent === 'emerald' ? 'text-emerald-700' : accent === 'amber' ? 'text-amber-700' : 'text-violet-700';
  return (
    <div>
      <div className={`text-base font-semibold ${valueColor}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m}:${String(remS).padStart(2, '0')}`;
}

// ── Run Summary Card ────────────────────────────────────────────────────────
//
// Renders a structured digest of a completed run at the top of the Results
// tab: numeric counts, top 5 candidates, common matched skills/gaps, and
// (admin only) LLM cost + token totals.

interface RunSummaryPayload {
  runId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number;
  counts: { matched: number; liked: number; disliked: number; pending: number; errors: number };
  topCandidates: Array<{ id: string; name: string; matchScore: number | null; reason: string | null; headline: string | null; source: string | null }>;
  topMatchedSkills: Array<{ skill: string; count: number }>;
  topGaps: Array<{ gap: string; count: number }>;
  llm?: { callCount: number; tokensIn: number; tokensOut: number; costUsd: number; avgLatencyMs: number };
}

function RunSummaryCard({
  agentId,
  runId,
  onFindMore,
}: {
  agentId: string;
  runId: string;
  onFindMore: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [summary, setSummary] = useState<RunSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [icpModalOpen, setIcpModalOpen] = useState(false);
  const ideal = useIdealProfile(agentId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get(`/api/v1/agents/${agentId}/runs/${runId}/summary`)
      .then((res) => {
        if (!cancelled) setSummary(res.data.data as RunSummaryPayload);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, runId]);

  if (loading || !summary) return null;

  const durationLabel = summary.durationMs > 0 ? formatElapsed(summary.durationMs) : '—';

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header strip */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">
            {t('agents.workbench.summary.title', 'Run summary')}
          </h3>
          <p className="text-[11px] text-slate-500">
            {t('agents.workbench.summary.subtitle', 'Completed in {{duration}} · {{matched}} candidates surfaced', {
              duration: durationLabel,
              matched: summary.counts.matched,
            })}
          </p>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-4 px-5 py-4">
          {/* Top stat row */}
          <div className={`grid gap-3 ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <SummaryStat label={t('agents.workbench.summary.matched', 'Matched')} value={summary.counts.matched} />
            <SummaryStat label={t('agents.workbench.summary.liked', 'Liked')} value={summary.counts.liked} accent="emerald" />
            <SummaryStat label={t('agents.workbench.summary.pending', 'Pending')} value={summary.counts.pending} />
            <SummaryStat label={t('agents.workbench.summary.errors', 'Errors')} value={summary.counts.errors} accent={summary.counts.errors > 0 ? 'red' : undefined} />
            {isAdmin && summary.llm && (
              <SummaryStat
                label={t('agents.workbench.summary.cost', 'Cost')}
                value={summary.llm.costUsd > 0 ? `$${summary.llm.costUsd.toFixed(4)}` : '—'}
                accent="violet"
              />
            )}
          </div>

          {/* Top candidates */}
          {summary.topCandidates.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {t('agents.workbench.summary.topCandidates', 'Top candidates')}
              </h4>
              <ol className="space-y-1.5">
                {summary.topCandidates.map((c, i) => (
                  <li key={c.id} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-slate-900 text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{c.name}</span>
                        {typeof c.matchScore === 'number' && (
                          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {Math.round(c.matchScore)}
                          </span>
                        )}
                      </div>
                      {c.headline && <p className="truncate text-[11px] text-slate-500">{c.headline}</p>}
                      {c.reason && <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{c.reason}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Skills + gaps grid */}
          {(summary.topMatchedSkills.length > 0 || summary.topGaps.length > 0) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {summary.topMatchedSkills.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t('agents.workbench.summary.commonStrengths', 'Common strengths')}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.topMatchedSkills.map((s) => (
                      <span
                        key={s.skill}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                      >
                        {s.skill}
                        <span className="text-[9px] text-emerald-500">×{s.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {summary.topGaps.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t('agents.workbench.summary.commonGaps', 'Common gaps')}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.topGaps.map((g) => (
                      <span
                        key={g.gap}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
                      >
                        {g.gap}
                        <span className="text-[9px] text-amber-500">×{g.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Admin-only LLM details */}
          {isAdmin && summary.llm && summary.llm.callCount > 0 && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2 font-mono text-[11px] text-violet-700">
              <span>{summary.llm.callCount} calls</span>
              <span className="mx-2 text-violet-300">·</span>
              <span>{summary.llm.tokensIn.toLocaleString()}↑ in</span>
              <span className="mx-2 text-violet-300">·</span>
              <span>{summary.llm.tokensOut.toLocaleString()}↓ out</span>
              <span className="mx-2 text-violet-300">·</span>
              <span>avg {summary.llm.avgLatencyMs}ms</span>
            </div>
          )}

          {/* ICP update delta strip — triage activity present */}
          {(summary.counts.liked + summary.counts.disliked) >= 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2">
              <span className="text-sm">✨</span>
              <span className="text-xs text-violet-800">
                {ideal.profile
                  ? t('agents.workbench.icp.deltaStripUpdated', 'Ideal profile updated · v{{n}}', { n: ideal.profile.version })
                  : t('agents.workbench.icp.deltaStripNoICP', "Ready to learn — generate your first ideal profile")}
              </span>
              <button
                type="button"
                onClick={() => setIcpModalOpen(true)}
                className="ml-auto rounded-lg border border-violet-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
              >
                {t('agents.workbench.icp.regenerate', 'Regenerate')}
              </button>
            </div>
          )}

          {/* Action row — Find more + Get suggestions */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button
              onClick={onFindMore}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 8v4M9 10h4" />
              </svg>
              {t('agents.workbench.summary.findMore', 'Find more candidates')}
            </button>
            {summary.counts.disliked > 0 && (
              <button
                onClick={() => setSuggestionsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {t('agents.workbench.summary.getSuggestions', 'Get criteria suggestions')}
                <span className="rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">{summary.counts.disliked}</span>
              </button>
            )}
            <span className="ml-auto text-[11px] text-slate-500">
              {t(
                'agents.workbench.summary.findMoreHint',
                'Already-evaluated candidates are skipped automatically.',
              )}
            </span>
          </div>
        </div>
      )}

      {suggestionsOpen && (
        <CriteriaSuggestionsModal
          agentId={agentId}
          runId={runId}
          onClose={() => setSuggestionsOpen(false)}
        />
      )}

      {icpModalOpen && (
        <IcpRegenerateLauncher agentId={agentId} onClose={() => setIcpModalOpen(false)} />
      )}
    </div>
  );
}

// Small wrapper that owns a useIdealProfile instance so the regenerate modal
// has a fresh hook and the RunSummaryCard's badge updates when regen finishes.
function IcpRegenerateLauncher({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const ideal = useIdealProfile(agentId);
  const [prev] = useState(ideal.profile);
  return (
    <RegenerateProfileModal
      previousProfile={prev}
      currentProfile={ideal.profile}
      regenerating={ideal.regenerating}
      onConfirm={async () => {
        await ideal.regenerate();
      }}
      onRevert={async () => {
        if (prev) await ideal.revert(prev.version);
      }}
      onClose={onClose}
    />
  );
}

// ── Criteria Suggestions Modal ──────────────────────────────────────────────
//
// When the recruiter has rejected candidates, the agent inspects the rejection
// pattern and proposes 3-5 actionable changes to the search criteria. Each
// suggestion can be applied with one click — pinned add suggestions become
// dealbreakers, modify/remove edit existing entries.

interface CriteriaSuggestion {
  id: string;
  type: 'add' | 'modify' | 'remove';
  text: string;
  rationale: string;
  newCriterion?: { text: string; pinned: boolean; bucket: 'most' | 'least' };
  targetIndex?: number;
}

interface SuggestionsResponse {
  suggestions: CriteriaSuggestion[];
  summary: string | null;
  rejectedCount: number;
}

function CriteriaSuggestionsModal({
  agentId,
  runId,
  onClose,
}: {
  agentId: string;
  runId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .post(`/api/v1/agents/${agentId}/runs/${runId}/criteria-suggestions`)
      .then((res) => {
        if (cancelled) return;
        setData(res.data.data as SuggestionsResponse);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg ?? 'Failed to load suggestions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, runId]);

  const applySuggestion = async (suggestion: CriteriaSuggestion) => {
    setApplying(suggestion.id);
    try {
      // Read current agent.config.criteria
      const agentRes = await axios.get(`/api/v1/agents/${agentId}`);
      const config = (agentRes.data.data?.config as { criteria?: AgentCriterion[] } | null) ?? {};
      const criteria: AgentCriterion[] = Array.isArray(config.criteria) ? [...config.criteria] : [];

      if (suggestion.type === 'add' && suggestion.newCriterion) {
        criteria.push({
          id: `c_${Math.random().toString(36).slice(2, 10)}`,
          text: suggestion.newCriterion.text,
          pinned: suggestion.newCriterion.pinned,
          bucket: suggestion.newCriterion.bucket,
        });
      } else if (suggestion.type === 'modify' && typeof suggestion.targetIndex === 'number') {
        const idx = suggestion.targetIndex - 1; // 1-indexed → 0-indexed
        if (idx >= 0 && idx < criteria.length && suggestion.newCriterion) {
          criteria[idx] = {
            ...criteria[idx],
            text: suggestion.newCriterion.text,
            pinned: suggestion.newCriterion.pinned,
            bucket: suggestion.newCriterion.bucket,
          };
        }
      } else if (suggestion.type === 'remove' && typeof suggestion.targetIndex === 'number') {
        const idx = suggestion.targetIndex - 1;
        if (idx >= 0 && idx < criteria.length) {
          criteria.splice(idx, 1);
        }
      }

      await axios.patch(`/api/v1/agents/${agentId}`, { config: { ...config, criteria } });
      setAppliedIds((prev) => new Set([...prev, suggestion.id]));
    } catch {
      /* surface in UI? */
    } finally {
      setApplying(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-[2px] py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {t('agents.workbench.suggestions.title', 'Criteria suggestions')}
              </h2>
            </div>
            <p className="ml-9 mt-0.5 text-xs text-slate-500">
              {t(
                'agents.workbench.suggestions.subtitle',
                'Based on the candidates you rejected, here are some refinements that could help.',
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <p className="text-sm text-slate-500">
                {t('agents.workbench.suggestions.analyzing', 'Analyzing rejected candidates…')}
              </p>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {data && (
            <div className="space-y-4">
              {data.summary && (
                <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
                    {t('agents.workbench.suggestions.pattern', 'Pattern detected')}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{data.summary}</p>
                </div>
              )}
              {data.suggestions.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  {t('agents.workbench.suggestions.empty', 'No specific suggestions — the agent thinks your criteria are well-tuned.')}
                </p>
              ) : (
                data.suggestions.map((s) => {
                  const isApplied = appliedIds.has(s.id);
                  const typeLabel =
                    s.type === 'add'
                      ? t('agents.workbench.suggestions.typeAdd', 'Add')
                      : s.type === 'modify'
                        ? t('agents.workbench.suggestions.typeModify', 'Modify')
                        : t('agents.workbench.suggestions.typeRemove', 'Remove');
                  const typeColor =
                    s.type === 'add'
                      ? 'bg-emerald-100 text-emerald-700'
                      : s.type === 'modify'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700';
                  return (
                    <div key={s.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-2 flex items-start gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColor}`}>
                          {typeLabel}
                        </span>
                        <p className="text-sm font-semibold text-slate-900">{s.text}</p>
                      </div>
                      <p className="mb-3 text-xs leading-snug text-slate-600">{s.rationale}</p>
                      {s.newCriterion && (
                        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-mono text-[10px] text-slate-500">
                            {s.newCriterion.pinned ? '📌 PINNED · ' : ''}
                            {s.newCriterion.bucket === 'most' ? 'MOST IMPORTANT' : 'LEAST IMPORTANT'}
                          </span>
                          <p className="mt-0.5">{s.newCriterion.text}</p>
                        </div>
                      )}
                      <button
                        onClick={() => applySuggestion(s)}
                        disabled={isApplied || applying === s.id}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isApplied
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50'
                        }`}
                      >
                        {isApplied ? (
                          <>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            {t('agents.workbench.suggestions.applied', 'Applied')}
                          </>
                        ) : applying === s.id ? (
                          t('common.saving', 'Saving…')
                        ) : (
                          t('agents.workbench.suggestions.apply', 'Apply')
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number | string; accent?: 'emerald' | 'red' | 'violet' }) {
  const valueColor =
    accent === 'emerald' ? 'text-emerald-700' : accent === 'red' ? 'text-red-700' : accent === 'violet' ? 'text-violet-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
      <div className={`text-lg font-semibold ${valueColor}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'completed'
      ? 'bg-green-500'
      : status === 'running' || status === 'queued'
        ? 'bg-blue-500 animate-pulse'
        : status === 'failed'
          ? 'bg-red-500'
          : status === 'cancelled'
            ? 'bg-slate-400'
            : 'bg-slate-300';
  return <span className={`h-2 w-2 flex-none rounded-full ${color}`} />;
}

function ActivityTab({
  activities,
  agentName,
  status,
}: {
  activities: RunActivity[];
  agentName: string | null;
  status: 'connecting' | 'streaming' | 'error';
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // SSE feed delivers oldest→newest; the user expects newest→oldest in a log view.
  const display = useMemo(() => [...activities].reverse(), [activities]);

  if (status === 'connecting' && activities.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-sm text-slate-500">
        {t('agents.workbench.drawer.connecting', 'Connecting…')}
      </div>
    );
  }
  if (display.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-sm text-slate-500">
        {t('agents.workbench.drawer.noActivity', 'No activity yet.')}
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      {/* Live indicator + agent name header */}
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            status === 'streaming'
              ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
              : status === 'error'
                ? 'bg-red-500'
                : 'bg-slate-300'
          }`}
        />
        <span className="text-xs font-medium text-slate-600">
          {agentName ?? '—'}
        </span>
        <span className="text-[11px] text-slate-400">
          · {t('agents.workbench.drawer.eventCount', '{{count}} events', { count: display.length })}
        </span>
      </div>

      <ol className="relative border-l border-slate-200 pl-5">
        {display.map((a) => {
          const severityClass =
            a.severity === 'error'
              ? 'bg-red-100 text-red-700'
              : a.severity === 'warn'
                ? 'bg-amber-100 text-amber-700'
                : a.eventType.startsWith('llm.')
                  ? 'bg-violet-100 text-violet-700'
                  : a.eventType === 'match.scored'
                    ? 'bg-emerald-100 text-emerald-700'
                    : a.eventType.startsWith('source.')
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-slate-100 text-slate-600';

          // Inline metrics for llm.call.completed events. Tokens + cost are
          // admin-only; latency stays visible to everyone.
          const payload = a.payload as Record<string, unknown> | null;
          let metrics: string | null = null;
          if (a.eventType === 'llm.call.completed' && payload) {
            const lat = payload.latencyMs as number | undefined;
            if (isAdmin) {
              const tIn = payload.tokensIn as number | undefined;
              const tOut = payload.tokensOut as number | undefined;
              const cost = payload.costUsd as number | undefined;
              metrics = `${tIn ?? 0}↑ ${tOut ?? 0}↓ · $${(cost ?? 0).toFixed(5)} · ${lat ?? 0}ms`;
            } else if (lat !== undefined) {
              metrics = `${lat}ms`;
            }
          }

          return (
            <li key={a.id} className="mb-3 ml-2">
              <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${severityClass}`}>
                  {a.eventType}
                </span>
                <span className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleTimeString()}</span>
                {agentName && <span className="text-[10px] font-medium text-slate-500">· {agentName}</span>}
                <span className="text-[10px] text-slate-400">· {a.actor}</span>
                {metrics && <span className="font-mono text-[10px] text-violet-600">· {metrics}</span>}
              </div>
              {a.message && <p className="mt-0.5 text-xs leading-snug text-slate-700">{a.message}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab({ agentId, onDeleted }: { agentId: string; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [hardRequirements, setHardRequirements] = useState<HardRequirement[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [jobId, setJobId] = useState('');
  const [taskType, setTaskType] = useState<'search_candidates' | 'match_resumes'>('search_candidates');
  const [sourceModes, setSourceModes] = useState<SourceMode[]>([]);
  const [autonomy, setAutonomy] = useState<'manual' | 'scheduled'>('manual');
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>('off');
  const [scheduleCron, setScheduleCron] = useState('');

  // Detect the preset that matches a stored cron string
  const presetForCron = (cron: string | null): SchedulePreset => {
    if (!cron) return 'off';
    for (const [key, value] of Object.entries(SCHEDULE_PRESETS)) {
      if (value === cron) return key as SchedulePreset;
    }
    return 'custom';
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRes, jobsRes] = await Promise.all([
        axios.get(`/api/v1/agents/${agentId}`),
        axios.get('/api/v1/agents/jobs-available', { params: { limit: 100 } }),
      ]);
      const a = agentRes.data.data as AgentDetail;
      setAgent(a);
      setName(a.name);
      setDescription(a.description);
      setInstructions(a.instructions ?? '');
      setJobId(a.jobId ?? '');
      setTaskType(((a.taskType === 'search' ? 'search_candidates' : a.taskType === 'match' ? 'match_resumes' : a.taskType) as 'search_candidates' | 'match_resumes') || 'search_candidates');
      setSourceModes((a.source?.modes ?? []) as SourceMode[]);
      setAutonomy(a.scheduleEnabled ? 'scheduled' : 'manual');
      const preset = presetForCron(a.schedule);
      setSchedulePreset(a.scheduleEnabled ? preset : 'off');
      setScheduleCron(a.schedule ?? '');
      setJobs((jobsRes.data.data as JobOption[]) || []);
      const cfg = (a.config as { hardRequirements?: HardRequirement[] } | null) ?? {};
      setHardRequirements(cfg.hardRequirements ?? []);
      setDirty(false);
    } catch (err) {
      console.error('Failed to load agent settings:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const markDirty = () => setDirty(true);

  const toggleSource = (mode: SourceMode) => {
    setSourceModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
    markDirty();
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim() || !description.trim() || !jobId) {
      setError(t('agents.workbench.settings.requiredMissing', 'Name, search criteria, and linked job are required'));
      return;
    }
    let cron: string | undefined;
    if (autonomy === 'scheduled') {
      cron = schedulePreset === 'custom' ? scheduleCron.trim() : SCHEDULE_PRESETS[schedulePreset as 'hourly' | 'daily' | 'weekly'];
      if (!cron || cron.split(/\s+/).filter(Boolean).length < 5) {
        setError(t('agents.workbench.errors.invalidCron', 'Enter a valid cron expression (5 fields)'));
        return;
      }
    }

    setSaving(true);
    try {
      const existingConfig = (agent?.config ?? {}) as Record<string, unknown>;
      await axios.patch(`/api/v1/agents/${agentId}`, {
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim() || null,
        jobId,
        taskType,
        source: taskType === 'search_candidates' ? { modes: sourceModes } : null,
        autonomy,
        schedule: autonomy === 'scheduled' ? cron : null,
        scheduleEnabled: autonomy === 'scheduled',
        config: { ...existingConfig, hardRequirements },
      });
      // Keep the dedicated HR endpoint in sync — it owns validation + audit log.
      try {
        await axios.patch(`/api/v1/agents/${agentId}/hard-requirements`, { hardRequirements });
      } catch {
        /* ignore if not yet deployed */
      }
      setDirty(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('agents.workbench.errors.createFailed', 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('agents.workbench.settings.confirmDelete', 'Delete this agent? This cannot be undone.'))) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/v1/agents/${agentId}`);
      onDeleted();
    } catch {
      setDeleting(false);
    }
  };

  if (loading || !agent) {
    return <div className="p-6 text-sm text-slate-500">{t('common.loading', 'Loading…')}</div>;
  }

  return (
    <div className="relative pb-24">
      <div className="space-y-8 px-6 py-6">
        {/* Identity */}
        <Section label={t('agents.workbench.settings.sections.identity', 'Identity')}>
          <Field label={t('agents.agentName', 'Agent Name')}>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); markDirty(); }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </Field>
        </Section>

        {/* Ideal Candidate Profile — the canonical home */}
        <Section label={t('agents.workbench.settings.sections.idealProfile', 'Ideal Profile')}>
          <IdealProfileCard agentId={agentId} />
        </Section>

        {/* Task type */}
        <Section label={t('agents.workbench.settings.sections.task', 'Task')}>
          <div className="grid grid-cols-2 gap-2">
            {(['search_candidates', 'match_resumes'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => { setTaskType(key); markDirty(); }}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  taskType === key
                    ? 'border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {key === 'search_candidates'
                  ? t('agents.taskTypeSearch', 'Search Candidates')
                  : t('agents.workbench.taskTypeMatchResumes', 'Match Resumes')}
              </button>
            ))}
          </div>
        </Section>

        {/* Target job */}
        <Section label={t('agents.workbench.settings.sections.target', 'Target')}>
          <Field label={t('agents.linkedJob', 'Linked Job')}>
            <select
              value={jobId}
              onChange={(e) => { setJobId(e.target.value); markDirty(); }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            >
              <option value="">{t('agents.selectJob', 'Select a job...')}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                  {j.user ? ` — ${j.user.name || j.user.email}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        {/* Candidate source */}
        {taskType === 'search_candidates' && (
          <Section label={t('agents.workbench.settings.sections.sources', 'Candidate Sources')}>
            <div className="grid grid-cols-1 gap-2">
              {(['instant_search', 'internal_minio', 'external_api'] as SourceMode[]).map((mode) => {
                const selected = sourceModes.includes(mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => toggleSource(mode)}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                        : 'border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border ${
                        selected ? 'border-violet-600 bg-violet-600' : 'border-slate-400 bg-white'
                      }`}
                    >
                      {selected && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        {t(`agents.workbench.source.${mode}.name`, mode)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {t(`agents.workbench.source.${mode}.desc`, '')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Hard requirements — strict pool filter */}
        <Section label={t('agents.workbench.settings.sections.hardRequirements', 'Hard Requirements')}>
          <HardRequirementsEditor
            value={hardRequirements}
            onChange={(next) => {
              setHardRequirements(next);
              markDirty();
            }}
          />
        </Section>

        {/* Search criteria */}
        <Section
          label={t('agents.workbench.settings.sections.criteria', 'Search Criteria')}
          action={
            <button
              onClick={() => setCriteriaOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-800"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 4v4h4l4-4m5-13l3 3-8 8H8v-3l8-8z" />
              </svg>
              {t('agents.workbench.settings.fineTuneCriteria', 'Fine-tune criteria')}
            </button>
          }
        >
          <AutoGrowTextarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); markDirty(); }}
            placeholder={t('agents.criteriaPlaceholder', 'Describe your ideal candidate in detail...')}
            minRows={3}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </Section>

        {/* Instructions */}
        <Section label={t('agents.workbench.settings.sections.instructions', 'Instructions')}>
          <AutoGrowTextarea
            value={instructions}
            onChange={(e) => { setInstructions(e.target.value); markDirty(); }}
            placeholder={t('agents.instructionsPlaceholder', 'Tell the agent what you want it to do...')}
            minRows={3}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </Section>

        {/* Schedule */}
        <Section label={t('agents.workbench.settings.sections.schedule', 'Schedule')}>
          <div className="grid grid-cols-5 gap-2">
            {(['off', 'hourly', 'daily', 'weekly', 'custom'] as SchedulePreset[]).map((preset) => {
              const selected = schedulePreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setSchedulePreset(preset);
                    setAutonomy(preset === 'off' ? 'manual' : 'scheduled');
                    markDirty();
                  }}
                  className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t(`agents.workbench.schedulePreset.${preset}`, preset)}
                </button>
              );
            })}
          </div>
          {schedulePreset === 'custom' && (
            <input
              type="text"
              value={scheduleCron}
              onChange={(e) => { setScheduleCron(e.target.value); markDirty(); }}
              placeholder="0 9 * * 1-5"
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          )}
          {schedulePreset !== 'off' && schedulePreset !== 'custom' && (
            <p className="mt-1 font-mono text-[11px] text-slate-500">
              cron: {SCHEDULE_PRESETS[schedulePreset as 'hourly' | 'daily' | 'weekly']}
            </p>
          )}
        </Section>

        {/* Danger zone */}
        <Section
          label={t('agents.workbench.settings.sections.danger', 'Danger Zone')}
          tone="danger"
        >
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/50 p-4">
            <div>
              <p className="text-sm font-semibold text-red-900">
                {t('agents.workbench.settings.deleteAgent', 'Delete agent')}
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                {t(
                  'agents.workbench.settings.deleteDesc',
                  'Removes the agent, its runs, candidates, and activity log. This cannot be undone.',
                )}
              </p>
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? t('common.deleting', 'Deleting…') : t('common.delete', 'Delete')}
            </button>
          </div>
        </Section>
      </div>

      {/* Sticky save bar — only visible when dirty */}
      {dirty && (
        <div className="fixed bottom-0 left-auto right-0 w-full max-w-4xl border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="font-medium text-slate-700">
                {t('agents.workbench.settings.unsavedChanges', 'You have unsaved changes')}
              </span>
              {error && <span className="text-red-600">· {error}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={load}
                disabled={saving}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                {t('agents.workbench.settings.discard', 'Discard')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? t('common.saving', 'Saving…') : t('agents.workbench.settings.saveChanges', 'Save changes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {criteriaOpen && (
        <AgentCriteriaModal
          agentId={agentId}
          initial={((agent.config as { criteria?: AgentCriterion[] } | null)?.criteria ?? []) as AgentCriterion[]}
          onClose={() => setCriteriaOpen(false)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}

function Section({
  label,
  action,
  tone = 'default',
  children,
}: {
  label: string;
  action?: React.ReactNode;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
            tone === 'danger' ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {label}
        </span>
        <span className={`h-px flex-1 ${tone === 'danger' ? 'bg-red-100' : 'bg-slate-100'}`} />
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
