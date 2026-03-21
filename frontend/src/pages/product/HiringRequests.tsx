import { useState, useEffect, useCallback, memo, useMemo } from 'react';
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
  IconChevronRight as IconArrow,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
  IconBriefcase,
  IconUsers,
  IconBolt,
  IconVideo,
  IconFolder,
  IconCircleCheck,
  IconAlertTriangle,
} from '@tabler/icons-react';

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
      <div className="flex items-center gap-0.5 h-1.5 rounded-full overflow-hidden bg-slate-100">
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
  const candidates = req._count?.candidates ?? 0;
  const matches = req._count?.resumeJobFits ?? 0;
  const interviews = req._count?.interviews ?? 0;
  const daysSinceUpdate = Math.floor((Date.now() - new Date(req.updatedAt).getTime()) / 86400000);
  const isStale = req.status === 'active' && daysSinceUpdate > 14;

  return (
    <article className="rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
      <Link to={`/product/hiring/${req.id}`} className="block p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[req.status] || STATUS_DOT.active}`} />
              <h3 className="text-base font-bold text-slate-900 truncate">{req.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[req.status] || STATUS_COLORS.active}`}>
                {hiringStatusLabel(req.status, t)}
              </span>
              {isStale && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                  <IconAlertTriangle size={11} stroke={2.5} />
                  {t('product.hiring.needsAttention', 'Needs attention')}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500 line-clamp-2 leading-relaxed">{req.requirements?.slice(0, 200)}</p>
          </div>
          <IconArrow size={18} stroke={1.5} className="text-slate-300 shrink-0 mt-0.5" />
        </div>

        {/* Stats chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            <IconUsers size={12} stroke={1.8} className="mr-1 inline -mt-0.5" />
            {candidates} {t('product.hiring.candidates', 'candidates')}
          </span>
          <span className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-600">
            <IconBolt size={12} stroke={1.8} className="mr-1 inline -mt-0.5" />
            {matches} {t('product.hiring.matchesLabel', 'matches')}
          </span>
          {interviews > 0 && (
            <span className="rounded bg-violet-50 px-2 py-0.5 font-medium text-violet-600">
              <IconVideo size={12} stroke={1.8} className="mr-1 inline -mt-0.5" />
              {interviews} {t('product.hiring.interviewsLabel', 'interviews')}
            </span>
          )}
          <span className="text-[11px] text-slate-400 ml-1">
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            <IconBriefcase size={14} stroke={2} />
            {t('product.hiring.manageJob', 'Manage Job')}
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
              <IconBriefcase size={14} stroke={2} />
            )}
            {t('product.hiring.createJob', 'Create Job')}
          </button>
        )}

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Status toggle */}
        {req.status === 'active' && (
          <button onClick={(e) => { e.preventDefault(); onStatusChange(req.id, 'paused'); }}
            title={t('product.hiring.pause', 'Pause')}
            className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors">
            <IconPlayerPause size={14} stroke={2} />
          </button>
        )}
        {req.status === 'paused' && (
          <button onClick={(e) => { e.preventDefault(); onStatusChange(req.id, 'active'); }}
            title={t('product.hiring.activate', 'Activate')}
            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
            <IconPlayerPlay size={14} stroke={2} />
          </button>
        )}

        {/* Delete */}
        <button onClick={(e) => { e.preventDefault(); onDelete(req.id); }}
          title={t('product.hiring.delete', 'Delete')}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
          <IconTrash size={14} stroke={2} />
        </button>
      </div>
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
    <div className="mx-auto max-w-[1460px] space-y-5">
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-2 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
          <IconCircleCheck size={18} stroke={2} />
          {successMessage}
        </div>
      )}

      {/* Header section — matches TalentHub */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900">{t('product.hiring.title', 'Projects')}</h2>
            <Link
              to="/start-hiring"
              state={{ fresh: true }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
            >
              <IconPlus size={15} stroke={2} />
              {t('product.hiring.newProject', 'New Project')}
            </Link>
          </div>

          {user?.role === 'admin' && (
            <div className="min-w-[240px]">
              <RecruiterTeamFilter value={recruiterFilter} onChange={setRecruiterFilter} />
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('product.hiring.searchPlaceholder', 'Search projects...')}
              className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Inline stats strip */}
        <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
          {[
            { label: t('product.hiring.stats.activeProjects', 'Active'), value: stats?.activeRequests ?? 0 },
            { label: t('product.hiring.stats.totalCandidates', 'Candidates'), value: stats?.totalCandidates ?? 0 },
            { label: t('product.hiring.stats.totalMatches', 'AI Matches'), value: stats?.totalMatches ?? 0 },
            { label: t('product.hiring.stats.interviews', 'Interviews'), value: stats?.interviewsCompleted ?? 0 },
            { label: t('product.hiring.stats.avgScore', 'Avg Score'), value: stats?.avgMatchScore ?? '—' },
          ].map((item) => (
            <div key={item.label} className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900">{item.value}</span>
              <span className="text-xs text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Status filter pills + results */}
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
        <span className="text-sm text-slate-500">
          {t('product.hiring.showingResults', 'Showing {{count}} projects', { count: totalCount })}
        </span>
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
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 transition-colors"
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
