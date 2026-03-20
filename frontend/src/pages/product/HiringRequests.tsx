import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';
import { normalizeInterviewLanguage } from '../../utils/interviewLanguage';
import RecruiterTeamFilter, { type RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';

interface HiringRequest {
  id: string;
  title: string;
  requirements: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: { candidates: number; resumeJobFits: number; interviews: number };
  linkedJob?: { id: string; title: string; status: string; updatedAt: string } | null;
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

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-slate-100 text-slate-600',
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  paused: 'bg-amber-500',
  closed: 'bg-slate-400',
};

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

// ── Stat Card ──
function StatCard({ label, value, icon, accent }: {
  label: string; value: string | number; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ── Pipeline Bar ──
function PipelineBar({ candidates, matches, interviews, t }: {
  candidates: number; matches: number; interviews: number;
  t: (k: string, f: string, o?: Record<string, unknown>) => string;
}) {
  const total = Math.max(candidates + matches, 1);
  const matchPct = Math.round((matches / total) * 100);
  const interviewPct = Math.round((interviews / total) * 100);
  const candidatePct = 100 - matchPct - interviewPct;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-slate-100">
        {candidatePct > 0 && (
          <div className="h-full rounded-full bg-slate-300 transition-all" style={{ width: `${candidatePct}%` }} />
        )}
        {matchPct > 0 && (
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${matchPct}%` }} />
        )}
        {interviewPct > 0 && (
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${interviewPct}%` }} />
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
          {t('product.hiring.pipeline.candidates', '{{count}} candidates', { count: candidates })}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          {t('product.hiring.pipeline.matches', '{{count}} matches', { count: matches })}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500" />
          {t('product.hiring.pipeline.interviews', '{{count}} interviews', { count: interviews })}
        </span>
      </div>
    </div>
  );
}

// ── Pagination ──
function Pagination({ page, totalPages, total, onPageChange, t }: {
  page: number; totalPages: number; total: number;
  onPageChange: (p: number) => void;
  t: (k: string, f: string, opts?: Record<string, unknown>) => string;
}) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-col items-center gap-2 pt-4 sm:flex-row sm:justify-between">
      <span className="text-xs text-slate-500">
        {t('product.hiring.totalProjects', '{{count}} projects', { count: total })}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {pages.map((p) => (
          <button key={p} onClick={() => onPageChange(p)}
            className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-colors ${
              p === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
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
  const candidates = req._count?.candidates ?? 0;
  const matches = req._count?.resumeJobFits ?? 0;
  const interviews = req._count?.interviews ?? 0;
  const daysSinceUpdate = Math.floor((Date.now() - new Date(req.updatedAt).getTime()) / 86400000);
  const isStale = req.status === 'active' && daysSinceUpdate > 14;

  return (
    <div className={`group relative rounded-2xl border bg-white transition-all hover:-translate-y-0.5 hover:shadow-md ${
      isStale ? 'border-amber-200' : 'border-slate-200 hover:border-blue-200'
    }`}>
      {/* Top accent line */}
      <div className={`absolute inset-x-0 top-0 h-0.5 rounded-t-2xl ${
        req.status === 'active' ? 'bg-emerald-500' : req.status === 'paused' ? 'bg-amber-400' : 'bg-slate-300'
      }`} />

      <Link to={`/product/hiring/${req.id}`} className="block px-5 pt-5 pb-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[req.status] || STATUS_DOT.active}`} />
              <h3 className="text-base font-semibold text-slate-900 truncate">{req.title}</h3>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[req.status] || STATUS_COLORS.active}`}>
                {hiringStatusLabel(req.status, t)}
              </span>
              {isStale && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {t('product.hiring.needsAttention', 'Needs attention')}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500 line-clamp-2 leading-relaxed">{req.requirements?.slice(0, 200)}</p>
          </div>

          {/* Arrow indicator */}
          <svg className="w-5 h-5 text-slate-300 shrink-0 mt-0.5 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>

        {/* Stats chips */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            {candidates} {t('product.hiring.candidates', 'candidates')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <svg className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {matches} {t('product.hiring.matchesLabel', 'matches')}
          </span>
          {interviews > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <svg className="h-3.5 w-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {interviews} {t('product.hiring.interviewsLabel', 'interviews')}
            </span>
          )}
          <span className="text-[11px] text-slate-400">
            {new Date(req.updatedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Pipeline bar */}
        {(candidates > 0 || matches > 0) && (
          <PipelineBar candidates={candidates} matches={matches} interviews={interviews} t={t} />
        )}
      </Link>

      {/* Action bar */}
      <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-4 py-2">
        {/* Linked job / Create Job */}
        {req.linkedJob ? (
          <Link
            to={`/product/jobs/${req.linkedJob.id}`}
            onClick={(e) => e.stopPropagation()}
            title={t('product.hiring.manageJob', 'Manage Job')}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 px-3 py-2 text-sm font-semibold text-blue-700 shadow-[0_16px_30px_-24px_rgba(37,99,235,0.95)] transition-colors hover:border-blue-300 hover:from-blue-100 hover:to-cyan-100"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5V6A2.25 2.25 0 019.75 3.75h4.5A2.25 2.25 0 0116.5 6v1.5m-9 0h9m-9 0H6A2.25 2.25 0 003.75 9.75v7.5A2.25 2.25 0 006 19.5h12a2.25 2.25 0 002.25-2.25v-7.5A2.25 2.25 0 0018 7.5h-1.5" />
              </svg>
            </span>
            <span>{t('product.hiring.manageJob', 'Manage Job')}</span>
          </Link>
        ) : (
          <button onClick={(e) => { e.preventDefault(); onCreateJob(req.id); }} disabled={isCreatingJob}
            title={isCreatingJob ? t('product.hiring.creatingJob', 'Creating...') : t('product.hiring.createJob', 'Create Job')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isCreatingJob ? 'text-blue-400 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'
            }`}>
            {isCreatingJob ? (
              <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            {t('product.hiring.createJob', 'Create Job')}
          </button>
        )}

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Status toggle */}
        {req.status === 'active' && (
          <button onClick={(e) => { e.preventDefault(); onStatusChange(req.id, 'paused'); }}
            title={t('product.hiring.pause', 'Pause')}
            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
        {req.status === 'paused' && (
          <button onClick={(e) => { e.preventDefault(); onStatusChange(req.id, 'active'); }}
            title={t('product.hiring.activate', 'Activate')}
            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}

        {/* Delete */}
        <button onClick={(e) => { e.preventDefault(); onDelete(req.id); }}
          title={t('product.hiring.delete', 'Delete')}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
});

// ── Main Component ──
export default function HiringRequests() {
  const { t, i18n } = useTranslation();
  const [requests, setRequests] = usePageState<HiringRequest[]>('hiring.requests', []);
  const [loading, setLoading] = useState(requests.length > 0 ? false : true);
  const [statusFilter, setStatusFilter] = usePageState<string>('hiring.statusFilter', '');
  const [search, setSearch] = usePageState<string>('hiring.search', '');
  const [recruiterFilter, setRecruiterFilter] = usePageState<RecruiterTeamFilterValue>('hiring.recruiterFilter', {});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [stats, setStats] = useState<HiringStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (recruiterFilter.filterUserId) params.filterUserId = recruiterFilter.filterUserId;
      if (recruiterFilter.filterTeamId) params.filterTeamId = recruiterFilter.filterTeamId;
      if (recruiterFilter.teamView) params.teamView = 'true';
      const res = await axios.get('/api/v1/hiring-requests/stats', { params });
      setStats(res.data.data);
    } catch {
      // silently fail
    }
  }, [recruiterFilter]);

  const fetchRequests = useCallback(async (pageNum: number) => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: (pageNum - 1) * PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      if (recruiterFilter.filterUserId) params.filterUserId = recruiterFilter.filterUserId;
      if (recruiterFilter.filterTeamId) params.filterTeamId = recruiterFilter.filterTeamId;
      if (recruiterFilter.teamView) params.teamView = 'true';
      const res = await axios.get('/api/v1/hiring-requests', { params });
      setRequests(res.data.data || []);
      const pag = res.data.pagination;
      if (pag) {
        setTotalCount(pag.total || 0);
        setTotalPages(Math.ceil((pag.total || 0) / PAGE_SIZE) || 1);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter, recruiterFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setPage(1);
    fetchRequests(1);
  }, [fetchRequests]);

  // Client-side search filter
  const filteredRequests = useMemo(() => {
    if (!search.trim()) return requests;
    const q = search.toLowerCase();
    return requests.filter((r) =>
      r.title.toLowerCase().includes(q) || r.requirements?.toLowerCase().includes(q)
    );
  }, [requests, search]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    fetchRequests(newPage);
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
      const nextTotal = Math.max(totalCount - 1, 0);
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
  }, [confirmDeleteId, fetchRequests, fetchStats, page, totalCount]);

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
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-2 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.hiring.title', 'Projects')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.hiring.subtitle', 'Manage recruitment projects — requirements, candidate search, matching, and interviews.')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap self-start sm:self-auto">
          <RecruiterTeamFilter value={recruiterFilter} onChange={setRecruiterFilter} />
          <Link
            to="/start-hiring"
            state={{ fresh: true }}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('product.hiring.newProject', 'New Project')}
          </Link>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard
            label={t('product.hiring.stats.activeProjects', 'Active Projects')}
            value={stats.activeRequests}
            accent="bg-emerald-50 text-emerald-600"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>}
          />
          <StatCard
            label={t('product.hiring.stats.totalCandidates', 'Total Candidates')}
            value={stats.totalCandidates}
            accent="bg-blue-50 text-blue-600"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
          />
          <StatCard
            label={t('product.hiring.stats.totalMatches', 'AI Matches')}
            value={stats.totalMatches}
            accent="bg-cyan-50 text-cyan-600"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          />
          <StatCard
            label={t('product.hiring.stats.interviews', 'Interviews')}
            value={stats.interviewsCompleted}
            accent="bg-violet-50 text-violet-600"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
          />
          <StatCard
            label={t('product.hiring.stats.avgScore', 'Avg Match Score')}
            value={stats.avgMatchScore ?? '-'}
            accent="bg-amber-50 text-amber-600"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>}
          />
        </div>
      )}

      {/* Filter + Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s ? hiringStatusLabel(s, t) : t('product.hiring.allStatuses', 'All')}
              {s && stats && (
                <span className="ml-1.5 opacity-70">
                  {s === 'active' ? stats.activeRequests : s === 'paused' ? stats.pausedRequests : stats.closedRequests}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('product.hiring.searchPlaceholder', 'Search projects...')}
            className="w-full sm:w-64 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors"
          />
        </div>
      </div>

      {/* Projects List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border border-dashed border-slate-200 bg-white">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
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
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t('product.hiring.newProject', 'New Project')}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
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

      <Pagination page={page} totalPages={totalPages} total={totalCount} onPageChange={handlePageChange} t={t} />


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
