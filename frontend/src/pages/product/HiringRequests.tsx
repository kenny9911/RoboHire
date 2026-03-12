import { useState, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';

interface HiringRequest {
  id: string;
  title: string;
  requirements: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: { candidates: number };
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-slate-100 text-slate-700',
};

const STATUSES = ['', 'active', 'paused', 'closed'];
const PAGE_SIZE = 20;

// ── Pagination Component ──
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
        {t('product.hiring.totalRequests', '{{count}} requests', { count: total })}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-colors ${
              p === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Memoized Card Component ──
const HiringRequestCard = memo(function HiringRequestCard({
  req,
  onStatusChange,
  onDelete,
  onCreateJob,
  isCreatingJob,
  t,
}: {
  req: HiringRequest;
  onStatusChange: (id: string, newStatus: string) => void;
  onDelete: (id: string) => void;
  onCreateJob: (id: string) => void;
  isCreatingJob: boolean;
  t: (k: string, f: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 hover:border-blue-200 transition-colors">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/product/hiring/${req.id}`}
              className="text-base font-semibold text-slate-900 hover:text-blue-700 transition-colors"
            >
              {req.title}
            </Link>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[req.status] || STATUS_COLORS.active}`}>
              {req.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 line-clamp-2">{req.requirements?.slice(0, 200)}</p>
          <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
            <span>{new Date(req.createdAt).toLocaleDateString()}</span>
            {req._count && (
              <span>{req._count.candidates} {t('product.hiring.candidates', 'candidates')}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Create Job from request */}
          <button
            onClick={() => onCreateJob(req.id)}
            disabled={isCreatingJob}
            title={isCreatingJob ? t('product.hiring.creatingJob', 'Creating...') : t('product.hiring.createJob', 'Create Job')}
            className={`p-2 rounded-lg transition-colors ${isCreatingJob ? 'text-blue-400 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'}`}
          >
            {isCreatingJob ? (
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* View in dashboard */}
          <Link
            to={`/product/hiring/${req.id}`}
            title={t('product.hiring.viewDetail', 'View Detail')}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </Link>

          {/* Status toggle */}
          {req.status === 'active' && (
            <button
              onClick={() => onStatusChange(req.id, 'paused')}
              title={t('product.hiring.pause', 'Pause')}
              className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
          {req.status === 'paused' && (
            <button
              onClick={() => onStatusChange(req.id, 'active')}
              title={t('product.hiring.activate', 'Activate')}
              className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {/* Delete */}
          <button
            onClick={() => onDelete(req.id)}
            title={t('product.hiring.delete', 'Delete')}
            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

// ── Main Component ──
export default function HiringRequests() {
  const { t } = useTranslation();
  const [requests, setRequests] = usePageState<HiringRequest[]>('hiring.requests', []);
  const [loading, setLoading] = useState(requests.length > 0 ? false : true);
  const [statusFilter, setStatusFilter] = usePageState<string>('hiring.statusFilter', '');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchRequests = useCallback(async (pageNum: number) => {
    try {
      setLoading(true);
      const params: any = { limit: PAGE_SIZE, offset: (pageNum - 1) * PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
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
  }, [statusFilter]);

  useEffect(() => {
    setPage(1);
    fetchRequests(1);
  }, [fetchRequests]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    fetchRequests(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fetchRequests]);

  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    try {
      const res = await axios.patch(`/api/v1/hiring-requests/${id}`, { status: newStatus });
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: res.data.data.status } : r)));
    } catch {
      // handle error
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`/api/v1/hiring-requests/${confirmDeleteId}`);
      setRequests((prev) => prev.filter((r) => r.id !== confirmDeleteId));
    } catch {
      // handle error
    } finally {
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId]);

  const [jobDuplicateModal, setJobDuplicateModal] = useState<{
    requestId: string;
    title: string;
    existingJobId: string;
  } | null>(null);
  const [customJobTitle, setCustomJobTitle] = useState('');
  const [showRenameInput, setShowRenameInput] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [creatingJobId, setCreatingJobId] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const doCreateJob = async (requestId: string, title?: string) => {
    setCreatingJobId(requestId);
    try {
      const res = await axios.post(`/api/v1/jobs/from-request/${requestId}`, title ? { title } : {});
      const jobTitle = res.data?.data?.title || title || '';
      showSuccess(t('product.hiring.jobCreatedSuccess', 'Job "{{title}}" created successfully!', { title: jobTitle }));
    } catch {
      // handle error
    } finally {
      setCreatingJobId(null);
    }
  };

  const doOverwriteJob = async (existingJobId: string, requestId: string) => {
    setCreatingJobId(requestId);
    try {
      const hr = requests.find(r => r.id === requestId);
      if (!hr) return;
      await axios.patch(`/api/v1/jobs/${existingJobId}`, {
        title: hr.title,
        description: '',
        hiringRequestId: hr.id,
      });
      showSuccess(t('product.hiring.jobOverwriteSuccess', 'Job "{{title}}" updated successfully!', { title: hr.title }));
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
    try {
      const checkRes = await axios.get('/api/v1/jobs', { params: { title: hr.title, limit: 1 } });
      if (checkRes.data.data?.length > 0) {
        setCreatingJobId(null);
        setJobDuplicateModal({ requestId, title: hr.title, existingJobId: checkRes.data.data[0].id });
        setCustomJobTitle('');
        setShowRenameInput(false);
        return;
      }
    } catch {
      // If check fails, proceed with creation
    }
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
          <h2 className="text-2xl font-bold text-slate-900">{t('product.hiring.title', 'Hiring Requests')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.hiring.subtitle', 'Manage your hiring requests and convert them into job postings.')}</p>
        </div>
        <Link
          to="/start-hiring"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors self-start sm:self-auto shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('product.hiring.newRequest', 'New Request')}
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s || t('product.hiring.allStatuses', 'All')}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900">{t('product.hiring.empty', 'No hiring requests yet')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('product.hiring.emptyDesc', 'Start a new hiring request with our AI assistant.')}</p>
          <Link
            to="/start-hiring"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('product.hiring.newRequest', 'New Request')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <HiringRequestCard
              key={req.id}
              req={req}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onCreateJob={handleCreateJob}
              isCreatingJob={creatingJobId === req.id}
              t={t}
            />
          ))}
          <Pagination page={page} totalPages={totalPages} total={totalCount} onPageChange={handlePageChange} t={t} />
        </div>
      )}

      {/* Job Duplicate Modal */}
      {jobDuplicateModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{t('product.hiring.duplicateJob.title', 'Duplicate Job Title')}</h3>
            </div>
            <p className="mb-6 text-sm text-gray-600">
              {t('product.hiring.duplicateJob.message', 'A job with the title "{{title}}" already exists. Would you like to overwrite it or create with a different name?', { title: jobDuplicateModal.title })}
            </p>

            {showRenameInput ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('product.hiring.duplicateJob.newTitle', 'New Title')}</label>
                <input
                  type="text"
                  value={customJobTitle}
                  onChange={(e) => setCustomJobTitle(e.target.value)}
                  placeholder={jobDuplicateModal.title}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  autoFocus
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              {showRenameInput ? (
                <button
                  onClick={async () => {
                    const title = customJobTitle.trim();
                    if (!title) return;
                    await doCreateJob(jobDuplicateModal.requestId, title);
                    setJobDuplicateModal(null);
                  }}
                  disabled={!customJobTitle.trim()}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {t('product.hiring.duplicateJob.createNew', 'Create Job')}
                </button>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      await doOverwriteJob(jobDuplicateModal.existingJobId, jobDuplicateModal.requestId);
                      setJobDuplicateModal(null);
                    }}
                    className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                  >
                    {t('product.hiring.duplicateJob.overwrite', 'Overwrite Existing')}
                  </button>
                  <button
                    onClick={() => setShowRenameInput(true)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {t('product.hiring.duplicateJob.rename', 'Use a Different Name')}
                  </button>
                </>
              )}
              <button
                onClick={() => setJobDuplicateModal(null)}
                className="w-full rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {t('product.hiring.duplicateJob.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{t('common.confirmDelete', 'Confirm Delete')}</h3>
            <p className="mt-2 text-sm text-slate-500">{t('common.confirmDeleteMessage', 'Are you sure you want to delete this item? This action cannot be undone.')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                {t('common.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
