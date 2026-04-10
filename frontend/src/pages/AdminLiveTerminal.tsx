import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';

type StreamStatus = 'connecting' | 'live' | 'offline';
type StreamLevel = 'debug' | 'info' | 'warn' | 'error';

interface MonitorEvent {
  id: string;
  timestamp: string;
  kind: string;
  severity: StreamLevel | 'critical';
  category: string;
  message: string;
  title: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  line: string;
}

const LEVEL_OPTIONS: Array<{ value: StreamLevel; label: string; accent: string }> = [
  { value: 'info', label: 'INFO', accent: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' },
  { value: 'debug', label: 'DEBUG', accent: 'border-slate-500/40 bg-slate-500/10 text-slate-300' },
  { value: 'warn', label: 'WARN', accent: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  { value: 'error', label: 'ERROR', accent: 'border-rose-400/40 bg-rose-400/10 text-rose-200' },
];

function severityClass(severity: MonitorEvent['severity']): string {
  if (severity === 'error' || severity === 'critical') return 'text-rose-300';
  if (severity === 'warn') return 'text-amber-300';
  if (severity === 'debug') return 'text-slate-400';
  return 'text-cyan-200';
}

function buildStreamUrl(levels: StreamLevel[]): string {
  const token = localStorage.getItem('auth_token');
  const base = API_BASE || window.location.origin;
  const url = new URL('/api/v1/admin/monitor/stream', base);
  if (token) url.searchParams.set('token', token);
  url.searchParams.set('levels', levels.join(','));
  return url.toString();
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

export default function AdminLiveTerminal() {
  const { user } = useAuth();
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<MonitorEvent | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<StreamLevel[]>(['info', 'debug', 'warn', 'error']);
  const [search, setSearch] = useState('');
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [autoScroll, setAutoScroll] = useState(true);
  const [loggerLevel, setLoggerLevel] = useState('DEBUG');
  const [loggerLevelMessage, setLoggerLevelMessage] = useState('');
  const terminalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const ensureDebugLevel = async () => {
      try {
        const current = await adminFetch('/monitor/logger-level');
        const currentLevel = String(current.data?.level || 'INFO').toUpperCase();
        if (cancelled) return;

        if (currentLevel === 'DEBUG') {
          setLoggerLevel('DEBUG');
          setLoggerLevelMessage('Runtime logger already running at DEBUG.');
          return;
        }

        const updated = await adminFetch('/monitor/logger-level', {
          method: 'POST',
          body: JSON.stringify({ level: 'DEBUG' }),
        });
        if (cancelled) return;

        setLoggerLevel(String(updated.data?.level || 'DEBUG').toUpperCase());
        setLoggerLevelMessage(`Runtime logger elevated from ${currentLevel} to DEBUG for full trace capture.`);
      } catch (error) {
        if (cancelled) return;
        setLoggerLevelMessage(error instanceof Error ? error.message : 'Failed to update runtime logger level.');
      }
    };

    void ensureDebugLevel();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const stream = new EventSource(buildStreamUrl(selectedLevels), { withCredentials: true });
    setStreamStatus('connecting');

    stream.addEventListener('open', () => {
      setStreamStatus('live');
    });

    stream.addEventListener('snapshot', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        recentEvents: MonitorEvent[];
      };
      setEvents(payload.recentEvents.slice(-400));
      setStreamStatus('live');
    });

    stream.addEventListener('event', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as MonitorEvent;
      setEvents((prev) => [...prev, payload].slice(-600));
    });

    stream.onerror = () => {
      setStreamStatus('offline');
    };

    return () => {
      stream.close();
    };
  }, [selectedLevels]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;

    return events.filter((event) => {
      const haystack = [
        event.line,
        event.message,
        event.category,
        event.title,
        event.requestId || '',
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [events, search]);

  const levelCounts = useMemo(() => {
    return LEVEL_OPTIONS.reduce<Record<StreamLevel, number>>((acc, option) => {
      acc[option.value] = events.filter((event) => {
        if (option.value === 'error') return event.severity === 'error' || event.severity === 'critical';
        return event.severity === option.value;
      }).length;
      return acc;
    }, { debug: 0, info: 0, warn: 0, error: 0 });
  }, [events]);

  useEffect(() => {
    if (!autoScroll || !terminalRef.current) return;
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [autoScroll, filteredEvents]);

  const toggleLevel = (level: StreamLevel) => {
    setSelectedLevels((prev) => {
      if (prev.includes(level)) {
        const next = prev.filter((entry) => entry !== level);
        return next.length > 0 ? next : prev;
      }
      return [...prev, level];
    });
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-center">
          <p className="text-lg font-semibold">Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_34%),linear-gradient(180deg,_#020617,_#050816_52%,_#020617)] text-slate-100">
      <SEO title="Admin Live Terminal" noIndex />

      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col px-4 py-4 lg:px-6">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_30px_90px_-52px_rgba(15,23,42,0.98)] backdrop-blur">
          <div className="border-b border-white/10 px-5 py-4 lg:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Monitor</p>
                <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight text-white">Realtime Live Terminal</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Dedicated operator window for detailed realtime logs. Filters are applied to the live stream subscription, so this terminal only receives the levels you enable.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/product/admin?tab=Monitor"
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 hover:border-cyan-400/40 hover:text-white"
                >
                  Back To Monitor
                </Link>
                <button
                  onClick={() => setEvents([])}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 hover:border-cyan-400/40 hover:text-white"
                >
                  Clear Buffer
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_1fr_auto]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Search</p>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search text, category, request id..."
                  className="mt-2 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Levels</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LEVEL_OPTIONS.map((option) => {
                    const active = selectedLevels.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        onClick={() => toggleLevel(option.value)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                          active ? option.accent : 'border-white/10 bg-white/[0.03] text-slate-500'
                        }`}
                      >
                        {option.label} {levelCounts[option.value]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200">Runtime Logger</p>
                  <p className="mt-2 text-sm font-semibold text-white">{loggerLevel}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Stream</p>
                  <p className={`mt-2 text-sm font-semibold ${
                    streamStatus === 'live' ? 'text-emerald-300' : streamStatus === 'connecting' ? 'text-amber-300' : 'text-rose-300'
                  }`}>
                    {streamStatus === 'live' ? 'LIVE' : streamStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                  </p>
                </div>
                <button
                  onClick={() => setAutoScroll((prev) => !prev)}
                  className={`rounded-2xl border px-4 py-3 text-left ${
                    autoScroll ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-slate-950/60 text-slate-400'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.16em]">Autoscroll</p>
                  <p className="mt-2 text-sm font-semibold">{autoScroll ? 'ON' : 'OFF'}</p>
                </button>
              </div>
            </div>

            {loggerLevelMessage ? (
              <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100">
                {loggerLevelMessage}
              </div>
            ) : null}
          </div>

          <div className="grid min-h-[calc(100vh-15rem)] gap-0 xl:grid-cols-[1.45fr_0.55fr]">
            <div className="border-b border-white/10 xl:border-b-0 xl:border-r xl:border-white/10">
              <div ref={terminalRef} className="h-[68vh] overflow-y-auto px-4 py-4 font-mono text-[12px] leading-6 lg:h-[calc(100vh-15rem)] lg:px-5">
                {filteredEvents.length > 0 ? filteredEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`block w-full border-b border-white/5 py-1.5 text-left transition-colors hover:bg-white/[0.03] ${severityClass(event.severity)} ${
                      selectedEvent?.id === event.id ? 'bg-white/[0.06]' : ''
                    }`}
                  >
                    {event.line}
                  </button>
                )) : (
                  <div className="py-8 text-center text-slate-500">
                    No events match the selected levels or search query.
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 py-4 lg:px-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Event Inspector</p>

              {selectedEvent ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{selectedEvent.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{new Date(selectedEvent.timestamp).toLocaleString()}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                        selectedEvent.severity === 'error' || selectedEvent.severity === 'critical'
                          ? 'border-rose-400/40 bg-rose-400/10 text-rose-200'
                          : selectedEvent.severity === 'warn'
                            ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                            : selectedEvent.severity === 'debug'
                              ? 'border-slate-500/40 bg-slate-500/10 text-slate-300'
                              : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                      }`}>
                        {selectedEvent.severity}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{selectedEvent.message}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Category</p>
                      <p className="mt-2 text-sm font-semibold text-white">{selectedEvent.category}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Request Id</p>
                      <p className="mt-2 break-all text-sm font-semibold text-white">{selectedEvent.requestId || 'n/a'}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Metadata</p>
                    <pre className="mt-3 max-h-[34vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950/80 p-3 text-[11px] leading-5 text-slate-300">
                      {JSON.stringify(selectedEvent.metadata || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-500">
                  Select a log line to inspect structured metadata.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
