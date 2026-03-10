import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';

interface HiringRequest {
  id: string;
  title: string;
  requirements: string;
  jobDescription?: string;
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

export default function HiringRequests() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<HiringRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = { include_counts: true };
      if (statusFilter) params.status = statusFilter;
      const res = await axios.get('/api/v1/hiring-requests', { params });
      setRequests(res.data.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await axios.patch(`/api/v1/hiring-requests/${id}`, { status: newStatus });
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: res.data.data.status } : r)));
    } catch {
      // handle error
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/v1/hiring-requests/${id}`);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // handle error
    }
  };

  const handleCreateJob = async (requestId: string) => {
    try {
      await axios.post(`/api/v1/jobs/from-request/${requestId}`);
    } catch {
      // handle error
    }
  };

  const statuses = ['', 'active', 'paused', 'closed'];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.hiring.title', 'Hiring Requests')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.hiring.subtitle', 'Manage your hiring requests and convert them into job postings.')}</p>
        </div>
        <Link
          to="/start-hiring"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('product.hiring.newRequest', 'New Request')}
        </Link>
      </div>

      {/* Status filter */}
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
            <div
              key={req.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/dashboard/requests/${req.id}`}
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
                    onClick={() => handleCreateJob(req.id)}
                    title={t('product.hiring.createJob', 'Create Job')}
                    className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </button>

                  {/* View in dashboard */}
                  <Link
                    to={`/dashboard/requests/${req.id}`}
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
                      onClick={() => handleStatusChange(req.id, 'paused')}
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
                      onClick={() => handleStatusChange(req.id, 'active')}
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
                    onClick={() => handleDelete(req.id)}
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
          ))}
        </div>
      )}
    </div>
  );
}
