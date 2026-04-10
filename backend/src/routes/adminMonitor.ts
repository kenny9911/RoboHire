import { Router } from 'express';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import prisma from '../lib/prisma.js';
import { opsMonitor } from '../services/OpsMonitorService.js';
import { logger } from '../services/LoggerService.js';

type UsageBucket = 'hour' | 'day' | 'week';

type AutofixActionType =
  | 'agent_alex_provider_switch'
  | 'toggle_agent_alex_web_search'
  | 'set_app_config'
  | 'set_user_limits'
  | 'env_patch';

interface TimelinePoint {
  period: string;
  requests: number;
  errors: number;
  llmCalls: number;
  totalTokens: number;
  cost: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
}

interface Recommendation {
  title: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  automatable: boolean;
  actionType?: AutofixActionType;
  payload?: Record<string, unknown>;
}

const router = Router();

const APP_CONFIG_ALLOWLIST = new Set([
  'agent_alex_provider',
  'agent_alex_web_search_enabled',
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
]);

const ENV_ALLOWLIST = new Set([
  'LOG_LEVEL',
  'FILE_LOGGING',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_FALLBACK_MODEL',
  'AGENT_ALEX_PROVIDER',
  'AGENT_ALEX_WEB_SEARCH_ENABLED',
]);

type StreamLevel = 'debug' | 'info' | 'warn' | 'error';

function startOfDayUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeekUTC(date: Date): string {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return startOfDayUTC(copy);
}

function bucketTimestamp(date: Date, bucket: UsageBucket): string {
  if (bucket === 'hour') return `${date.toISOString().slice(0, 13)}:00`;
  if (bucket === 'week') return startOfWeekUTC(date);
  return startOfDayUTC(date);
}

function toBool(value: string | null | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return value === 'true';
}

function computeP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index] ?? 0;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function resolveEnvFilePath(): string {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) || candidates[0]!;
}

function serializeEnvValue(value: string): string {
  if (/[\s#"'`]/.test(value)) return JSON.stringify(value);
  return value;
}

function upsertEnvVar(content: string, key: string, value: string): string {
  const line = `${key}=${serializeEnvValue(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  return `${content}${suffix}${line}\n`;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeStreamLevels(rawValue: string | string[] | undefined): Set<StreamLevel> {
  const values = Array.isArray(rawValue) ? rawValue.join(',') : rawValue || '';
  const parts = values
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) {
    return new Set<StreamLevel>(['debug', 'info', 'warn', 'error']);
  }

  const normalized = new Set<StreamLevel>();
  for (const part of parts) {
    if (part === 'error' || part === 'critical') {
      normalized.add('error');
      continue;
    }
    if (part === 'debug' || part === 'info' || part === 'warn') {
      normalized.add(part);
    }
  }

  if (normalized.size === 0) {
    return new Set<StreamLevel>(['debug', 'info', 'warn', 'error']);
  }

  return normalized;
}

function eventMatchesLevels(
  event: {
    severity: string;
  },
  levels: Set<StreamLevel>,
): boolean {
  if (event.severity === 'critical') {
    return levels.has('error');
  }
  if (event.severity === 'debug' || event.severity === 'info' || event.severity === 'warn' || event.severity === 'error') {
    return levels.has(event.severity);
  }
  return true;
}

function buildTimeline(
  requestLogs: Array<{
    createdAt: Date;
    statusCode: number;
    durationMs: number;
    totalTokens: number;
    cost: number;
    llmCalls: number;
  }>,
  bucket: UsageBucket,
): TimelinePoint[] {
  const map = new Map<string, TimelinePoint>();

  for (const log of requestLogs) {
    const key = bucketTimestamp(log.createdAt, bucket);
    const point = map.get(key) ?? {
      period: key,
      requests: 0,
      errors: 0,
      llmCalls: 0,
      totalTokens: 0,
      cost: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
    };

    point.requests += 1;
    point.errors += log.statusCode >= 400 ? 1 : 0;
    point.llmCalls += log.llmCalls;
    point.totalTokens += log.totalTokens;
    point.cost += log.cost;
    point.totalLatencyMs += log.durationMs;
    map.set(key, point);
  }

  return Array.from(map.values())
    .map((point) => ({
      ...point,
      avgLatencyMs: point.requests > 0 ? Math.round(point.totalLatencyMs / point.requests) : 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function buildIntelligence(params: {
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalCost: number;
  liveErrorsLastFiveMinutes: number;
  activeRequests: number;
  activeAgents: number;
  currentConfig: Record<string, string>;
  topErrorEndpoint?: {
    endpoint: string;
    module: string;
    errors: number;
    requests: number;
  } | null;
  topModel?: {
    model: string;
    cost: number;
    calls: number;
  } | null;
}): {
  observations: Array<{ severity: 'info' | 'warn' | 'error'; title: string; detail: string }>;
  insights: Array<{ title: string; detail: string }>;
  recommendations: Recommendation[];
} {
  const observations: Array<{ severity: 'info' | 'warn' | 'error'; title: string; detail: string }> = [];
  const insights: Array<{ title: string; detail: string }> = [];
  const recommendations: Recommendation[] = [];

  if (params.requestCount === 0) {
    observations.push({
      severity: 'info',
      title: 'No traffic in selected window',
      detail: 'There are no API request logs in the selected time range, so the panel is currently showing only live memory state.',
    });
    return { observations, insights, recommendations };
  }

  if (params.errorRate >= 0.08) {
    observations.push({
      severity: 'error',
      title: 'High error rate',
      detail: `${params.errorCount} failing requests were recorded in the selected window (${formatPercent(params.errorRate)}).`,
    });
  } else if (params.errorCount > 0) {
    observations.push({
      severity: 'warn',
      title: 'Errors present',
      detail: `${params.errorCount} requests failed in the selected window (${formatPercent(params.errorRate)}).`,
    });
  } else {
    observations.push({
      severity: 'info',
      title: 'No request failures',
      detail: 'No API request failures were recorded in the selected window.',
    });
  }

  if (params.p95LatencyMs >= 12_000 || params.avgLatencyMs >= 5_000) {
    observations.push({
      severity: params.p95LatencyMs >= 20_000 ? 'error' : 'warn',
      title: 'Latency pressure detected',
      detail: `Average latency is ${params.avgLatencyMs} ms and p95 latency is ${params.p95LatencyMs} ms.`,
    });
  }

  if (params.liveErrorsLastFiveMinutes > 0 || params.activeRequests > 0 || params.activeAgents > 0) {
    observations.push({
      severity: params.liveErrorsLastFiveMinutes >= 3 ? 'warn' : 'info',
      title: 'Live operational state',
      detail: `${params.activeRequests} active requests, ${params.activeAgents} active agents, ${params.liveErrorsLastFiveMinutes} live errors in the last 5 minutes.`,
    });
  }

  if (params.topErrorEndpoint) {
    insights.push({
      title: 'Primary failure hotspot',
      detail: `${params.topErrorEndpoint.endpoint} (${params.topErrorEndpoint.module}) is the biggest current error contributor with ${params.topErrorEndpoint.errors} failing requests.`,
    });
  }

  if (params.topModel && params.topModel.cost > 0) {
    insights.push({
      title: 'Cost concentration',
      detail: `${params.topModel.model} is the top LLM cost driver in the selected window at $${params.topModel.cost.toFixed(4)} across ${params.topModel.calls} calls.`,
    });
  }

  const currentAgentAlexProvider = params.currentConfig.agent_alex_provider || 'gemini';
  const currentWebSearch = toBool(params.currentConfig.agent_alex_web_search_enabled, false);
  const currentInterviewModel = params.currentConfig['interview.llmModel'] || '';

  if (
    (params.errorRate >= 0.08 || params.liveErrorsLastFiveMinutes >= 3) &&
    currentAgentAlexProvider !== 'claude'
  ) {
    recommendations.push({
      title: 'Fail over Agent Alex provider to Claude',
      detail: 'Recent failures are elevated. Switching Agent Alex away from Gemini is a low-friction operational rollback.',
      risk: 'medium',
      automatable: true,
      actionType: 'agent_alex_provider_switch',
      payload: { provider: 'claude' },
    });
  }

  if ((params.avgLatencyMs >= 5_000 || params.p95LatencyMs >= 12_000) && currentWebSearch) {
    recommendations.push({
      title: 'Disable Agent Alex web search',
      detail: 'Web search adds latency and external dependency risk. Temporarily disabling it reduces failure surface and response time.',
      risk: 'low',
      automatable: true,
      actionType: 'toggle_agent_alex_web_search',
      payload: { enabled: false },
    });
  }

  if (
    (params.avgLatencyMs >= 5_000 || params.totalCost >= 10) &&
    currentInterviewModel &&
    !currentInterviewModel.includes('flash')
  ) {
    recommendations.push({
      title: 'Move interview LLM model to a faster flash-class model',
      detail: `The current interview model is ${currentInterviewModel}. A flash-class model should reduce latency and cost pressure.`,
      risk: 'medium',
      automatable: true,
      actionType: 'set_app_config',
      payload: {
        entries: [
          { key: 'interview.llmModel', value: 'gemini-3-flash-preview' },
        ],
      },
    });
  }

  if (params.errorCount > 0 && (params.currentConfig.LOG_LEVEL || process.env.LOG_LEVEL || 'INFO').toUpperCase() !== 'DEBUG') {
    recommendations.push({
      title: 'Raise log verbosity to DEBUG during investigation',
      detail: 'If you need deeper traces for the current incident, promote runtime log level temporarily so step logs and debug entries are emitted.',
      risk: 'medium',
      automatable: true,
      actionType: 'env_patch',
      payload: { key: 'LOG_LEVEL', value: 'DEBUG' },
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: 'No automatic mitigation recommended',
      detail: 'Current signals are within the configured thresholds. Continue observing live traffic and investigate manually if you have a specific incident.',
      risk: 'low',
      automatable: false,
    });
  }

  return { observations, insights, recommendations };
}

async function executeSetAppConfig(entries: Array<{ key: string; value: string }>, adminId: string, dryRun: boolean) {
  if (entries.length === 0) {
    throw new Error('No app config entries were provided.');
  }

  for (const entry of entries) {
    if (!APP_CONFIG_ALLOWLIST.has(entry.key)) {
      throw new Error(`Config key "${entry.key}" is not allowlisted for Autofix.`);
    }
  }

  const existingRows = await prisma.appConfig.findMany({
    where: { key: { in: entries.map((entry) => entry.key) } },
  });
  const existingMap = new Map(existingRows.map((row) => [row.key, row.value]));
  const changes = entries.map((entry) => ({
    key: entry.key,
    oldValue: existingMap.get(entry.key) ?? null,
    newValue: entry.value,
  }));

  if (!dryRun) {
    await prisma.$transaction(
      changes.flatMap((change) => [
        prisma.appConfig.upsert({
          where: { key: change.key },
          create: { key: change.key, value: change.newValue, updatedBy: adminId },
          update: { value: change.newValue, updatedBy: adminId },
        }),
      ]),
    );
  }

  return changes;
}

async function executeSetUserLimits(
  payload: { userId?: string; maxInterviews?: number | null; maxMatches?: number | null },
  adminId: string,
  dryRun: boolean,
) {
  if (!payload.userId) throw new Error('userId is required for set_user_limits.');
  if (payload.maxInterviews === undefined && payload.maxMatches === undefined) {
    throw new Error('Provide at least one of maxInterviews or maxMatches.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      customMaxInterviews: true,
      customMaxMatches: true,
    },
  });
  if (!user) throw new Error('User not found.');

  const change = {
    userId: user.id,
    email: user.email,
    oldValue: {
      maxInterviews: user.customMaxInterviews,
      maxMatches: user.customMaxMatches,
    },
    newValue: {
      maxInterviews: payload.maxInterviews ?? user.customMaxInterviews,
      maxMatches: payload.maxMatches ?? user.customMaxMatches,
    },
  };

  if (!dryRun) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(payload.maxInterviews !== undefined ? { customMaxInterviews: payload.maxInterviews } : {}),
        ...(payload.maxMatches !== undefined ? { customMaxMatches: payload.maxMatches } : {}),
      },
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId,
        type: 'limits',
        oldValue: JSON.stringify(change.oldValue),
        newValue: JSON.stringify(change.newValue),
        reason: '[Autofix] Updated user usage limits from monitor console',
      },
    });
  }

  return change;
}

async function executeEnvPatch(payload: { key?: string; value?: string }, dryRun: boolean) {
  if (!payload.key || typeof payload.value !== 'string') {
    throw new Error('key and value are required for env_patch.');
  }
  if (!ENV_ALLOWLIST.has(payload.key)) {
    throw new Error(`Env key "${payload.key}" is not allowlisted for Autofix.`);
  }
  if (process.env.AUTOFIX_ENABLE_ENV_WRITES !== 'true' && !dryRun) {
    throw new Error('Environment writes are disabled. Set AUTOFIX_ENABLE_ENV_WRITES=true to allow them.');
  }

  const envPath = resolveEnvFilePath();
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch {
    content = '';
  }

  const currentMatch = content.match(new RegExp(`^${payload.key}=(.*)$`, 'm'));
  const currentValue = currentMatch?.[1] ?? process.env[payload.key] ?? null;
  const nextContent = upsertEnvVar(content, payload.key, payload.value);

  if (!dryRun) {
    await fs.writeFile(envPath, nextContent, 'utf8');
    process.env[payload.key] = payload.value;
  }

  return {
    envPath,
    key: payload.key,
    oldValue: currentValue,
    newValue: payload.value,
  };
}

/**
 * GET /api/v1/admin/monitor/summary
 * Unified monitoring summary for the Monitor page.
 */
router.get('/summary', async (req, res) => {
  try {
    const now = new Date();
    const to = req.query.to ? new Date(String(req.query.to)) : now;
    const from = req.query.from
      ? new Date(String(req.query.from))
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const bucket = (String(req.query.bucket || 'hour') as UsageBucket);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid from/to date format' });
    }
    if (!['hour', 'day', 'week'].includes(bucket)) {
      return res.status(400).json({ success: false, error: 'bucket must be one of: hour, day, week' });
    }

    const [requestLogs, llmLogs, recentActivities, configRows] = await Promise.all([
      prisma.apiRequestLog.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          createdAt: true,
          endpoint: true,
          method: true,
          module: true,
          statusCode: true,
          durationMs: true,
          totalTokens: true,
          cost: true,
          llmCalls: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 50_000,
      }),
      prisma.lLMCallLog.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          createdAt: true,
          provider: true,
          model: true,
          status: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          cost: true,
          durationMs: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 50_000,
      }),
      prisma.userActivity.findMany({
        where: { timestamp: { gte: from, lte: to } },
        select: {
          id: true,
          timestamp: true,
          eventType: true,
          path: true,
          element: true,
          elementTag: true,
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: 60,
      }),
      prisma.appConfig.findMany({
        where: {
          key: {
            in: [
              'agent_alex_provider',
              'agent_alex_web_search_enabled',
              'interview.llmProvider',
              'interview.llmModel',
              'interview.preemptiveGeneration',
            ],
          },
        },
      }),
    ]);

    const currentConfig = Object.fromEntries(configRows.map((row) => [row.key, row.value]));
    if (!currentConfig.agent_alex_provider) {
      currentConfig.agent_alex_provider = process.env.AGENT_ALEX_PROVIDER || 'gemini';
    }
    if (!currentConfig.agent_alex_web_search_enabled) {
      currentConfig.agent_alex_web_search_enabled = process.env.AGENT_ALEX_WEB_SEARCH_ENABLED || 'false';
    }
    if (!currentConfig['interview.llmModel'] && process.env.LLM_MODEL) {
      currentConfig['interview.llmModel'] = process.env.LLM_MODEL;
    }

    const requestCount = requestLogs.length;
    const errorCount = requestLogs.filter((log) => log.statusCode >= 400).length;
    const totalTokens = requestLogs.reduce((sum, log) => sum + log.totalTokens, 0);
    const totalCost = requestLogs.reduce((sum, log) => sum + log.cost, 0);
    const llmCallCount = llmLogs.length;
    const avgLatencyMs = requestCount > 0
      ? Math.round(requestLogs.reduce((sum, log) => sum + log.durationMs, 0) / requestCount)
      : 0;
    const p95LatencyMs = computeP95(requestLogs.map((log) => log.durationMs));
    const errorRate = requestCount > 0 ? errorCount / requestCount : 0;

    const timeline = buildTimeline(requestLogs, bucket);
    const topEndpointMap = new Map<string, {
      endpoint: string;
      module: string;
      method: string;
      requests: number;
      errors: number;
      totalTokens: number;
      cost: number;
      totalLatencyMs: number;
    }>();
    for (const log of requestLogs) {
      const key = `${log.method}:${log.endpoint}`;
      const entry = topEndpointMap.get(key) ?? {
        endpoint: log.endpoint,
        module: log.module,
        method: log.method,
        requests: 0,
        errors: 0,
        totalTokens: 0,
        cost: 0,
        totalLatencyMs: 0,
      };
      entry.requests += 1;
      entry.errors += log.statusCode >= 400 ? 1 : 0;
      entry.totalTokens += log.totalTokens;
      entry.cost += log.cost;
      entry.totalLatencyMs += log.durationMs;
      topEndpointMap.set(key, entry);
    }

    const topEndpoints = Array.from(topEndpointMap.values())
      .map((entry) => ({
        ...entry,
        avgLatencyMs: entry.requests > 0 ? Math.round(entry.totalLatencyMs / entry.requests) : 0,
        errorRate: entry.requests > 0 ? entry.errors / entry.requests : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    const topErrors = [...topEndpoints]
      .filter((entry) => entry.errors > 0)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 8);

    const modelMap = new Map<string, {
      model: string;
      provider: string;
      calls: number;
      errors: number;
      totalTokens: number;
      cost: number;
      totalLatencyMs: number;
    }>();
    const providerMap = new Map<string, {
      provider: string;
      calls: number;
      errors: number;
      totalTokens: number;
      cost: number;
      totalLatencyMs: number;
    }>();
    for (const log of llmLogs) {
      const modelEntry = modelMap.get(log.model) ?? {
        model: log.model,
        provider: log.provider,
        calls: 0,
        errors: 0,
        totalTokens: 0,
        cost: 0,
        totalLatencyMs: 0,
      };
      modelEntry.calls += 1;
      modelEntry.errors += log.status === 'error' ? 1 : 0;
      modelEntry.totalTokens += log.totalTokens;
      modelEntry.cost += log.cost;
      modelEntry.totalLatencyMs += log.durationMs;
      modelMap.set(log.model, modelEntry);

      const providerEntry = providerMap.get(log.provider) ?? {
        provider: log.provider,
        calls: 0,
        errors: 0,
        totalTokens: 0,
        cost: 0,
        totalLatencyMs: 0,
      };
      providerEntry.calls += 1;
      providerEntry.errors += log.status === 'error' ? 1 : 0;
      providerEntry.totalTokens += log.totalTokens;
      providerEntry.cost += log.cost;
      providerEntry.totalLatencyMs += log.durationMs;
      providerMap.set(log.provider, providerEntry);
    }

    const topModels = Array.from(modelMap.values())
      .map((entry) => ({
        ...entry,
        avgLatencyMs: entry.calls > 0 ? Math.round(entry.totalLatencyMs / entry.calls) : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);

    const topProviders = Array.from(providerMap.values())
      .map((entry) => ({
        ...entry,
        avgLatencyMs: entry.calls > 0 ? Math.round(entry.totalLatencyMs / entry.calls) : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);

    const liveSnapshot = opsMonitor.getLiveSnapshot();
    const recentEvents = opsMonitor.getRecentEvents(180);
    const liveHeartbeats = opsMonitor.getRecentHeartbeats(24);
    const recentAutofixRuns = opsMonitor.getRecentAutofixRuns(12);

    const agentMetricMap = new Map<string, {
      agentName: string;
      starts: number;
      completions: number;
      failures: number;
      activeCount: number;
    }>();
    for (const event of recentEvents) {
      if (event.kind !== 'agent_start' && event.kind !== 'agent_end') continue;
      const match = event.message.match(/(?:🤖\s+|^[✓✗]\s+)(.+?)(?:\s+started|\s+completed)$/u);
      const agentName = match?.[1];
      if (!agentName) continue;

      const entry = agentMetricMap.get(agentName) ?? {
        agentName,
        starts: 0,
        completions: 0,
        failures: 0,
        activeCount: 0,
      };
      if (event.kind === 'agent_start') entry.starts += 1;
      if (event.kind === 'agent_end') {
        entry.completions += 1;
        if (event.message.startsWith('✗')) entry.failures += 1;
      }
      agentMetricMap.set(agentName, entry);
    }
    for (const activeAgent of liveSnapshot.activeAgents) {
      const entry = agentMetricMap.get(activeAgent.agentName) ?? {
        agentName: activeAgent.agentName,
        starts: 0,
        completions: 0,
        failures: 0,
        activeCount: 0,
      };
      entry.activeCount += 1;
      agentMetricMap.set(activeAgent.agentName, entry);
    }

    const intelligence = buildIntelligence({
      requestCount,
      errorCount,
      errorRate,
      avgLatencyMs,
      p95LatencyMs,
      totalCost,
      liveErrorsLastFiveMinutes: liveSnapshot.latestHeartbeat.errorsLastFiveMinutes,
      activeRequests: liveSnapshot.activeRequests.length,
      activeAgents: liveSnapshot.activeAgents.length,
      currentConfig,
      topErrorEndpoint: topErrors[0]
        ? {
            endpoint: topErrors[0].endpoint,
            module: topErrors[0].module,
            errors: topErrors[0].errors,
            requests: topErrors[0].requests,
          }
        : null,
      topModel: topModels[0]
        ? {
            model: topModels[0].model,
            cost: topModels[0].cost,
            calls: topModels[0].calls,
          }
        : null,
    });

    res.json({
      success: true,
      data: {
        filters: {
          from: from.toISOString(),
          to: to.toISOString(),
          bucket,
        },
        overview: {
          requestCount,
          llmCallCount,
          errorCount,
          errorRate,
          totalTokens,
          totalCost,
          avgLatencyMs,
          p95LatencyMs,
          activityCount: recentActivities.length,
          activeRequests: liveSnapshot.activeRequests.length,
          activeAgents: liveSnapshot.activeAgents.length,
          requestRatePerMinute: liveSnapshot.latestHeartbeat.requestRatePerMinute,
          llmRatePerMinute: liveSnapshot.latestHeartbeat.llmRatePerMinute,
          activityRatePerMinute: liveSnapshot.latestHeartbeat.activityRatePerMinute,
          errorsLastFiveMinutes: liveSnapshot.latestHeartbeat.errorsLastFiveMinutes,
          unhealthySignals: liveSnapshot.latestHeartbeat.unhealthySignals,
        },
        timeline,
        live: {
          activeRequests: liveSnapshot.activeRequests,
          activeAgents: liveSnapshot.activeAgents,
          recentEvents,
          heartbeats: liveHeartbeats,
        },
        breakdowns: {
          topEndpoints,
          topErrors,
          topModels,
          topProviders,
          recentActivities,
          agentMetrics: Array.from(agentMetricMap.values()).sort((a, b) => (b.activeCount + b.starts) - (a.activeCount + a.starts)),
        },
        currentConfig,
        intelligence,
        autofix: {
          supportedActionTypes: [
            'agent_alex_provider_switch',
            'toggle_agent_alex_web_search',
            'set_app_config',
            'set_user_limits',
            'env_patch',
          ],
          recentRuns: recentAutofixRuns,
          guardrails: {
            envWritesEnabled: process.env.AUTOFIX_ENABLE_ENV_WRITES === 'true',
            appConfigAllowlist: Array.from(APP_CONFIG_ALLOWLIST),
            envAllowlist: Array.from(ENV_ALLOWLIST),
          },
        },
      },
    });
  } catch (error) {
    console.error('Admin monitor summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to load monitor summary' });
  }
});

/**
 * GET /api/v1/admin/monitor/stream
 * Server-sent events stream for live terminal updates.
 */
router.get('/stream', (req, res) => {
  const levels = normalizeStreamLevels(req.query.levels as string | string[] | undefined);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  res.write('retry: 3000\n\n');
  send('snapshot', {
    live: opsMonitor.getLiveSnapshot(),
    recentEvents: opsMonitor.getRecentEvents(120).filter((event) => eventMatchesLevels(event, levels)).slice(-60),
    recentAutofixRuns: opsMonitor.getRecentAutofixRuns(10),
  });

  const onEvent = (payload: unknown) => {
    const event = payload as { severity?: string };
    if (!event.severity || eventMatchesLevels(event as { severity: string }, levels)) {
      send('event', payload);
    }
  };
  opsMonitor.on('event', onEvent);

  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    opsMonitor.off('event', onEvent);
    res.end();
  });
});

/**
 * GET /api/v1/admin/monitor/logger-level
 * Return the current runtime logger level.
 */
router.get('/logger-level', (_req, res) => {
  res.json({
    success: true,
    data: {
      level: logger.getLogLevelName(),
      levels: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
    },
  });
});

/**
 * POST /api/v1/admin/monitor/logger-level
 * Update the runtime logger level without restarting the process.
 */
router.post('/logger-level', async (req, res) => {
  const level = String(req.body?.level || '').trim().toUpperCase();

  if (!['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(level)) {
    return res.status(400).json({
      success: false,
      error: 'level must be one of DEBUG, INFO, WARN, ERROR',
    });
  }

  const previousLevel = logger.getLogLevelName();
  logger.setLogLevel(level);
  process.env.LOG_LEVEL = level;
  logger.info('MONITOR', `Runtime log level changed`, {
    previousLevel,
    currentLevel: level,
    changedBy: req.user?.id || null,
  });

  await prisma.adminAdjustment.create({
    data: {
      userId: req.user!.id,
      adminId: req.user!.id,
      type: 'autofix',
      oldValue: previousLevel,
      newValue: level,
      reason: `[Monitor] Runtime logger level changed to ${level}`,
    },
  });

  res.json({
    success: true,
    data: {
      previousLevel,
      level,
    },
  });
});

/**
 * POST /api/v1/admin/monitor/autofix/execute
 * Execute a guarded operational autofix action.
 */
router.post('/autofix/execute', async (req, res) => {
  const body = (req.body ?? {}) as {
    actionType?: AutofixActionType;
    payload?: Record<string, unknown>;
    dryRun?: boolean;
    reason?: string;
  };

  const actionType = body.actionType;
  const payload = body.payload || {};
  const dryRun = body.dryRun !== false;
  const reason = (body.reason || '').toString().trim();

  if (!actionType) {
    return res.status(400).json({ success: false, error: 'actionType is required' });
  }

  try {
    let result: unknown;
    let title: string = actionType;

    if (actionType === 'agent_alex_provider_switch') {
      const provider = payload.provider;
      if (provider !== 'claude' && provider !== 'gemini') {
        throw new Error('provider must be "claude" or "gemini".');
      }
      title = `Switch Agent Alex provider to ${provider}`;
      result = await executeSetAppConfig(
        [{ key: 'agent_alex_provider', value: provider }],
        req.user!.id,
        dryRun,
      );
    } else if (actionType === 'toggle_agent_alex_web_search') {
      if (typeof payload.enabled !== 'boolean') {
        throw new Error('enabled must be a boolean.');
      }
      title = `${payload.enabled ? 'Enable' : 'Disable'} Agent Alex web search`;
      result = await executeSetAppConfig(
        [{ key: 'agent_alex_web_search_enabled', value: String(payload.enabled) }],
        req.user!.id,
        dryRun,
      );
    } else if (actionType === 'set_app_config') {
      const entries = Array.isArray(payload.entries)
        ? payload.entries
            .map((entry) =>
              typeof entry === 'object' && entry !== null
                ? {
                    key: String((entry as { key?: unknown }).key || ''),
                    value: String((entry as { value?: unknown }).value ?? ''),
                  }
                : null,
            )
            .filter((entry): entry is { key: string; value: string } => Boolean(entry?.key))
        : [];
      title = 'Apply app config patch';
      result = await executeSetAppConfig(entries, req.user!.id, dryRun);
    } else if (actionType === 'set_user_limits') {
      title = 'Update user usage limits';
      result = await executeSetUserLimits(
        {
          userId: typeof payload.userId === 'string' ? payload.userId : undefined,
          maxInterviews: payload.maxInterviews as number | null | undefined,
          maxMatches: payload.maxMatches as number | null | undefined,
        },
        req.user!.id,
        dryRun,
      );
    } else if (actionType === 'env_patch') {
      title = `Patch env variable ${String(payload.key || '')}`;
      result = await executeEnvPatch(
        {
          key: typeof payload.key === 'string' ? payload.key : undefined,
          value: typeof payload.value === 'string' ? payload.value : undefined,
        },
        dryRun,
      );
    } else {
      throw new Error(`Unsupported actionType "${actionType}".`);
    }

    const summary = `${dryRun ? 'Dry run' : 'Executed'} ${title}${reason ? ` — ${reason}` : ''}`;
    const run = opsMonitor.recordAutofixRun({
      title,
      actionType,
      dryRun,
      status: 'executed',
      summary,
      metadata: result as Record<string, unknown>,
    });

    if (!dryRun) {
      await prisma.adminAdjustment.create({
        data: {
          userId: req.user!.id,
          adminId: req.user!.id,
          type: 'autofix',
          oldValue: null,
          newValue: JSON.stringify({ actionType, payload, result }),
          reason: reason || `[Autofix] ${title}`,
        },
      });
    }

    res.json({
      success: true,
      data: {
        run,
        result,
      },
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    const run = opsMonitor.recordAutofixRun({
      title: actionType,
      actionType,
      dryRun,
      status: 'failed',
      summary: message,
      metadata: { payload },
    });

    res.status(400).json({
      success: false,
      error: message,
      data: { run },
    });
  }
});

export default router;
