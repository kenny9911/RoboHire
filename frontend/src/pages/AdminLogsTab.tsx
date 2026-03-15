import { Fragment, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';

// --- Types ---
interface LLMCallDetail {
  id: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
  createdAt: string;
}

interface RequestLogRecord {
  id: string;
  requestId?: string | null;
  userId?: string | null;
  endpoint: string;
  method: string;
  module: string;
  apiName: string;
  statusCode: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: number;
  cost: number;
  provider?: string | null;
  model?: string | null;
  createdAt: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  user?: { id: string; email: string; name?: string | null } | null;
  llmCallLog: LLMCallDetail[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// --- Helpers ---
async function adminFetch(endpoint: string) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/v1/admin${endpoint}`, { headers, credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function statusBadge(code: number) {
  if (code >= 500) return 'bg-rose-100 text-rose-700';
  if (code >= 400) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function methodBadge(method: string) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-emerald-100 text-emerald-700',
    PUT: 'bg-amber-100 text-amber-700',
    PATCH: 'bg-violet-100 text-violet-700',
    DELETE: 'bg-rose-100 text-rose-700',
  };
  return colors[method] || 'bg-slate-100 text-slate-700';
}

function hasExpandableContent(record: RequestLogRecord): boolean {
  return record.llmCallLog.length > 0 || !!record.requestPayload || !!record.responsePayload;
}

export default function LogsTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<RequestLogRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const [filters, setFilters] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return {
      fromDate: toDateInputValue(from),
      toDate: toDateInputValue(to),
      userId: '',
      module: '',
      endpoint: '',
      statusGroup: '',
    };
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', '50');
        params.set('sort', sort);
        params.set('order', order);
        if (appliedFilters.fromDate) params.set('from', new Date(`${appliedFilters.fromDate}T00:00:00.000Z`).toISOString());
        if (appliedFilters.toDate) params.set('to', new Date(`${appliedFilters.toDate}T23:59:59.999Z`).toISOString());
        if (appliedFilters.userId) params.set('userId', appliedFilters.userId);
        if (appliedFilters.module) params.set('module', appliedFilters.module);
        if (appliedFilters.endpoint) params.set('endpoint', appliedFilters.endpoint);
        if (appliedFilters.statusGroup) params.set('statusGroup', appliedFilters.statusGroup);

        const res = await adminFetch(`/request-logs?${params.toString()}`);
        if (!cancelled) {
          setRecords(res.data);
          setPagination(res.pagination);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load logs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [appliedFilters, page, sort, order]);

  const handleSort = (field: string) => {
    if (sort === field) {
      setOrder(order === 'desc' ? 'asc' : 'desc');
    } else {
      setSort(field);
      setOrder('desc');
    }
    setPage(1);
  };

  const sortIcon = (field: string) => sort === field ? (order === 'desc' ? ' ↓' : ' ↑') : '';

  // Compute summary from current page data
  const totalRequests = pagination.total;
  const currentPageWithLLM = records.filter((r) => r.llmCalls > 0).length;
  const currentPageCost = records.reduce((s, r) => s + r.cost, 0);
  const currentPageErrors = records.filter((r) => r.statusCode >= 400).length;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="landing-gradient-stroke rounded-3xl bg-white/90 p-6 shadow-[0_30px_56px_-42px_rgba(15,23,42,0.7)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="landing-display text-2xl font-semibold text-slate-900">{t('admin.logs.title', 'Request Logs')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin.logs.subtitle', 'Monitor all API requests, diagnose issues, and track performance.')}</p>
          </div>
          <button
            onClick={() => { setAppliedFilters(filters); setPage(1); }}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_36px_-24px_rgba(37,99,235,0.95)] hover:-translate-y-0.5 transition-transform"
          >
            {t('admin.logs.applyFilters', 'Apply Filters')}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-xs font-medium text-slate-500">
            {t('admin.logs.from', 'From')}
            <input type="date" value={filters.fromDate} onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.logs.to', 'To')}
            <input type="date" value={filters.toDate} onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.logs.module', 'Module')}
            <input type="text" value={filters.module} onChange={(e) => setFilters((p) => ({ ...p, module: e.target.value }))} placeholder="e.g. smart_matching"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.logs.endpoint', 'Endpoint')}
            <input type="text" value={filters.endpoint} onChange={(e) => setFilters((p) => ({ ...p, endpoint: e.target.value }))} placeholder="/api/v1/..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.logs.status', 'Status')}
            <select value={filters.statusGroup} onChange={(e) => setFilters((p) => ({ ...p, statusGroup: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none">
              <option value="">{t('admin.logs.allStatuses', 'All')}</option>
              <option value="2xx">2xx Success</option>
              <option value="4xx">4xx Client Error</option>
              <option value="5xx">5xx Server Error</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.logs.user', 'User')}
            <input type="text" value={filters.userId} onChange={(e) => setFilters((p) => ({ ...p, userId: e.target.value }))} placeholder="User ID"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
          {t('admin.logs.loading', 'Loading request logs...')}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">{error}</div>
      ) : (
        <>
          {/* Summary Row */}
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: t('admin.logs.totalRequests', 'Total Requests'), value: totalRequests.toLocaleString(), color: 'text-blue-600' },
              { label: t('admin.logs.withLLM', 'With LLM (this page)'), value: `${currentPageWithLLM} / ${records.length}`, color: 'text-cyan-600' },
              { label: t('admin.logs.pageCost', 'Page Cost'), value: formatCost(currentPageCost), color: 'text-emerald-600' },
              { label: t('admin.logs.pageErrors', 'Page Errors'), value: String(currentPageErrors), color: currentPageErrors > 0 ? 'text-rose-600' : 'text-slate-600' },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className={`mt-1 text-xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Request Log Table */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3 cursor-pointer" onClick={() => handleSort('createdAt')}>{t('admin.logs.time', 'Time')}{sortIcon('createdAt')}</th>
                    <th className="px-4 py-3">{t('admin.logs.user', 'User')}</th>
                    <th className="px-4 py-3">{t('admin.logs.module', 'Module')}</th>
                    <th className="px-4 py-3">{t('admin.logs.apiName', 'API')}</th>
                    <th className="px-4 py-3">{t('admin.logs.method', 'Method')}</th>
                    <th className="px-4 py-3 cursor-pointer" onClick={() => handleSort('statusCode')}>{t('admin.logs.status', 'Status')}{sortIcon('statusCode')}</th>
                    <th className="px-4 py-3 text-right cursor-pointer" onClick={() => handleSort('durationMs')}>{t('admin.logs.duration', 'Duration')}{sortIcon('durationMs')}</th>
                    <th className="px-4 py-3 text-right">{t('admin.logs.llmCalls', 'LLM')}</th>
                    <th className="px-4 py-3 text-right">{t('admin.logs.tokens', 'Tokens')}</th>
                    <th className="px-4 py-3 text-right cursor-pointer" onClick={() => handleSort('cost')}>{t('admin.logs.cost', 'Cost')}{sortIcon('cost')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                        {t('admin.logs.noData', 'No request logs found for the selected filters.')}
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <Fragment key={r.id}>
                        <tr className={`hover:bg-slate-50/60 ${expandedRow === r.id ? 'bg-slate-50' : ''}`}>
                          <td className="px-4 py-2.5">
                            {hasExpandableContent(r) && (
                              <button
                                onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                                className="text-slate-400 hover:text-slate-600 text-xs"
                              >
                                {expandedRow === r.id ? '▼' : '▶'}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                            {new Date(r.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[130px] truncate">
                            {r.user?.email || r.userId || '-'}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              {r.module}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[160px] truncate" title={r.endpoint}>
                            {r.apiName}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${methodBadge(r.method)}`}>
                              {r.method}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.statusCode)}`}>
                              {r.statusCode}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-right text-slate-500">{formatDuration(r.durationMs)}</td>
                          <td className="px-4 py-2.5 text-xs text-right text-slate-600">{r.llmCalls || '-'}</td>
                          <td className="px-4 py-2.5 text-xs text-right text-slate-600">{r.totalTokens > 0 ? r.totalTokens.toLocaleString() : '-'}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-medium text-emerald-600">{r.cost > 0 ? formatCost(r.cost) : '-'}</td>
                        </tr>
                        {expandedRow === r.id && hasExpandableContent(r) && (
                          <tr>
                            <td colSpan={11} className="bg-slate-50/70 px-8 py-3">
                              <div className="space-y-4">
                                {r.llmCallLog.length > 0 && (
                                  <div>
                                    <p className="mb-2 text-xs font-medium text-slate-500">{t('admin.logs.llmCallDetails', 'LLM Call Details')}</p>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-left text-slate-400">
                                          <th className="pb-1 pr-4">{t('admin.logs.provider', 'Provider')}</th>
                                          <th className="pb-1 pr-4">{t('admin.logs.model', 'Model')}</th>
                                          <th className="pb-1 pr-4 text-right">{t('admin.logs.inputTokens', 'Input')}</th>
                                          <th className="pb-1 pr-4 text-right">{t('admin.logs.outputTokens', 'Output')}</th>
                                          <th className="pb-1 pr-4 text-right">{t('admin.logs.cost', 'Cost')}</th>
                                          <th className="pb-1 text-right">{t('admin.logs.duration', 'Duration')}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200/60">
                                        {r.llmCallLog.map((call) => (
                                          <tr key={call.id}>
                                            <td className="py-1 pr-4 text-slate-600">{call.provider}</td>
                                            <td className="py-1 pr-4 text-slate-600">{call.model}</td>
                                            <td className="py-1 pr-4 text-right text-slate-600">{call.promptTokens.toLocaleString()}</td>
                                            <td className="py-1 pr-4 text-right text-slate-600">{call.completionTokens.toLocaleString()}</td>
                                            <td className="py-1 pr-4 text-right font-medium text-emerald-600">{formatCost(call.cost)}</td>
                                            <td className="py-1 text-right text-slate-500">{formatDuration(call.durationMs)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {r.requestPayload && (
                                  <div>
                                    <p className="mb-2 text-xs font-medium text-slate-500">{t('admin.logs.requestPayload', 'Request Payload')}</p>
                                    <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
                                      {JSON.stringify(r.requestPayload, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                {r.responsePayload && (
                                  <div>
                                    <p className="mb-2 text-xs font-medium text-slate-500">{t('admin.logs.responsePayload', 'Response Payload')}</p>
                                    <pre className="max-h-[320px] overflow-auto rounded-2xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">
                                      {JSON.stringify(r.responsePayload, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  {t('admin.logs.showing', 'Showing')} {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} {t('admin.logs.of', 'of')} {pagination.total.toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {t('admin.logs.prev', 'Prev')}
                  </button>
                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage(page + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {t('admin.logs.next', 'Next')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
