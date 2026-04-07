import { useState, useCallback, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import axios from '../lib/axios';
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

type UserTableColumnKey =
  | 'email'
  | 'name'
  | 'company'
  | 'role'
  | 'plan'
  | 'status'
  | 'balance'
  | 'interviews'
  | 'matches'
  | 'actions';

type ResizableUserTableColumnKey = Exclude<UserTableColumnKey, 'actions'>;

const USER_TABLE_DEFAULT_WIDTHS: Record<UserTableColumnKey, number> = {
  email: 320,
  name: 160,
  company: 180,
  role: 90,
  plan: 100,
  status: 110,
  balance: 110,
  interviews: 120,
  matches: 110,
  actions: 76,
};

const USER_TABLE_MIN_WIDTHS: Record<ResizableUserTableColumnKey, number> = {
  email: 220,
  name: 120,
  company: 140,
  role: 80,
  plan: 84,
  status: 96,
  balance: 100,
  interviews: 108,
  matches: 100,
};

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

interface InterviewConfigVersionRecord {
  id: string;
  versionNumber: number;
  versionLabel?: string | null;
  changeNote?: string | null;
  isActive: boolean;
  createdAt: string;
  activatedAt?: string | null;
  createdBy?: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
  config: Record<string, string>;
  populatedKeys: string[];
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

const TABS = ['Overview', 'Analytics', 'LLM Usage', 'Logs', 'Users', 'Activity', 'Pricing', 'Interview', 'Teams', 'Settings'] as const;
type Tab = (typeof TABS)[number];
const INTERVIEW_CONFIG_FIELDS = [
  'interview.instructions',
  'interview.agentName',
  'interview.sttProvider',
  'interview.sttModel',
  'interview.llmProvider',
  'interview.llmModel',
  'interview.ttsProvider',
  'interview.ttsModel',
  'interview.ttsVoice',
  'interview.language',
  'interview.turnDetection',
  'interview.allowInterruptions',
  'interview.discardAudioIfUninterruptible',
  'interview.preemptiveGeneration',
  'interview.minInterruptionDurationMs',
  'interview.minInterruptionWords',
  'interview.minEndpointingDelayMs',
  'interview.maxEndpointingDelayMs',
  'interview.aecWarmupDurationMs',
  'interview.useTtsAlignedTranscript',
  'interview.logInterimTranscripts',
] as const;
type InterviewConfigFieldKey = (typeof INTERVIEW_CONFIG_FIELDS)[number];
const INTERVIEW_CONFIG_DEFAULTS: Record<InterviewConfigFieldKey, string> = {
  'interview.instructions': '',
  'interview.agentName': 'RoboHire-1',
  'interview.sttProvider': 'livekit-inference',
  'interview.sttModel': 'elevenlabs/scribe_v2_realtime',
  'interview.llmProvider': 'openai',
  'interview.llmModel': 'openai/gpt-5.4',
  'interview.ttsProvider': 'livekit-inference',
  'interview.ttsModel': 'cartesia/sonic-3',
  'interview.ttsVoice': 'e90c6678-f0d3-4767-9883-5d0ecf5894a8',
  'interview.language': 'en',
  'interview.turnDetection': 'multilingual_eou',
  'interview.allowInterruptions': 'true',
  'interview.discardAudioIfUninterruptible': 'true',
  'interview.preemptiveGeneration': 'false',
  'interview.minInterruptionDurationMs': '900',
  'interview.minInterruptionWords': '2',
  'interview.minEndpointingDelayMs': '900',
  'interview.maxEndpointingDelayMs': '6000',
  'interview.aecWarmupDurationMs': '3000',
  'interview.useTtsAlignedTranscript': 'true',
  'interview.logInterimTranscripts': 'false',
};

type ConfigFieldInfo = {
  title: string;
  what: string;
  effect: string;
  dependencies: string;
};

const INTERVIEW_CONFIG_FIELD_INFO: Record<InterviewConfigFieldKey, ConfigFieldInfo> = {
  'interview.instructions': {
    title: 'Interview Instructions',
    what: 'The optional system prompt override injected into the interviewer agent before the session starts.',
    effect: 'If you provide text here, every interview uses this exact prompt. If left blank, the backend generates a tailored prompt per interview from the job, company, language, and resume context.',
    dependencies: 'Works with `llmProvider`, `llmModel`, and the candidate/job metadata passed into the room. Leaving it blank enables `InterviewPromptAgent` generation.',
  },
  'interview.agentName': {
    title: 'Agent Name',
    what: 'The LiveKit Cloud agent dispatch name used when creating an interview room.',
    effect: 'Determines which deployed worker receives the job. A wrong name can send traffic to the wrong agent or fail dispatch.',
    dependencies: 'Must match the registered LiveKit worker name in production.',
  },
  'interview.sttProvider': {
    title: 'STT Provider',
    what: 'Selects the speech-to-text backend used to transcribe candidate audio.',
    effect: 'Changes latency, language coverage, transcript quality, and what model IDs are valid.',
    dependencies: 'Must be paired with a compatible `sttModel`. Current worker support is `livekit-inference` or `openai`.',
  },
  'interview.sttModel': {
    title: 'STT Model',
    what: 'The exact recognizer model identifier used by the selected STT provider.',
    effect: 'Changes recognition quality, supported languages, punctuation behavior, and cost profile.',
    dependencies: 'Must be valid for the selected `sttProvider`. It also interacts with `language` and turn detection quality.',
  },
  'interview.llmProvider': {
    title: 'LLM Provider',
    what: 'Chooses the language-model backend that plans the interview and writes responses.',
    effect: 'Changes reasoning style, response speed, multilingual quality, and token pricing.',
    dependencies: 'Must be paired with a compatible `llmModel`. Current worker support is `google` or `openai`.',
  },
  'interview.llmModel': {
    title: 'LLM Model',
    what: 'The exact model name used for interviewer reasoning and response generation.',
    effect: 'Changes answer quality, latency, instruction-following, and multilingual fluency.',
    dependencies: 'Must be valid for the selected `llmProvider`. Strongly affected by `instructions` length and structure.',
  },
  'interview.ttsProvider': {
    title: 'TTS Provider',
    what: 'Selects the text-to-speech backend that renders the interviewer voice.',
    effect: 'Changes voice quality, streaming latency, alignment support, and valid model/voice IDs.',
    dependencies: 'Must be paired with a compatible `ttsModel`. Current worker support is `livekit-inference` or `openai`.',
  },
  'interview.ttsModel': {
    title: 'TTS Model',
    what: 'The exact synthesis model identifier used by the selected TTS provider.',
    effect: 'Changes timbre, latency, multilingual voice quality, and audio alignment behavior.',
    dependencies: 'Must be valid for the selected `ttsProvider`. Some models work better with `useTtsAlignedTranscript` than others.',
  },
  'interview.ttsVoice': {
    title: 'TTS Voice',
    what: 'The default voice ID or preset name for the interviewer.',
    effect: 'Changes the interviewer’s sound, accent, and personality. Invalid values can break audio generation.',
    dependencies: 'Must exist for the selected `ttsProvider` and `ttsModel`. Voice availability is provider-specific.',
  },
  'interview.language': {
    title: 'Default Language',
    what: 'The default interview language used to normalize STT/TTS language codes.',
    effect: 'Improves multilingual transcription and synthesis defaults, especially when the user language is known ahead of time.',
    dependencies: 'Affects STT language normalization, TTS language normalization, and prompt wording. Best results also depend on the chosen STT/TTS models.',
  },
  'interview.turnDetection': {
    title: 'Turn Detection',
    what: 'Controls how the agent decides that the candidate has finished speaking.',
    effect: 'Has the biggest impact on barge-in stability, pause handling, and multilingual end-of-turn accuracy.',
    dependencies: 'Interacts with `minEndpointingDelayMs`, `maxEndpointingDelayMs`, `allowInterruptions`, and STT/VAD quality. `multilingual_eou` is usually the safest multilingual option.',
  },
  'interview.allowInterruptions': {
    title: 'Allow Interruptions',
    what: 'Determines whether the candidate can interrupt the interviewer while the agent is speaking.',
    effect: 'Makes the conversation feel natural when tuned well, but aggressive settings can cause unstable turn-taking.',
    dependencies: 'Works with `minInterruptionDurationMs`, `minInterruptionWords`, `aecWarmupDurationMs`, and the active turn-detection mode.',
  },
  'interview.discardAudioIfUninterruptible': {
    title: 'Discard Audio If Uninterruptible',
    what: 'Controls whether candidate audio is dropped when the current assistant speech segment cannot be interrupted.',
    effect: 'Prevents buffered echo or stale speech from being processed after protected playback finishes.',
    dependencies: 'Most relevant when interruptions are disabled globally or a speech segment is temporarily uninterruptible.',
  },
  'interview.preemptiveGeneration': {
    title: 'Preemptive Generation',
    what: 'Allows the agent to start generating a reply before turn detection fully settles.',
    effect: 'Can reduce perceived latency, but it also increases the chance of premature or incorrect replies.',
    dependencies: 'Interacts heavily with `turnDetection` and endpointing delays. Usually needs conservative turn settings to stay stable.',
  },
  'interview.minInterruptionDurationMs': {
    title: 'Min Interruption Duration Ms',
    what: 'The minimum speech duration the user must sustain before the agent accepts an interruption.',
    effect: 'Higher values reduce accidental barge-ins from breaths, echo, and filler sounds. Lower values feel more responsive.',
    dependencies: 'Only matters when `allowInterruptions` is enabled. Also depends on mic quality, echo cancellation, and VAD/STT accuracy.',
  },
  'interview.minInterruptionWords': {
    title: 'Min Interruption Words',
    what: 'The minimum number of recognized words required before the agent yields to the user.',
    effect: 'Higher values filter out fillers like “uh” or “嗯”; lower values allow very fast takeovers.',
    dependencies: 'Only matters when `allowInterruptions` is enabled and STT is producing usable transcripts.',
  },
  'interview.minEndpointingDelayMs': {
    title: 'Min Endpointing Delay Ms',
    what: 'The shortest silence window the system allows before committing the user turn.',
    effect: 'Higher values reduce premature cutoffs; lower values make the interview feel faster but more fragile.',
    dependencies: 'Strongly tied to `turnDetection`, language pacing, and STT quality. Critical for multilingual stability.',
  },
  'interview.maxEndpointingDelayMs': {
    title: 'Max Endpointing Delay Ms',
    what: 'The longest silence window the system waits before forcing the end of the user turn.',
    effect: 'Caps how long the agent will wait during long pauses. Too low can interrupt reflective answers; too high can make the session feel sluggish.',
    dependencies: 'Works with `minEndpointingDelayMs` and the chosen `turnDetection` mode.',
  },
  'interview.aecWarmupDurationMs': {
    title: 'AEC Warmup Duration Ms',
    what: 'A short protection window after agent playback starts while echo cancellation settles.',
    effect: 'Reduces false interruptions caused by the interviewer audio leaking back into the candidate mic.',
    dependencies: 'Most important when `allowInterruptions` is enabled and the user is on speakers instead of headphones.',
  },
  'interview.useTtsAlignedTranscript': {
    title: 'Use TTS Aligned Transcript',
    what: 'Tells the session to use TTS alignment data when available for transcript/playback synchronization.',
    effect: 'Improves spoken-word timing, interruption handling, and trace quality for agent responses.',
    dependencies: 'Depends on the selected TTS provider/model exposing alignment metadata. It is most useful for streaming TTS with barge-in.',
  },
  'interview.logInterimTranscripts': {
    title: 'Log Interim Transcripts',
    what: 'Stores partial STT hypotheses before the final transcript is committed.',
    effect: 'Makes diagnostics and multilingual tuning easier, but increases log volume and noise.',
    dependencies: 'Depends on the STT provider emitting interim results. It does not improve quality by itself; it improves observability.',
  },
};

const INTERVIEW_RELEASE_FIELD_INFO: Record<'versionLabel' | 'changeNote', ConfigFieldInfo> = {
  versionLabel: {
    title: 'Version Label',
    what: 'A human-readable release label for this saved interview configuration.',
    effect: 'Makes it easier for admins to recognize stable tuning milestones such as `v1.0` or a language-specific release.',
    dependencies: 'Does not change runtime behavior. The immutable numeric version is still tracked separately in the database.',
  },
  changeNote: {
    title: 'Change Note',
    what: 'A short release note describing what changed in this version.',
    effect: 'Improves traceability when comparing tuning experiments and production regressions.',
    dependencies: 'Does not affect runtime behavior, but it is saved with the version history for admin review.',
  },
};

function normalizeInterviewConfig(config?: Record<string, string> | null): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const key of INTERVIEW_CONFIG_FIELDS) {
    const rawValue = config?.[key];
    normalized[key] =
      typeof rawValue === 'string' && rawValue.trim().length > 0
        ? rawValue
        : INTERVIEW_CONFIG_DEFAULTS[key];
  }
  return normalized;
}

function diffInterviewConfigKeys(
  current: Record<string, string>,
  baseline: Record<string, string>,
): string[] {
  return INTERVIEW_CONFIG_FIELDS.filter((key) => (current[key] ?? '') !== (baseline[key] ?? ''));
}

function formatAdminTimestamp(value?: string | null): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function ConfigInfoPopover({ info }: { info: ConfigFieldInfo }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-500 transition hover:border-cyan-400 hover:text-cyan-600"
        aria-label={`Show information about ${info.title}`}
        aria-expanded={open}
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-3rem)] rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl">
          <p className="text-sm font-semibold text-slate-900">{info.title}</p>
          <div className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
            <div>
              <p className="font-semibold uppercase tracking-[0.14em] text-slate-500">What it is</p>
              <p className="mt-1">{info.what}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-[0.14em] text-slate-500">Effect</p>
              <p className="mt-1">{info.effect}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-[0.14em] text-slate-500">Dependencies</p>
              <p className="mt-1">{info.dependencies}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigFieldLabel({ label, info }: { label: string; info: ConfigFieldInfo }) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <ConfigInfoPopover info={info} />
    </div>
  );
}

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
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [columnWidths, setColumnWidths] = useState<Record<UserTableColumnKey, number>>(() => ({
    ...USER_TABLE_DEFAULT_WIDTHS,
  }));

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

  const searchUsers = useCallback(async (searchTerm: string, companyTerm: string, pageNum: number) => {
    setIsSearching(true);
    setSearchError('');
    try {
      const params = new URLSearchParams({
        search: searchTerm,
        company: companyTerm,
        page: String(pageNum),
        limit: '20',
      });
      const data = await adminFetch(`/users?${params.toString()}`);
      setUsers(data.data.users);
      setTotalUsers(data.data.pagination.total);
      setPage(pageNum);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    void searchUsers('', '', 1);
  }, [searchUsers]);

  const runUserSearch = useCallback((pageNum = 1) => {
    void searchUsers(search, companyFilter, pageNum);
  }, [companyFilter, search, searchUsers]);

  const startColumnResize = useCallback((column: ResizableUserTableColumnKey, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[column];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(USER_TABLE_MIN_WIDTHS[column], startWidth + (moveEvent.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [column]: nextWidth }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths]);

  const userTableColumns: Array<{ key: UserTableColumnKey; label: string; resizable: boolean; align?: 'left' | 'right' }> = [
    { key: 'email', label: 'Email', resizable: true },
    { key: 'name', label: 'Name', resizable: true },
    { key: 'company', label: 'Company', resizable: true },
    { key: 'role', label: 'Role', resizable: true },
    { key: 'plan', label: 'Plan', resizable: true },
    { key: 'status', label: 'Status', resizable: true },
    { key: 'balance', label: 'Balance', resizable: true },
    { key: 'interviews', label: 'Interviews', resizable: true },
    { key: 'matches', label: 'Matches', resizable: true },
    { key: 'actions', label: '', resizable: false, align: 'right' },
  ];
  const userTableMinWidth = userTableColumns.reduce((sum, column) => sum + columnWidths[column.key], 0);

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
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.8fr)_auto]">
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runUserSearch(1)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <input
            type="text"
            placeholder="Filter by company..."
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runUserSearch(1)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            onClick={() => runUserSearch(1)}
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
            <table className="w-full table-fixed text-sm" style={{ minWidth: `${userTableMinWidth}px` }}>
              <colgroup>
                {userTableColumns.map((column) => (
                  <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  {userTableColumns.map((column) => (
                    <th
                      key={column.key}
                      className={`relative pb-2 pr-4 font-medium ${column.align === 'right' ? 'text-right' : ''}`}
                    >
                      {column.label}
                      {column.resizable && (
                        <div
                          onMouseDown={(event) => startColumnResize(column.key as ResizableUserTableColumnKey, event)}
                          className="absolute right-0 top-0 h-full w-3 cursor-col-resize touch-none"
                          aria-hidden="true"
                        />
                      )}
                    </th>
                  ))}
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
                      onClick={() => navigate(`/product/admin/users/${u.id}`)}
                    >
                      <td className="py-2.5 pr-4 text-gray-900 truncate" title={u.email}>{u.email}</td>
                      <td className="py-2.5 pr-4 text-gray-600 truncate" title={u.name || '-'}>
                        {u.name || '-'}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600 truncate" title={u.company || '-'}>
                        {u.company || '-'}
                      </td>
                      <td className="py-2.5 pr-4">
                        {u.role === 'admin' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">admin</span>
                        ) : (
                          <span className="text-gray-400 text-xs">user</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">{tierBadge(u.subscriptionTier)}</td>
                      <td className="py-2.5 pr-4">{statusBadge(u.subscriptionStatus)}</td>
                      <td className="py-2.5 pr-4 text-gray-900 font-mono">${u.topUpBalance.toFixed(2)}</td>
                      <td className="py-2.5 pr-4 text-gray-600">
                        {u.interviewsUsed}/
                        {u.customMaxInterviews != null
                          ? <span className="text-amber-600 font-medium" title="Custom override">{u.customMaxInterviews}</span>
                          : formatUsageLimit(u.effectiveMaxInterviews)}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600">
                        {u.resumeMatchesUsed}/
                        {u.customMaxMatches != null
                          ? <span className="text-amber-600 font-medium" title="Custom override">{u.customMaxMatches}</span>
                          : formatUsageLimit(u.effectiveMaxMatches)}
                      </td>
                      <td className="py-2.5 text-right">
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
                  onClick={() => runUserSearch(page - 1)}
                  className="px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  Prev
                </button>
                <span className="px-2 py-1 text-xs">Page {page}</span>
                <button
                  disabled={page * 20 >= totalUsers}
                  onClick={() => runUserSearch(page + 1)}
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
                  {selectedUser.company && <p className="text-sm text-gray-500">{selectedUser.company}</p>}
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
                          <option value="internal">Internal</option>
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
  const [prices, setPrices] = useState<Record<'USD' | 'CNY' | 'JPY' | 'TWD', Record<'starter' | 'growth' | 'business', string>>>({
    USD: { starter: '29', growth: '199', business: '399' },
    CNY: { starter: '199', growth: '1369', business: '2749' },
    JPY: { starter: '4559', growth: '31329', business: '62799' },
    TWD: { starter: '899', growth: '6199', business: '12399' },
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
        const p: Record<'USD' | 'CNY' | 'JPY' | 'TWD', Record<'starter' | 'growth' | 'business', string>> = {
          USD: { starter: '29', growth: '199', business: '399' },
          CNY: { starter: '199', growth: '1369', business: '2749' },
          JPY: { starter: '4559', growth: '31329', business: '62799' },
          TWD: { starter: '899', growth: '6199', business: '12399' },
        };
        let nextDiscountEnabled = false;
        let nextDiscountPercent = '0';

        for (const c of configs) {
          if (c.key === 'price_starter_monthly') p.USD.starter = c.value;
          if (c.key === 'price_growth_monthly') p.USD.growth = c.value;
          if (c.key === 'price_business_monthly') p.USD.business = c.value;

          const match = c.key.match(/^price_(usd|cny|jpy|twd)_(starter|growth|business)_monthly$/i);
          if (match) {
            const currency = match[1].toUpperCase() as 'USD' | 'CNY' | 'JPY' | 'TWD';
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
      TWD: {
        starter: parsePrice(prices.TWD.starter),
        growth: parsePrice(prices.TWD.growth),
        business: parsePrice(prices.TWD.business),
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
            { code: 'TWD' as const, symbol: 'NT$', localeLabel: 'Taiwan Dollar' },
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
  const [config, setConfig] = useState<Record<string, string>>(normalizeInterviewConfig());
  const [versions, setVersions] = useState<InterviewConfigVersionRecord[]>([]);
  const [activeVersion, setActiveVersion] = useState<InterviewConfigVersionRecord | null>(null);
  const [versionLabel, setVersionLabel] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [activatingVersionId, setActivatingVersionId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [productionNote, setProductionNote] = useState('');
  const baselineConfigRef = useRef<Record<string, string>>(normalizeInterviewConfig());

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminFetch('/interview-config');
      const payload = data.data || {};
      const normalizedConfig = normalizeInterviewConfig(payload.config || {});
      setConfig(normalizedConfig);
      baselineConfigRef.current = normalizedConfig;
      setActiveVersion(payload.activeVersion || null);
      setVersions(Array.isArray(payload.versions) ? payload.versions : []);
      setProductionNote(payload.productionStatus?.note || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleLoadVersion = (version: InterviewConfigVersionRecord) => {
    setConfig(normalizeInterviewConfig(version.config));
    setVersionLabel(version.versionLabel || `Based on v${version.versionNumber}`);
    setChangeNote(
      version.changeNote
        ? `Loaded from v${version.versionNumber}: ${version.changeNote}`
        : `Loaded from v${version.versionNumber}`,
    );
    setError('');
    setMessage(`Loaded version v${version.versionNumber} into the editor. Save to publish it.`);
  };

  const handleActivateVersion = async (version: InterviewConfigVersionRecord) => {
    setActivatingVersionId(version.id);
    setMessage('');
    setError('');
    try {
      const data = await adminFetch(`/interview-config/${version.id}/activate`, {
        method: 'POST',
      });

      const payload = data.data || {};
      const normalizedConfig = normalizeInterviewConfig(payload.config || version.config || {});
      baselineConfigRef.current = normalizedConfig;
      setConfig(normalizedConfig);
      setActiveVersion(payload.activeVersion || null);
      setVersions(Array.isArray(payload.versions) ? payload.versions : []);
      setProductionNote(payload.productionStatus?.note || productionNote);
      setVersionLabel('');
      setChangeNote('');
      setMessage(`Version v${version.versionNumber} is now active in production.`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate version');
    } finally {
      setActivatingVersionId(null);
    }
  };

  const handleResetToActive = () => {
    const resetConfig = normalizeInterviewConfig(activeVersion?.config || baselineConfigRef.current);
    setConfig(resetConfig);
    setVersionLabel('');
    setChangeNote('');
    setError('');
    setMessage('Editor reset to the active production version.');
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const data = await adminFetch('/interview-config', {
        method: 'PUT',
        body: JSON.stringify({
          config,
          versionLabel,
          changeNote,
        }),
      });

      const payload = data.data || {};
      const normalizedConfig = normalizeInterviewConfig(payload.config || config);
      baselineConfigRef.current = normalizedConfig;
      setConfig(normalizedConfig);
      setActiveVersion(payload.activeVersion || null);
      setVersions(Array.isArray(payload.versions) ? payload.versions : []);
      setProductionNote(payload.productionStatus?.note || productionNote);
      setVersionLabel('');
      setChangeNote('');
      setMessage(
        payload.activeVersion?.versionNumber
          ? `Version v${payload.activeVersion.versionNumber} is now active in production.`
          : 'Configuration saved',
      );
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" /></div>;
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
  const changedKeys = diffInterviewConfigKeys(config, baselineConfigRef.current);
  const hasUnsavedChanges = changedKeys.length > 0 || versionLabel.trim().length > 0 || changeNote.trim().length > 0;
  const llmProviderValue = (config['interview.llmProvider'] || '').trim().toLowerCase();
  const llmModelValue = (config['interview.llmModel'] || '').trim();
  const llmConfigWarning =
    llmProviderValue === 'google' && /^gpt/i.test(llmModelValue)
      ? 'The current LLM config resolves to Google as the provider, but the model looks like an OpenAI model. This combination is likely invalid at runtime.'
      : llmProviderValue === 'openai' && /gemini/i.test(llmModelValue)
        ? 'The current LLM config resolves to OpenAI as the provider, but the model looks like a Google Gemini model. This combination is likely invalid at runtime.'
        : '';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                Interview Room Config
              </span>
              {activeVersion ? (
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100">
                  Active v{activeVersion.versionNumber}
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
                  No saved versions yet
                </span>
              )}
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Publish versioned interview-room settings</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Changes are stored as immutable versions in the database. Saving creates a new version and makes it live
                for newly started interview sessions. You can also re-activate any saved version from history.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <p className="font-medium text-white">
              {activeVersion ? `Version v${activeVersion.versionNumber}` : 'Draft editor'}
            </p>
            <p className="mt-1 text-slate-300">
              {activeVersion
                ? `Published ${formatAdminTimestamp(activeVersion.activatedAt || activeVersion.createdAt)}`
                : 'The next save will create version 1.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_360px]">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Interview Instructions</h3>
            <p className="text-sm text-gray-500 mb-4">System prompt for the AI interviewer agent.</p>
            <ConfigFieldLabel
              label="Instructions"
              info={INTERVIEW_CONFIG_FIELD_INFO['interview.instructions']}
            />
            <p className="mb-3 text-xs text-gray-500">
              Leave this blank to auto-generate a tailored prompt for each interview from the job, company, language,
              and resume data.
            </p>
            <textarea
              value={config['interview.instructions'] || ''}
              onChange={(e) => updateField('interview.instructions', e.target.value)}
              rows={8}
              className={inputCls}
              placeholder="You are an AI interviewer..."
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Agent Dispatch</h3>
            <p className="text-sm text-gray-500 mb-4">Configure the LiveKit Cloud agent name used when interview rooms are created.</p>
            <div>
              <ConfigFieldLabel
                label="Agent Name"
                info={INTERVIEW_CONFIG_FIELD_INFO['interview.agentName']}
              />
              <input
                type="text"
                value={config['interview.agentName'] || ''}
                onChange={(e) => updateField('interview.agentName', e.target.value)}
                className={inputCls}
                placeholder="RoboHire-1"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Speech-to-Text</h3>
            <p className="text-sm text-gray-500 mb-4">Choose the recognizer stack used to capture candidate responses.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <ConfigFieldLabel
                  label="Provider"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.sttProvider']}
                />
                <select
                  value={config['interview.sttProvider'] || 'livekit-inference'}
                  onChange={(e) => updateField('interview.sttProvider', e.target.value)}
                  className={inputCls}
                >
                  <option value="livekit-inference">LiveKit Inference</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <ConfigFieldLabel
                  label="Model"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.sttModel']}
                />
                <input
                  type="text"
                  value={config['interview.sttModel'] || ''}
                  onChange={(e) => updateField('interview.sttModel', e.target.value)}
                  className={inputCls}
                  placeholder="elevenlabs/scribe_v2_realtime"
                />
              </div>
            </div>
            <div className="mt-4">
              <ConfigFieldLabel
                label="Default Language"
                info={INTERVIEW_CONFIG_FIELD_INFO['interview.language']}
              />
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

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Language Model</h3>
            <p className="text-sm text-gray-500 mb-4">Configure the model responsible for interview planning and question generation.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <ConfigFieldLabel
                  label="Provider"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.llmProvider']}
                />
                <select
                  value={config['interview.llmProvider'] || 'openai'}
                  onChange={(e) => updateField('interview.llmProvider', e.target.value)}
                  className={inputCls}
                >
                  <option value="openai">OpenAI</option>
                  <option value="google">Google</option>
                </select>
              </div>
              <div>
                <ConfigFieldLabel
                  label="Model"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.llmModel']}
                />
                <input
                  type="text"
                  value={config['interview.llmModel'] || ''}
                  onChange={(e) => updateField('interview.llmModel', e.target.value)}
                  className={inputCls}
                  placeholder="openai/gpt-5.4"
                />
              </div>
            </div>
            {llmConfigWarning && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {llmConfigWarning}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Text-to-Speech</h3>
            <p className="text-sm text-gray-500 mb-4">Choose the synthesis stack and the default interviewer voice.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <ConfigFieldLabel
                  label="Provider"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.ttsProvider']}
                />
                <select
                  value={config['interview.ttsProvider'] || 'livekit-inference'}
                  onChange={(e) => updateField('interview.ttsProvider', e.target.value)}
                  className={inputCls}
                >
                  <option value="livekit-inference">LiveKit Inference</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <ConfigFieldLabel
                  label="Model"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.ttsModel']}
                />
                <input
                  type="text"
                  value={config['interview.ttsModel'] || ''}
                  onChange={(e) => updateField('interview.ttsModel', e.target.value)}
                  className={inputCls}
                  placeholder="cartesia/sonic-3"
                />
              </div>
            </div>
            <div className="mt-4">
              <ConfigFieldLabel
                label="Voice"
                info={INTERVIEW_CONFIG_FIELD_INFO['interview.ttsVoice']}
              />
              <input
                type="text"
                value={config['interview.ttsVoice'] || ''}
                onChange={(e) => updateField('interview.ttsVoice', e.target.value)}
                className={inputCls}
                placeholder="e90c6678-f0d3-4767-9883-5d0ecf5894a8"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Turn Taking And Telemetry</h3>
            <p className="text-sm text-gray-500 mb-4">
              Tune barge-in, endpointing, and trace collection for multilingual interview sessions.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <ConfigFieldLabel
                  label="Turn Detection"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.turnDetection']}
                />
                <select
                  value={config['interview.turnDetection'] || 'multilingual_eou'}
                  onChange={(e) => updateField('interview.turnDetection', e.target.value)}
                  className={inputCls}
                >
                  <option value="multilingual_eou">Multilingual EOU</option>
                  <option value="stt">STT Endpointing</option>
                  <option value="vad">VAD</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div>
                <ConfigFieldLabel
                  label="Allow Interruptions"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.allowInterruptions']}
                />
                <select
                  value={config['interview.allowInterruptions'] || 'true'}
                  onChange={(e) => updateField('interview.allowInterruptions', e.target.value)}
                  className={inputCls}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div>
                <ConfigFieldLabel
                  label="Discard Audio If Uninterruptible"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.discardAudioIfUninterruptible']}
                />
                <select
                  value={config['interview.discardAudioIfUninterruptible'] || 'true'}
                  onChange={(e) =>
                    updateField('interview.discardAudioIfUninterruptible', e.target.value)
                  }
                  className={inputCls}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div>
                <ConfigFieldLabel
                  label="Preemptive Generation"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.preemptiveGeneration']}
                />
                <select
                  value={config['interview.preemptiveGeneration'] || 'false'}
                  onChange={(e) => updateField('interview.preemptiveGeneration', e.target.value)}
                  className={inputCls}
                >
                  <option value="false">Disabled</option>
                  <option value="true">Enabled</option>
                </select>
              </div>
              <div>
                <ConfigFieldLabel
                  label="Min Interruption Duration Ms"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.minInterruptionDurationMs']}
                />
                <input
                  type="number"
                  value={config['interview.minInterruptionDurationMs'] || '900'}
                  onChange={(e) => updateField('interview.minInterruptionDurationMs', e.target.value)}
                  className={inputCls}
                  placeholder="900"
                />
              </div>
              <div>
                <ConfigFieldLabel
                  label="Min Interruption Words"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.minInterruptionWords']}
                />
                <input
                  type="number"
                  value={config['interview.minInterruptionWords'] || '2'}
                  onChange={(e) => updateField('interview.minInterruptionWords', e.target.value)}
                  className={inputCls}
                  placeholder="2"
                />
              </div>
              <div>
                <ConfigFieldLabel
                  label="Min Endpointing Delay Ms"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.minEndpointingDelayMs']}
                />
                <input
                  type="number"
                  value={config['interview.minEndpointingDelayMs'] || '900'}
                  onChange={(e) => updateField('interview.minEndpointingDelayMs', e.target.value)}
                  className={inputCls}
                  placeholder="900"
                />
              </div>
              <div>
                <ConfigFieldLabel
                  label="Max Endpointing Delay Ms"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.maxEndpointingDelayMs']}
                />
                <input
                  type="number"
                  value={config['interview.maxEndpointingDelayMs'] || '6000'}
                  onChange={(e) => updateField('interview.maxEndpointingDelayMs', e.target.value)}
                  className={inputCls}
                  placeholder="6000"
                />
              </div>
              <div>
                <ConfigFieldLabel
                  label="AEC Warmup Duration Ms"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.aecWarmupDurationMs']}
                />
                <input
                  type="number"
                  value={config['interview.aecWarmupDurationMs'] || '3000'}
                  onChange={(e) => updateField('interview.aecWarmupDurationMs', e.target.value)}
                  className={inputCls}
                  placeholder="3000"
                />
              </div>
              <div>
                <ConfigFieldLabel
                  label="Use TTS Aligned Transcript"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.useTtsAlignedTranscript']}
                />
                <select
                  value={config['interview.useTtsAlignedTranscript'] || 'true'}
                  onChange={(e) => updateField('interview.useTtsAlignedTranscript', e.target.value)}
                  className={inputCls}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div>
                <ConfigFieldLabel
                  label="Log Interim Transcripts"
                  info={INTERVIEW_CONFIG_FIELD_INFO['interview.logInterimTranscripts']}
                />
                <select
                  value={config['interview.logInterimTranscripts'] || 'false'}
                  onChange={(e) => updateField('interview.logInterimTranscripts', e.target.value)}
                  className={inputCls}
                >
                  <option value="false">Disabled</option>
                  <option value="true">Enabled</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Release This Version</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Every save creates a new immutable version and updates the active production config for new interviews.
                </p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${hasUnsavedChanges ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {hasUnsavedChanges ? `${changedKeys.length} unsaved field${changedKeys.length === 1 ? '' : 's'}` : 'Editor synced'}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <ConfigFieldLabel
                  label="Version Label"
                  info={INTERVIEW_RELEASE_FIELD_INFO.versionLabel}
                />
                <input
                  type="text"
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  className={inputCls}
                  placeholder="Mandarin stability tuning"
                />
              </div>
              <div>
                <ConfigFieldLabel
                  label="Change Note"
                  info={INTERVIEW_RELEASE_FIELD_INFO.changeNote}
                />
                <textarea
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  rows={4}
                  className={inputCls}
                  placeholder="Raised endpointing delay and disabled preemptive generation."
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-800">Production behavior</p>
                <p className="mt-1">
                  {productionNote || 'Newly started interviews will pick up the active configuration immediately after publish or activation.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Publishing...' : activeVersion ? 'Publish New Version' : 'Create v1.0'}
                </button>
                <button
                  onClick={handleResetToActive}
                  disabled={saving}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  Reset Editor
                </button>
              </div>
              {message && <p className="text-sm font-medium text-green-600">{message}</p>}
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Version History</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Load any previous version into the editor for comparison, or activate it directly in production.
                </p>
              </div>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {versions.length} shown
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {versions.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No versions have been saved yet. The first publish will create the initial production version.
                </div>
              )}

              {versions.map((version) => (
                <div
                  key={version.id}
                  className={`rounded-xl border p-4 ${version.isActive ? 'border-cyan-200 bg-cyan-50/70' : 'border-slate-200 bg-slate-50/70'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">v{version.versionNumber}</p>
                        {version.isActive && (
                          <span className="inline-flex rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        {version.versionLabel || 'Untitled release'}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {!version.isActive && (
                        <button
                          onClick={() => handleActivateVersion(version)}
                          disabled={saving || activatingVersionId === version.id}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {activatingVersionId === version.id ? 'Activating...' : 'Use In Production'}
                        </button>
                      )}
                      <button
                        onClick={() => handleLoadVersion(version)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        Load To Editor
                      </button>
                    </div>
                  </div>
                  {version.changeNote && (
                    <p className="mt-3 text-sm leading-6 text-slate-600">{version.changeNote}</p>
                  )}
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <p>Saved: {formatAdminTimestamp(version.createdAt)}</p>
                    <p>Live: {formatAdminTimestamp(version.activatedAt || version.createdAt)}</p>
                    <p>
                      Author: {version.createdBy?.name || version.createdBy?.email || 'Unknown admin'}
                    </p>
                    <p>{version.populatedKeys.length} configured fields</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Teams Tab ──────────────────────────────────────────────────────
type TeamMember = { id: string; name: string | null; email: string; role: string; avatar: string | null };
type Team = { id: string; name: string; description: string | null; members: TeamMember[]; createdAt: string };

function TeamsTab() {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<TeamMember[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/admin/teams');
      if (res.data.success) setTeams(res.data.data);
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await axios.post('/api/v1/admin/teams', { name: newName.trim(), description: newDesc.trim() || null });
      if (res.data.success) {
        setTeams(prev => [res.data.data, ...prev]);
        setNewName(''); setNewDesc(''); setCreating(false);
      }
    } catch { /* */ } finally { setSaving(false); }
  };

  const handleUpdate = async (teamId: string) => {
    setSaving(true);
    try {
      const res = await axios.patch(`/api/v1/admin/teams/${teamId}`, { name: editName, description: editDesc || null });
      if (res.data.success) {
        setTeams(prev => prev.map(t => t.id === teamId ? res.data.data : t));
        setEditingId(null);
      }
    } catch { /* */ } finally { setSaving(false); }
  };

  const handleDelete = async (teamId: string) => {
    if (!confirm(t('admin.teams.confirmDelete', 'Delete this team? Members will be unassigned.'))) return;
    try {
      await axios.delete(`/api/v1/admin/teams/${teamId}`);
      setTeams(prev => prev.filter(t => t.id !== teamId));
    } catch { /* */ }
  };

  const openAddMember = async (teamId: string) => {
    setAddMemberTeamId(teamId);
    setUserSearch('');
    try {
      const res = await axios.get('/api/v1/admin/users');
      if (res.data.success) setAllUsers(res.data.data.users || []);
    } catch { /* */ }
  };

  const handleAddMember = async (userId: string) => {
    if (!addMemberTeamId) return;
    try {
      const res = await axios.post(`/api/v1/admin/teams/${addMemberTeamId}/members`, { userIds: [userId] });
      if (res.data.success) {
        setTeams(prev => prev.map(t => t.id === addMemberTeamId ? res.data.data : t));
      }
    } catch { /* */ }
  };

  const handleRemoveMember = async (teamId: string, userId: string) => {
    try {
      await axios.delete(`/api/v1/admin/teams/${teamId}/members/${userId}`);
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, members: t.members.filter(m => m.id !== userId) } : t));
    } catch { /* */ }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;
  }

  const currentTeamMemberIds = addMemberTeamId ? new Set(teams.find(t => t.id === addMemberTeamId)?.members.map(m => m.id)) : new Set<string>();
  const filteredUsers = allUsers.filter(u => !currentTeamMemberIds.has(u.id) && (
    !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())
  ));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('admin.teams.title', 'Teams')}</h2>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          {t('admin.teams.createTeam', 'Create Team')}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder={t('admin.teams.teamName', 'Team Name')}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            autoFocus
          />
          <input
            value={newDesc} onChange={e => setNewDesc(e.target.value)}
            placeholder={t('admin.teams.description', 'Description (optional)')}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
              {t('actions.cancel', 'Cancel')}
            </button>
            <button onClick={handleCreate} disabled={saving || !newName.trim()} className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? '...' : t('actions.create', 'Create')}
            </button>
          </div>
        </div>
      )}

      {/* Teams list */}
      {teams.length === 0 && !creating && (
        <div className="text-center py-16 text-gray-500 text-sm">{t('admin.teams.noTeams', 'No teams created yet')}</div>
      )}

      {teams.map(team => (
        <div key={team.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Team header */}
          <div className="px-5 py-4 border-b border-gray-100">
            {editingId === team.id ? (
              <div className="space-y-2">
                <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder={t('admin.teams.description', 'Description')} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">{t('actions.cancel', 'Cancel')}</button>
                  <button onClick={() => handleUpdate(team.id)} disabled={saving} className="text-xs font-medium text-white bg-indigo-600 px-3 py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t('actions.save', 'Save')}</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{team.name}</h3>
                  {team.description && <p className="text-xs text-gray-500 mt-0.5">{team.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{t('admin.teams.memberCount', '{{count}} member(s)', { count: team.members.length })}</span>
                  <button onClick={() => { setEditingId(team.id); setEditName(team.name); setEditDesc(team.description || ''); }} className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50">{t('admin.teams.editTeam', 'Edit')}</button>
                  <button onClick={() => handleDelete(team.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">{t('admin.teams.deleteTeam', 'Delete')}</button>
                </div>
              </div>
            )}
          </div>

          {/* Members list */}
          <div className="px-5 py-3">
            {team.members.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">{t('admin.teams.noMembers', 'No members yet')}</p>
            ) : (
              <div className="space-y-2">
                {team.members.map(m => (
                  <div key={m.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-700">
                        {m.avatar ? <img src={m.avatar} className="w-7 h-7 rounded-full" alt="" /> : (m.name?.[0] || m.email[0]).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.name || m.email}</p>
                        <p className="text-xs text-gray-400">{m.email}</p>
                      </div>
                      {m.role === 'admin' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Admin</span>}
                    </div>
                    <button onClick={() => handleRemoveMember(team.id, m.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                      {t('admin.teams.removeMember', 'Remove')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => openAddMember(team.id)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1.5 rounded-lg hover:bg-indigo-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              {t('admin.teams.addMember', 'Add Member')}
            </button>
          </div>
        </div>
      ))}

      {/* Add Member Modal */}
      {addMemberTeamId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAddMemberTeamId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">{t('admin.teams.addMember', 'Add Member')}</h3>
              <button onClick={() => setAddMemberTeamId(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <div className="p-4">
              <input
                value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder={t('admin.teams.searchUsers', 'Search users...')}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-1 max-h-80">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">{t('admin.teams.noUsersFound', 'No users found')}</p>
              ) : filteredUsers.slice(0, 20).map(u => (
                <div key={u.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{u.name || u.email}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                  <button
                    onClick={() => handleAddMember(u.id)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded-lg hover:bg-indigo-50"
                  >
                    {t('actions.add', 'Add')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
  const [searchParams] = useSearchParams();
  const initialTab = TABS.includes(searchParams.get('tab') as Tab) ? (searchParams.get('tab') as Tab) : 'Overview';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

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
      {activeTab === 'Teams' && <TeamsTab />}
      {activeTab === 'Settings' && <SettingsTab />}
    </div>
  );
}
