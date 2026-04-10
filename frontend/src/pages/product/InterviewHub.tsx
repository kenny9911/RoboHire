import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { useAuth } from '../../context/AuthContext';
import RecruiterTeamFilter, { RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';

interface GoHireInterview {
  id: string;
  gohireUserId: string;
  candidateName: string;
  candidateEmail: string | null;
  interviewDatetime: string;
  interviewEndDatetime: string | null;
  duration: number | null;
  videoUrl: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  recruiterId: string | null;
  jobTitle: string | null;
  resumeUrl: string | null;
  lastLoginAt: string | null;
  invitedAt: string | null;
  evaluationScore: number | null;
  evaluationVerdict: string | null;
  candidateUserId: string | null;
  userId: string | null;
  resumeId: string | null;
  jobId: string | null;
  resumeProcessingStatus: string | null;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Stats {
  totalCount: number;
  withVideoCount: number;
  withEvaluationCount: number;
  dateRange: { earliest: string | null; latest: string | null } | null;
  topRecruiters: Array<{ recruiterEmail: string; count: number }>;
  topJobTitles: Array<{ jobTitle: string; count: number }>;
}

const VERDICT_STYLES: Record<string, { bg: string; text: string }> = {
  strong_hire: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  hire: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  lean_hire: { bg: 'bg-blue-50', text: 'text-blue-600' },
  lean_no_hire: { bg: 'bg-amber-50', text: 'text-amber-600' },
  no_hire: { bg: 'bg-red-50', text: 'text-red-600' },
};

function formatDuration(startFull: string, endFull: string | null): string {
  if (!endFull) return '-';
  const startTime = new Date(startFull).getTime();
  const endTime = new Date(endFull).getTime();
  if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) return '-';
  
  const diffMins = Math.round((endTime - startTime) / 60000);
  return `${diffMins}m`;
}

export default function InterviewHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Admin filter state
  const [adminFilter, setAdminFilter] = useState<RecruiterTeamFilterValue>({});

  // Search / filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [jobTitleFilter, setJobTitleFilter] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hasVideo, setHasVideo] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('interviewDatetime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const limit = 20;

  // Data state
  const [interviews, setInterviews] = useState<GoHireInterview[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // CSV import state (admin only)
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    total: number;
    errors: Array<{ row: number; error: string }>;
    duplicates: Array<{ row: number; candidateName: string; interviewDatetime: string }>;
    batchId?: string;
    usersCreated?: number;
    usersLinked?: number;
    jobsCreated?: number;
    jobsLinked?: number;
    resumeProcessingStarted?: boolean;
    resumesPending?: number;
  } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumeProgress, setResumeProgress] = useState<{
    completed: number;
    failed: number;
    skippedExisting: number;
    pending: number;
    total: number;
    done: boolean;
    currentlyProcessing: Array<{ interviewId: string; candidateName: string; startedAt: number }>;
    report?: {
      summary: { total: number; created: number; skippedExisting: number; skippedNoEmail: number; failed: number };
      created: Array<{ interviewId: string; candidateName: string; resumeId: string; resumeUrl: string | null; recruiter: string | null }>;
      skippedExisting: Array<{ interviewId: string; candidateName: string; existingResumeId: string; resumeUrl: string | null; reason: string }>;
      skippedNoEmail: Array<{ interviewId: string; candidateName: string; resumeUrl: string | null; reason: string }>;
      failed: Array<{ interviewId: string; candidateName: string; resumeUrl: string | null; error: string }>;
    };
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Backfill state
  const [backfilling, setBackfilling] = useState(false);
  const [backfillBatchId, setBackfillBatchId] = useState<string | null>(null);
  const [backfillStartedAt, setBackfillStartedAt] = useState<number | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{
    completed: number;
    failed: number;
    skippedExisting: number;
    skippedNoEmail: number;
    pending: number;
    total: number;
    done: boolean;
    stopped?: boolean;
    currentlyProcessing: Array<{ interviewId: string; candidateName: string; startedAt: number }>;
    report?: {
      summary: { total: number; created: number; skippedExisting: number; skippedNoEmail: number; failed: number; notProcessed?: number; stopped?: boolean };
      created: Array<{ interviewId: string; candidateName: string; resumeId: string; recruiter: string | null }>;
      skippedExisting: Array<{ interviewId: string; candidateName: string; existingResumeId: string; reason: string }>;
      skippedNoEmail: Array<{ interviewId: string; candidateName: string; reason: string }>;
      failed: Array<{ interviewId: string; candidateName: string; error: string }>;
      notProcessed?: Array<{ interviewId: string; candidateName: string }>;
    };
  } | null>(null);
  const backfillPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scan-and-select state (preview before sync)
  interface ScanItem {
    interviewId: string;
    gohireUserId: string;
    candidateName: string;
    candidateEmail: string | null;
    recruiterName: string | null;
    recruiterEmail: string | null;
    jobTitle: string | null;
    resumeUrl: string | null;
    interviewDatetime: string;
    interviewEndDatetime: string | null;
    durationMinutes: number | null;
    isShortInterview: boolean;
    candidateUserExists: boolean;
    candidateUserId: string | null;
    hasResumeInTalentHub: boolean;
    existingResumeId: string | null;
    recruiterUserExists: boolean;
    recruiterUserId: string | null;
    recommendedAction: 'create_new' | 'link_existing' | 'create_user_and_resume' | 'no_email' | 'no_url';
  }
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanItem[] | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [selectedScanIds, setSelectedScanIds] = useState<Set<string>>(new Set());
  const [scanFilter, setScanFilter] = useState<'all' | 'create_new' | 'create_user_and_resume' | 'link_existing' | 'no_email'>('all');
  const [scanSearch, setScanSearch] = useState('');
  const [hideShortInterviews, setHideShortInterviews] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true);
        const params: Record<string, string> = {};
        if (adminFilter.filterUserId) params.filterUserId = adminFilter.filterUserId;
        if (adminFilter.filterTeamId) params.filterTeamId = adminFilter.filterTeamId;
        if (adminFilter.teamView !== undefined) params.teamView = adminFilter.teamView ? 'true' : 'false';
        const res = await axios.get('/api/v1/gohire-interviews/stats', { params });
        if (res.data.success) {
          setStats(res.data.data);
        }
      } catch {
        // silent
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [adminFilter]);

  // Fetch interviews
  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number | boolean> = {
        page,
        limit,
        sortBy,
        sortOrder,
      };
      if (debouncedQuery) params.q = debouncedQuery;
      if (jobTitleFilter) params.jobTitle = jobTitleFilter;
      if (recruiterFilter) params.recruiterEmail = recruiterFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (hasVideo !== undefined) params.hasVideo = hasVideo;
      if (adminFilter.filterUserId) params.filterUserId = adminFilter.filterUserId;
      if (adminFilter.filterTeamId) params.filterTeamId = adminFilter.filterTeamId;
      if (adminFilter.teamView !== undefined) params.teamView = adminFilter.teamView ? 'true' : 'false';

      const res = await axios.get('/api/v1/gohire-interviews', { params });
      if (res.data.success) {
        setInterviews(res.data.data || []);
        setPagination(res.data.pagination || null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortOrder, debouncedQuery, jobTitleFilter, recruiterFilter, dateFrom, dateTo, hasVideo, adminFilter]);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleRowClick = (interview: GoHireInterview) => {
    if (interview.videoUrl) {
      navigate(`/product/interview-hub/${interview.id}`);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setJobTitleFilter('');
    setRecruiterFilter('');
    setDateFrom('');
    setDateTo('');
    setHasVideo(undefined);
    setPage(1);
  };

  const hasActiveFilters = jobTitleFilter || recruiterFilter || dateFrom || dateTo || hasVideo !== undefined;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startResumePolling = useCallback((batchId: string, totalPending: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setResumeProgress({
      completed: 0, failed: 0, skippedExisting: 0,
      pending: totalPending, total: totalPending,
      done: false, currentlyProcessing: [],
    });

    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/api/v1/gohire-interviews/import-status/${batchId}`);
        if (res.data.success) {
          const { batch, statusBreakdown, runtime } = res.data.data;
          const completedTotal = statusBreakdown.find((s: any) => s.status === 'completed')?.count || 0;
          const failed = statusBreakdown.find((s: any) => s.status === 'failed')?.count || 0;
          const pending = statusBreakdown.find((s: any) => s.status === 'pending')?.count || 0;
          const processing = statusBreakdown.find((s: any) => s.status === 'processing')?.count || 0;

          // Pull live counts from the in-progress report if present
          const liveReport = batch.errors as any;
          const liveCreated = liveReport?.created?.length ?? 0;
          const liveSkippedExisting = liveReport?.skippedExisting?.length ?? 0;

          setResumeProgress({
            completed: liveCreated || (completedTotal - liveSkippedExisting),
            skippedExisting: liveSkippedExisting,
            failed,
            pending: pending + processing,
            total: totalPending,
            done: batch.phase2Completed,
            currentlyProcessing: runtime?.processing || [],
            report: batch.phase2Completed && batch.errors ? batch.errors as any : undefined,
          });

          if (batch.phase2Completed) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            fetchInterviews();
          }
        }
      } catch {
        // Silent — keep polling
      }
    }, 2000);
  }, []);

  const handleImportCsv = async (file: File, overwrite = false) => {
    setImporting(true);
    setImportResult(null);
    setResumeProgress(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (overwrite) formData.append('overwrite', 'true');

      const res = await axios.post('/api/v1/gohire-interviews/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        const result = res.data.data;
        setImportResult(result);

        // If there are duplicates and not overwriting, save the file for potential re-import
        if (result.duplicates.length > 0 && !overwrite) {
          setPendingFile(file);
        } else {
          setPendingFile(null);
        }

        // Refresh data if any records were created or updated
        if (result.created > 0 || result.updated > 0) {
          fetchInterviews();
        }

        // Start polling for Phase 2 resume processing
        if (result.resumeProcessingStarted && result.batchId) {
          startResumePolling(result.batchId, result.resumesPending || 0);
        }
      }
    } catch {
      setImportResult({ created: 0, updated: 0, skipped: 0, total: 0, errors: [{ row: 0, error: t('interviewHub.import.failed', 'Import failed') }], duplicates: [] });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportCsv(file);
  };

  const handleOverwriteConfirm = () => {
    if (pendingFile) {
      handleImportCsv(pendingFile, true);
    }
  };

  // Cleanup backfill polling on unmount
  useEffect(() => {
    return () => {
      if (backfillPollRef.current) clearInterval(backfillPollRef.current);
    };
  }, []);

  const handleBackfillResumes = async () => {
    setBackfilling(true);
    setBackfillProgress(null);
    setStopRequested(false);
    setBackfillStartedAt(Date.now());
    try {
      const res = await axios.post('/api/v1/gohire-interviews/backfill-resumes');
      if (res.data.success) {
        const { batchId, totalToProcess } = res.data.data;
        if (!totalToProcess) {
          setBackfillProgress({
            completed: 0, failed: 0, skippedExisting: 0, skippedNoEmail: 0,
            pending: 0, total: 0, done: true, currentlyProcessing: [],
          });
          setBackfilling(false);
          return;
        }
        setBackfillBatchId(batchId);
        setBackfillProgress({
          completed: 0, failed: 0, skippedExisting: 0, skippedNoEmail: 0,
          pending: totalToProcess, total: totalToProcess, done: false,
          currentlyProcessing: [],
        });

        // Poll progress every 2s for more responsive UI
        backfillPollRef.current = setInterval(async () => {
          try {
            const status = await axios.get(`/api/v1/gohire-interviews/import-status/${batchId}`);
            if (status.data.success) {
              const { batch, statusBreakdown, runtime } = status.data.data;
              // Note: 'completed' status from DB includes both newly-created AND already-existing (linked)
              const completedTotal = statusBreakdown.find((s: any) => s.status === 'completed')?.count || 0;
              const failed = statusBreakdown.find((s: any) => s.status === 'failed')?.count || 0;
              const skipped = statusBreakdown.find((s: any) => s.status === 'skipped')?.count || 0;
              const pending = statusBreakdown.find((s: any) => s.status === 'pending')?.count || 0;
              const processing = statusBreakdown.find((s: any) => s.status === 'processing')?.count || 0;

              // Pull live counts from the in-progress report if present, else fall back to DB counts
              const liveReport = batch.errors as any;
              const liveCreated = liveReport?.created?.length ?? 0;
              const liveSkippedExisting = liveReport?.skippedExisting?.length ?? 0;
              const liveSkippedNoEmail = liveReport?.skippedNoEmail?.length ?? skipped;

              setStopRequested(runtime?.stopRequested || false);

              setBackfillProgress({
                completed: liveCreated || (completedTotal - liveSkippedExisting),
                skippedExisting: liveSkippedExisting,
                skippedNoEmail: liveSkippedNoEmail,
                failed,
                pending: pending + processing,
                total: totalToProcess,
                done: batch.phase2Completed,
                stopped: liveReport?.summary?.stopped || false,
                currentlyProcessing: runtime?.processing || [],
                report: batch.phase2Completed && batch.errors ? batch.errors as any : undefined,
              });

              if (batch.phase2Completed) {
                if (backfillPollRef.current) clearInterval(backfillPollRef.current);
                backfillPollRef.current = null;
                setBackfilling(false);
                setBackfillBatchId(null);
                fetchInterviews();
              }
            }
          } catch {
            // silent
          }
        }, 2000);
      }
    } catch {
      setBackfillProgress({
        completed: 0, failed: 1, skippedExisting: 0, skippedNoEmail: 0,
        pending: 0, total: 0, done: true, currentlyProcessing: [],
      });
      setBackfilling(false);
    }
  };

  const handleStopBackfill = async () => {
    if (!backfillBatchId) return;
    setStopRequested(true);
    try {
      await axios.post(`/api/v1/gohire-interviews/backfill-stop/${backfillBatchId}`);
    } catch {
      // silent — polling will reflect actual state
    }
  };

  // Read-only scan: list interviews missing resumes (no DB writes)
  const handleScanMissingResumes = async () => {
    setScanning(true);
    setScanResults(null);
    setScanModalOpen(true);
    try {
      const res = await axios.get('/api/v1/gohire-interviews/missing-resumes');
      if (res.data.success) {
        const items: ScanItem[] = res.data.data.items;
        setScanResults(items);
        // Default selection: only safe-to-create rows AND skip short interviews (<9min)
        const defaultSelected = new Set(
          items
            .filter((i) =>
              (i.recommendedAction === 'create_new' || i.recommendedAction === 'create_user_and_resume') &&
              !i.isShortInterview,
            )
            .map((i) => i.interviewId),
        );
        setSelectedScanIds(defaultSelected);
      }
    } catch {
      setScanResults([]);
    } finally {
      setScanning(false);
    }
  };

  // Process only the selected interview IDs from the scan modal
  const handleCreateSelected = async () => {
    if (selectedScanIds.size === 0) return;
    const interviewIds = Array.from(selectedScanIds);
    setScanModalOpen(false);
    setBackfilling(true);
    setBackfillProgress(null);
    setStopRequested(false);
    setBackfillStartedAt(Date.now());
    try {
      const res = await axios.post('/api/v1/gohire-interviews/create-selected-resumes', { interviewIds });
      if (res.data.success) {
        const { batchId, totalToProcess } = res.data.data;
        if (!totalToProcess) {
          setBackfillProgress({
            completed: 0, failed: 0, skippedExisting: 0, skippedNoEmail: 0,
            pending: 0, total: 0, done: true, currentlyProcessing: [],
          });
          setBackfilling(false);
          return;
        }
        setBackfillBatchId(batchId);
        setBackfillProgress({
          completed: 0, failed: 0, skippedExisting: 0, skippedNoEmail: 0,
          pending: totalToProcess, total: totalToProcess, done: false,
          currentlyProcessing: [],
        });
        // Reuse the same polling logic as full backfill
        backfillPollRef.current = setInterval(async () => {
          try {
            const status = await axios.get(`/api/v1/gohire-interviews/import-status/${batchId}`);
            if (status.data.success) {
              const { batch, statusBreakdown, runtime } = status.data.data;
              const completedTotal = statusBreakdown.find((s: any) => s.status === 'completed')?.count || 0;
              const failed = statusBreakdown.find((s: any) => s.status === 'failed')?.count || 0;
              const skipped = statusBreakdown.find((s: any) => s.status === 'skipped')?.count || 0;
              const pending = statusBreakdown.find((s: any) => s.status === 'pending')?.count || 0;
              const processing = statusBreakdown.find((s: any) => s.status === 'processing')?.count || 0;
              const liveReport = batch.errors as any;
              const liveCreated = liveReport?.created?.length ?? 0;
              const liveSkippedExisting = liveReport?.skippedExisting?.length ?? 0;
              const liveSkippedNoEmail = liveReport?.skippedNoEmail?.length ?? skipped;
              setStopRequested(runtime?.stopRequested || false);
              setBackfillProgress({
                completed: liveCreated || (completedTotal - liveSkippedExisting),
                skippedExisting: liveSkippedExisting,
                skippedNoEmail: liveSkippedNoEmail,
                failed,
                pending: pending + processing,
                total: totalToProcess,
                done: batch.phase2Completed,
                stopped: liveReport?.summary?.stopped || false,
                currentlyProcessing: runtime?.processing || [],
                report: batch.phase2Completed && batch.errors ? batch.errors as any : undefined,
              });
              if (batch.phase2Completed) {
                if (backfillPollRef.current) clearInterval(backfillPollRef.current);
                backfillPollRef.current = null;
                setBackfilling(false);
                setBackfillBatchId(null);
                fetchInterviews();
              }
            }
          } catch { /* silent */ }
        }, 2000);
      }
    } catch {
      setBackfillProgress({
        completed: 0, failed: 1, skippedExisting: 0, skippedNoEmail: 0,
        pending: 0, total: 0, done: true, currentlyProcessing: [],
      });
      setBackfilling(false);
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) {
      return (
        <svg className="w-3 h-3 text-slate-300 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortOrder === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t('interviewHub.title', 'Interview Hub')}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('interviewHub.description', 'Search and manage GoHire interview recordings and evaluations.')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {statsLoading ? (
                  <div className="h-7 w-12 animate-pulse rounded bg-slate-100" />
                ) : (
                  stats?.totalCount ?? 0
                )}
              </div>
              <div className="text-xs text-slate-500">{t('interviewHub.stats.totalInterviews', 'Total Interviews')}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {statsLoading ? (
                  <div className="h-7 w-12 animate-pulse rounded bg-slate-100" />
                ) : (
                  stats?.withVideoCount ?? 0
                )}
              </div>
              <div className="text-xs text-slate-500">{t('interviewHub.stats.withVideo', 'With Video')}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {statsLoading ? (
                  <div className="h-7 w-12 animate-pulse rounded bg-slate-100" />
                ) : (
                  stats?.withEvaluationCount ?? 0
                )}
              </div>
              <div className="text-xs text-slate-500">{t('interviewHub.stats.withEvaluations', 'With Evaluations')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-3">
          {/* Search input */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('interviewHub.searchPlaceholder', 'Search by candidate name or email...')}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
            />
          </div>

          {/* Recruiter/team filter — admin sees full user picker, non-admin with team sees My/Team toggle */}
          <RecruiterTeamFilter value={adminFilter} onChange={(f) => { setAdminFilter(f); setPage(1); }} />

          {/* Import CSV / Sync Resumes / Scan & Select — admin only */}
          {user?.role === 'admin' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {importing ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                {t('interviewHub.import.button', 'Import CSV')}
              </button>
              <button
                onClick={handleBackfillResumes}
                disabled={backfilling}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                title={t('interviewHub.backfill.tooltip', 'Scan interviews without resumes and create them in Talent Hub')}
              >
                {backfilling ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {t('interviewHub.backfill.button', 'Sync Resumes')}
              </button>
              <button
                onClick={handleScanMissingResumes}
                disabled={scanning || backfilling}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50"
                title={t('interviewHub.scan.tooltip', 'Preview interviews missing resumes — review and select which to create (no DB writes)')}
              >
                {scanning ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                )}
                {t('interviewHub.scan.button', 'Scan & Select')}
              </button>
            </>
          )}

          {/* Filter toggle button */}
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              filtersOpen || hasActiveFilters
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {t('interviewHub.filters', 'Filters')}
            {hasActiveFilters && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {[jobTitleFilter, recruiterFilter, dateFrom, dateTo, hasVideo !== undefined].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Expanded filters */}
        {filtersOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('interviewHub.filterJobTitle', 'Job Title')}
              </label>
              <input
                type="text"
                value={jobTitleFilter}
                onChange={(e) => { setJobTitleFilter(e.target.value); setPage(1); }}
                placeholder={t('interviewHub.filterJobTitlePlaceholder', 'Filter by job title...')}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('interviewHub.filterRecruiter', 'Recruiter')}
              </label>
              <input
                type="text"
                value={recruiterFilter}
                onChange={(e) => { setRecruiterFilter(e.target.value); setPage(1); }}
                placeholder={t('interviewHub.filterRecruiterPlaceholder', 'Filter by recruiter email...')}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('interviewHub.filterDateFrom', 'Date From')}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('interviewHub.filterDateTo', 'Date To')}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-600"
              />
            </div>

            <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
              {/* Has video toggle */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => {
                    setHasVideo(prev => prev === undefined ? true : prev === true ? false : undefined);
                    setPage(1);
                  }}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    hasVideo === true ? 'bg-blue-600' : hasVideo === false ? 'bg-red-400' : 'bg-slate-200'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    hasVideo === true ? 'translate-x-4' : hasVideo === false ? 'translate-x-2' : 'translate-x-0'
                  }`} />
                </div>
                <span className="text-sm text-slate-600">
                  {hasVideo === true
                    ? t('interviewHub.hasVideoYes', 'Has Video')
                    : hasVideo === false
                    ? t('interviewHub.hasVideoNo', 'No Video')
                    : t('interviewHub.hasVideoAll', 'All Videos')}
                </span>
              </label>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  {t('interviewHub.clearFilters', 'Clear all filters')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : interviews.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-900">
              {t('interviewHub.noResults', 'No interviews found')}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {debouncedQuery || hasActiveFilters
                ? t('interviewHub.noResultsFiltered', 'Try adjusting your search or filters.')
                : t('interviewHub.noResultsEmpty', 'No interview data available yet.')}
            </p>
          </div>
        ) : (
          <>
            {/* Backfill progress banner */}
            {backfillProgress && (() => {
              const processed = backfillProgress.completed + backfillProgress.failed + backfillProgress.skippedExisting + backfillProgress.skippedNoEmail;
              const pct = backfillProgress.total > 0 ? Math.round((processed / backfillProgress.total) * 100) : 0;
              const elapsedMs = backfillStartedAt ? Date.now() - backfillStartedAt : 0;
              const itemsPerSec = elapsedMs > 0 && processed > 0 ? processed / (elapsedMs / 1000) : 0;
              const remaining = Math.max(0, backfillProgress.total - processed);
              const etaSec = itemsPerSec > 0 ? Math.round(remaining / itemsPerSec) : 0;
              const formatEta = (s: number) => {
                if (s < 60) return `${s}s`;
                if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
                return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
              };
              const isStopped = backfillProgress.report?.summary?.stopped;
              const bannerColor = backfillProgress.done
                ? (isStopped ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50')
                : 'border-blue-200 bg-blue-50';

              return (
              <div className={`mx-0 mb-4 rounded-lg border p-4 ${bannerColor}`}>
                {/* Header line: status icon + title + close (when done) */}
                <div className="flex items-center gap-2 mb-3">
                  {!backfillProgress.done ? (
                    <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : isStopped ? (
                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  <span className={`text-sm font-semibold ${backfillProgress.done ? (isStopped ? 'text-amber-800' : 'text-emerald-800') : 'text-blue-800'}`}>
                    {backfillProgress.done
                      ? (backfillProgress.total === 0
                        ? t('interviewHub.backfill.allSynced', 'All interviews already have resumes in Talent Hub')
                        : isStopped
                          ? t('interviewHub.backfill.stopped', 'Resume sync stopped')
                          : t('interviewHub.backfill.done', 'Resume sync complete: {{completed}} created, {{failed}} failed', { completed: backfillProgress.completed, failed: backfillProgress.failed }))
                      : stopRequested
                        ? t('interviewHub.backfill.stopping', 'Stopping... finishing in-flight resumes')
                        : t('interviewHub.backfill.processing', 'Syncing resumes to Talent Hub...')
                    }
                  </span>
                  {/* Stop button while running */}
                  {!backfillProgress.done && !stopRequested && (
                    <button
                      onClick={handleStopBackfill}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                      {t('interviewHub.backfill.stop', 'Stop')}
                    </button>
                  )}
                  {backfillProgress.done && (
                    <button onClick={() => setBackfillProgress(null)} className="ml-auto text-slate-400 hover:text-slate-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>

                {/* Progress bar + counters (always show, even when done) */}
                {backfillProgress.total > 0 && (
                  <>
                    <div className="w-full bg-white/60 rounded-full h-2.5 mb-2 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${backfillProgress.done ? (isStopped ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
                      <span className="font-semibold text-slate-700">{processed} / {backfillProgress.total} ({pct}%)</span>
                      {!backfillProgress.done && (
                        <>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-600">{itemsPerSec.toFixed(2)} {t('interviewHub.backfill.perSec', '/s')}</span>
                          {etaSec > 0 && (
                            <>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-600">ETA {formatEta(etaSec)}</span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {/* Live status counters */}
                    <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                      <div className="rounded bg-emerald-100 px-2 py-1">
                        <span className="font-bold text-emerald-700">{backfillProgress.completed}</span>
                        <span className="text-emerald-600 ml-1">{t('interviewHub.backfill.reportCreated', 'Created')}</span>
                      </div>
                      <div className="rounded bg-slate-100 px-2 py-1">
                        <span className="font-bold text-slate-700">{backfillProgress.skippedExisting}</span>
                        <span className="text-slate-500 ml-1">{t('interviewHub.backfill.reportExisting', 'Already Exist')}</span>
                      </div>
                      <div className="rounded bg-amber-100 px-2 py-1">
                        <span className="font-bold text-amber-700">{backfillProgress.skippedNoEmail}</span>
                        <span className="text-amber-600 ml-1">{t('interviewHub.backfill.reportNoEmail', 'No Email')}</span>
                      </div>
                      <div className="rounded bg-red-100 px-2 py-1">
                        <span className="font-bold text-red-700">{backfillProgress.failed}</span>
                        <span className="text-red-600 ml-1">{t('interviewHub.backfill.reportFailed', 'Failed')}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Currently processing list */}
                {!backfillProgress.done && backfillProgress.currentlyProcessing.length > 0 && (
                  <div className="mt-2 rounded-md bg-white/50 p-2">
                    <div className="text-[11px] font-semibold text-slate-600 mb-1">
                      {t('interviewHub.backfill.processingNow', 'Processing now ({{count}}):', { count: backfillProgress.currentlyProcessing.length })}
                    </div>
                    <div className="space-y-0.5">
                      {backfillProgress.currentlyProcessing.map((p) => {
                        const elapsed = Math.round((Date.now() - p.startedAt) / 1000);
                        return (
                          <div key={p.interviewId} className="flex items-center gap-2 text-xs text-slate-700">
                            <svg className="w-3 h-3 animate-spin text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="truncate">{p.candidateName}</span>
                            <span className="text-slate-400 ml-auto">{elapsed}s</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Status report — detailed expandable lists when done */}
                {backfillProgress.done && backfillProgress.report && (
                  <div className="mt-3 space-y-2 border-t border-slate-200/60 pt-3">
                    {/* Created list */}
                    {backfillProgress.report.created.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-emerald-700 font-medium">{t('interviewHub.backfill.createdList', 'Created resumes ({{count}})', { count: backfillProgress.report.created.length })}</summary>
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 pl-3 bg-white/50 rounded p-2">
                          {backfillProgress.report.created.map((r, i) => (
                            <div key={i} className="text-emerald-700">✓ {r.candidateName} {r.recruiter ? <span className="text-slate-500">({r.recruiter})</span> : ''}</div>
                          ))}
                        </div>
                      </details>
                    )}
                    {/* Skipped — already exist */}
                    {backfillProgress.report.skippedExisting.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-slate-600 font-medium">{t('interviewHub.backfill.existingList', 'Already in Talent Hub ({{count}})', { count: backfillProgress.report.skippedExisting.length })}</summary>
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 pl-3 bg-white/50 rounded p-2">
                          {backfillProgress.report.skippedExisting.map((r, i) => (
                            <div key={i} className="text-slate-600">↻ {r.candidateName} <span className="text-slate-400">— linked to existing</span></div>
                          ))}
                        </div>
                      </details>
                    )}
                    {/* Skipped — no email */}
                    {backfillProgress.report.skippedNoEmail.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-amber-700 font-medium">{t('interviewHub.backfill.noEmailList', 'No email — skipped ({{count}})', { count: backfillProgress.report.skippedNoEmail.length })}</summary>
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 pl-3 bg-white/50 rounded p-2">
                          {backfillProgress.report.skippedNoEmail.map((r, i) => (
                            <div key={i} className="text-amber-700">⚠ {r.candidateName}</div>
                          ))}
                        </div>
                      </details>
                    )}
                    {/* Failed */}
                    {backfillProgress.report.failed.length > 0 && (
                      <details className="text-xs" open>
                        <summary className="cursor-pointer text-red-700 font-medium">{t('interviewHub.backfill.failedList', 'Failed ({{count}})', { count: backfillProgress.report.failed.length })}</summary>
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 pl-3 bg-white/50 rounded p-2">
                          {backfillProgress.report.failed.map((r, i) => (
                            <div key={i} className="text-red-700">✗ <span className="font-medium">{r.candidateName}</span> — {r.error}</div>
                          ))}
                        </div>
                      </details>
                    )}
                    {/* Not processed (only if stopped) */}
                    {backfillProgress.report.notProcessed && backfillProgress.report.notProcessed.length > 0 && (
                      <details className="text-xs" open={isStopped}>
                        <summary className="cursor-pointer text-amber-700 font-medium">{t('interviewHub.backfill.notProcessedList', 'Not processed — stopped before reaching ({{count}})', { count: backfillProgress.report.notProcessed.length })}</summary>
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 pl-3 bg-white/50 rounded p-2">
                          {backfillProgress.report.notProcessed.map((r, i) => (
                            <div key={i} className="text-amber-600">○ {r.candidateName}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th
                      className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSort('candidateName')}
                    >
                      {t('interviewHub.col.candidateName', 'Candidate Name')}
                      <SortIcon column="candidateName" />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">
                      {t('interviewHub.col.email', 'Email')}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSort('jobTitle')}
                    >
                      {t('interviewHub.col.jobTitle', 'Job Title')}
                      <SortIcon column="jobTitle" />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">
                      {t('interviewHub.col.recruiter', 'Recruiter')}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSort('interviewDatetime')}
                    >
                      {t('interviewHub.col.date', 'Date')}
                      <SortIcon column="interviewDatetime" />
                    </th>
                    <th
                      className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSort('duration')}
                    >
                      {t('interviewHub.col.duration', 'Duration')}
                      <SortIcon column="duration" />
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600">
                      {t('interviewHub.col.video', 'Video')}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSort('evaluationScore')}
                    >
                      {t('interviewHub.col.score', 'Score')}
                      <SortIcon column="evaluationScore" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {interviews.map((interview) => {
                    const hasVideoUrl = !!interview.videoUrl;
                    const verdictStyle = interview.evaluationVerdict
                      ? VERDICT_STYLES[interview.evaluationVerdict] || { bg: 'bg-slate-50', text: 'text-slate-600' }
                      : null;

                    return (
                      <tr
                        key={interview.id}
                        onClick={() => handleRowClick(interview)}
                        className={`border-b border-slate-50 transition-colors ${
                          hasVideoUrl
                            ? 'hover:bg-blue-50/50 cursor-pointer'
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 shrink-0">
                              <span className="text-xs font-bold text-slate-600">
                                {interview.candidateName[0]?.toUpperCase() || '?'}
                              </span>
                              {/* Resume processing status dot */}
                              {interview.resumeProcessingStatus && interview.resumeProcessingStatus !== 'skipped' && (
                                <span
                                  className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                    interview.resumeProcessingStatus === 'completed' ? 'bg-emerald-400' :
                                    interview.resumeProcessingStatus === 'failed' ? 'bg-red-400' :
                                    interview.resumeProcessingStatus === 'processing' ? 'bg-blue-400 animate-pulse' :
                                    'bg-amber-400'
                                  }`}
                                  title={`Resume: ${interview.resumeProcessingStatus}`}
                                />
                              )}
                            </div>
                            {interview.resumeId ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/product/talent?highlight=${interview.resumeId}`); }}
                                className="font-medium text-blue-600 hover:text-blue-800 truncate max-w-[180px] text-left"
                                title={t('interviewHub.viewInTalentHub', 'View in Talent Hub')}
                              >
                                {interview.candidateName}
                              </button>
                            ) : (
                              <span className="font-medium text-slate-900 truncate max-w-[180px]">
                                {interview.candidateName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 truncate max-w-[180px]">
                          {interview.candidateEmail || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {interview.jobTitle ? (
                            interview.jobId ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/product/jobs/${interview.jobId}`); }}
                                className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full truncate max-w-[160px] transition-colors"
                              >
                                {interview.jobTitle}
                              </button>
                            ) : (
                              <span className="inline-block px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-full truncate max-w-[160px]">
                                {interview.jobTitle}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 truncate max-w-[150px]">
                          {interview.recruiterName || interview.recruiterEmail || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {new Date(interview.interviewDatetime).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDuration(interview.interviewDatetime, interview.interviewEndDatetime)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {hasVideoUrl ? (
                            <svg className="w-5 h-5 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-slate-200 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {interview.evaluationScore != null ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${
                                interview.evaluationScore >= 80 ? 'text-emerald-600' :
                                interview.evaluationScore >= 60 ? 'text-blue-600' :
                                interview.evaluationScore >= 40 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {interview.evaluationScore}
                              </span>
                              {interview.evaluationVerdict && verdictStyle && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${verdictStyle.bg} ${verdictStyle.text}`}>
                                  {interview.evaluationVerdict.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <div className="text-xs text-slate-500">
                  {t('interviewHub.pagination.showing', 'Showing')} {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} {t('interviewHub.pagination.of', 'of')} {pagination.total} {t('interviewHub.pagination.results', 'results')}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('interviewHub.pagination.prev', 'Previous')}
                  </button>

                  {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    const total = pagination.totalPages;
                    if (total <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= total - 3) {
                      pageNum = total - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`min-w-[32px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          pageNum === page
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                    disabled={page >= pagination.totalPages}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('interviewHub.pagination.next', 'Next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Import Result Modal */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setImportResult(null); setPendingFile(null); setResumeProgress(null); if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {t('interviewHub.import.resultTitle', 'Import Results')}
              </h3>
              <button onClick={() => { setImportResult(null); setPendingFile(null); setResumeProgress(null); if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-slate-50">
                  <div className="text-xl font-bold text-slate-700">{importResult.total}</div>
                  <div className="text-[11px] text-slate-500">{t('interviewHub.import.total', 'Total')}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-emerald-50">
                  <div className="text-xl font-bold text-emerald-600">{importResult.created}</div>
                  <div className="text-[11px] text-emerald-600">{t('interviewHub.import.created', 'Created')}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50">
                  <div className="text-xl font-bold text-blue-600">{importResult.updated}</div>
                  <div className="text-[11px] text-blue-600">{t('interviewHub.import.updated', 'Updated')}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-amber-50">
                  <div className="text-xl font-bold text-amber-600">{importResult.skipped}</div>
                  <div className="text-[11px] text-amber-600">{t('interviewHub.import.skipped', 'Skipped')}</div>
                </div>
              </div>

              {/* Users & Jobs created during import */}
              {(importResult.usersCreated || importResult.usersLinked || importResult.jobsCreated || importResult.jobsLinked) ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-medium text-slate-500 mb-1">{t('interviewHub.import.candidates', 'Candidates')}</div>
                    <div className="flex items-baseline gap-2">
                      {importResult.usersCreated ? (
                        <span className="text-sm text-emerald-600 font-medium">{importResult.usersCreated} {t('interviewHub.import.newAccounts', 'new')}</span>
                      ) : null}
                      {importResult.usersLinked ? (
                        <span className="text-sm text-blue-600 font-medium">{importResult.usersLinked} {t('interviewHub.import.linked', 'linked')}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-medium text-slate-500 mb-1">{t('interviewHub.import.jobs', 'Jobs')}</div>
                    <div className="flex items-baseline gap-2">
                      {importResult.jobsCreated ? (
                        <span className="text-sm text-emerald-600 font-medium">{importResult.jobsCreated} {t('interviewHub.import.newAccounts', 'new')}</span>
                      ) : null}
                      {importResult.jobsLinked ? (
                        <span className="text-sm text-blue-600 font-medium">{importResult.jobsLinked} {t('interviewHub.import.linked', 'linked')}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Resume processing progress + detailed report */}
              {resumeProgress && (() => {
                const processed = resumeProgress.completed + resumeProgress.failed + resumeProgress.skippedExisting;
                const pct = resumeProgress.total > 0 ? Math.round((processed / resumeProgress.total) * 100) : 0;
                return (
                  <div className={`rounded-lg border p-4 ${resumeProgress.done ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {!resumeProgress.done ? (
                        <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      <span className={`text-sm font-semibold ${resumeProgress.done ? 'text-emerald-800' : 'text-blue-800'}`}>
                        {resumeProgress.done
                          ? t('interviewHub.import.resumesDone', 'Resume processing complete')
                          : t('interviewHub.import.resumesProcessing', 'Processing resumes...')
                        }
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-white/60 rounded-full h-2.5 mb-2 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${resumeProgress.done ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 mb-2">
                      <span className="font-semibold">{processed} / {resumeProgress.total} ({pct}%)</span>
                    </div>
                    {/* Live status counters */}
                    <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                      <div className="rounded bg-emerald-100 px-2 py-1">
                        <span className="font-bold text-emerald-700">{resumeProgress.completed}</span>
                        <span className="text-emerald-600 ml-1">{t('interviewHub.backfill.reportCreated', 'Created')}</span>
                      </div>
                      <div className="rounded bg-slate-100 px-2 py-1">
                        <span className="font-bold text-slate-700">{resumeProgress.skippedExisting}</span>
                        <span className="text-slate-500 ml-1">{t('interviewHub.backfill.reportExisting', 'Already Exist')}</span>
                      </div>
                      <div className="rounded bg-amber-100 px-2 py-1">
                        <span className="font-bold text-amber-700">{resumeProgress.pending}</span>
                        <span className="text-amber-600 ml-1">{t('interviewHub.import.remaining', 'remaining')}</span>
                      </div>
                      <div className="rounded bg-red-100 px-2 py-1">
                        <span className="font-bold text-red-700">{resumeProgress.failed}</span>
                        <span className="text-red-600 ml-1">{t('interviewHub.backfill.reportFailed', 'Failed')}</span>
                      </div>
                    </div>

                    {/* Currently processing list */}
                    {!resumeProgress.done && resumeProgress.currentlyProcessing.length > 0 && (
                      <div className="mt-2 rounded-md bg-white/50 p-2">
                        <div className="text-[11px] font-semibold text-slate-600 mb-1">
                          {t('interviewHub.backfill.processingNow', 'Processing now ({{count}}):', { count: resumeProgress.currentlyProcessing.length })}
                        </div>
                        <div className="space-y-0.5">
                          {resumeProgress.currentlyProcessing.map((p) => {
                            const elapsed = Math.round((Date.now() - p.startedAt) / 1000);
                            return (
                              <div key={p.interviewId} className="flex items-center gap-2 text-xs text-slate-700">
                                <svg className="w-3 h-3 animate-spin text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span className="truncate">{p.candidateName}</span>
                                <span className="text-slate-400 ml-auto">{elapsed}s</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Detailed report when done */}
                    {resumeProgress.done && resumeProgress.report && (
                      <div className="mt-3 space-y-2 border-t border-slate-200/60 pt-3">
                        {/* Created list — clickable to TalentHub + view original PDF */}
                        {resumeProgress.report.created.length > 0 && (
                          <details className="text-xs" open>
                            <summary className="cursor-pointer text-emerald-700 font-medium">
                              {t('interviewHub.backfill.createdList', 'Created resumes ({{count}})', { count: resumeProgress.report.created.length })}
                            </summary>
                            <div className="mt-1 max-h-48 overflow-y-auto space-y-1 pl-3 bg-white/50 rounded p-2">
                              {resumeProgress.report.created.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-emerald-700">
                                  <span className="text-emerald-500">✓</span>
                                  <button
                                    onClick={() => navigate(`/product/talent?highlight=${r.resumeId}`)}
                                    className="font-medium hover:underline text-left"
                                    title={t('interviewHub.viewInTalentHub', 'View in Talent Hub')}
                                  >
                                    {r.candidateName}
                                  </button>
                                  {r.recruiter && <span className="text-slate-500 text-[10px]">({r.recruiter})</span>}
                                  {r.resumeUrl && (
                                    <a href={r.resumeUrl} target="_blank" rel="noreferrer" className="ml-auto text-blue-600 hover:text-blue-800 text-[10px]" title={t('interviewHub.import.viewOriginal', 'View original PDF')}>
                                      {t('interviewHub.import.viewOriginal', 'Original PDF')} ↗
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        {/* Already exist list */}
                        {resumeProgress.report.skippedExisting.length > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-slate-600 font-medium">
                              {t('interviewHub.backfill.existingList', 'Already in Talent Hub ({{count}})', { count: resumeProgress.report.skippedExisting.length })}
                            </summary>
                            <div className="mt-1 max-h-48 overflow-y-auto space-y-1 pl-3 bg-white/50 rounded p-2">
                              {resumeProgress.report.skippedExisting.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-slate-600">
                                  <span className="text-slate-400">↻</span>
                                  <button
                                    onClick={() => navigate(`/product/talent?highlight=${r.existingResumeId}`)}
                                    className="hover:underline text-left"
                                  >
                                    {r.candidateName}
                                  </button>
                                  <span className="text-slate-400 text-[10px]">— linked to existing</span>
                                  {r.resumeUrl && (
                                    <a href={r.resumeUrl} target="_blank" rel="noreferrer" className="ml-auto text-blue-600 hover:text-blue-800 text-[10px]">
                                      {t('interviewHub.import.viewOriginal', 'Original PDF')} ↗
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        {/* No email skipped */}
                        {resumeProgress.report.skippedNoEmail.length > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-amber-700 font-medium">
                              {t('interviewHub.backfill.noEmailList', 'No email — skipped ({{count}})', { count: resumeProgress.report.skippedNoEmail.length })}
                            </summary>
                            <div className="mt-1 max-h-48 overflow-y-auto space-y-1 pl-3 bg-white/50 rounded p-2">
                              {resumeProgress.report.skippedNoEmail.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-amber-700">
                                  <span>⚠</span>
                                  <span>{r.candidateName}</span>
                                  {r.resumeUrl && (
                                    <a href={r.resumeUrl} target="_blank" rel="noreferrer" className="ml-auto text-blue-600 hover:text-blue-800 text-[10px]">
                                      {t('interviewHub.import.viewOriginal', 'Original PDF')} ↗
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        {/* Failed — open by default with error message + link to original PDF */}
                        {resumeProgress.report.failed.length > 0 && (
                          <details className="text-xs" open>
                            <summary className="cursor-pointer text-red-700 font-medium">
                              {t('interviewHub.backfill.failedList', 'Failed ({{count}})', { count: resumeProgress.report.failed.length })}
                            </summary>
                            <div className="mt-1 max-h-48 overflow-y-auto space-y-1 pl-3 bg-white/50 rounded p-2">
                              {resumeProgress.report.failed.map((r, i) => (
                                <div key={i} className="text-red-700">
                                  <div className="flex items-center gap-2">
                                    <span className="text-red-500">✗</span>
                                    <span className="font-medium">{r.candidateName}</span>
                                    {r.resumeUrl && (
                                      <a href={r.resumeUrl} target="_blank" rel="noreferrer" className="ml-auto text-blue-600 hover:text-blue-800 text-[10px]">
                                        {t('interviewHub.import.viewOriginal', 'Original PDF')} ↗
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-red-600 text-[11px] pl-5 mt-0.5">{r.error}</div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Duplicates warning */}
              {importResult.duplicates.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">
                        {t('interviewHub.import.duplicatesFound', '{{count}} duplicate records were skipped', { count: importResult.duplicates.length })}
                      </p>
                      <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                        {importResult.duplicates.map((d, i) => (
                          <div key={i} className="text-xs text-amber-700">
                            {t('interviewHub.import.duplicateRow', 'Row {{row}}: {{name}} ({{date}})', {
                              row: d.row,
                              name: d.candidateName,
                              date: new Date(d.interviewDatetime).toLocaleDateString(),
                            })}
                          </div>
                        ))}
                      </div>
                      {pendingFile && (
                        <button
                          onClick={handleOverwriteConfirm}
                          disabled={importing}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {importing ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : null}
                          {t('interviewHub.import.overwriteAll', 'Re-import & overwrite duplicates')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-800 mb-2">
                    {t('interviewHub.import.errorsFound', '{{count}} rows had errors', { count: importResult.errors.length })}
                  </p>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="text-xs text-red-700">
                        {e.row > 0 ? `Row ${e.row}: ` : ''}{e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => { setImportResult(null); setPendingFile(null); setResumeProgress(null); if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan & Select modal — preview interviews missing resumes */}
      {scanModalOpen && (() => {
        const items = scanResults || [];
        const filtered = items.filter((it) => {
          if (hideShortInterviews && it.isShortInterview) return false;
          if (scanFilter !== 'all' && it.recommendedAction !== scanFilter) return false;
          if (scanSearch) {
            const q = scanSearch.toLowerCase();
            return (
              it.candidateName.toLowerCase().includes(q) ||
              (it.candidateEmail || '').toLowerCase().includes(q) ||
              (it.recruiterName || '').toLowerCase().includes(q) ||
              (it.jobTitle || '').toLowerCase().includes(q)
            );
          }
          return true;
        });
        const counts = items.reduce((acc, it) => { acc[it.recommendedAction] = (acc[it.recommendedAction] || 0) + 1; return acc; }, {} as Record<string, number>);
        const shortCount = items.filter((it) => it.isShortInterview).length;
        const allFilteredSelected = filtered.length > 0 && filtered.every((it) => selectedScanIds.has(it.interviewId));
        const toggleRow = (id: string) => {
          const next = new Set(selectedScanIds);
          if (next.has(id)) next.delete(id); else next.add(id);
          setSelectedScanIds(next);
        };
        const toggleAllFiltered = () => {
          const next = new Set(selectedScanIds);
          if (allFilteredSelected) {
            filtered.forEach((it) => next.delete(it.interviewId));
          } else {
            filtered.forEach((it) => {
              // Don't auto-select disabled rows
              if (it.recommendedAction !== 'no_email' && it.recommendedAction !== 'no_url') {
                next.add(it.interviewId);
              }
            });
          }
          setSelectedScanIds(next);
        };
        const selectOnlyNew = () => {
          const next = new Set<string>();
          items.forEach((it) => {
            if (it.recommendedAction === 'create_new' || it.recommendedAction === 'create_user_and_resume') {
              next.add(it.interviewId);
            }
          });
          setSelectedScanIds(next);
        };
        const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
          create_new: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: t('interviewHub.scan.actionCreateNew', 'Create new') },
          create_user_and_resume: { bg: 'bg-blue-100', text: 'text-blue-700', label: t('interviewHub.scan.actionCreateUserAndResume', 'Create user + resume') },
          link_existing: { bg: 'bg-slate-100', text: 'text-slate-600', label: t('interviewHub.scan.actionLinkExisting', 'Link to existing') },
          no_email: { bg: 'bg-amber-100', text: 'text-amber-700', label: t('interviewHub.scan.actionNoEmail', 'No email') },
          no_url: { bg: 'bg-red-100', text: 'text-red-700', label: t('interviewHub.scan.actionNoUrl', 'No resume URL') },
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setScanModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {t('interviewHub.scan.title', 'Scan: Interviews Missing Resumes')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('interviewHub.scan.subtitle', 'Read-only preview. Select which to create — existing resumes will never be overwritten.')}
                  </p>
                </div>
                <button onClick={() => setScanModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Filters & summary */}
              {scanning ? (
                <div className="flex-1 flex items-center justify-center py-16">
                  <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-16 text-slate-500 text-sm">
                  {t('interviewHub.scan.empty', 'All interviews already have resumes in Talent Hub')}
                </div>
              ) : (
                <>
                  <div className="px-6 py-3 border-b border-slate-100 space-y-3">
                    {/* Action breakdown */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() => setScanFilter('all')}
                        className={`px-2.5 py-1 rounded-md font-medium ${scanFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {t('interviewHub.scan.filterAll', 'All')} ({items.length})
                      </button>
                      {(['create_new', 'create_user_and_resume', 'link_existing', 'no_email'] as const).map((k) => {
                        const style = ACTION_STYLES[k];
                        return (
                          <button
                            key={k}
                            onClick={() => setScanFilter(k)}
                            className={`px-2.5 py-1 rounded-md font-medium ${scanFilter === k ? `${style.bg} ${style.text} ring-2 ring-offset-1 ring-slate-300` : `${style.bg} ${style.text} opacity-80 hover:opacity-100`}`}
                          >
                            {style.label} ({counts[k] || 0})
                          </button>
                        );
                      })}
                    </div>
                    {/* Search & bulk actions */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={scanSearch}
                        onChange={(e) => setScanSearch(e.target.value)}
                        placeholder={t('interviewHub.scan.searchPlaceholder', 'Search by name, email, recruiter, job...')}
                        className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <button
                        onClick={toggleAllFiltered}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        {allFilteredSelected ? t('interviewHub.scan.deselectFiltered', 'Deselect filtered') : t('interviewHub.scan.selectFiltered', 'Select filtered')}
                      </button>
                      <button
                        onClick={selectOnlyNew}
                        className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-md"
                      >
                        {t('interviewHub.scan.selectOnlyNew', 'Only new')}
                      </button>
                      <button
                        onClick={() => setSelectedScanIds(new Set())}
                        disabled={selectedScanIds.size === 0}
                        className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('interviewHub.scan.unselectAll', 'Unselect all')}
                      </button>
                    </div>
                    {/* Short interview toggle */}
                    {shortCount > 0 && (
                      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hideShortInterviews}
                          onChange={(e) => setHideShortInterviews(e.target.checked)}
                          className="w-3.5 h-3.5 accent-blue-600"
                        />
                        {t('interviewHub.scan.hideShort', 'Hide short interviews (<9 min)')}
                        <span className="text-amber-600 font-medium">({shortCount})</span>
                      </label>
                    )}
                  </div>

                  {/* Table */}
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left w-10"></th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">{t('interviewHub.scan.colCandidate', 'Candidate')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">{t('interviewHub.scan.colJob', 'Job')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">{t('interviewHub.scan.colRecruiter', 'Recruiter')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{t('interviewHub.scan.colDateTime', 'Date & Time')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{t('interviewHub.scan.colDuration', 'Duration')}</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">{t('interviewHub.scan.colAction', 'Action')}</th>
                          <th className="px-3 py-2 text-center font-semibold text-slate-600">{t('interviewHub.scan.colResume', 'Resume')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((it) => {
                          const style = ACTION_STYLES[it.recommendedAction];
                          const disabled = it.recommendedAction === 'no_email' || it.recommendedAction === 'no_url';
                          const isChecked = selectedScanIds.has(it.interviewId);
                          const dt = new Date(it.interviewDatetime);
                          return (
                            <tr key={it.interviewId} className={`border-b border-slate-100 hover:bg-slate-50/50 ${disabled ? 'opacity-60' : ''} ${it.isShortInterview ? 'bg-amber-50/40' : ''}`}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={disabled}
                                  onChange={() => !disabled && toggleRow(it.interviewId)}
                                  className="w-4 h-4 accent-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-slate-900">{it.candidateName}</div>
                                {it.candidateEmail && <div className="text-slate-500 text-[11px]">{it.candidateEmail}</div>}
                              </td>
                              <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">{it.jobTitle || '-'}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{it.recruiterName || it.recruiterEmail || '-'}</td>
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                <div>{dt.toLocaleDateString()}</div>
                                <div className="text-[10px] text-slate-400">{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {it.durationMinutes != null ? (
                                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${it.isShortInterview ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                    {it.durationMinutes}m{it.isShortInterview ? ' ⚠' : ''}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text}`}>
                                  {style.label}
                                </span>
                                {it.hasResumeInTalentHub && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    {t('interviewHub.scan.existingId', 'Resume #{{id}}', { id: it.existingResumeId?.substring(0, 8) })}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {it.resumeUrl ? (
                                  <a href={it.resumeUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800" onClick={(e) => e.stopPropagation()}>
                                    <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </a>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div className="text-xs text-slate-600">
                      {t('interviewHub.scan.selectedCount', '{{selected}} of {{total}} selected', { selected: selectedScanIds.size, total: items.length })}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setScanModalOpen(false)}
                        className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        {t('common.cancel', 'Cancel')}
                      </button>
                      <button
                        onClick={handleCreateSelected}
                        disabled={selectedScanIds.size === 0}
                        className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('interviewHub.scan.createSelected', 'Create {{count}} resumes', { count: selectedScanIds.size })}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
