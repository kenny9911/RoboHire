import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';

// --- Types ---
interface LLMCallRecord {
  id: string;
  requestId?: string | null;
  userId?: string | null;
  endpoint: string;
  module: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
  createdAt: string;
  user?: { id: string; email: string; name?: string | null } | null;
}

interface LLMCallSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  totalDurationMs: number;
  avgCostPerCall: number;
  avgDurationMs: number;
}

interface SummaryGroup {
  key: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgCost?: number;
  avgDurationMs?: number;
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function StableChartContainer({ className, children }: { className: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setIsReady(rect.width > 0 && rect.height > 0);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={containerRef} className={className}>
      {isReady ? children : null}
    </div>
  );
}

const COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#6366f1'];

export default function LLMUsageTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<LLMCallRecord[]>([]);
  const [summary, setSummary] = useState<LLMCallSummary | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });

  const [byModel, setByModel] = useState<SummaryGroup[]>([]);
  const [byProvider, setByProvider] = useState<SummaryGroup[]>([]);
  const [byDay, setByDay] = useState<SummaryGroup[]>([]);

  const [filters, setFilters] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
      fromDate: toDateInputValue(from),
      toDate: toDateInputValue(to),
      provider: '',
      model: '',
      module: '',
      userId: '',
    };
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  // Load data
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
        if (appliedFilters.provider) params.set('provider', appliedFilters.provider);
        if (appliedFilters.model) params.set('model', appliedFilters.model);
        if (appliedFilters.module) params.set('module', appliedFilters.module);
        if (appliedFilters.userId) params.set('userId', appliedFilters.userId);

        const summaryParams = new URLSearchParams();
        if (appliedFilters.fromDate) summaryParams.set('from', new Date(`${appliedFilters.fromDate}T00:00:00.000Z`).toISOString());
        if (appliedFilters.toDate) summaryParams.set('to', new Date(`${appliedFilters.toDate}T23:59:59.999Z`).toISOString());

        const [callsRes, modelRes, providerRes, dayRes] = await Promise.all([
          adminFetch(`/llm-calls?${params.toString()}`),
          adminFetch(`/llm-calls/summary?${summaryParams.toString()}&groupBy=model`),
          adminFetch(`/llm-calls/summary?${summaryParams.toString()}&groupBy=provider`),
          adminFetch(`/llm-calls/summary?${summaryParams.toString()}&groupBy=day`),
        ]);

        if (!cancelled) {
          setRecords(callsRes.data);
          setSummary(callsRes.summary);
          setPagination(callsRes.pagination);
          setByModel(modelRes.data || []);
          setByProvider(providerRes.data || []);
          setByDay(dayRes.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load LLM usage');
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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="landing-gradient-stroke rounded-3xl bg-white/90 p-6 shadow-[0_30px_56px_-42px_rgba(15,23,42,0.7)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="landing-display text-2xl font-semibold text-slate-900">{t('admin.llmUsage.title', 'LLM Usage')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin.llmUsage.subtitle', 'Detailed view of all LLM API calls, costs, and token usage.')}</p>
          </div>
          <button
            onClick={() => { setAppliedFilters(filters); setPage(1); }}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_36px_-24px_rgba(37,99,235,0.95)] hover:-translate-y-0.5 transition-transform"
          >
            {t('admin.llmUsage.applyFilters', 'Apply Filters')}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-xs font-medium text-slate-500">
            {t('admin.llmUsage.from', 'From')}
            <input type="date" value={filters.fromDate} onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.llmUsage.to', 'To')}
            <input type="date" value={filters.toDate} onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.llmUsage.provider', 'Provider')}
            <input type="text" value={filters.provider} onChange={(e) => setFilters((p) => ({ ...p, provider: e.target.value }))} placeholder="e.g. openai"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.llmUsage.model', 'Model')}
            <input type="text" value={filters.model} onChange={(e) => setFilters((p) => ({ ...p, model: e.target.value }))} placeholder="e.g. gpt-4o"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.llmUsage.module', 'Module')}
            <input type="text" value={filters.module} onChange={(e) => setFilters((p) => ({ ...p, module: e.target.value }))} placeholder="e.g. smart_matching"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {t('admin.llmUsage.user', 'User')}
            <input type="text" value={filters.userId} onChange={(e) => setFilters((p) => ({ ...p, userId: e.target.value }))} placeholder="User ID"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none" />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
          {t('admin.llmUsage.loading', 'Loading LLM usage data...')}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">{error}</div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: t('admin.llmUsage.totalCalls', 'Total LLM Calls'), value: summary.totalCalls.toLocaleString(), color: 'text-blue-600' },
                { label: t('admin.llmUsage.totalTokens', 'Total Tokens'), value: formatTokens(summary.totalTokens), sub: `${formatTokens(summary.totalPromptTokens)} in / ${formatTokens(summary.totalCompletionTokens)} out`, color: 'text-cyan-600' },
                { label: t('admin.llmUsage.totalCost', 'Total Cost'), value: formatCost(summary.totalCost), color: 'text-emerald-600' },
                { label: t('admin.llmUsage.avgCostPerCall', 'Avg Cost/Call'), value: formatCost(summary.avgCostPerCall), color: 'text-amber-600' },
                { label: t('admin.llmUsage.avgLatency', 'Avg Latency'), value: formatDuration(summary.avgDurationMs), color: 'text-violet-600' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">{card.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</p>
                  {'sub' in card && card.sub && <p className="mt-0.5 text-xs text-slate-400">{card.sub}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Cost Trend */}
            {byDay.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('admin.llmUsage.costTrend', 'Cost Trend')}</h3>
                <StableChartContainer className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={byDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`$${Number(v ?? 0).toFixed(4)}`, 'Cost']} />
                      <Area type="monotone" dataKey="cost" fill="#3b82f6" fillOpacity={0.15} stroke="#3b82f6" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </StableChartContainer>
              </div>
            )}

            {/* Token Usage Trend */}
            {byDay.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('admin.llmUsage.tokenTrend', 'Token Usage Trend')}</h3>
                <StableChartContainer className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => formatTokens(v)} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [formatTokens(Number(v ?? 0))]} />
                      <Bar dataKey="promptTokens" stackId="tokens" fill="#3b82f6" name={t('admin.llmUsage.inputTokens', 'Input')} />
                      <Bar dataKey="completionTokens" stackId="tokens" fill="#06b6d4" name={t('admin.llmUsage.outputTokens', 'Output')} />
                    </BarChart>
                  </ResponsiveContainer>
                </StableChartContainer>
              </div>
            )}

            {/* Cost by Model */}
            {byModel.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('admin.llmUsage.costByModel', 'Cost by Model')}</h3>
                <StableChartContainer className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byModel.slice(0, 8)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={(v: number) => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="key" type="category" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [`$${Number(v ?? 0).toFixed(4)}`, 'Cost']} />
                      <Bar dataKey="cost" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </StableChartContainer>
              </div>
            )}

            {/* Cost by Provider */}
            {byProvider.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('admin.llmUsage.costByProvider', 'Cost by Provider')}</h3>
                <StableChartContainer className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byProvider} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={(v: number) => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="key" type="category" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`$${Number(v ?? 0).toFixed(4)}`, 'Cost']} />
                      <Bar dataKey="cost" fill="#06b6d4">
                        {byProvider.map((_entry, i) => (
                          <rect key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </StableChartContainer>
              </div>
            )}
          </div>

          {/* Detail Table */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">{t('admin.llmUsage.callLog', 'LLM Call Log')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-3 cursor-pointer" onClick={() => handleSort('createdAt')}>{t('admin.llmUsage.time', 'Time')}{sortIcon('createdAt')}</th>
                    <th className="px-4 py-3">{t('admin.llmUsage.user', 'User')}</th>
                    <th className="px-4 py-3">{t('admin.llmUsage.module', 'Module')}</th>
                    <th className="px-4 py-3">{t('admin.llmUsage.provider', 'Provider')}</th>
                    <th className="px-4 py-3">{t('admin.llmUsage.model', 'Model')}</th>
                    <th className="px-4 py-3 text-right cursor-pointer" onClick={() => handleSort('promptTokens')}>{t('admin.llmUsage.inputTokens', 'Input')}{sortIcon('promptTokens')}</th>
                    <th className="px-4 py-3 text-right cursor-pointer" onClick={() => handleSort('completionTokens')}>{t('admin.llmUsage.outputTokens', 'Output')}{sortIcon('completionTokens')}</th>
                    <th className="px-4 py-3 text-right cursor-pointer" onClick={() => handleSort('cost')}>{t('admin.llmUsage.cost', 'Cost')}{sortIcon('cost')}</th>
                    <th className="px-4 py-3 text-right cursor-pointer" onClick={() => handleSort('durationMs')}>{t('admin.llmUsage.duration', 'Duration')}{sortIcon('durationMs')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                        {t('admin.llmUsage.noData', 'No LLM calls found for the selected filters.')}
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[140px] truncate">
                          {r.user?.email || r.userId || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {r.module}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{r.provider}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[120px] truncate">{r.model}</td>
                        <td className="px-4 py-2.5 text-xs text-right text-slate-600">{r.promptTokens.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-xs text-right text-slate-600">{r.completionTokens.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-xs text-right font-medium text-emerald-600">{formatCost(r.cost)}</td>
                        <td className="px-4 py-2.5 text-xs text-right text-slate-500">{formatDuration(r.durationMs)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  {t('admin.llmUsage.showing', 'Showing')} {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} {t('admin.llmUsage.of', 'of')} {pagination.total.toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {t('admin.llmUsage.prev', 'Prev')}
                  </button>
                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage(page + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {t('admin.llmUsage.next', 'Next')}
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
