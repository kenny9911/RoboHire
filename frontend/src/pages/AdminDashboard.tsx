import { useState, useCallback, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import SEO from '../components/SEO';
import LLMUsageTab from './AdminLLMUsageTab';
import LogsTab from './AdminLogsTab';
import ActivityTab from './AdminActivityTab';
import { formatUsageLimit, getPlanInterviewLimit, getPlanMatchLimit } from '../utils/usageLimits';

// --- Types ---
interface UserSummary {
  id: string;
  email: string;
  name?: string | null;
  company?: string | null;
  role: string;
  provider?: string | null;
  createdAt: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  interviewsUsed: number;
  resumeMatchesUsed: number;
  topUpBalance: number;
  currentPeriodEnd?: string | null;
  trialEnd?: string | null;
  customMaxInterviews?: number | null;
  customMaxMatches?: number | null;
  planMaxInterviews?: number | null;
  planMaxMatches?: number | null;
  effectiveMaxInterviews?: number | null;
  effectiveMaxMatches?: number | null;
}

interface AdjustmentRecord {
  id: string;
  type: string;
  amount?: number | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason: string;
  createdAt: string;
  admin: { id: string; email: string; name?: string | null };
}

interface SystemStats {
  totalUsers: number;
  usersByTier?: Record<string, number>;
  byTier?: Record<string, number>;
  activeSubscriptions: number;
  totalRevenue: number;
  newUsersThisMonth: number;
  totalInterviewsUsed?: number;
  totalMatchesUsed?: number;
  totalInterviews?: number;
  totalMatches?: number;
}

type AnalyticsBucket = 'hour' | 'day' | 'week';

interface UsageTimeRow {
  date?: string;
  period?: string;
  calls: number;
  llmCalls: number;
  totalTokens: number;
  cost: number;
  avgLatencyMs: number;
  errorRate: number;
}

interface UsageTopRow {
  module?: string;
  apiName?: string;
  endpoint?: string;
  method?: string;
  email?: string;
  userId?: string | null;
  calls: number;
  llmCalls: number;
  totalTokens: number;
  cost: number;
  avgLatencyMs: number;
}

interface UsageAnalytics {
  filters: {
    from: string;
    to: string;
    bucket: AnalyticsBucket;
    userId: string | null;
    module: string | null;
    endpoint: string | null;
  };
  totals: {
    calls: number;
    uniqueUsers: number;
    llmCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    totalLatencyMs: number;
    avgLatencyMs: number;
    errorCount: number;
    errorRate: number;
    interviewCalls: number;
    resumeMatchCalls: number;
  };
  workflow: {
    interview: {
      calls: number;
      totalTokens: number;
      cost: number;
      avgLatencyMs: number;
      errorRate: number;
    };
    resumeMatch: {
      calls: number;
      totalTokens: number;
      cost: number;
      avgLatencyMs: number;
      errorRate: number;
    };
  };
  byDay: UsageTimeRow[];
  byPeriod: UsageTimeRow[];
  byUser: UsageTopRow[];
  byModule: UsageTopRow[];
  byApi: UsageTopRow[];
  byInterview: UsageTopRow[];
  byResumeMatch: UsageTopRow[];
  byProvider: Array<{ provider: string; calls: number; llmCalls: number; totalTokens: number; cost: number }>;
  byModel: Array<{ model: string; calls: number; llmCalls: number; totalTokens: number; cost: number }>;
}

// --- Helpers ---
async function adminFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1/admin${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function authFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/auth${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const TABS = ['Overview', 'Analytics', 'LLM Usage', 'Logs', 'Users', 'Activity', 'Pricing', 'Interview', 'Settings'] as const;
type Tab = (typeof TABS)[number];

// --- Badge helpers ---
function tierBadge(tier: string) {
  const colors: Record<string, string> = {
    free: 'bg-gray-100 text-gray-700',
    starter: 'bg-blue-100 text-blue-700',
    growth: 'bg-emerald-100 text-emerald-700',
    business: 'bg-purple-100 text-purple-700',
    custom: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[tier] || colors.free}`}>
      {tier}
    </span>
  );
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trialing: 'bg-blue-100 text-blue-700',
    past_due: 'bg-red-100 text-red-700',
    canceled: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.active}`}>
      {status}
    </span>
  );
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatMoney(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function StableChartContainer({ className, children }: { className: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateReadyState = () => {
      const rect = node.getBoundingClientRect();
      const next = rect.width > 0 && rect.height > 0;
      setIsReady((prev) => (prev === next ? prev : next));
    };

    updateReadyState();

    const observer = new ResizeObserver(updateReadyState);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {isReady ? children : null}
    </div>
  );
}

// ========== TAB COMPONENTS ==========

function OverviewTab() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/stats')
      .then((data) => setStats(data.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-500 p-6">Loading stats...</p>;
  if (error) return <p className="text-sm text-red-600 p-6">{error}</p>;
  if (!stats) return null;

  const usersByTier = stats.usersByTier || stats.byTier || {};
  const interviewsUsed = stats.totalInterviewsUsed ?? stats.totalInterviews ?? 0;
  const matchesUsed = stats.totalMatchesUsed ?? stats.totalMatches ?? 0;

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, color: 'bg-indigo-50 text-indigo-700' },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions, color: 'bg-green-50 text-green-700' },
    { label: 'New This Month', value: stats.newUsersThisMonth, color: 'bg-blue-50 text-blue-700' },
    { label: 'Total Revenue', value: `$${stats.totalRevenue.toFixed(2)}`, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Interviews Used', value: interviewsUsed, color: 'bg-purple-50 text-purple-700' },
    { label: 'Matches Used', value: matchesUsed, color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl p-5 ${c.color}`}>
            <p className="text-xs font-medium opacity-70 mb-1">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Users by tier */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Users by Plan</h3>
        <div className="space-y-2">
          {Object.entries(usersByTier).map(([tier, count]) => (
            <div key={tier} className="flex items-center gap-3">
              <div className="w-20">{tierBadge(tier)}</div>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-400 rounded-full transition-all"
                  style={{ width: `${stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 w-10 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsageAnalyticsTab() {
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState<{
    fromDate: string;
    toDate: string;
    bucket: AnalyticsBucket;
    userId: string;
    module: string;
    endpoint: string;
  }>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
      fromDate: toDateInputValue(from),
      toDate: toDateInputValue(to),
      bucket: 'day',
      userId: '',
      module: '',
      endpoint: '',
    };
  });

  const [appliedFilters, setAppliedFilters] = useState(filters);

  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        params.set('bucket', appliedFilters.bucket);
        if (appliedFilters.fromDate) {
          params.set('from', new Date(`${appliedFilters.fromDate}T00:00:00.000Z`).toISOString());
        }
        if (appliedFilters.toDate) {
          params.set('to', new Date(`${appliedFilters.toDate}T23:59:59.999Z`).toISOString());
        }
        if (appliedFilters.userId) params.set('userId', appliedFilters.userId);
        if (appliedFilters.module.trim()) params.set('module', appliedFilters.module.trim());
        if (appliedFilters.endpoint.trim()) params.set('endpoint', appliedFilters.endpoint.trim());

        const data = await adminFetch(`/usage/analytics?${params.toString()}`);
        if (!cancelled) {
          setAnalytics(data.data as UsageAnalytics);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load usage analytics');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [
    appliedFilters.bucket,
    appliedFilters.endpoint,
    appliedFilters.fromDate,
    appliedFilters.module,
    appliedFilters.toDate,
    appliedFilters.userId,
  ]);

  const moduleOptions = analytics?.byModule.map((row) => row.module || '').filter(Boolean) || [];
  const userOptions =
    analytics?.byUser.filter((row) => Boolean(row.userId)).slice(0, 200).map((row) => ({
      id: row.userId as string,
      label: row.email || row.userId || 'Unknown user',
    })) || [];
  const chartRows = (analytics?.byPeriod || []).map((row) => ({
    label: row.period || row.date || '',
    calls: row.calls,
    llmCalls: row.llmCalls,
    totalTokens: row.totalTokens,
    cost: row.cost,
  }));
  const topApis = (analytics?.byApi || []).slice(0, 8);
  const topUsers = (analytics?.byUser || []).slice(0, 8);
  const topModules = (analytics?.byModule || []).slice(0, 8);
  const topProviders = (analytics?.byProvider || []).slice(0, 8);
  const topModels = (analytics?.byModel || []).slice(0, 8);
  const topInterviewApis = (analytics?.byInterview || []).slice(0, 6);
  const topResumeMatchApis = (analytics?.byResumeMatch || []).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="landing-gradient-stroke rounded-3xl bg-white/90 p-6 shadow-[0_30px_56px_-42px_rgba(15,23,42,0.7)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="landing-display text-2xl font-semibold text-slate-900">Usage Analytics</h2>
            <p className="mt-1 text-sm text-slate-500">
              Unified logs for API calls, tokens, model/provider usage, latency, and cost.
            </p>
          </div>
          <button
            onClick={() => setAppliedFilters(filters)}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_36px_-24px_rgba(37,99,235,0.95)] hover:-translate-y-0.5 transition-transform"
          >
            Apply Filters
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-xs font-medium text-slate-500">
            From
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            Bucket
            <select
              value={filters.bucket}
              onChange={(e) => setFilters((prev) => ({ ...prev, bucket: e.target.value as AnalyticsBucket }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-500">
            Module
            <input
              list="admin-analytics-modules"
              value={filters.module}
              onChange={(e) => setFilters((prev) => ({ ...prev, module: e.target.value }))}
              placeholder="e.g. resume_match"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
            />
            <datalist id="admin-analytics-modules">
              {moduleOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>

          <label className="text-xs font-medium text-slate-500">
            User
            <select
              value={filters.userId}
              onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="">All users</option>
              {userOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-500">
            Endpoint Search
            <input
              type="text"
              value={filters.endpoint}
              onChange={(e) => setFilters((prev) => ({ ...prev, endpoint: e.target.value }))}
              placeholder="/api/v1/..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
          Loading usage analytics...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">{error}</div>
      ) : !analytics ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No analytics data available.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="API Calls" value={String(analytics.totals.calls)} />
            <StatCard label="LLM Calls" value={String(analytics.totals.llmCalls)} />
            <StatCard label="Total Tokens" value={formatTokens(analytics.totals.totalTokens)} />
            <StatCard label="LLM Cost" value={formatMoney(analytics.totals.cost)} />
            <StatCard label="Unique Users" value={String(analytics.totals.uniqueUsers)} />
            <StatCard label="Avg Latency" value={`${analytics.totals.avgLatencyMs} ms`} />
            <StatCard label="Error Rate" value={formatPercent(analytics.totals.errorRate)} />
            <StatCard label="Interview / Match" value={`${analytics.totals.interviewCalls} / ${analytics.totals.resumeMatchCalls}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <WorkflowCard
              title="Interview Workflows"
              calls={analytics.workflow.interview.calls}
              tokens={analytics.workflow.interview.totalTokens}
              cost={analytics.workflow.interview.cost}
              latency={analytics.workflow.interview.avgLatencyMs}
              errorRate={analytics.workflow.interview.errorRate}
            />
            <WorkflowCard
              title="Resume Match Workflows"
              calls={analytics.workflow.resumeMatch.calls}
              tokens={analytics.workflow.resumeMatch.totalTokens}
              cost={analytics.workflow.resumeMatch.cost}
              latency={analytics.workflow.resumeMatch.avgLatencyMs}
              errorRate={analytics.workflow.resumeMatch.errorRate}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
              <p className="text-sm font-semibold text-slate-700">Calls and LLM Calls by Period</p>
              <StableChartContainer className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <AreaChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Area yAxisId="left" type="monotone" dataKey="calls" name="API Calls" stroke="#2563eb" fill="#bfdbfe" />
                    <Area yAxisId="right" type="monotone" dataKey="llmCalls" name="LLM Calls" stroke="#0ea5e9" fill="#bae6fd" />
                  </AreaChart>
                </ResponsiveContainer>
              </StableChartContainer>
            </div>

            <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
              <p className="text-sm font-semibold text-slate-700">Tokens and Cost by Period</p>
              <StableChartContainer className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === 'Cost (USD)') return formatMoney(Number(value));
                        return formatTokens(Number(value));
                      }}
                    />
                    <Bar yAxisId="left" dataKey="totalTokens" name="Tokens" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    <Bar yAxisId="right" dataKey="cost" name="Cost (USD)" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </StableChartContainer>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SimpleTable
              title="Top Modules"
              columns={['Module', 'Calls', 'Tokens', 'Cost']}
              rows={topModules.map((row) => [
                row.module || '-',
                String(row.calls),
                formatTokens(row.totalTokens),
                formatMoney(row.cost),
              ])}
            />
            <SimpleTable
              title="Top APIs"
              columns={['API', 'Method', 'Calls', 'Cost']}
              rows={topApis.map((row) => [
                row.apiName || row.endpoint || '-',
                row.method || '-',
                String(row.calls),
                formatMoney(row.cost),
              ])}
            />
            <SimpleTable
              title="Top Users"
              columns={['User', 'Calls', 'Tokens', 'Avg Latency']}
              rows={topUsers.map((row) => [
                row.email || row.userId || 'Anonymous',
                String(row.calls),
                formatTokens(row.totalTokens),
                `${row.avgLatencyMs} ms`,
              ])}
            />
            <SimpleTable
              title="Providers / Models"
              columns={['Type', 'Name', 'LLM Calls', 'Cost']}
              rows={[
                ...topProviders.map((row) => ['Provider', row.provider, String(row.llmCalls), formatMoney(row.cost)]),
                ...topModels.map((row) => ['Model', row.model, String(row.llmCalls), formatMoney(row.cost)]),
              ]}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SimpleTable
              title="Interview APIs"
              columns={['API', 'Method', 'Calls', 'Cost']}
              rows={topInterviewApis.map((row) => [
                row.apiName || row.endpoint || '-',
                row.method || '-',
                String(row.calls),
                formatMoney(row.cost),
              ])}
            />
            <SimpleTable
              title="Resume Match APIs"
              columns={['API', 'Method', 'Calls', 'Cost']}
              rows={topResumeMatchApis.map((row) => [
                row.apiName || row.endpoint || '-',
                row.method || '-',
                String(row.calls),
                formatMoney(row.cost),
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="landing-gradient-stroke rounded-2xl bg-white p-4 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.6)]">
      <p className="text-xs font-medium uppercase tracking-[0.11em] text-slate-500">{label}</p>
      <p className="landing-display mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function WorkflowCard({
  title,
  calls,
  tokens,
  cost,
  latency,
  errorRate,
}: {
  title: string;
  calls: number;
  tokens: number;
  cost: number;
  latency: number;
  errorRate: number;
}) {
  return (
    <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricLine label="Calls" value={String(calls)} />
        <MetricLine label="Tokens" value={formatTokens(tokens)} />
        <MetricLine label="Cost" value={formatMoney(cost)} />
        <MetricLine label="Latency" value={`${latency} ms`} />
      </div>
      <p className="mt-4 text-xs text-slate-500">Error rate: {formatPercent(errorRate)}</p>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.09em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function SimpleTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              {columns.map((column) => (
                <th key={column} className="pb-2 pr-4 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row, idx) => (
                <tr key={`${title}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                  {row.map((value, cellIdx) => (
                    <td key={`${title}-${idx}-${cellIdx}`} className="py-2 pr-4 text-slate-700">
                      {value}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-slate-400">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersTab() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Action form state
  const [actionType, setActionType] = useState<'balance' | 'usage' | 'subscription' | 'set_limits' | 'reset' | 'cancel_sub' | 'disable' | 'enable' | 'set_role' | ''>('');
  const [actionMaxInterviews, setActionMaxInterviews] = useState('');
  const [actionMaxMatches, setActionMaxMatches] = useState('');
  const [actionAmount, setActionAmount] = useState('');
  const [actionUsageType, setActionUsageType] = useState<'interview' | 'match'>('interview');
  const [actionTier, setActionTier] = useState('starter');
  const [actionStatus, setActionStatus] = useState('active');
  const [actionRole, setActionRole] = useState('user');
  const [actionImmediate, setActionImmediate] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const searchUsers = useCallback(async (searchTerm: string, pageNum: number) => {
    setIsSearching(true);
    setSearchError('');
    try {
      const data = await adminFetch(`/users?search=${encodeURIComponent(searchTerm)}&page=${pageNum}&limit=20`);
      setUsers(data.data.users);
      setTotalUsers(data.data.pagination.total);
      setPage(pageNum);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const loadUserDetail = async (userId: string) => {
    setIsLoadingDetail(true);
    try {
      const data = await adminFetch(`/users/${userId}`);
      setSelectedUser(data.data.user);
      setAdjustments(data.data.adjustments);
      setActionType('');
      setActionMessage('');
      setActionError('');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleAction = async () => {
    if (!selectedUser || !actionType || !actionReason.trim()) return;
    setIsSubmitting(true);
    setActionMessage('');
    setActionError('');

    try {
      let data;
      if (actionType === 'balance') {
        const amount = parseFloat(actionAmount);
        if (isNaN(amount) || amount === 0) throw new Error('Enter a non-zero amount');
        data = await adminFetch(`/users/${selectedUser.id}/adjust-balance`, {
          method: 'POST',
          body: JSON.stringify({ amount, reason: actionReason.trim() }),
        });
        setActionMessage(`Balance adjusted: $${data.data.oldBalance.toFixed(2)} → $${data.data.newBalance.toFixed(2)}`);
      } else if (actionType === 'usage') {
        const amount = parseInt(actionAmount);
        if (isNaN(amount) || amount === 0) throw new Error('Enter a non-zero amount');
        data = await adminFetch(`/users/${selectedUser.id}/adjust-usage`, {
          method: 'POST',
          body: JSON.stringify({ action: actionUsageType, amount, reason: actionReason.trim() }),
        });
        setActionMessage(`${actionUsageType} usage: ${data.data.oldValue} → ${data.data.newValue}`);
      } else if (actionType === 'subscription') {
        data = await adminFetch(`/users/${selectedUser.id}/set-subscription`, {
          method: 'POST',
          body: JSON.stringify({ tier: actionTier, status: actionStatus, reason: actionReason.trim() }),
        });
        setActionMessage(`Subscription: ${data.data.oldTier}/${data.data.oldStatus} → ${data.data.newTier}/${data.data.newStatus}`);
      } else if (actionType === 'set_limits') {
        const body: Record<string, unknown> = { reason: actionReason.trim() };
        if (actionMaxInterviews === 'clear') {
          body.maxInterviews = null;
        } else if (actionMaxInterviews !== '') {
          const v = parseInt(actionMaxInterviews);
          if (isNaN(v) || v < 0) throw new Error('Max interviews must be a non-negative integer');
          body.maxInterviews = v;
        }
        if (actionMaxMatches === 'clear') {
          body.maxMatches = null;
        } else if (actionMaxMatches !== '') {
          const v = parseInt(actionMaxMatches);
          if (isNaN(v) || v < 0) throw new Error('Max matches must be a non-negative integer');
          body.maxMatches = v;
        }
        if (body.maxInterviews === undefined && body.maxMatches === undefined) {
          throw new Error('Enter at least one limit value or clear an existing override');
        }
        data = await adminFetch(`/users/${selectedUser.id}/set-limits`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const fmt = (v: number | null) => v == null ? 'plan default' : String(v);
        setActionMessage(`Limits updated: interviews ${fmt(data.data.old.maxInterviews)}→${fmt(data.data.new.maxInterviews)}, matches ${fmt(data.data.old.maxMatches)}→${fmt(data.data.new.maxMatches)}`);
      } else if (actionType === 'reset') {
        data = await adminFetch(`/users/${selectedUser.id}/reset-usage`, {
          method: 'POST',
          body: JSON.stringify({ reason: actionReason.trim() }),
        });
        setActionMessage(`Usage reset: interviews ${data.data.oldInterviews}→0, matches ${data.data.oldMatches}→0`);
      } else if (actionType === 'cancel_sub') {
        data = await adminFetch(`/users/${selectedUser.id}/cancel-subscription`, {
          method: 'POST',
          body: JSON.stringify({ reason: actionReason.trim(), immediate: actionImmediate }),
        });
        setActionMessage(data.data?.message || 'Subscription cancelled');
      } else if (actionType === 'disable') {
        data = await adminFetch(`/users/${selectedUser.id}/disable`, {
          method: 'POST',
          body: JSON.stringify({ reason: actionReason.trim() }),
        });
        setActionMessage('User disabled');
      } else if (actionType === 'enable') {
        data = await adminFetch(`/users/${selectedUser.id}/enable`, {
          method: 'POST',
          body: JSON.stringify({ reason: actionReason.trim() }),
        });
        setActionMessage('User enabled');
      } else if (actionType === 'set_role') {
        data = await adminFetch(`/users/${selectedUser.id}/set-role`, {
          method: 'POST',
          body: JSON.stringify({ role: actionRole, reason: actionReason.trim() }),
        });
        setActionMessage(`Role changed to ${actionRole}`);
      }

      await loadUserDetail(selectedUser.id);
      setActionAmount('');
      setActionMaxInterviews('');
      setActionMaxMatches('');
      setActionReason('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">User Management</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search by email, name, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchUsers(search, 1)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            onClick={() => searchUsers(search, 1)}
            disabled={isSearching}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchError && <p className="mt-2 text-sm text-red-600">{searchError}</p>}

        {/* User list */}
        {users.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Balance</th>
                  <th className="pb-2 font-medium">Interviews</th>
                  <th className="pb-2 font-medium">Matches</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  return (
                    <tr
                      key={u.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                        selectedUser?.id === u.id ? 'bg-indigo-50' : ''
                      }`}
                      onClick={() => loadUserDetail(u.id)}
                    >
                      <td className="py-2.5 text-gray-900">{u.email}</td>
                      <td className="py-2.5 text-gray-600">{u.name || '-'}</td>
                      <td className="py-2.5">
                        {u.role === 'admin' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">admin</span>
                        ) : (
                          <span className="text-gray-400 text-xs">user</span>
                        )}
                      </td>
                      <td className="py-2.5">{tierBadge(u.subscriptionTier)}</td>
                      <td className="py-2.5">{statusBadge(u.subscriptionStatus)}</td>
                      <td className="py-2.5 text-gray-900 font-mono">${u.topUpBalance.toFixed(2)}</td>
                      <td className="py-2.5 text-gray-600">
                        {u.interviewsUsed}/
                        {u.customMaxInterviews != null
                          ? <span className="text-amber-600 font-medium" title="Custom override">{u.customMaxInterviews}</span>
                          : formatUsageLimit(u.effectiveMaxInterviews)}
                      </td>
                      <td className="py-2.5 text-gray-600">
                        {u.resumeMatchesUsed}/
                        {u.customMaxMatches != null
                          ? <span className="text-amber-600 font-medium" title="Custom override">{u.customMaxMatches}</span>
                          : formatUsageLimit(u.effectiveMaxMatches)}
                      </td>
                      <td className="py-2.5">
                        <button className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
              <span>{totalUsers} user{totalUsers !== 1 ? 's' : ''} found</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => searchUsers(search, page - 1)}
                  className="px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  Prev
                </button>
                <span className="px-2 py-1 text-xs">Page {page}</span>
                <button
                  disabled={page * 20 >= totalUsers}
                  onClick={() => searchUsers(search, page + 1)}
                  className="px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Detail + Actions */}
      {selectedUser && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoadingDetail ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedUser.name || selectedUser.email}
                  </h3>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {tierBadge(selectedUser.subscriptionTier)}
                  {statusBadge(selectedUser.subscriptionStatus)}
                  {selectedUser.role === 'admin' && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">admin</span>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Balance</p>
                  <p className="text-lg font-semibold text-gray-900 font-mono">${selectedUser.topUpBalance.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Interviews Used</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedUser.interviewsUsed}
                    <span className="text-sm text-gray-400 font-normal">
                      /{selectedUser.customMaxInterviews != null
                        ? <span className="text-amber-600" title="Custom override">{selectedUser.customMaxInterviews}</span>
                        : formatUsageLimit(selectedUser.effectiveMaxInterviews)}
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Matches Used</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedUser.resumeMatchesUsed}
                    <span className="text-sm text-gray-400 font-normal">
                      /{selectedUser.customMaxMatches != null
                        ? <span className="text-amber-600" title="Custom override">{selectedUser.customMaxMatches}</span>
                        : formatUsageLimit(selectedUser.effectiveMaxMatches)}
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Joined</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(selectedUser.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Action selector */}
              <div className="border-t border-gray-200 pt-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Admin Actions</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {([
                    { key: 'balance', label: 'Adjust Balance' },
                    { key: 'usage', label: 'Adjust Usage' },
                    { key: 'subscription', label: 'Set Subscription' },
                    { key: 'set_limits', label: 'Set Limits' },
                    { key: 'reset', label: 'Reset Usage' },
                    { key: 'cancel_sub', label: 'Cancel Subscription' },
                    { key: 'disable', label: 'Disable User' },
                    { key: 'enable', label: 'Enable User' },
                    { key: 'set_role', label: 'Set Role' },
                  ] as const).map((a) => (
                    <button
                      key={a.key}
                      onClick={() => { setActionType(a.key); setActionMessage(''); setActionError(''); }}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        actionType === a.key
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                {/* Action forms */}
                {actionType && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    {actionType === 'balance' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Amount (positive=credit, negative=debit)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={actionAmount}
                          onChange={(e) => setActionAmount(e.target.value)}
                          placeholder="e.g. 5.00 or -2.50"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {actionType === 'usage' && (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                          <select
                            value={actionUsageType}
                            onChange={(e) => setActionUsageType(e.target.value as 'interview' | 'match')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="interview">Interview</option>
                            <option value="match">Resume Match</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Amount (positive=add, negative=credit back)
                          </label>
                          <input
                            type="number"
                            value={actionAmount}
                            onChange={(e) => setActionAmount(e.target.value)}
                            placeholder="e.g. -2 to credit back"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {actionType === 'subscription' && (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tier</label>
                          <select
                            value={actionTier}
                            onChange={(e) => setActionTier(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="free">Free</option>
                            <option value="starter">Starter</option>
                            <option value="growth">Growth</option>
                            <option value="business">Business</option>
                            <option value="custom">Custom (Unlimited)</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                          <select
                            value={actionStatus}
                            onChange={(e) => setActionStatus(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="active">Active</option>
                            <option value="trialing">Trialing</option>
                            <option value="past_due">Past Due</option>
                            <option value="canceled">Canceled</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {actionType === 'set_limits' && (
                      <div>
                        <p className="text-sm text-gray-600 mb-3">
                          Override the maximum number of API calls for this user. Leave blank to keep current value. Enter 0 to block access. Clear to revert to plan default.
                        </p>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Max Interviews
                              {selectedUser?.customMaxInterviews != null && (
                                <span className="ml-1 text-amber-600">(current: {selectedUser.customMaxInterviews})</span>
                              )}
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={actionMaxInterviews}
                                onChange={(e) => setActionMaxInterviews(e.target.value)}
                                placeholder={`Plan default: ${formatUsageLimit(getPlanInterviewLimit(selectedUser))}`}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                              {selectedUser?.customMaxInterviews != null && (
                                <button
                                  type="button"
                                  onClick={() => setActionMaxInterviews('clear')}
                                  className={`px-2 py-1 text-xs rounded border ${actionMaxInterviews === 'clear' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Max Matches
                              {selectedUser?.customMaxMatches != null && (
                                <span className="ml-1 text-amber-600">(current: {selectedUser.customMaxMatches})</span>
                              )}
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={actionMaxMatches}
                                onChange={(e) => setActionMaxMatches(e.target.value)}
                                placeholder={`Plan default: ${formatUsageLimit(getPlanMatchLimit(selectedUser))}`}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                              {selectedUser?.customMaxMatches != null && (
                                <button
                                  type="button"
                                  onClick={() => setActionMaxMatches('clear')}
                                  className={`px-2 py-1 text-xs rounded border ${actionMaxMatches === 'clear' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {actionType === 'reset' && (
                      <p className="text-sm text-gray-600">
                        This will reset both interview and match usage counters to 0.
                      </p>
                    )}

                    {actionType === 'cancel_sub' && (
                      <div>
                        <p className="text-sm text-gray-600 mb-2">
                          Cancel this user's Stripe subscription.
                        </p>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={actionImmediate}
                            onChange={(e) => setActionImmediate(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          Cancel immediately (otherwise cancels at period end)
                        </label>
                      </div>
                    )}

                    {actionType === 'disable' && (
                      <p className="text-sm text-gray-600">
                        Disable this user account. Their subscription will be cancelled and status set to canceled.
                      </p>
                    )}

                    {actionType === 'enable' && (
                      <p className="text-sm text-gray-600">
                        Re-enable this user account. Their subscription status will be set back to active.
                      </p>
                    )}

                    {actionType === 'set_role' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                        <select
                          value={actionRole}
                          onChange={(e) => setActionRole(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Reason (required)</label>
                      <input
                        type="text"
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Reason for this action..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    <button
                      onClick={handleAction}
                      disabled={isSubmitting || !actionReason.trim()}
                      className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 ${
                        ['disable', 'cancel_sub'].includes(actionType)
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {isSubmitting ? 'Applying...' : 'Apply'}
                    </button>

                    {actionMessage && <p className="text-sm text-green-600 font-medium">{actionMessage}</p>}
                    {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                  </div>
                )}
              </div>

              {/* Audit log */}
              {adjustments.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Adjustment History</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex items-start gap-3 text-sm py-2 border-b border-gray-100">
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">{adj.type}</span>
                          {adj.amount != null && (
                            <span className={`ml-2 font-mono ${adj.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {adj.amount > 0 ? '+' : ''}{adj.type === 'balance' ? `$${adj.amount.toFixed(2)}` : adj.amount}
                            </span>
                          )}
                          {adj.oldValue && adj.newValue && (
                            <span className="ml-2 text-gray-400">
                              {adj.oldValue} &rarr; {adj.newValue}
                            </span>
                          )}
                          <p className="text-gray-500 mt-0.5">{adj.reason}</p>
                        </div>
                        <div className="text-right text-xs text-gray-400 whitespace-nowrap">
                          <p>{new Date(adj.createdAt).toLocaleDateString()}</p>
                          <p>{adj.admin.name || adj.admin.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PricingTab() {
  const [prices, setPrices] = useState<Record<'USD' | 'CNY' | 'JPY', Record<'starter' | 'growth' | 'business', string>>>({
    USD: { starter: '29', growth: '199', business: '399' },
    CNY: { starter: '199', growth: '1369', business: '2749' },
    JPY: { starter: '4559', growth: '31329', business: '62799' },
  });
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/config')
      .then((data) => {
        const configs: { key: string; value: string }[] = data.data?.configs || [];
        const p: Record<'USD' | 'CNY' | 'JPY', Record<'starter' | 'growth' | 'business', string>> = {
          USD: { starter: '29', growth: '199', business: '399' },
          CNY: { starter: '199', growth: '1369', business: '2749' },
          JPY: { starter: '4559', growth: '31329', business: '62799' },
        };
        let nextDiscountEnabled = false;
        let nextDiscountPercent = '0';

        for (const c of configs) {
          if (c.key === 'price_starter_monthly') p.USD.starter = c.value;
          if (c.key === 'price_growth_monthly') p.USD.growth = c.value;
          if (c.key === 'price_business_monthly') p.USD.business = c.value;

          const match = c.key.match(/^price_(usd|cny|jpy)_(starter|growth|business)_monthly$/i);
          if (match) {
            const currency = match[1].toUpperCase() as 'USD' | 'CNY' | 'JPY';
            const tier = match[2].toLowerCase() as 'starter' | 'growth' | 'business';
            p[currency][tier] = c.value;
          }

          if (c.key === 'pricing_discount_enabled') {
            nextDiscountEnabled = c.value === 'true' || c.value === '1';
          }
          if (c.key === 'pricing_discount_percent') {
            nextDiscountPercent = c.value;
          }
        }
        setPrices(p);
        setDiscountEnabled(nextDiscountEnabled);
        setDiscountPercent(nextDiscountPercent);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const parsePrice = (value: string) => Number.parseFloat(value);
    const parsedPrices = {
      USD: {
        starter: parsePrice(prices.USD.starter),
        growth: parsePrice(prices.USD.growth),
        business: parsePrice(prices.USD.business),
      },
      CNY: {
        starter: parsePrice(prices.CNY.starter),
        growth: parsePrice(prices.CNY.growth),
        business: parsePrice(prices.CNY.business),
      },
      JPY: {
        starter: parsePrice(prices.JPY.starter),
        growth: parsePrice(prices.JPY.growth),
        business: parsePrice(prices.JPY.business),
      },
    };

    const invalidPrice = Object.values(parsedPrices).some((currencyPrices) =>
      Object.values(currencyPrices).some((price) => !Number.isFinite(price) || price <= 0)
    );
    if (invalidPrice) {
      setError('All prices must be positive numbers');
      return;
    }

    const parsedDiscountPercent = Number.parseFloat(discountPercent || '0');
    if (discountEnabled && (!Number.isFinite(parsedDiscountPercent) || parsedDiscountPercent <= 0 || parsedDiscountPercent >= 100)) {
      setError('Discount must be a number greater than 0 and less than 100');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const body = {
        prices: parsedPrices,
        discount: {
          enabled: discountEnabled,
          percentOff: discountEnabled ? Number(parsedDiscountPercent.toFixed(2)) : 0,
        },
      };

      await adminFetch('/config/pricing', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage('Pricing updated successfully. New subscribers will see the latest prices and discount settings.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update prices');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500 p-6">Loading pricing config...</p>;

  return (
    <div className="max-w-4xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Subscription Pricing</h3>
        <p className="text-sm text-gray-500 mb-6">
          Set monthly prices for each plan and currency. Changes apply to new subscribers and renewals. Existing subscribers keep their current pricing until their next billing cycle.
        </p>

        <div className="space-y-6">
          {([
            { code: 'USD' as const, symbol: '$', localeLabel: 'US Dollar' },
            { code: 'CNY' as const, symbol: '¥', localeLabel: 'Chinese Yuan' },
            { code: 'JPY' as const, symbol: '¥', localeLabel: 'Japanese Yen' },
          ]).map((currency) => (
            <div key={currency.code} className="rounded-xl border border-gray-200 p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-900">{currency.code}</h4>
                <p className="text-xs text-gray-500">{currency.localeLabel}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([
                  { key: 'starter' as const, label: 'Starter', color: 'border-l-blue-400' },
                  { key: 'growth' as const, label: 'Growth', color: 'border-l-emerald-400' },
                  { key: 'business' as const, label: 'Business', color: 'border-l-purple-400' },
                ]).map((plan) => (
                  <div key={plan.key} className={`border-l-4 ${plan.color} pl-3`}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{plan.label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{currency.symbol}</span>
                      <input
                        type="number"
                        min="0"
                        step={currency.code === 'USD' ? '0.01' : '1'}
                        value={prices[currency.code][plan.key]}
                        onChange={(e) => setPrices((prev) => ({
                          ...prev,
                          [currency.code]: {
                            ...prev[currency.code],
                            [plan.key]: e.target.value,
                          },
                        }))}
                        className="w-full pl-7 pr-12 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">/mo</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Discount</h4>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={discountEnabled}
                onChange={(e) => setDiscountEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Enable discount for new checkouts
            </label>
            <div className="relative w-full md:w-56">
              <input
                type="number"
                min="0"
                max="99.99"
                step="0.01"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                disabled={!discountEnabled}
                className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            This applies to new Stripe checkouts only. Existing subscriptions remain on their current pricing.
          </p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Update Prices'}
          </button>
          {message && <p className="text-sm text-green-600 font-medium">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Stripe prices are immutable. Updating USD prices creates new Stripe Price objects and archives old ones. Currency display values for CNY/JPY are controlled here for the pricing page.
          </p>
        </div>
      </div>

      <UsageLimitsSection />
    </div>
  );
}

function UsageLimitsSection() {
  const TIERS = ['free', 'starter', 'growth', 'business'] as const;
  const TIER_LABELS: Record<string, string> = { free: 'Free', starter: 'Starter', growth: 'Growth', business: 'Business' };
  const TIER_COLORS: Record<string, string> = { free: 'border-l-gray-300', starter: 'border-l-blue-400', growth: 'border-l-emerald-400', business: 'border-l-purple-400' };

  const DEFAULTS: Record<string, { interviews: string; matches: string }> = {
    free: { interviews: '0', matches: '0' },
    starter: { interviews: '15', matches: '30' },
    growth: { interviews: '120', matches: '240' },
    business: { interviews: '280', matches: '500' },
  };

  const [limits, setLimits] = useState(DEFAULTS);
  const [ppuInterview, setPpuInterview] = useState('2.00');
  const [ppuMatch, setPpuMatch] = useState('0.40');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/config')
      .then((data) => {
        const configs: { key: string; value: string }[] = data.data?.configs || [];
        const next = { ...DEFAULTS };
        let nextPpuInterview = '2.00';
        let nextPpuMatch = '0.40';

        for (const c of configs) {
          const limitMatch = c.key.match(/^limit_(\w+)_(interviews|matches)$/);
          if (limitMatch) {
            const tier = limitMatch[1];
            const action = limitMatch[2] as 'interviews' | 'matches';
            if (next[tier]) {
              next[tier] = { ...next[tier], [action]: c.value };
            }
          }
          if (c.key === 'payperuse_interview') nextPpuInterview = c.value;
          if (c.key === 'payperuse_match') nextPpuMatch = c.value;
        }
        setLimits(next);
        setPpuInterview(nextPpuInterview);
        setPpuMatch(nextPpuMatch);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const body: { limits: Record<string, { interviews: number; matches: number }>; payPerUse: { interview: number; match: number } } = {
        limits: {},
        payPerUse: {
          interview: Number.parseFloat(ppuInterview),
          match: Number.parseFloat(ppuMatch),
        },
      };

      for (const tier of TIERS) {
        const interviews = Number.parseInt(limits[tier].interviews, 10);
        const matches = Number.parseInt(limits[tier].matches, 10);
        if (!Number.isFinite(interviews) || interviews < 0 || !Number.isFinite(matches) || matches < 0) {
          setError(`Invalid limits for ${TIER_LABELS[tier]}: must be non-negative integers`);
          setSaving(false);
          return;
        }
        body.limits[tier] = { interviews, matches };
      }

      if (!Number.isFinite(body.payPerUse.interview) || body.payPerUse.interview <= 0 ||
          !Number.isFinite(body.payPerUse.match) || body.payPerUse.match <= 0) {
        setError('Pay-per-use rates must be positive numbers');
        setSaving(false);
        return;
      }

      await adminFetch('/config/limits', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage('Usage limits updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update limits');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500 p-6 mt-6">Loading usage limits...</p>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">API Usage Limits</h3>
      <p className="text-sm text-gray-500 mb-6">
        Set monthly usage limits for each subscription tier. Changes take effect immediately for all users on that tier (unless they have a per-user override).
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-4 font-medium text-gray-600">Tier</th>
              <th className="text-left py-2 px-4 font-medium text-gray-600">Interviews / month</th>
              <th className="text-left py-2 px-4 font-medium text-gray-600">Resume Matches / month</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((tier) => (
              <tr key={tier} className="border-b border-gray-100">
                <td className="py-3 pr-4">
                  <span className={`inline-block border-l-4 ${TIER_COLORS[tier]} pl-2 font-medium text-gray-800`}>
                    {TIER_LABELS[tier]}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={limits[tier].interviews}
                    onChange={(e) => setLimits((prev) => ({
                      ...prev,
                      [tier]: { ...prev[tier], interviews: e.target.value },
                    }))}
                    className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </td>
                <td className="py-3 px-4">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={limits[tier].matches}
                    onChange={(e) => setLimits((prev) => ({
                      ...prev,
                      [tier]: { ...prev[tier], matches: e.target.value },
                    }))}
                    className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-3 pr-4">
                <span className="inline-block border-l-4 border-l-amber-400 pl-2 font-medium text-gray-400">
                  Custom
                </span>
              </td>
              <td className="py-3 px-4 text-gray-400 text-xs">Unlimited</td>
              <td className="py-3 px-4 text-gray-400 text-xs">Unlimited</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Pay-Per-Use Rates</h4>
        <p className="text-xs text-gray-500 mb-3">
          Charged when users exceed their plan limits and have top-up balance.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Interview (per use)</label>
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={ppuInterview}
                onChange={(e) => setPpuInterview(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Resume Match (per use)</label>
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={ppuMatch}
                onChange={(e) => setPpuMatch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Updating...' : 'Update Limits'}
        </button>
        {message && <p className="text-sm text-green-600 font-medium">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function InterviewConfigTab() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch('/interview-config')
      .then((data) => setConfig(data.data || {}))
      .catch(() => setMessage('Failed to load config'))
      .finally(() => setLoading(false));
  }, []);

  const updateField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await adminFetch('/interview-config', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      setMessage('Configuration saved');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" /></div>;
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="max-w-2xl space-y-6">
      {/* Instructions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Interview Instructions</h3>
        <p className="text-sm text-gray-500 mb-4">System prompt for the AI interviewer agent.</p>
        <textarea
          value={config['interview.instructions'] || ''}
          onChange={(e) => updateField('interview.instructions', e.target.value)}
          rows={8}
          className={inputCls}
          placeholder="You are an AI interviewer..."
        />
      </div>

      {/* Agent Name */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Agent Name</h3>
        <p className="text-sm text-gray-500 mb-4">LiveKit Cloud agent name to dispatch.</p>
        <input
          type="text"
          value={config['interview.agentName'] || ''}
          onChange={(e) => updateField('interview.agentName', e.target.value)}
          className={inputCls}
          placeholder="RoboHire-1"
        />
      </div>

      {/* STT Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Speech-to-Text (STT)</h3>
        <p className="text-sm text-gray-500 mb-4">Configure the speech recognition provider and model.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Provider</label>
            <select
              value={config['interview.sttProvider'] || 'elevenlabs'}
              onChange={(e) => updateField('interview.sttProvider', e.target.value)}
              className={inputCls}
            >
              <option value="elevenlabs">ElevenLabs</option>
              <option value="deepgram">Deepgram</option>
              <option value="openai">OpenAI Whisper</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <input
              type="text"
              value={config['interview.sttModel'] || ''}
              onChange={(e) => updateField('interview.sttModel', e.target.value)}
              className={inputCls}
              placeholder="scribe_v2"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>Language</label>
          <select
            value={config['interview.language'] || 'en'}
            onChange={(e) => updateField('interview.language', e.target.value)}
            className={inputCls}
          >
            <option value="en">English</option>
            <option value="zh-CN">Chinese (Mandarin)</option>
            <option value="zh-TW">Chinese (Traditional)</option>
            <option value="ja">Japanese</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="pt">Portuguese</option>
            <option value="ko">Korean</option>
          </select>
        </div>
      </div>

      {/* LLM Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Language Model (LLM)</h3>
        <p className="text-sm text-gray-500 mb-4">Configure the AI model for the interviewer.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Provider</label>
            <select
              value={config['interview.llmProvider'] || 'openai'}
              onChange={(e) => updateField('interview.llmProvider', e.target.value)}
              className={inputCls}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <input
              type="text"
              value={config['interview.llmModel'] || ''}
              onChange={(e) => updateField('interview.llmModel', e.target.value)}
              className={inputCls}
              placeholder="gpt-4o"
            />
          </div>
        </div>
      </div>

      {/* TTS Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Text-to-Speech (TTS)</h3>
        <p className="text-sm text-gray-500 mb-4">Configure the voice synthesis for the interviewer.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Provider</label>
            <select
              value={config['interview.ttsProvider'] || 'cartesia'}
              onChange={(e) => updateField('interview.ttsProvider', e.target.value)}
              className={inputCls}
            >
              <option value="cartesia">Cartesia</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <input
              type="text"
              value={config['interview.ttsModel'] || ''}
              onChange={(e) => updateField('interview.ttsModel', e.target.value)}
              className={inputCls}
              placeholder="sonic-3"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>Voice</label>
          <input
            type="text"
            value={config['interview.ttsVoice'] || ''}
            onChange={(e) => updateField('interview.ttsVoice', e.target.value)}
            className={inputCls}
            placeholder="alloy"
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        {message && <p className={`text-sm font-medium ${message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
      </div>
    </div>
  );
}

function SettingsTab() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!currentPassword || !newPassword) {
      setError('All fields are required');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setSaving(true);
    try {
      await authFetch('/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMessage('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Change Password</h3>
        <p className="text-sm text-gray-500 mb-6">Update your admin account password.</p>
        <form className="space-y-6" onSubmit={handleChangePassword}>
          <input
            type="email"
            name="username"
            value={user?.email || ''}
            readOnly
            tabIndex={-1}
            autoComplete="username"
            aria-hidden="true"
            className="sr-only"
          />
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Changing...' : 'Change Password'}
            </button>
            {message && <p className="text-sm text-green-600 font-medium">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}

// ========== MAIN COMPONENT ==========

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <SEO title="Admin" noIndex />
      {/* Tab bar */}
      <div className="landing-gradient-stroke rounded-3xl bg-white/90 p-2 shadow-[0_22px_44px_-36px_rgba(15,23,42,0.62)]">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-[0_14px_26px_-18px_rgba(37,99,235,0.95)]'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && <OverviewTab />}
      {activeTab === 'Analytics' && <UsageAnalyticsTab />}
      {activeTab === 'LLM Usage' && <LLMUsageTab />}
      {activeTab === 'Logs' && <LogsTab />}
      {activeTab === 'Users' && <UsersTab />}
      {activeTab === 'Activity' && <ActivityTab />}
      {activeTab === 'Pricing' && <PricingTab />}
      {activeTab === 'Interview' && <InterviewConfigTab />}
      {activeTab === 'Settings' && <SettingsTab />}
    </div>
  );
}
