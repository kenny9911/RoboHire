import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import RecruiterTeamFilter, { RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';

interface EvaluatedInterview {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  interviewDatetime: string;
  duration: number | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  jobTitle: string | null;
  evaluationScore: number | null;
  evaluationVerdict: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  strong_hire: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Strong Hire' },
  hire: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Hire' },
  lean_hire: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Lean Hire' },
  lean_no_hire: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Lean No Hire' },
  no_hire: { bg: 'bg-red-50', text: 'text-red-600', label: 'No Hire' },
};

function scoreColor(score: number | null): string {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-slate-100';
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function EvaluationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [recruiterFilter, setRecruiterFilter] = useState<RecruiterTeamFilterValue>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('evaluationScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const limit = 20;

  const [interviews, setInterviews] = useState<EvaluatedInterview[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number | boolean> = {
        page,
        limit,
        sortBy,
        sortOrder,
        hasEvaluation: 'true',
      };
      if (debouncedQuery) params.q = debouncedQuery;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (recruiterFilter.filterUserId) params.filterUserId = recruiterFilter.filterUserId;
      if (recruiterFilter.filterTeamId) params.filterTeamId = recruiterFilter.filterTeamId;
      if (recruiterFilter.teamView !== undefined) params.teamView = recruiterFilter.teamView ? 'true' : 'false';

      const res = await axios.get('/api/v1/gohire-interviews', { params });
      if (res.data.success) {
        let data = res.data.data || [];
        // Client-side verdict filter
        if (verdictFilter) {
          data = data.filter((iv: EvaluatedInterview) => iv.evaluationVerdict === verdictFilter);
        }
        setInterviews(data);
        setPagination(res.data.pagination || null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortOrder, debouncedQuery, dateFrom, dateTo, recruiterFilter, verdictFilter]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  // Computed stats from current page data + total
  const stats = useMemo(() => {
    const total = pagination?.total ?? 0;
    const scores = interviews.map((iv) => iv.evaluationScore).filter((s): s is number => s != null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const passCount = scores.filter((s) => s >= 70).length;
    const strongHireCount = interviews.filter((iv) => iv.evaluationVerdict === 'strong_hire').length;
    return { total, avgScore, passCount, strongHireCount };
  }, [interviews, pagination]);

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setVerdictFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasActiveFilters = verdictFilter || dateFrom || dateTo;

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
          {t('evaluationCenter.title', 'Evaluation Center')}
          <span className="ml-2 text-lg font-normal text-slate-400">
            {t('evaluationCenter.subtitle', 'AI-Powered Assessment Hub')}
          </span>
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('evaluationCenter.description', 'Review and manage AI-generated interview evaluation reports. Share, export, and compare candidates.')}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Evaluated */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{loading ? <div className="h-7 w-12 animate-pulse rounded bg-slate-100" /> : stats.total}</div>
              <div className="text-xs text-slate-500">{t('evaluationCenter.stats.totalEvaluated', 'Total Evaluated')}</div>
            </div>
          </div>
        </div>

        {/* Avg Score */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div>
              <div className={`text-2xl font-bold ${scoreColor(stats.avgScore)}`}>
                {loading ? <div className="h-7 w-12 animate-pulse rounded bg-slate-100" /> : stats.avgScore}
              </div>
              <div className="text-xs text-slate-500">{t('evaluationCenter.stats.avgScore', 'Avg Score')}</div>
            </div>
          </div>
        </div>

        {/* Pass Rate */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">
                {loading ? <div className="h-7 w-12 animate-pulse rounded bg-slate-100" /> : stats.passCount}
              </div>
              <div className="text-xs text-slate-500">{t('evaluationCenter.stats.passCount', 'Pass (70+)')}</div>
            </div>
          </div>
        </div>

        {/* Strong Hire */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50">
              <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-violet-600">
                {loading ? <div className="h-7 w-12 animate-pulse rounded bg-slate-100" /> : stats.strongHireCount}
              </div>
              <div className="text-xs text-slate-500">{t('evaluationCenter.stats.strongHire', 'Strong Hire')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('evaluationCenter.searchPlaceholder', 'Search by candidate name or email...')}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
            />
          </div>

          {/* Recruiter/team filter */}
          <RecruiterTeamFilter
            value={recruiterFilter}
            onChange={(f) => { setRecruiterFilter(f); setPage(1); }}
          />

          {/* Filters toggle */}
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              hasActiveFilters
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {t('evaluationCenter.filters', 'Filters')}
            {hasActiveFilters && (
              <span className="ml-1 h-4 w-4 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center">!</span>
            )}
          </button>
        </div>

        {/* Expanded filters */}
        {filtersOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('evaluationCenter.verdictFilter', 'Verdict')}</label>
              <select
                value={verdictFilter}
                onChange={(e) => { setVerdictFilter(e.target.value); setPage(1); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('evaluationCenter.allVerdicts', 'All Verdicts')}</option>
                <option value="strong_hire">{t('evaluationCenter.verdict.strongHire', 'Strong Hire')}</option>
                <option value="hire">{t('evaluationCenter.verdict.hire', 'Hire')}</option>
                <option value="lean_hire">{t('evaluationCenter.verdict.leanHire', 'Lean Hire')}</option>
                <option value="lean_no_hire">{t('evaluationCenter.verdict.leanNoHire', 'Lean No Hire')}</option>
                <option value="no_hire">{t('evaluationCenter.verdict.noHire', 'No Hire')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('evaluationCenter.dateFrom', 'Date From')}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('evaluationCenter.dateTo', 'Date To')}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {hasActiveFilters && (
              <div className="sm:col-span-3 flex justify-end">
                <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">
                  {t('evaluationCenter.clearFilters', 'Clear all filters')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none" onClick={() => handleSort('candidateName')}>
                  {t('evaluationCenter.col.candidate', 'Candidate')} <SortIcon column="candidateName" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none" onClick={() => handleSort('jobTitle')}>
                  {t('evaluationCenter.col.position', 'Position')} <SortIcon column="jobTitle" />
                </th>
                <th className="text-center px-4 py-3 font-medium text-slate-600 cursor-pointer select-none" onClick={() => handleSort('evaluationScore')}>
                  {t('evaluationCenter.col.score', 'Score')} <SortIcon column="evaluationScore" />
                </th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">
                  {t('evaluationCenter.col.verdict', 'Verdict')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">
                  {t('evaluationCenter.col.recruiter', 'Recruiter')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none" onClick={() => handleSort('interviewDatetime')}>
                  {t('evaluationCenter.col.date', 'Date')} <SortIcon column="interviewDatetime" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-32 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-40 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 w-10 bg-slate-100 rounded mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-5 w-20 bg-slate-100 rounded mx-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-28 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 bg-slate-100 rounded" /></td>
                  </tr>
                ))
              ) : interviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium">{t('evaluationCenter.empty', 'No evaluated interviews yet')}</p>
                    <p className="text-xs mt-1">{t('evaluationCenter.emptyHint', 'Complete an interview and generate an evaluation to see it here.')}</p>
                  </td>
                </tr>
              ) : (
                interviews.map((iv) => {
                  const vs = VERDICT_STYLES[iv.evaluationVerdict || ''];
                  return (
                    <tr
                      key={iv.id}
                      onClick={() => navigate(`/product/interview-hub/${iv.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{iv.candidateName}</div>
                        {iv.candidateEmail && (
                          <div className="text-xs text-slate-400 truncate max-w-[200px]">{iv.candidateEmail}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{iv.jobTitle || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-2">
                          <span className={`text-lg font-bold ${scoreColor(iv.evaluationScore)}`}>
                            {iv.evaluationScore ?? '-'}
                          </span>
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${scoreBg(iv.evaluationScore)}`}
                              style={{ width: `${iv.evaluationScore ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {vs ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${vs.bg} ${vs.text}`}>
                            {t(`evaluationCenter.verdict.${iv.evaluationVerdict}`, vs.label)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{iv.recruiterName || iv.recruiterEmail || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(iv.interviewDatetime).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {t('evaluationCenter.showing', 'Showing')} {(page - 1) * limit + 1}-{Math.min(page * limit, pagination.total)} {t('evaluationCenter.of', 'of')} {pagination.total}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('evaluationCenter.prev', 'Prev')}
              </button>
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, pagination.totalPages - 4));
                const p = start + i;
                if (p > pagination.totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      p === page
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('evaluationCenter.next', 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
