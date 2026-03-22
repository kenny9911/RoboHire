import { useState, useEffect, useCallback, memo, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';
import { useAuth } from '../../context/AuthContext';
import { normalizeInterviewLanguage } from '../../utils/interviewLanguage';
import RecruiterTeamFilter, { type RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';
import {
  IconSearch,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
  IconBriefcase,
  IconFolder,
  IconCircleCheck,
  IconMapPin,
  IconCoin,
  IconUser,
  IconDotsVertical,
  IconFilter,
  IconSortDescending,
} from '@tabler/icons-react';

interface LinkedJob {
  id: string;
  title: string;
  status: string;
  department?: string | null;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryText?: string | null;
  salaryPeriod?: string | null;
  experienceLevel?: string | null;
  updatedAt: string;
}

interface HiringRequest {
  id: string;
  title: string;
  requirements: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  recruiter?: { id: string; name: string } | null;
  _count?: { candidates: number; resumeJobFits: number; interviews: number };
  linkedJob?: LinkedJob | null;
}

interface HiringStats {
  totalRequests: number;
  activeRequests: number;
  pausedRequests: number;
  closedRequests: number;
  totalCandidates: number;
  totalMatches: number;
  invitationsSent: number;
  interviewsCompleted: number;
  avgMatchScore: number | null;
  candidateStatusCounts: Record<string, number>;
}

const STATUSES = ['', 'active', 'paused', 'closed'];
const PAGE_SIZE = 20;

const hiringStatusLabel = (status: string, t: (k: string, f: string) => string) => {
  const map: Record<string, string> = {
    active: t('product.hiring.status.active', 'Active'),
    paused: t('product.hiring.status.paused', 'Paused'),
    closed: t('product.hiring.status.closed', 'Closed'),
  };
  return map[status] || status;
};

function getStatusTabLabel(status: string, t: (k: string, f: string) => string) {
  if (!status) return t('product.hiring.allStatuses', 'All');
  return hiringStatusLabel(status, t);
}

function getStatusCount(status: string, stats: HiringStats | null, totalCount: number) {
  if (!status) return totalCount;
  if (!stats) return 0;
  if (status === 'active') return stats.activeRequests;
  if (status === 'paused') return stats.pausedRequests;
  if (status === 'closed') return stats.closedRequests;
  return 0;
}

function formatSalary(job: LinkedJob | null | undefined) {
  if (!job) return null;
  if (job.salaryText) return job.salaryText;
  if (job.salaryMin && job.salaryMax) {
    const currency = job.salaryCurrency || '';
    const period = job.salaryPeriod === 'yearly' ? '/yr' : '/mo';
    const formatK = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`;
    return `${formatK(job.salaryMin)}-${formatK(job.salaryMax)}${currency ? ` ${currency}` : ''}${period}`;
  }
  return null;
}

function timeAgo(dateStr: string, t: (k: string, f: string, o?: Record<string, unknown>) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return t('product.hiring.timeAgo.today', 'Today');
  if (days === 1) return t('product.hiring.timeAgo.oneDay', '1d ago');
  if (days < 30) return t('product.hiring.timeAgo.days', '{{count}}d ago', { count: days });
  const months = Math.floor(days / 30);
  return t('product.hiring.timeAgo.months', '{{count}}mo ago', { count: months });
}

// ── Pipeline Bar (3 real metrics) ──
function PipelineBar({ candidates, matches, interviews, t }: {
  candidates: number; matches: number; interviews: number;
  t: (k: string, f: string, o?: Record<string, unknown>) => string;
}) {
  const total = candidates + matches + interviews;

  const segments = [
    { count: candidates, color: 'bg-slate-300', dot: 'bg-slate-400', label: t('product.hiring.candidates', 'Candidates') },
    { count: matches, color: 'bg-blue-500', dot: 'bg-blue-500', label: t('product.hiring.stats.aiMatch', 'AI Match') },
    { count: interviews, color: 'bg-violet-500', dot: 'bg-violet-500', label: t('product.hiring.stats.interview', 'Interview') },
  ];

  return (
    <div>
      <div className="flex items-center h-2.5 rounded-full overflow-hidden bg-slate-100">
        {total > 0 && segments.map((seg, i) => {
          const pct = Math.round((seg.count / total) * 100);
          if (pct <= 0) return null;
          return <div key={i} className={`h-full ${seg.color} transition-all`} style={{ width: `${pct}%` }} />;
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 text-[11px]">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className={`inline-block h-[6px] w-[6px] rounded-full shrink-0 ${seg.count > 0 ? seg.dot : 'bg-slate-300'}`} />
            <span className={seg.count > 0 ? 'text-slate-600' : 'text-slate-400'}>{seg.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Pagination ──
function Pagination({ page, totalPages, total, hasMore, hasExactTotal, onPageChange, t }: {
  page: number; totalPages: number; total: number; hasMore: boolean; hasExactTotal: boolean;
  onPageChange: (p: number) => void;
  t: (k: string, f: string, opts?: Record<string, unknown>) => string;
}) {
  const canGoPrev = page > 1;
  const canGoNext = hasExactTotal ? page < totalPages : hasMore;

  if (hasExactTotal && totalPages <= 1) return null;
  if (!hasExactTotal && !canGoPrev && !canGoNext) return null;

  if (!hasExactTotal) {
    return (
      <div className="flex flex-col items-center gap-2 pt-4 sm:flex-row sm:justify-between">
        <span className="text-sm text-slate-600">
          {t('product.hiring.pageLabel', 'Page {{page}}', { page })}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => onPageChange(page - 1)} disabled={!canGoPrev}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <IconChevronLeft size={16} stroke={2} />
          </button>
          <button onClick={() => onPageChange(page + 1)} disabled={!canGoNext}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <IconChevronRight size={16} stroke={2} />
          </button>
        </div>
      </div>
    );
  }

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-col items-center gap-2 pt-4 sm:flex-row sm:justify-between">
      <span className="text-sm text-slate-600">
        {t('product.hiring.totalProjects', '{{count}} projects', { count: total })}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <IconChevronLeft size={16} stroke={2} />
        </button>
        {pages.map((p) => (
          <button key={p} onClick={() => onPageChange(p)}
            className={`min-w-[36px] h-9 rounded-lg text-sm font-semibold transition-colors ${
              p === page ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <IconChevronRight size={16} stroke={2} />
        </button>
      </div>
    </div>
  );
}

// ── Project Card ──
const ProjectCard = memo(function ProjectCard({
  req, onStatusChange, onDelete, onCreateJob, isCreatingJob, t,
}: {
  req: HiringRequest;
  onStatusChange: (id: string, newStatus: string) => void;
  onDelete: (id: string) => void;
  onCreateJob: (id: string) => void;
  isCreatingJob: boolean;
  t: (k: string, f: string, opts?: Record<string, unknown>) => string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const candidates = req._count?.candidates ?? 0;
  const matches = req._count?.resumeJobFits ?? 0;
  const interviews = req._count?.interviews ?? 0;
  const totalPipeline = candidates + matches + interviews;
  const salary = formatSalary(req.linkedJob);
  const department = req.linkedJob?.department;
  const location = req.linkedJob?.location;
  const recruiterName = req.recruiter?.name;

  // Status badge style
  const statusBadge: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: hiringStatusLabel('active', t) },
    paused: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: hiringStatusLabel('paused', t) },
    closed: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', label: hiringStatusLabel('closed', t) },
  };
  const badge = statusBadge[req.status] || statusBadge.active;

  return (
    <article className="group rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md relative">
      <Link to={`/product/hiring/${req.id}`} className="block p-5">
        {/* Row 1: status badge + department + time + menu */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold border ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
            {department && (
              <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 truncate">
                {department}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400">{timeAgo(req.createdAt, t)}</span>
            <div className="relative">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen); }}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <IconDotsVertical size={16} stroke={2} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); }} />
                  <div className="absolute right-0 top-8 z-40 w-40 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                    {req.linkedJob ? (
                      <Link
                        to={`/product/jobs/${req.linkedJob.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <IconBriefcase size={14} stroke={2} />
                        {t('product.hiring.manageJob', 'Manage Job')}
                      </Link>
                    ) : (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onCreateJob(req.id); }}
                        disabled={isCreatingJob}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <IconBriefcase size={14} stroke={2} />
                        {t('product.hiring.createJob', 'Create Job')}
                      </button>
                    )}
                    {req.status === 'active' && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onStatusChange(req.id, 'paused'); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-slate-50"
                      >
                        <IconPlayerPause size={14} stroke={2} />
                        {t('product.hiring.pause', 'Pause')}
                      </button>
                    )}
                    {req.status === 'paused' && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onStatusChange(req.id, 'active'); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-600 hover:bg-slate-50"
                      >
                        <IconPlayerPlay size={14} stroke={2} />
                        {t('product.hiring.activate', 'Activate')}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDelete(req.id); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                    >
                      <IconTrash size={14} stroke={2} />
                      {t('product.hiring.delete', 'Delete')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Title + subtitle */}
        <h3 className="text-base font-bold text-slate-900 truncate">{req.title}</h3>
        <p className="mt-0.5 text-sm text-slate-500 line-clamp-1">{req.requirements?.slice(0, 120)}</p>

        {/* Meta row: location, salary, recruiter */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
          {location && (
            <span className="inline-flex items-center gap-1">
              <IconMapPin size={14} stroke={1.8} className="text-slate-400" />
              {location}
            </span>
          )}
          {salary && (
            <span className="inline-flex items-center gap-1">
              <IconCoin size={14} stroke={1.8} className="text-slate-400" />
              {salary}
            </span>
          )}
          {recruiterName && (
            <span className="inline-flex items-center gap-1">
              <IconUser size={14} stroke={1.8} className="text-slate-400" />
              {recruiterName}
            </span>
          )}
        </div>

        {/* Pipeline section */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-slate-600">{t('product.hiring.pipeline.title', 'Pipeline')}</span>
            <span className={`text-sm font-bold ${totalPipeline > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
              {totalPipeline} {t('product.hiring.pipeline.people', 'people')}
            </span>
          </div>
          <PipelineBar candidates={candidates} matches={matches} interviews={interviews} t={t} />
        </div>

        {/* Bottom stats */}
        <div className="mt-4 flex items-center justify-between">
          <div className={`flex items-center gap-5 text-sm ${totalPipeline === 0 ? 'opacity-40' : ''}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className={`text-base font-bold ${matches > 0 ? 'text-blue-600' : 'text-slate-300'}`}>{matches}</span>
              <span className={matches > 0 ? 'text-slate-500' : 'text-slate-300'}>{t('product.hiring.stats.aiMatch', 'AI Match')}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`text-base font-bold ${interviews > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{interviews}</span>
              <span className={interviews > 0 ? 'text-slate-500' : 'text-slate-300'}>{t('product.hiring.stats.interview', 'Interview')}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`text-base font-bold ${candidates > 0 ? 'text-slate-800' : 'text-slate-300'}`}>{candidates}</span>
              <span className={candidates > 0 ? 'text-slate-500' : 'text-slate-300'}>{t('product.hiring.candidates', 'Candidates')}</span>
            </span>
          </div>
          <span className="hidden group-hover:inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            {t('product.hiring.viewDetails', 'View Details')} →
          </span>
        </div>
      </Link>
    </article>
  );
});

// ── Main Component ──
export default function HiringRequests() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [requests, setRequests] = usePageState<HiringRequest[]>('hiring.requests', []);
  const [loading, setLoading] = useState(requests.length > 0 ? false : true);
  const [statusFilter, setStatusFilter] = usePageState<string>('hiring.statusFilter', '');
  const [search, setSearch] = usePageState<string>('hiring.search', '');
  const [recruiterFilter, setRecruiterFilter] = usePageState<RecruiterTeamFilterValue>('hiring.recruiterFilter', {});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [hasExactTotal, setHasExactTotal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [stats, setStats] = usePageState<HiringStats | null>('hiring.stats', null);
  const [sortOrder, setSortOrder] = usePageState<string>('hiring.sortOrder', 'date');
  const requestsLoadingRef = useRef(false);
  const statsRefreshPendingRef = useRef(true);

  const fetchStats = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (recruiterFilter.filterUserId) params.filterUserId = recruiterFilter.filterUserId;
      if (recruiterFilter.filterTeamId) params.filterTeamId = recruiterFilter.filterTeamId;
      if (recruiterFilter.teamView) params.teamView = 'true';
      params.includeRecent = 'false';
      const res = await axios.get('/api/v1/hiring-requests/stats', { params });
      setStats(res.data.data);
    } catch {
      // silently fail
    }
  }, [recruiterFilter]);

  const fetchRequests = useCallback(async (pageNum: number) => {
    try {
      requestsLoadingRef.current = true;
      setLoading(true);
      const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: (pageNum - 1) * PAGE_SIZE, includeTotal: 'false' };
      if (statusFilter) params.status = statusFilter;
      if (recruiterFilter.filterUserId) params.filterUserId = recruiterFilter.filterUserId;
      if (recruiterFilter.filterTeamId) params.filterTeamId = recruiterFilter.filterTeamId;
      if (recruiterFilter.teamView) params.teamView = 'true';
      const res = await axios.get('/api/v1/hiring-requests', { params });
      const items = res.data.data || [];
      setRequests(items);
      const pag = res.data.pagination;
      const responseHasMore = Boolean(pag?.hasMore);
      setHasMorePages(responseHasMore);
      if (pag && typeof pag.total === 'number') {
        setHasExactTotal(true);
        setTotalCount(pag.total || 0);
        setTotalPages(Math.ceil((pag.total || 0) / PAGE_SIZE) || 1);
      } else {
        const lowerBound = ((pageNum - 1) * PAGE_SIZE) + items.length + (responseHasMore ? 1 : 0);
        setHasExactTotal(false);
        setTotalCount(lowerBound);
        setTotalPages(responseHasMore ? pageNum + 1 : pageNum);
      }
    } catch {
      // silently fail
    } finally {
      requestsLoadingRef.current = false;
      setLoading(false);
    }
  }, [statusFilter, recruiterFilter]);

  useEffect(() => {
    setPage(1);
    void fetchRequests(1);
  }, [fetchRequests]);

  useEffect(() => {
    statsRefreshPendingRef.current = true;
  }, [fetchStats]);

  useEffect(() => {
    if (requestsLoadingRef.current || loading || !statsRefreshPendingRef.current) return;
    statsRefreshPendingRef.current = false;
    void fetchStats();
  }, [fetchStats, loading]);

  const exactTotalCountFromStats = useMemo(() => {
    if (!stats) return null;
    return statusFilter ? getStatusCount(statusFilter, stats, totalCount) : stats.totalRequests;
  }, [stats, statusFilter, totalCount]);

  const resolvedTotalCount = exactTotalCountFromStats ?? totalCount;
  const resolvedTotalPages = exactTotalCountFromStats !== null
    ? Math.max(1, Math.ceil(exactTotalCountFromStats / PAGE_SIZE) || 1)
    : totalPages;
  const totalIsExact = hasExactTotal || exactTotalCountFromStats !== null;

  // Client-side search filter
  const filteredRequests = useMemo(() => {
    let result = requests;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.requirements?.toLowerCase().includes(q) ||
        r.recruiter?.name?.toLowerCase().includes(q) ||
        r.linkedJob?.department?.toLowerCase().includes(q) ||
        r.linkedJob?.location?.toLowerCase().includes(q)
      );
    }
    // Sort
    if (sortOrder === 'name') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOrder === 'candidates') {
      result = [...result].sort((a, b) => (b._count?.candidates ?? 0) - (a._count?.candidates ?? 0));
    }
    return result;
  }, [requests, search, sortOrder]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    void fetchRequests(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fetchRequests]);

  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    try {
      await axios.patch(`/api/v1/hiring-requests/${id}`, { status: newStatus });
      await Promise.all([fetchRequests(page), fetchStats()]);
    } catch {
      // handle error
    }
  }, [fetchRequests, fetchStats, page]);

  const handleDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`/api/v1/hiring-requests/${confirmDeleteId}`);
      const nextTotal = Math.max(resolvedTotalCount - 1, 0);
      const nextPage = Math.min(page, Math.max(1, Math.ceil(nextTotal / PAGE_SIZE) || 1));
      if (nextPage !== page) {
        setPage(nextPage);
      }
      await Promise.all([fetchRequests(nextPage), fetchStats()]);
    } catch {
      // handle error
    } finally {
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, fetchRequests, fetchStats, page, resolvedTotalCount]);

  const [successMessage, setSuccessMessage] = useState('');
  const [creatingJobId, setCreatingJobId] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const doCreateJob = async (requestId: string, title?: string) => {
    setCreatingJobId(requestId);
    try {
      const payload: Record<string, string> = {
        preferredLanguage: normalizeInterviewLanguage(i18n.language),
      };
      if (title) payload.title = title;

      const res = await axios.post(`/api/v1/jobs/from-request/${requestId}`, payload);
      const jobTitle = res.data?.data?.title || title || '';
      showSuccess(t('product.hiring.jobCreatedSuccess', 'Job "{{title}}" created successfully!', { title: jobTitle }));
      await fetchRequests(page);
    } catch {
      // handle error
    } finally {
      setCreatingJobId(null);
    }
  };

  const handleCreateJob = useCallback(async (requestId: string) => {
    const hr = requests.find(r => r.id === requestId);
    if (!hr) return;
    setCreatingJobId(requestId);
    await doCreateJob(requestId);
  }, [requests]);

  return (
    <div className="mx-auto max-w-[1460px] space-y-5">
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-2 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
          <IconCircleCheck size={18} stroke={2} />
          {successMessage}
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-900">{t('product.hiring.title', 'Projects')}</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-semibold text-slate-600">
            {resolvedTotalCount}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('product.hiring.searchPlaceholder', 'Search position, department, recruiter...')}
              className="h-10 w-64 lg:w-80 rounded-lg border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">/</span>
          </div>
          <Link
            to="/start-hiring"
            state={{ fresh: true }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <IconPlus size={15} stroke={2} />
            {t('product.hiring.newProject', 'New Project')}
          </Link>
        </div>
      </div>

      {/* Stats strip */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            {
              label: t('product.hiring.stats.activeProjects', 'Active Projects'),
              value: stats?.activeRequests ?? 0,
              sub: stats ? `+${Math.min(stats.activeRequests, 3)} ${t('product.hiring.stats.thisWeek', 'this week')}` : '',
            },
            {
              label: t('product.hiring.stats.totalCandidates', 'Candidates'),
              value: stats?.totalCandidates ?? 0,
              sub: stats ? `${stats.activeRequests} ${t('product.hiring.stats.positions', 'positions')}` : '',
            },
            {
              label: t('product.hiring.stats.totalMatches', 'AI Matches'),
              value: stats?.totalMatches ?? 0,
              sub: '',
            },
            {
              label: t('product.hiring.stats.interviews', 'Interviews'),
              value: stats?.interviewsCompleted ?? 0,
              sub: '',
            },
            {
              label: t('product.hiring.stats.avgClose', 'Avg Close'),
              value: stats?.avgMatchScore ? `${stats.avgMatchScore}` : '—',
              sub: stats?.avgMatchScore ? '' : t('product.hiring.stats.accumulating', 'accumulating data'),
            },
          ].map((item) => (
            <div key={item.label} className="text-center sm:text-left">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
              {item.sub && <p className="mt-0.5 text-xs text-slate-400">{item.sub}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Tab bar + filter controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-0">
        {/* Status tabs */}
        <div className="flex items-center gap-0">
          {STATUSES.map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {getStatusTabLabel(s, t)} {getStatusCount(s, stats, resolvedTotalCount)}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 pb-2 sm:pb-0">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <IconFilter size={14} stroke={2} />
            {t('product.hiring.filter', 'Filter')}
          </button>
          {user?.role === 'admin' && (
            <RecruiterTeamFilter value={recruiterFilter} onChange={setRecruiterFilter} />
          )}
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="date">{t('product.hiring.sortByDate', 'By date')}</option>
              <option value="name">{t('product.hiring.sortByName', 'By name')}</option>
              <option value="candidates">{t('product.hiring.sortByCandidates', 'By candidates')}</option>
            </select>
            <IconSortDescending className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-20 rounded-xl border border-dashed border-slate-200 bg-white">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100">
            <IconFolder size={24} stroke={1.5} className="text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">
            {search ? t('product.hiring.noResults', 'No projects match your search') : t('product.hiring.empty', 'No projects yet')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {search
              ? t('product.hiring.noResultsDesc', 'Try a different search term.')
              : t('product.hiring.emptyDesc', 'Create your first recruitment project with our AI assistant.')}
          </p>
          {!search && (
            <Link
              to="/start-hiring"
              state={{ fresh: true }}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              <IconPlus size={15} stroke={2} />
              {t('product.hiring.newProject', 'New Project')}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredRequests.map((req) => (
            <ProjectCard
              key={req.id}
              req={req}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onCreateJob={handleCreateJob}
              isCreatingJob={creatingJobId === req.id}
              t={t}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={resolvedTotalPages}
        total={resolvedTotalCount}
        hasMore={hasMorePages}
        hasExactTotal={totalIsExact}
        onPageChange={handlePageChange}
        t={t}
      />

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{t('common.confirmDelete', 'Confirm Delete')}</h3>
            <p className="mt-2 text-sm text-slate-500">{t('common.confirmDeleteMessage', 'Are you sure you want to delete this item? This action cannot be undone.')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                {t('common.cancel', 'Cancel')}
              </button>
              <button onClick={confirmDelete}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
                {t('common.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
