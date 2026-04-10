import { useEffect, useMemo, useRef, useState } from 'react';
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
import { API_BASE } from '../config';

type UsageBucket = 'hour' | 'day' | 'week';
type StreamStatus = 'connecting' | 'live' | 'offline';

interface MonitorEvent {
  id: string;
  timestamp: string;
  kind: string;
  severity: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  category: string;
  message: string;
  title: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  line: string;
}

interface ActiveRequestSummary {
  requestId: string;
  endpoint: string;
  method: string;
  startedAt: string;
  ageMs: number;
  llmCalls: number;
  totalTokens: number;
  totalCost: number;
}

interface ActiveAgentSummary {
  id: string;
  requestId?: string;
  agentName: string;
  startedAt: string;
  ageMs: number;
  inputSize?: number;
}

interface HeartbeatSnapshot {
  timestamp: string;
  activeRequests: number;
  activeAgents: number;
  requestRatePerMinute: number;
  llmRatePerMinute: number;
  activityRatePerMinute: number;
  errorsLastFiveMinutes: number;
  unhealthySignals: string[];
}

interface Recommendation {
  title: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  automatable: boolean;
  actionType?: string;
  payload?: Record<string, unknown>;
}

interface AutofixRun {
  id: string;
  timestamp: string;
  title: string;
  actionType: string;
  dryRun: boolean;
  status: 'planned' | 'executed' | 'failed';
  summary: string;
  metadata?: Record<string, unknown>;
}

interface MonitorSummary {
  filters: {
    from: string;
    to: string;
    bucket: UsageBucket;
  };
  overview: {
    requestCount: number;
    llmCallCount: number;
    errorCount: number;
    errorRate: number;
    totalTokens: number;
    totalCost: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    activityCount: number;
    activeRequests: number;
    activeAgents: number;
    requestRatePerMinute: number;
    llmRatePerMinute: number;
    activityRatePerMinute: number;
    errorsLastFiveMinutes: number;
    unhealthySignals: string[];
  };
  timeline: Array<{
    period: string;
    requests: number;
    errors: number;
    llmCalls: number;
    totalTokens: number;
    cost: number;
    avgLatencyMs: number;
  }>;
  live: {
    activeRequests: ActiveRequestSummary[];
    activeAgents: ActiveAgentSummary[];
    recentEvents: MonitorEvent[];
    heartbeats: HeartbeatSnapshot[];
  };
  breakdowns: {
    topEndpoints: Array<{
      endpoint: string;
      module: string;
      method: string;
      requests: number;
      errors: number;
      totalTokens: number;
      cost: number;
      avgLatencyMs: number;
      errorRate: number;
    }>;
    topErrors: Array<{
      endpoint: string;
      module: string;
      method: string;
      requests: number;
      errors: number;
      totalTokens: number;
      cost: number;
      avgLatencyMs: number;
      errorRate: number;
    }>;
    topModels: Array<{
      model: string;
      provider: string;
      calls: number;
      errors: number;
      totalTokens: number;
      cost: number;
      avgLatencyMs: number;
    }>;
    topProviders: Array<{
      provider: string;
      calls: number;
      errors: number;
      totalTokens: number;
      cost: number;
      avgLatencyMs: number;
    }>;
    recentActivities: Array<{
      id: string;
      timestamp: string;
      eventType: string;
      path: string;
      element?: string | null;
      elementTag?: string | null;
      user: { id: string; email: string; name?: string | null };
    }>;
    agentMetrics: Array<{
      agentName: string;
      starts: number;
      completions: number;
      failures: number;
      activeCount: number;
    }>;
  };
  currentConfig: Record<string, string>;
  intelligence: {
    observations: Array<{ severity: 'info' | 'warn' | 'error'; title: string; detail: string }>;
    insights: Array<{ title: string; detail: string }>;
    recommendations: Recommendation[];
  };
  autofix: {
    supportedActionTypes: string[];
    recentRuns: AutofixRun[];
    guardrails: {
      envWritesEnabled: boolean;
      appConfigAllowlist: string[];
      envAllowlist: string[];
    };
  };
}

async function adminFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1/admin${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatMoney(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function formatLatency(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatAge(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1_000)}s`;
}

function severityClass(severity: MonitorEvent['severity']): string {
  if (severity === 'error' || severity === 'critical') return 'text-rose-300';
  if (severity === 'warn') return 'text-amber-300';
  if (severity === 'debug') return 'text-slate-500';
  return 'text-emerald-300';
}

function riskClass(risk: Recommendation['risk']): string {
  if (risk === 'high') return 'bg-rose-100 text-rose-700';
  if (risk === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function statusClass(status: AutofixRun['status']): string {
  if (status === 'failed') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="landing-gradient-stroke rounded-2xl bg-white p-4 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.6)]">
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="landing-display mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function TableCard({
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
            {rows.length > 0 ? rows.map((row, index) => (
              <tr key={`${title}-${index}`} className="border-b border-slate-100 last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${index}-${cellIndex}`} className="py-2 pr-4 text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            )) : (
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

export default function AdminRobustMonitorTab() {
  const [rangeHours, setRangeHours] = useState(24);
  const [bucket, setBucket] = useState<UsageBucket>('hour');
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [liveEvents, setLiveEvents] = useState<MonitorEvent[]>([]);
  const [liveRequests, setLiveRequests] = useState<ActiveRequestSummary[]>([]);
  const [liveAgents, setLiveAgents] = useState<ActiveAgentSummary[]>([]);
  const [heartbeats, setHeartbeats] = useState<HeartbeatSnapshot[]>([]);
  const [autofixRuns, setAutofixRuns] = useState<AutofixRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [autoScroll, setAutoScroll] = useState(true);
  const [autofixReason, setAutofixReason] = useState('');
  const [autofixMessage, setAutofixMessage] = useState('');
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      setLoading(true);
      setError('');
      try {
        const to = new Date();
        const from = new Date(to.getTime() - rangeHours * 60 * 60 * 1000);
        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          bucket,
        });
        const data = await adminFetch(`/monitor/summary?${params.toString()}`);
        if (cancelled) return;
        setSummary(data.data as MonitorSummary);
        setLiveEvents((data.data as MonitorSummary).live.recentEvents);
        setLiveRequests((data.data as MonitorSummary).live.activeRequests);
        setLiveAgents((data.data as MonitorSummary).live.activeAgents);
        setHeartbeats((data.data as MonitorSummary).live.heartbeats);
        setAutofixRuns((data.data as MonitorSummary).autofix.recentRuns);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load monitor summary');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSummary();
    const timer = window.setInterval(() => {
      void loadSummary();
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [bucket, rangeHours]);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const base = API_BASE || window.location.origin;
    const url = new URL('/api/v1/admin/monitor/stream', base);
    if (token) url.searchParams.set('token', token);

    setStreamStatus('connecting');
    const stream = new EventSource(url.toString(), { withCredentials: true });

    stream.addEventListener('open', () => {
      setStreamStatus('live');
    });

    stream.addEventListener('snapshot', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        live: {
          activeRequests: ActiveRequestSummary[];
          activeAgents: ActiveAgentSummary[];
          latestHeartbeat: HeartbeatSnapshot;
        };
        recentEvents: MonitorEvent[];
        recentAutofixRuns: AutofixRun[];
      };

      setLiveRequests(payload.live.activeRequests);
      setLiveAgents(payload.live.activeAgents);
      setHeartbeats((prev) => {
        const next = [...prev, payload.live.latestHeartbeat].slice(-24);
        return next;
      });
      setLiveEvents(payload.recentEvents.slice(-180));
      setAutofixRuns(payload.recentAutofixRuns);
      setStreamStatus('live');
    });

    stream.addEventListener('event', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as MonitorEvent;
      setLiveEvents((prev) => [...prev, payload].slice(-220));
      if (payload.kind === 'heartbeat' && payload.metadata) {
        setHeartbeats((prev) => [...prev, payload.metadata as unknown as HeartbeatSnapshot].slice(-24));
      }
      if (payload.kind === 'autofix') {
        setAutofixRuns((prev) => {
          const syntheticRun: AutofixRun = {
            id: payload.id,
            timestamp: payload.timestamp,
            title: payload.title,
            actionType: String(payload.metadata?.actionType || 'autofix'),
            dryRun: Boolean(payload.metadata?.dryRun),
            status: payload.metadata?.status === 'failed' ? 'failed' : 'executed',
            summary: payload.message,
            metadata: payload.metadata,
          };
          return [syntheticRun, ...prev].slice(0, 12);
        });
      }
    });

    stream.onerror = () => {
      setStreamStatus('offline');
    };

    return () => {
      stream.close();
    };
  }, []);

  useEffect(() => {
    if (!autoScroll || !terminalRef.current) return;
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [autoScroll, liveEvents]);

  const chartRows = useMemo(() => (
    summary?.timeline.map((point) => ({
      label: point.period,
      requests: point.requests,
      errors: point.errors,
      llmCalls: point.llmCalls,
      totalTokens: point.totalTokens,
      cost: point.cost,
      avgLatencyMs: point.avgLatencyMs,
    })) || []
  ), [summary]);

  const executeAutofix = async (recommendation: Recommendation, dryRun: boolean) => {
    if (!recommendation.actionType || !recommendation.payload) return;
    setExecutingAction(`${recommendation.actionType}:${dryRun ? 'dry' : 'apply'}`);
    setAutofixMessage('');

    try {
      const data = await adminFetch('/monitor/autofix/execute', {
        method: 'POST',
        body: JSON.stringify({
          actionType: recommendation.actionType,
          payload: recommendation.payload,
          dryRun,
          reason: autofixReason.trim() || undefined,
        }),
      });

      const run = data.data?.run as AutofixRun | undefined;
      if (run) {
        setAutofixRuns((prev) => [run, ...prev].slice(0, 12));
      }
      setAutofixMessage(run?.summary || `${dryRun ? 'Dry run completed' : 'Autofix executed'}.`);
    } catch (err) {
      setAutofixMessage(err instanceof Error ? err.message : 'Autofix failed');
    } finally {
      setExecutingAction(null);
    }
  };

  if (loading && !summary) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
        Loading Monitor...
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!summary) return null;

  const latestHeartbeat = heartbeats[heartbeats.length - 1];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.25),_transparent_38%),linear-gradient(135deg,_#0f172a,_#111827_58%,_#1f2937)] p-6 text-white shadow-[0_34px_80px_-44px_rgba(15,23,42,0.88)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Monitor</p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight">Realtime operational intelligence for requests, agents, models, and Autofix.</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-300">
              Live terminal feed for API calls, LLM calls, heartbeats, activities, and failures. Historical charts for latency, token I/O, cost, and error concentration. Recommendations can be dry-run or applied directly.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs font-medium text-slate-300">
              Range
              <select
                value={rangeHours}
                onChange={(event) => setRangeHours(Number(event.target.value))}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              >
                <option value={6}>Last 6h</option>
                <option value={24}>Last 24h</option>
                <option value={72}>Last 72h</option>
                <option value={168}>Last 7d</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-300">
              Bucket
              <select
                value={bucket}
                onChange={(event) => setBucket(event.target.value as UsageBucket)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
              </select>
            </label>
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">Stream</p>
              <p className={`mt-1 text-sm font-semibold ${streamStatus === 'live' ? 'text-emerald-300' : streamStatus === 'connecting' ? 'text-amber-300' : 'text-rose-300'}`}>
                {streamStatus === 'live' ? 'LIVE' : streamStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
              </p>
            </div>
            <button
              onClick={() => window.open('/admin/live-terminal', '_blank', 'noopener,noreferrer')}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-left text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200">Launch</p>
              <p className="mt-1 text-sm font-semibold">Open Live Terminal</p>
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">Requests</p>
            <p className="mt-2 text-2xl font-semibold">{summary.overview.requestCount}</p>
            <p className="mt-2 text-xs text-slate-300">{summary.overview.requestRatePerMinute} req/min live</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">LLM Calls</p>
            <p className="mt-2 text-2xl font-semibold">{summary.overview.llmCallCount}</p>
            <p className="mt-2 text-xs text-slate-300">{summary.overview.llmRatePerMinute} llm/min live</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">Token I/O</p>
            <p className="mt-2 text-2xl font-semibold">{formatTokens(summary.overview.totalTokens)}</p>
            <p className="mt-2 text-xs text-slate-300">all requests in range</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">LLM Cost</p>
            <p className="mt-2 text-2xl font-semibold">{formatMoney(summary.overview.totalCost)}</p>
            <p className="mt-2 text-xs text-slate-300">p95 latency {formatLatency(summary.overview.p95LatencyMs)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">Errors</p>
            <p className="mt-2 text-2xl font-semibold">{formatPercent(summary.overview.errorRate)}</p>
            <p className="mt-2 text-xs text-slate-300">{summary.overview.errorsLastFiveMinutes} live in last 5m</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Avg Latency" value={formatLatency(summary.overview.avgLatencyMs)} hint="full-window request average" />
        <MetricCard label="P95 Latency" value={formatLatency(summary.overview.p95LatencyMs)} hint="tail latency signal" />
        <MetricCard label="Active Requests" value={String(liveRequests.length)} hint={`${liveAgents.length} active agents`} />
        <MetricCard
          label="Heartbeat"
          value={latestHeartbeat ? `${latestHeartbeat.requestRatePerMinute} rpm` : 'n/a'}
          hint={latestHeartbeat?.unhealthySignals[0] || 'latest heartbeat healthy'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
          <p className="text-sm font-semibold text-slate-700">Requests, errors, and LLM calls</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="requests" name="Requests" stroke="#2563eb" fill="#bfdbfe" />
                <Area type="monotone" dataKey="errors" name="Errors" stroke="#e11d48" fill="#fecdd3" />
                <Area type="monotone" dataKey="llmCalls" name="LLM Calls" stroke="#0891b2" fill="#bae6fd" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
          <p className="text-sm font-semibold text-slate-700">Tokens, cost, and latency</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="totalTokens" name="Tokens" fill="#2563eb" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="right" dataKey="cost" name="Cost" fill="#14b8a6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#050816] shadow-[0_30px_70px_-48px_rgba(15,23,42,0.95)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <div>
              <p className="font-mono text-sm text-cyan-300">Live Ops Terminal</p>
              <p className="mt-1 text-xs text-slate-400">API calls, debug logs, heartbeats, activities, LLM usage, and Autofix runs.</p>
            </div>
            <button
              onClick={() => setAutoScroll((prev) => !prev)}
              className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-slate-300"
            >
              {autoScroll ? 'Autoscroll On' : 'Autoscroll Off'}
            </button>
          </div>
          <div ref={terminalRef} className="max-h-[32rem] overflow-y-auto px-5 py-4 font-mono text-[12px] leading-6">
            {liveEvents.length > 0 ? liveEvents.map((event) => (
              <div key={event.id} className={`border-b border-white/5 py-1 ${severityClass(event.severity)}`}>
                {event.line}
              </div>
            )) : (
              <div className="text-slate-500">No live events yet.</div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
            <p className="text-sm font-semibold text-slate-700">Active Requests</p>
            <div className="mt-4 space-y-3">
              {liveRequests.length > 0 ? liveRequests.slice(0, 8).map((request) => (
                <div key={request.requestId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{request.method} {request.endpoint}</p>
                      <p className="mt-1 text-xs text-slate-500">{request.requestId.slice(0, 12)} • {formatAge(request.ageMs)}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{request.llmCalls} llm</div>
                      <div>{formatTokens(request.totalTokens)} tok</div>
                      <div>{formatMoney(request.totalCost)}</div>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-500">No active requests.</p>
              )}
            </div>
          </div>

          <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
            <p className="text-sm font-semibold text-slate-700">Active Agents</p>
            <div className="mt-4 space-y-3">
              {liveAgents.length > 0 ? liveAgents.slice(0, 8).map((agent) => (
                <div key={agent.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">{agent.agentName}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatAge(agent.ageMs)} • req {agent.requestId?.slice(0, 8) || 'global'}</p>
                </div>
              )) : (
                <p className="text-sm text-slate-500">No active agent executions.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
          <p className="text-sm font-semibold text-slate-700">Observations</p>
          <div className="mt-4 space-y-3">
            {summary.intelligence.observations.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    item.severity === 'error' ? 'bg-rose-100 text-rose-700' : item.severity === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {item.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
          <p className="text-sm font-semibold text-slate-700">Insights</p>
          <div className="mt-4 space-y-3">
            {summary.intelligence.insights.length > 0 ? summary.intelligence.insights.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No derived insights yet.
              </div>
            )}
          </div>
        </div>

        <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">Recommendations</p>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Guarded Autofix
            </span>
          </div>

          <label className="mt-4 block text-xs font-medium text-slate-500">
            Reason / incident note
            <input
              value={autofixReason}
              onChange={(event) => setAutofixReason(event.target.value)}
              placeholder="Optional audit reason for dry-runs and apply actions"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
            />
          </label>

          {autofixMessage ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {autofixMessage}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {summary.intelligence.recommendations.map((recommendation) => (
              <div key={recommendation.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{recommendation.title}</p>
                    <p className="mt-2 text-sm text-slate-600">{recommendation.detail}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${riskClass(recommendation.risk)}`}>
                    {recommendation.risk}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={!recommendation.automatable || !recommendation.actionType || executingAction !== null}
                    onClick={() => void executeAutofix(recommendation, true)}
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {executingAction === `${recommendation.actionType}:dry` ? 'Running...' : 'Dry Run'}
                  </button>
                  <button
                    disabled={!recommendation.automatable || !recommendation.actionType || executingAction !== null}
                    onClick={() => void executeAutofix(recommendation, false)}
                    className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {executingAction === `${recommendation.actionType}:apply` ? 'Applying...' : 'Apply'}
                  </button>
                  {!recommendation.automatable ? (
                    <span className="inline-flex items-center rounded-full bg-slate-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Manual Only
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TableCard
          title="Hot Endpoints"
          columns={['Endpoint', 'Calls', 'Errors', 'Latency']}
          rows={summary.breakdowns.topEndpoints.map((row) => [
            row.endpoint,
            String(row.requests),
            `${row.errors} (${formatPercent(row.errorRate)})`,
            formatLatency(row.avgLatencyMs),
          ])}
        />
        <TableCard
          title="Top Error Endpoints"
          columns={['Endpoint', 'Module', 'Errors', 'Cost']}
          rows={summary.breakdowns.topErrors.map((row) => [
            row.endpoint,
            row.module,
            String(row.errors),
            formatMoney(row.cost),
          ])}
        />
        <TableCard
          title="Models"
          columns={['Model', 'Calls', 'Cost', 'Latency']}
          rows={summary.breakdowns.topModels.map((row) => [
            row.model,
            String(row.calls),
            formatMoney(row.cost),
            formatLatency(row.avgLatencyMs),
          ])}
        />
        <TableCard
          title="Providers"
          columns={['Provider', 'Calls', 'Errors', 'Cost']}
          rows={summary.breakdowns.topProviders.map((row) => [
            row.provider,
            String(row.calls),
            String(row.errors),
            formatMoney(row.cost),
          ])}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TableCard
          title="Recent Activities"
          columns={['Time', 'User', 'Event', 'Path']}
          rows={summary.breakdowns.recentActivities.slice(0, 10).map((row) => [
            new Date(row.timestamp).toLocaleTimeString(),
            row.user.name || row.user.email,
            row.eventType,
            row.path,
          ])}
        />
        <TableCard
          title="Agent Monitoring"
          columns={['Agent', 'Starts', 'Completed', 'Active']}
          rows={summary.breakdowns.agentMetrics.slice(0, 10).map((row) => [
            row.agentName,
            String(row.starts),
            `${row.completions} / ${row.failures} fail`,
            String(row.activeCount),
          ])}
        />
      </div>

      <div className="landing-gradient-stroke rounded-3xl bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Autofix Runbook</p>
            <p className="mt-1 text-xs text-slate-500">
              App config changes are allowlisted. Env writes are {summary.autofix.guardrails.envWritesEnabled ? 'enabled' : 'disabled'}.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {summary.currentConfig.agent_alex_provider || 'gemini'} / web search {summary.currentConfig.agent_alex_web_search_enabled || 'false'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {autofixRuns.length > 0 ? autofixRuns.map((run) => (
            <div key={run.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800">{run.title}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusClass(run.status)}`}>
                  {run.dryRun ? 'dry-run' : run.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{run.summary}</p>
              <p className="mt-2 text-xs text-slate-500">{new Date(run.timestamp).toLocaleString()}</p>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No Autofix runs recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
