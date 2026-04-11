import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import { API_BASE } from '../config';

/**
 * Admin-only realtime terminal for the Agents Workbench.
 *
 * Phase 5. Streams every AgentActivityLog event from every agent in the
 * system via SSE, plus a recent-runs sidebar showing token/cost/latency
 * aggregates. Monospace console aesthetic with color-coded severity and
 * keyboard shortcuts for pause/resume/clear/filter focus.
 *
 * Route: /product/admin/agents-terminal (guarded by AdminOnly route wrapper)
 */

interface TerminalEvent {
  id: string;
  agentId: string;
  agentName?: string;
  runId: string | null;
  candidateId: string | null;
  actor: string;
  eventType: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  message: string | null;
  payload: unknown;
  sequence: number;
  createdAt: string;
}

interface RunRow {
  id: string;
  agentId: string;
  status: string;
  triggeredBy: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  llmCallCount: number;
  avgLatencyMs: number;
  durationMs: number;
  agent: { id: string; name: string; user?: { name: string | null; email: string } | null };
  _count?: { candidates: number; activities: number };
}

const MAX_BUFFER = 2000; // cap so the terminal doesn't balloon

type SeverityFilter = 'all' | 'debug' | 'info' | 'warn' | 'error';

export default function AdminAgentsTerminal() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<SeverityFilter>('all');
  const [filterAgent, setFilterAgent] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef<TerminalEvent[]>([]);
  const pausedRef = useRef(false);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Keep paused state available inside the SSE handler without triggering
  // re-subscription each time the toggle changes.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Initial history backfill
  useEffect(() => {
    void axios
      .get('/api/v1/admin/agents-terminal/history', { params: { limit: 300 } })
      .then((res) => {
        const history: TerminalEvent[] = res.data.data || [];
        // Backend already returns oldest→newest ordering.
        setEvents(history.slice(-MAX_BUFFER));
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/admin/agents-terminal/runs', { params: { limit: 40 } });
      setRuns(res.data.data || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadRuns();
    const iv = setInterval(loadRuns, 10_000);
    return () => clearInterval(iv);
  }, [loadRuns]);

  // SSE subscription
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const base = API_BASE || window.location.origin;
    const url = new URL('/api/v1/admin/agents-terminal/stream', base);
    if (token) url.searchParams.set('token', token);

    const es = new EventSource(url.toString(), { withCredentials: true });

    es.addEventListener('connected', () => setConnected(true));

    es.addEventListener('event', (ev) => {
      try {
        const evt: TerminalEvent = JSON.parse((ev as MessageEvent).data);
        if (pausedRef.current) {
          bufferRef.current.push(evt);
          return;
        }
        setEvents((prev) => {
          const next = [...prev, evt];
          if (next.length > MAX_BUFFER) next.splice(0, next.length - MAX_BUFFER);
          return next;
        });
      } catch {
        /* ignore */
      }
    });

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  // Flush the paused buffer on resume
  useEffect(() => {
    if (!paused && bufferRef.current.length > 0) {
      setEvents((prev) => {
        const next = [...prev, ...bufferRef.current];
        bufferRef.current = [];
        if (next.length > MAX_BUFFER) next.splice(0, next.length - MAX_BUFFER);
        return next;
      });
    }
  }, [paused]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, autoScroll]);

  // Detect manual scroll-up and pause auto-scroll
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  // Keyboard shortcuts: Space = pause/resume, C = clear, / = focus filter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setEvents([]);
      } else if (e.key === '/') {
        e.preventDefault();
        filterInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = filterText.toLowerCase().trim();
    return events.filter((ev) => {
      if (filterSeverity !== 'all' && ev.severity !== filterSeverity) return false;
      if (filterAgent && ev.agentId !== filterAgent) return false;
      if (q) {
        const hay = `${ev.eventType} ${ev.message ?? ''} ${ev.agentName ?? ''} ${ev.actor}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, filterText, filterSeverity, filterAgent]);

  const uniqueAgents = useMemo(() => {
    const m = new Map<string, string>();
    for (const ev of events) {
      if (!m.has(ev.agentId)) m.set(ev.agentId, ev.agentName || ev.agentId);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [events]);

  return (
    <div className="flex h-[calc(100vh-80px)] bg-zinc-950 text-zinc-100">
      {/* Main terminal column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header bar */}
        <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-500'
              }`}
            />
            <span className="text-xs font-mono text-zinc-400">
              {connected ? 'LIVE' : 'DISCONNECTED'}
            </span>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <h2 className="text-sm font-semibold text-zinc-100">
            {t('admin.agentsTerminal.title', 'Agent Operations Terminal')}
          </h2>
          <span className="text-[11px] text-zinc-500">
            {t('admin.agentsTerminal.subtitle', 'Realtime event stream across all agents')}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] font-mono text-zinc-500">
              <kbd className="rounded bg-zinc-800 px-1">space</kbd>
              <span>pause</span>
              <span className="mx-1 text-zinc-700">·</span>
              <kbd className="rounded bg-zinc-800 px-1">c</kbd>
              <span>clear</span>
              <span className="mx-1 text-zinc-700">·</span>
              <kbd className="rounded bg-zinc-800 px-1">/</kbd>
              <span>filter</span>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/70 px-5 py-2">
          <input
            ref={filterInputRef}
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={t('admin.agentsTerminal.filterPlaceholder', 'Filter events / agents / messages...')}
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600"
          />
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as SeverityFilter)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 focus:border-violet-600 focus:outline-none"
          >
            <option value="all">all severities</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="max-w-[200px] rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 focus:border-violet-600 focus:outline-none"
          >
            <option value="">all agents ({uniqueAgents.length})</option>
            {uniqueAgents.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
              paused
                ? 'border-amber-700 bg-amber-950/40 text-amber-400'
                : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {paused ? `▶ resume (${bufferRef.current.length})` : '⏸ pause'}
          </button>
          <button
            onClick={() => setEvents([])}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-400 hover:text-zinc-200"
          >
            clear
          </button>
        </div>

        {/* Event stream */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[12px] leading-relaxed"
        >
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-600">
              {t('admin.agentsTerminal.waiting', 'Waiting for events...')}
            </div>
          ) : (
            filtered.map((ev) => <EventLine key={ev.id} event={ev} />)
          )}
        </div>
      </div>

      {/* Sidebar: recent runs with token/cost aggregates */}
      <aside className="hidden w-80 flex-none flex-col border-l border-zinc-800 bg-zinc-900 xl:flex">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {t('admin.agentsTerminal.recentRuns', 'Recent Runs')}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      </aside>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EventLine({ event }: { event: TerminalEvent }) {
  const timestamp = new Date(event.createdAt).toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(new Date(event.createdAt).getMilliseconds()).padStart(3, '0');

  const typeColor = eventTypeColor(event.eventType, event.severity);
  const payload = event.payload as Record<string, unknown> | null;

  // Build inline metrics suffix for llm.call.completed events
  let metrics: string | null = null;
  if (event.eventType === 'llm.call.completed' && payload) {
    const tokensIn = payload.tokensIn as number | undefined;
    const tokensOut = payload.tokensOut as number | undefined;
    const costUsd = payload.costUsd as number | undefined;
    const latencyMs = payload.latencyMs as number | undefined;
    metrics = `[${tokensIn ?? 0}↑ ${tokensOut ?? 0}↓ $${(costUsd ?? 0).toFixed(5)} ${latencyMs ?? 0}ms]`;
  }

  return (
    <div className="group flex gap-3 border-l-2 border-transparent py-0.5 pl-2 hover:border-violet-600 hover:bg-zinc-900/50">
      <span className="flex-none text-zinc-600">{timestamp}</span>
      <span className={`flex-none ${typeColor} font-semibold`}>{event.eventType.padEnd(28)}</span>
      <span className="flex-none text-zinc-500">{event.agentName ?? event.agentId.slice(0, 8)}</span>
      {metrics && <span className="flex-none text-violet-400">{metrics}</span>}
      <span className="min-w-0 flex-1 truncate text-zinc-300">{event.message}</span>
      <span className="flex-none text-zinc-700">{event.actor}</span>
    </div>
  );
}

function eventTypeColor(eventType: string, severity: string): string {
  if (severity === 'error') return 'text-red-400';
  if (severity === 'warn') return 'text-amber-400';
  if (eventType.startsWith('llm.')) return 'text-violet-400';
  if (eventType.startsWith('source.') && eventType.endsWith('.hit')) return 'text-sky-400';
  if (eventType === 'match.scored') return 'text-emerald-400';
  if (eventType.startsWith('run.')) return 'text-cyan-400';
  if (eventType.startsWith('candidate.')) return 'text-fuchsia-400';
  if (eventType.startsWith('invite.') || eventType.startsWith('email.') || eventType.startsWith('im.')) return 'text-pink-400';
  return 'text-zinc-400';
}

function RunCard({ run }: { run: RunRow }) {
  const { t } = useTranslation();
  const statusColor =
    run.status === 'completed'
      ? 'text-emerald-400'
      : run.status === 'failed'
        ? 'text-red-400'
        : run.status === 'running' || run.status === 'queued'
          ? 'text-cyan-400'
          : 'text-zinc-500';
  const cost = run.costUsd > 0 ? `$${run.costUsd.toFixed(4)}` : '—';
  const duration = run.durationMs > 0 ? formatDuration(run.durationMs) : '—';

  return (
    <div className="border-b border-zinc-800 px-4 py-3">
      <div className="mb-1 flex items-center gap-2">
        <span className={`font-mono text-[11px] font-semibold ${statusColor}`}>{run.status}</span>
        <span className="truncate text-xs text-zinc-300">{run.agent.name}</span>
      </div>
      <p className="mb-2 truncate text-[10px] text-zinc-500">
        {run.agent.user?.name || run.agent.user?.email || 'system'} · {run.triggeredBy}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-400">
        <div className="flex justify-between">
          <span className="text-zinc-600">calls</span>
          <span>{run.llmCallCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600">avg</span>
          <span>{run.avgLatencyMs}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600">in</span>
          <span>{run.tokensIn.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600">out</span>
          <span>{run.tokensOut.toLocaleString()}</span>
        </div>
        <div className="col-span-2 flex justify-between border-t border-zinc-800 pt-1">
          <span className="text-zinc-600">{t('admin.agentsTerminal.cost', 'cost')}</span>
          <span className="text-emerald-400">{cost}</span>
        </div>
        <div className="col-span-2 flex justify-between">
          <span className="text-zinc-600">{t('admin.agentsTerminal.duration', 'duration')}</span>
          <span>{duration}</span>
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
