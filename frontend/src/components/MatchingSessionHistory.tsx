import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface MatchingSession {
  id: string;
  title: string | null;
  status: string;
  totalResumes: number;
  totalFiltered: number;
  totalMatched: number;
  totalFailed: number;
  avgScore: number | null;
  topGrade: string | null;
  totalCost: number;
  totalTokens: number;
  totalLLMCalls: number;
  createdAt: string;
  completedAt: string | null;
  preFilterModel: string | null;
  preFilterResult: any;
  criteriaSnapshot?: {
    selectedResumeCount: number;
    locations: string[];
    jobTypes: string[];
    freeText: string | null;
    hasPreFilter: boolean;
  };
  job: { id: string; title: string };
}

interface MatchingSessionHistoryProps {
  onSelectSession: (sessionId: string | null) => void;
  selectedSessionId: string | null;
  refreshTrigger?: number;
  embedded?: boolean;
  limit?: number;
}

const STATUS_BADGES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  running: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
};

export default function MatchingSessionHistory({
  onSelectSession,
  selectedSessionId,
  refreshTrigger,
  embedded = false,
  limit = 50,
}: MatchingSessionHistoryProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<MatchingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/matching/sessions', { params: { limit } });
      setSessions(res.data.data || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, refreshTrigger]);

  const handleDelete = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm(t('product.matching.deleteSessionConfirm', 'Delete this matching session?'))) return;
    try {
      await axios.delete(`/api/v1/matching/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      if (selectedSessionId === sessionId) {
        onSelectSession(null);
      }
    } catch {
      // silent
    }
  };

  const sessionCards = (
    <>
      {sessions.length === 0 && !loading && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-900">
            {t('product.matching.noSessions', 'No matching history yet. Run AI Matching to create your first session.')}
          </p>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            {t('product.matching.noSessionsHint', 'Saved sessions will keep the role, candidate selection, and matching criteria together for later reuse.')}
          </p>
        </div>
      )}

      {sessions.map((session) => {
        const criteriaItems: string[] = [];
        const matchRate =
          session.totalResumes > 0 ? Math.round((session.totalMatched / session.totalResumes) * 100) : 0;
        const statusLabel = t(
          `product.matching.session${session.status.charAt(0).toUpperCase() + session.status.slice(1)}`,
          session.status
        );

        if (session.criteriaSnapshot?.selectedResumeCount) {
          criteriaItems.push(
            t('product.matching.sessionSummaryResumeCount', '{{count}} resumes selected', {
              count: session.criteriaSnapshot.selectedResumeCount,
            })
          );
        }
        if (session.criteriaSnapshot?.locations?.length) {
          criteriaItems.push(
            t('product.matching.sessionSummaryLocationsShort', '{{count}} locations', {
              count: session.criteriaSnapshot.locations.length,
            })
          );
        }
        if (session.criteriaSnapshot?.jobTypes?.length) {
          criteriaItems.push(
            t('product.matching.sessionSummaryJobTypesShort', '{{count}} job types', {
              count: session.criteriaSnapshot.jobTypes.length,
            })
          );
        }

        return (
          <div
            key={session.id}
            className={`group relative overflow-hidden rounded-3xl border bg-white shadow-sm transition-all ${
              selectedSessionId === session.id
                ? 'border-blue-300 ring-2 ring-blue-100'
                : 'border-slate-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md'
            }`}
          >
            <div
              className={`absolute inset-x-0 top-0 h-1 ${
                selectedSessionId === session.id
                  ? 'bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400'
                  : 'bg-gradient-to-r from-slate-200 via-slate-100 to-white'
              }`}
            />

            <button
              type="button"
              onClick={() => onSelectSession(session.id)}
              className="w-full px-5 pb-5 pt-4 text-left"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                  <span className="text-base font-bold leading-none">{matchRate}%</span>
                  <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                    {t('product.matching.fit', 'fit')}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 pr-10">
                    <h4 className="truncate text-base font-semibold text-slate-950">
                      {session.title || t('product.matching.untitledSession', 'Untitled Session')}
                    </h4>
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                        STATUS_BADGES[session.status] || STATUS_BADGES.completed
                      }`}
                      title={statusLabel}
                      aria-label={statusLabel}
                    >
                      {session.status === 'completed' && (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {session.status === 'running' && (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.93 4.93a10 10 0 0114.14 0A10 10 0 0122 12" />
                        </svg>
                      )}
                      {session.status === 'failed' && (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      {!['completed', 'running', 'failed'].includes(session.status) && (
                        <span className="h-2.5 w-2.5 rounded-full bg-current" />
                      )}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {session.job?.title && (
                      <span className="font-semibold text-slate-700">{session.job.title}</span>
                    )}
                    <span>{new Date(session.createdAt).toLocaleString()}</span>
                    {session.preFilterModel && (
                      <span>{t('product.matching.prefilterEnabled', 'AI pre-filter enabled')}</span>
                    )}
                  </div>

                  {session.criteriaSnapshot?.freeText && (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                      {session.criteriaSnapshot.freeText}
                    </p>
                  )}

                  {criteriaItems.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {criteriaItems.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {t('product.matching.sessionStatsMatched', 'Matched')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {session.totalMatched}/{session.totalResumes}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {t('product.matching.avgScoreShort', 'Avg score')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {session.avgScore ?? '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {t('product.matching.topGradeShort', 'Top grade')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {session.topGrade || '-'}
                      </p>
                    </div>
                  </div>

                  {session.preFilterModel && session.preFilterResult && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {t('product.matching.preFilterSummary', 'Pre-filter: {{passed}} passed, {{excluded}} excluded', {
                          passed: session.preFilterResult.passedIds?.length ?? 0,
                          excluded: session.preFilterResult.excluded?.length ?? 0,
                        })}
                      </span>
                      {session.totalFailed > 0 && (
                        <span>{t('product.matching.failedCountInline', '{{count}} failed', { count: session.totalFailed })}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={(event) => handleDelete(session.id, event)}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
              title={t('product.matching.deleteSession', 'Delete session')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-3 p-4">
        {loading && (
          <div className="flex justify-center py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        )}
        {sessionCards}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900">
              {t('product.matching.sessionHistory', 'Session History')}
            </p>
            <p className="text-xs text-slate-500">
              {t('product.matching.sessionHistoryDesc', 'Saved matching strategies and result snapshots')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
            {sessions.length}
          </span>
          {loading && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />}
        </div>
      </button>

      {expanded && (
        <div className="max-h-[28rem] overflow-y-auto border-t border-slate-200 bg-slate-50/70 p-3">
          <div className="space-y-3">{sessionCards}</div>
        </div>
      )}
    </div>
  );
}
