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
  } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImportCsv = async (file: File, overwrite = false) => {
    setImporting(true);
    setImportResult(null);
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
          <span className="ml-2 text-lg font-normal text-slate-400">{t('interviewHub.subtitle', '面试库')}</span>
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

          {/* Import CSV button (admin only) */}
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
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 shrink-0">
                              <span className="text-xs font-bold text-slate-600">
                                {interview.candidateName[0]?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <span className="font-medium text-slate-900 truncate max-w-[180px]">
                              {interview.candidateName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 truncate max-w-[180px]">
                          {interview.candidateEmail || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {interview.jobTitle ? (
                            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-full truncate max-w-[160px]">
                              {interview.jobTitle}
                            </span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setImportResult(null); setPendingFile(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {t('interviewHub.import.resultTitle', 'Import Results')}
              </h3>
              <button onClick={() => { setImportResult(null); setPendingFile(null); }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
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
                onClick={() => { setImportResult(null); setPendingFile(null); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
