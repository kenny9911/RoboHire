import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface MatchingBatchSessionPreview {
  id: string;
  title: string | null;
  status: string;
  job?: {
    id: string;
    title: string;
  };
}

interface MatchingBatch {
  id: string;
  title: string | null;
  status: string;
  totalJobs: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  filteredTasks: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  configSnapshot?: {
    selectedJobCount: number;
    selectedResumeCount: number;
    maxAgents: number;
    hasPreFilter: boolean;
  };
  matchingSessions?: MatchingBatchSessionPreview[];
}

interface MatchingBatchHistoryProps {
  onSelectBatch: (batchId: string | null) => void;
  selectedBatchId: string | null;
  refreshTrigger?: number;
  embedded?: boolean;
  limit?: number;
  filterParams?: Record<string, string>;
  onDeletedBatch?: (batchId: string) => void;
}

const STATUS_BADGES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  running: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
};

export default function MatchingBatchHistory({
  onSelectBatch,
  selectedBatchId,
  refreshTrigger,
  embedded = false,
  limit = 50,
  filterParams,
  onDeletedBatch,
}: MatchingBatchHistoryProps) {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<MatchingBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const formatTime = useCallback(
    (value: string | null | undefined) => (
      value
        ? new Date(value).toLocaleString()
        : t('product.matching.sessionEndPending', 'In progress')
    ),
    [t]
  );

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/matching/batches', {
        params: {
          limit,
          includeTotal: 'false',
          ...filterParams,
        },
      });
      setBatches(res.data.data || []);
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [filterParams, limit]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches, refreshTrigger]);

  const handleDelete = async (batchId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm(t('product.matching.deleteBatchConfirm', 'Delete this matching run?'))) return;
    try {
      await axios.delete(`/api/v1/matching/batches/${batchId}`);
      setBatches((prev) => prev.filter((batch) => batch.id !== batchId));
      if (selectedBatchId === batchId) {
        onSelectBatch(null);
      }
      onDeletedBatch?.(batchId);
    } catch {
      // silent
    }
  };

  const batchCards = (
    <>
      {batches.length === 0 && !loading && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-900">
            {t('product.matching.noBatches', 'No batch matching runs yet.')}
          </p>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            {t('product.matching.noBatchesHint', 'New Smart Matching runs will appear here with their child job sessions.')}
          </p>
        </div>
      )}

      {batches.map((batch) => {
        const resolved = batch.completedTasks + batch.failedTasks + batch.filteredTasks;
        const progress = batch.totalTasks > 0 ? Math.round((resolved / batch.totalTasks) * 100) : 0;
        const statusLabel = t(
          `product.matching.session${batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}`,
          batch.status
        );
        const sessionPreview = (batch.matchingSessions || []).slice(0, 3);

        return (
          <div
            key={batch.id}
            className={`group relative overflow-hidden rounded-3xl border bg-white shadow-sm transition-all ${
              selectedBatchId === batch.id
                ? 'border-blue-300 ring-2 ring-blue-100'
                : 'border-slate-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md'
            }`}
          >
            <div
              className={`absolute inset-x-0 top-0 h-1 ${
                selectedBatchId === batch.id
                  ? 'bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400'
                  : 'bg-gradient-to-r from-slate-200 via-slate-100 to-white'
              }`}
            />

            <button
              type="button"
              onClick={() => onSelectBatch(batch.id)}
              className="w-full px-5 pb-5 pt-4 text-left"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                  <span className="text-base font-bold leading-none">{progress}%</span>
                  <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                    {t('product.matching.progressShort', 'run')}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 pr-10">
                    <h4 className="truncate text-base font-semibold text-slate-950">
                      {batch.title || t('product.matching.untitledBatch', 'Untitled matching run')}
                    </h4>
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                        STATUS_BADGES[batch.status] || STATUS_BADGES.completed
                      }`}
                      title={statusLabel}
                      aria-label={statusLabel}
                    >
                      {batch.status === 'completed' && (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {batch.status === 'running' && (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.93 4.93a10 10 0 0114.14 0A10 10 0 0122 12" />
                        </svg>
                      )}
                      {batch.status === 'failed' && (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>
                      {t('product.matching.batchStartedAt', 'Started')}: {formatTime(batch.startedAt || batch.createdAt)}
                    </span>
                    <span>
                      {t('product.matching.batchEndedAt', 'Ended')}: {formatTime(batch.completedAt)}
                    </span>
                    <span>
                      {t('product.matching.totalJobsLabel', '{{count}} jobs', {
                        count: batch.totalJobs,
                      })}
                    </span>
                    {batch.configSnapshot?.selectedResumeCount ? (
                      <span>
                        {t('product.matching.sessionSummaryResumeCount', '{{count}} resumes selected', {
                          count: batch.configSnapshot.selectedResumeCount,
                        })}
                      </span>
                    ) : null}
                    <span>
                      {t('product.matching.agentCountLabel', '{{count}} agents', {
                        count: batch.configSnapshot?.maxAgents || 6,
                      })}
                    </span>
                    {batch.configSnapshot?.hasPreFilter && (
                      <span>{t('product.matching.prefilterEnabled', 'AI pre-filter enabled')}</span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {t('product.matching.sessionStatsMatched', 'Matched')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {batch.completedTasks}/{batch.totalTasks}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {t('product.matching.failedCountInline', 'Failed')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{batch.failedTasks}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {t('product.matching.totalFilteredLabel', 'Filtered')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{batch.filteredTasks}</p>
                    </div>
                  </div>

                  {sessionPreview.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {sessionPreview.map((session) => (
                        <span
                          key={session.id}
                          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {session.job?.title || session.title || t('product.matching.untitledSession', 'Untitled Session')}
                        </span>
                      ))}
                      {(batch.matchingSessions?.length || 0) > sessionPreview.length && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                          {t('product.matching.moreSessions', '+{{count}} more', {
                            count: (batch.matchingSessions?.length || 0) - sessionPreview.length,
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={(event) => handleDelete(batch.id, event)}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
              title={t('product.matching.deleteBatch', 'Delete matching run')}
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
        {batchCards}
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
              {t('product.matching.batchHistory', 'Batch Matching History')}
            </p>
            <p className="text-xs text-slate-500">
              {t('product.matching.batchHistoryDesc', 'Parent matching runs and their job-session snapshots')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
            {batches.length}
          </span>
          {loading && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />}
        </div>
      </button>

      {expanded && (
        <div className="max-h-[28rem] overflow-y-auto border-t border-slate-200 bg-slate-50/70 p-3">
          <div className="space-y-3">{batchCards}</div>
        </div>
      )}
    </div>
  );
}
