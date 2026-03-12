import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { API_BASE } from '../../config';
import { usePageState } from '../../hooks/usePageState';
import PreMatchDialog from '../../components/PreMatchDialog';
import MatchingSessionHistory from '../../components/MatchingSessionHistory';
import MatchDetailModal from '../../components/MatchDetailModal';

interface Job {
  id: string;
  title: string;
  status: string;
  department?: string;
  location?: string;
}

interface MatchResult {
  id: string;
  resumeId: string;
  score: number | null;
  grade: string | null;
  status: string;
  matchData: any;
  createdAt: string;
  resume: {
    id: string;
    name: string;
    email: string | null;
    currentRole: string | null;
    experienceYears: string | null;
    tags: string[];
  };
}

interface MatchProgress {
  total: number;
  completed: number;
  failed: number;
  currentCandidateName: string | null;
  jobTitle: string;
  jobIndex?: number;
  jobCount?: number;
}

interface PreFilterProgress {
  status: string;
  total: number;
  passed?: number;
  excluded?: number;
  durationMs?: number;
}

const GRADE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-700',
  A: 'bg-emerald-100 text-emerald-700',
  'B+': 'bg-blue-100 text-blue-700',
  B: 'bg-blue-100 text-blue-700',
  'C': 'bg-amber-100 text-amber-700',
  D: 'bg-orange-100 text-orange-700',
  F: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600',
  reviewed: 'bg-blue-100 text-blue-700',
  shortlisted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  invited: 'bg-purple-100 text-purple-700',
};

export default function SmartMatching() {
  const { t, i18n } = useTranslation();
  const [jobs, setJobs] = usePageState<Job[]>('matching.jobs', []);
  const [selectedJobIds, setSelectedJobIds] = usePageState<string[]>('matching.selectedJobIds', []);
  const [matches, setMatches] = usePageState<MatchResult[]>('matching.matches', []);
  const [loadingJobs, setLoadingJobs] = useState(jobs.length > 0 ? false : true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [running, setRunning] = useState(false);
  const [matchProgress, setMatchProgress] = useState<MatchProgress | null>(null);
  const [preFilterProgress, setPreFilterProgress] = useState<PreFilterProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = usePageState<string>('matching.statusFilter', '');
  const [showPreMatchDialog, setShowPreMatchDialog] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionRefreshTrigger, setSessionRefreshTrigger] = useState(0);
  const [jobSearch, setJobSearch] = useState('');
  const [detailMatch, setDetailMatch] = useState<MatchResult | null>(null);
  const [jobSelectorExpanded, setJobSelectorExpanded] = useState(selectedJobIds.length === 0);

  const selectedJobIdSet = useMemo(() => new Set(selectedJobIds), [selectedJobIds]);

  const filteredJobs = useMemo(() => {
    if (!jobSearch.trim()) return jobs;
    const q = jobSearch.toLowerCase();
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.department?.toLowerCase().includes(q) ||
        j.location?.toLowerCase().includes(q)
    );
  }, [jobs, jobSearch]);

  const selectedJobTitles = useMemo(
    () => jobs.filter((j) => selectedJobIdSet.has(j.id)).map((j) => j.title),
    [jobs, selectedJobIdSet]
  );

  const getAuthHeaders = useCallback((stream = false): Record<string, string> => {
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (stream) {
      headers.Accept = 'text/event-stream';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const getCompletionMessage = useCallback((completed: number, failed: number, total: number, filtered?: number) => {
    let msg = '';
    if (failed > 0) {
      msg = t('product.matching.completePartial', 'Matching finished: {{completed}} completed, {{failed}} failed, {{total}} total.', {
        completed,
        failed,
        total,
      });
    } else {
      msg = t('product.matching.completeSuccess', 'Matching finished: {{completed}} of {{total}} resumes completed.', {
        completed,
        total,
      });
    }
    if (filtered && filtered > 0) {
      msg += ' ' + t('product.matching.preFilteredCount', '({{filtered}} pre-filtered out)', { filtered });
    }
    return msg;
  }, [t]);

  const formatRunMatchingError = useCallback((payload?: any, status?: number) => {
    if (payload?.error) return payload.error;
    if (status === 402) {
      return t('product.matching.limitExceeded', 'You have used all available matching credits. Upgrade or top up to continue.');
    }
    return t('product.matching.errorGeneric', 'Matching failed. Please try again.');
  }, [t]);

  // Fetch user's jobs (skip if cached)
  useEffect(() => {
    if (jobs.length > 0) return;
    (async () => {
      try {
        const res = await axios.get('/api/v1/jobs', { params: { limit: 100 } });
        setJobs(res.data.data || []);
      } catch {
        // silent
      } finally {
        setLoadingJobs(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch match results for all selected jobs
  const fetchMatches = useCallback(async (jobIds: string[]) => {
    if (jobIds.length === 0) {
      setMatches([]);
      return;
    }
    try {
      setLoadingMatches(true);
      const params: any = { sort: 'score', order: 'desc' };
      if (statusFilter) params.status = statusFilter;
      // Fetch matches for all selected jobs in parallel
      const results = await Promise.all(
        jobIds.map((jobId) => axios.get(`/api/v1/matching/results/${jobId}`, { params }).catch(() => ({ data: { data: [] } })))
      );
      const allMatches = results.flatMap((res) => res.data.data || []);
      // Sort by score desc
      allMatches.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
      setMatches(allMatches);
    } catch {
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, [statusFilter]);

  // Load session-specific matches
  const fetchSessionMatches = useCallback(async (sessionId: string) => {
    try {
      setLoadingMatches(true);
      const res = await axios.get(`/api/v1/matching/sessions/${sessionId}`);
      setMatches(res.data.data?.matches || []);
    } catch {
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionMatches(selectedSessionId);
    } else if (selectedJobIds.length > 0) {
      fetchMatches(selectedJobIds);
    } else {
      setMatches([]);
    }
  }, [selectedJobIds, selectedSessionId, fetchMatches, fetchSessionMatches]);

  const toggleJobSelection = useCallback((jobId: string) => {
    setSelectedJobIds((prev) => {
      if (prev.includes(jobId)) {
        return prev.filter((id) => id !== jobId);
      }
      return [...prev, jobId];
    });
    setSelectedSessionId(null);
  }, []);

  // Run AI matching for each selected job sequentially with SSE
  const runMatchingForJob = async (
    jobId: string,
    jobTitle: string,
    jobIndex: number,
    jobCount: number,
    config: {
      resumeIds: string[];
      preFilter?: { locations?: string[]; jobTypes?: string[]; freeText?: string };
      sessionName?: string;
    }
  ) => {
    setPreFilterProgress(null);
    setMatchProgress({
      total: 0,
      completed: 0,
      failed: 0,
      currentCandidateName: null,
      jobTitle,
      jobIndex,
      jobCount,
    });

    const sessionName = jobCount > 1
      ? `${config.sessionName ? config.sessionName + ' — ' : ''}${jobTitle}`
      : config.sessionName;

    const response = await fetch(`${API_BASE}/api/v1/matching/run`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      credentials: 'include',
      body: JSON.stringify({
        jobId,
        resumeIds: config.resumeIds,
        preFilter: config.preFilter,
        sessionName,
        locale: i18n.language,
      }),
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok && !contentType.includes('text/event-stream')) {
      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new Error(formatRunMatchingError(payload, response.status));
    }

    let matchedCount = 0;
    let failedCount = 0;
    let totalCount = 0;
    let filteredCount = 0;

    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const eventData = JSON.parse(line.slice(6));

              if (currentEvent === 'prefilter') {
                setPreFilterProgress({
                  status: eventData.status,
                  total: eventData.total ?? 0,
                  passed: eventData.passed,
                  excluded: eventData.excluded,
                  durationMs: eventData.durationMs,
                });
              } else if (currentEvent === 'progress') {
                setMatchProgress({
                  total: eventData.total ?? 0,
                  completed: eventData.completed ?? 0,
                  failed: eventData.failed ?? 0,
                  currentCandidateName: eventData.currentCandidateName ?? null,
                  jobTitle: eventData.jobTitle || jobTitle,
                  jobIndex,
                  jobCount,
                });
              } else if (currentEvent === 'complete' && eventData.success) {
                matchedCount = eventData.data?.totalMatched ?? 0;
                failedCount = eventData.data?.totalFailed ?? 0;
                totalCount = eventData.data?.total ?? matchedCount + failedCount;
                filteredCount = eventData.data?.totalFiltered ?? 0;
              } else if (currentEvent === 'error') {
                throw new Error(eventData.error || 'Matching failed');
              }
            } catch (e: any) {
              if (e.message && e.message !== 'Matching failed') throw e;
            }
            currentEvent = '';
          }
        }
      }
    } else {
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(formatRunMatchingError(data, response.status));
      }
      matchedCount = data.data?.totalMatched ?? 0;
      failedCount = data.data?.totalFailed ?? 0;
      totalCount = matchedCount + failedCount;
    }

    return { matched: matchedCount, failed: failedCount, total: totalCount, filtered: filteredCount };
  };

  const handleRunMatching = async (config: {
    resumeIds: string[];
    preFilter?: { locations?: string[]; jobTypes?: string[]; freeText?: string };
    sessionName?: string;
  }) => {
    if (selectedJobIds.length === 0) return;
    setShowPreMatchDialog(false);

    try {
      setRunning(true);
      setError(null);
      setSuccessMessage(null);

      let totalMatched = 0;
      let totalFailed = 0;
      let totalAll = 0;
      let totalFiltered = 0;

      const selectedJobs = jobs.filter((j) => selectedJobIdSet.has(j.id));

      for (let i = 0; i < selectedJobs.length; i++) {
        const job = selectedJobs[i];
        try {
          const result = await runMatchingForJob(job.id, job.title, i + 1, selectedJobs.length, config);
          totalMatched += result.matched;
          totalFailed += result.failed;
          totalAll += result.total;
          totalFiltered += result.filtered;
        } catch (err: any) {
          setError((prev) => (prev ? prev + '\n' : '') + `${job.title}: ${err.message}`);
        }
      }

      setSuccessMessage(getCompletionMessage(totalMatched, totalFailed, totalAll, totalFiltered));

      // Refresh matches and sessions
      setSelectedSessionId(null);
      await fetchMatches(selectedJobIds);
      setSessionRefreshTrigger((prev) => prev + 1);
    } catch {
      setError(t('product.matching.errorGeneric', 'Matching failed. Please try again.'));
    } finally {
      setRunning(false);
      setMatchProgress(null);
      setPreFilterProgress(null);
    }
  };

  // Update match status
  const handleStatusUpdate = async (matchId: string, newStatus: string) => {
    try {
      await axios.patch(`/api/v1/matching/results/${matchId}`, { status: newStatus });
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, status: newStatus } : m))
      );
    } catch {
      // handle error
    }
  };

  const statuses = ['', 'new', 'reviewed', 'shortlisted', 'rejected', 'invited'];
  const processedCount = matchProgress ? matchProgress.completed + matchProgress.failed : 0;
  const progressPercent = matchProgress
    ? matchProgress.total > 0
      ? Math.max(8, (processedCount / matchProgress.total) * 100)
      : 8
    : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.matching.title', 'Smart Matching')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.matching.subtitle', 'AI-powered candidate-job matching with detailed analysis.')}</p>
        </div>
        <button
          onClick={() => setShowPreMatchDialog(true)}
          disabled={selectedJobIds.length === 0 || running}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              {matchProgress?.total
                ? t('product.matching.runningProgress', 'Matching {{processed}} / {{total}}', {
                    processed: processedCount,
                    total: matchProgress.total,
                  })
                : t('product.matching.running', 'Matching...')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {t('product.matching.runMatch', 'Run AI Matching')}
              {selectedJobIds.length > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs">{selectedJobIds.length}</span>
              )}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-start justify-between gap-3">
            <p className="whitespace-pre-line">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 transition-colors hover:text-red-600"
            >
              <span className="sr-only">{t('product.matching.dismissError', 'Dismiss error')}</span>
              &times;
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <div className="flex items-start justify-between gap-3">
            <p>{successMessage}</p>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-400 transition-colors hover:text-emerald-600"
            >
              <span className="sr-only">{t('product.matching.dismissSuccess', 'Dismiss message')}</span>
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Job Selector — collapsible multi-select with checkboxes */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <button
          onClick={() => setJobSelectorExpanded(!jobSelectorExpanded)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${jobSelectorExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-sm font-semibold text-slate-700">
              {t('product.matching.selectJobs', 'Select Jobs')}
            </span>
            {selectedJobIds.length > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                {t('product.matching.jobsSelectedCount', '{{count}} selected', { count: selectedJobIds.length })}
              </span>
            )}
          </div>
          {selectedJobIds.length > 0 && !jobSelectorExpanded && (
            <span className="text-xs text-slate-500 truncate max-w-sm">
              {selectedJobTitles.join(', ')}
            </span>
          )}
        </button>

        {jobSelectorExpanded && (
          <div className="border-t border-slate-200 px-5 pb-4 pt-3">
            {loadingJobs ? (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-500">{t('product.matching.noJobs', 'No jobs found. Create a job first.')}</p>
                <Link
                  to="/product/jobs"
                  className="mt-2 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  {t('product.matching.goToJobs', 'Go to Jobs')}
                </Link>
              </div>
            ) : (
              <>
                {jobs.length > 5 && (
                  <input
                    type="text"
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                    placeholder={t('product.matching.searchJobs', 'Search jobs...')}
                    className="w-full mb-2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                )}
                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {filteredJobs.map((job) => (
                    <label
                      key={job.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                        running ? 'opacity-60 pointer-events-none' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedJobIdSet.has(job.id)}
                        onChange={() => toggleJobSelection(job.id)}
                        disabled={running}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-900">{job.title}</span>
                        {job.department && (
                          <span className="text-xs text-slate-500 ml-2">({job.department})</span>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        job.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                        job.status === 'draft' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {job.status}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Session History — always visible */}
      <MatchingSessionHistory
        onSelectSession={setSelectedSessionId}
        selectedSessionId={selectedSessionId}
        refreshTrigger={sessionRefreshTrigger}
      />

      {/* Viewing session banner */}
      {selectedSessionId && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-blue-700 font-medium">
            {t('product.matching.viewingSession', 'Viewing saved session results')}
          </span>
          <button
            onClick={() => setSelectedSessionId(null)}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            {t('product.matching.backToCurrent', 'Back to current results')}
          </button>
        </div>
      )}

      {/* Status filter */}
      {selectedJobIds.length > 0 && !selectedSessionId && (
        <div className="flex gap-2 flex-wrap">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s || t('product.matching.allStatuses', 'All')}
            </button>
          ))}
        </div>
      )}

      {/* Pre-filter progress */}
      {running && preFilterProgress && (
        <div className={`rounded-2xl border p-5 ${
          preFilterProgress.status === 'running'
            ? 'border-purple-200 bg-gradient-to-r from-purple-50 via-violet-50 to-fuchsia-50 shadow-[0_20px_42px_-30px_rgba(147,51,234,0.5)]'
            : 'border-purple-200 bg-purple-50'
        }`}>
          {preFilterProgress.status === 'running' ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-200/80">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {t('product.matching.preFilterRunning', 'Pre-filtering {{total}} resumes...', { total: preFilterProgress.total })}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t('product.matching.preFilterRunningDesc', 'AI is screening candidates to find the best matches for this job.')}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-purple-700">
              <svg className="w-5 h-5 text-purple-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t('product.matching.preFilterComplete', 'Pre-filter complete: {{passed}} passed, {{excluded}} excluded', {
                passed: preFilterProgress.passed ?? 0,
                excluded: preFilterProgress.excluded ?? 0,
              })}
              {preFilterProgress.durationMs && (
                <span className="text-purple-500 ml-1">({(preFilterProgress.durationMs / 1000).toFixed(1)}s)</span>
              )}
            </div>
          )}
        </div>
      )}

      {running && matchProgress && (!preFilterProgress || preFilterProgress.status === 'completed') && (
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-cyan-50 to-sky-50 p-5 shadow-[0_20px_42px_-30px_rgba(37,99,235,0.6)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200/80">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {matchProgress.jobCount && matchProgress.jobCount > 1
                    ? t('product.matching.progressTitleMulti', 'Job {{jobIndex}}/{{jobCount}}: Matching resumes for {{jobTitle}}', {
                        jobIndex: matchProgress.jobIndex,
                        jobCount: matchProgress.jobCount,
                        jobTitle: matchProgress.jobTitle,
                      })
                    : t('product.matching.progressTitle', 'Matching resumes for {{jobTitle}}', {
                        jobTitle: matchProgress.jobTitle,
                      })
                  }
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {t('product.matching.progressStats', '{{processed}} / {{total}} resumes processed', {
                    processed: processedCount,
                    total: matchProgress.total || '...',
                  })}
                  {matchProgress.failed > 0 && (
                    <>
                      {' · '}
                      {t('product.matching.progressFailed', '{{failed}} failed', {
                        failed: matchProgress.failed,
                      })}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                {t('product.matching.progressCurrentLabel', 'Currently matching')}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {matchProgress.currentCandidateName
                  ? t('product.matching.progressCurrent', '{{candidateName}} -> {{jobTitle}}', {
                      candidateName: matchProgress.currentCandidateName,
                      jobTitle: matchProgress.jobTitle,
                    })
                  : t('product.matching.progressPreparing', 'Preparing the next resume...')}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-blue-700">
              <span>{t('product.matching.running', 'Matching...')}</span>
              <span>
                {matchProgress.total > 0
                  ? `${processedCount}/${matchProgress.total}`
                  : t('product.matching.progressStarting', 'Starting...')}
              </span>
            </div>
            <div className="h-2 rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-[width] duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Match Results */}
      {(selectedJobIds.length > 0 || selectedSessionId) && (
        <>
          {loadingMatches ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : matches.length === 0 ? (
            running ? (
              <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {t('product.matching.running', 'Matching...')}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {t('product.matching.runningEmpty', 'Matching is in progress. Results will appear here automatically.')}
                </p>
              </div>
            ) : (
            <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
              <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-lg font-semibold text-slate-900">{t('product.matching.noResults', 'No match results yet')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('product.matching.noResultsDesc', 'Click "Run AI Matching" to match candidates against this job.')}</p>
            </div>
            )
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0">
                        <span className="text-sm font-bold text-blue-600">
                          {match.resume.name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/product/talent/${match.resume.id}`}
                            className="text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors"
                          >
                            {match.resume.name}
                          </Link>
                          {match.grade && (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[match.grade] || 'bg-slate-100 text-slate-600'}`}>
                              {match.grade}
                            </span>
                          )}
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[match.status] || STATUS_COLORS.new}`}>
                            {match.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          {match.resume.currentRole && <span>{match.resume.currentRole}</span>}
                          {match.resume.experienceYears && <span>{match.resume.experienceYears} {t('product.talent.yearsExp', 'years experience')}</span>}
                          {match.resume.email && <span>{match.resume.email}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Score */}
                      {match.score !== null && (
                        <div className="text-center">
                          <div className={`text-2xl font-bold ${
                            match.score >= 80 ? 'text-emerald-600' :
                            match.score >= 60 ? 'text-blue-600' :
                            match.score >= 40 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {match.score}
                          </div>
                          <div className="text-xs text-slate-400">{t('product.matching.score', 'score')}</div>
                        </div>
                      )}

                      {/* Preference Fit */}
                      {match.matchData?.preferenceAlignment && match.matchData.preferenceAlignment.overallScore < 100 && (
                        <div className="text-center">
                          <div className={`text-lg font-bold ${
                            match.matchData.preferenceAlignment.overallScore >= 80 ? 'text-emerald-600' :
                            match.matchData.preferenceAlignment.overallScore >= 50 ? 'text-amber-600' : 'text-red-500'
                          }`}>
                            {match.matchData.preferenceAlignment.overallScore}
                          </div>
                          <div className="text-[10px] text-slate-400">{t('product.matching.prefScore', 'pref. fit')}</div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {match.status !== 'shortlisted' && (
                          <button
                            onClick={() => handleStatusUpdate(match.id, 'shortlisted')}
                            title={t('product.matching.shortlist', 'Shortlist')}
                            className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}
                        {match.status !== 'rejected' && (
                          <button
                            onClick={() => handleStatusUpdate(match.id, 'rejected')}
                            title={t('product.matching.reject', 'Reject')}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {match.matchData && (
                          <button
                            onClick={() => setDetailMatch(match)}
                            title={t('product.matching.viewDetails', 'View Details')}
                            className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                          </button>
                        )}
                        <Link
                          to={`/product/talent/${match.resume.id}`}
                          title={t('product.matching.viewProfile', 'View Profile')}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  {match.resume.tags && match.resume.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {match.resume.tags.slice(0, 6).map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {tag}
                        </span>
                      ))}
                      {match.resume.tags.length > 6 && (
                        <span className="text-xs text-slate-400">+{match.resume.tags.length - 6}</span>
                      )}
                    </div>
                  )}

                  {/* Key highlights from matchData */}
                  {match.matchData?.highlights && Array.isArray(match.matchData.highlights) && match.matchData.highlights.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-500">
                        {match.matchData.highlights.slice(0, 3).join(' · ')}
                      </p>
                    </div>
                  )}

                  {/* Preference warnings */}
                  {match.matchData?.preferenceAlignment?.warnings?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {match.matchData.preferenceAlignment.warnings.slice(0, 3).map((w: string, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] text-amber-700">
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pre-match dialog */}
      <PreMatchDialog
        open={showPreMatchDialog}
        onClose={() => setShowPreMatchDialog(false)}
        onConfirm={handleRunMatching}
        jobTitle={selectedJobTitles.join(', ')}
        loading={running}
      />

      {/* Match detail modal */}
      <MatchDetailModal
        open={!!detailMatch}
        onClose={() => setDetailMatch(null)}
        matchData={detailMatch?.matchData}
        candidateName={detailMatch?.resume?.name || ''}
        score={detailMatch?.score ?? null}
        grade={detailMatch?.grade ?? null}
      />
    </div>
  );
}
