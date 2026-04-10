import { EventEmitter } from 'events';
import {
  logger,
  LogLevel,
  type LogEntry,
  type RequestUsageSnapshot,
} from './LoggerService.js';

export type MonitorEventKind =
  | 'log'
  | 'request_start'
  | 'request_end'
  | 'llm_call'
  | 'agent_start'
  | 'agent_end'
  | 'activity'
  | 'heartbeat'
  | 'autofix';

export type MonitorSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface MonitorEvent {
  id: string;
  timestamp: string;
  kind: MonitorEventKind;
  severity: MonitorSeverity;
  category: string;
  message: string;
  title: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  line: string;
}

export interface ActiveRequestSummary {
  requestId: string;
  endpoint: string;
  method: string;
  startedAt: string;
  ageMs: number;
  llmCalls: number;
  totalTokens: number;
  totalCost: number;
  status?: 'success' | 'error';
  statusCode?: number;
}

export interface ActiveAgentSummary {
  id: string;
  requestId?: string;
  agentName: string;
  startedAt: string;
  ageMs: number;
  inputSize?: number;
}

export interface HeartbeatSnapshot {
  timestamp: string;
  activeRequests: number;
  activeAgents: number;
  requestRatePerMinute: number;
  llmRatePerMinute: number;
  activityRatePerMinute: number;
  errorsLastFiveMinutes: number;
  unhealthySignals: string[];
}

export interface AutofixRun {
  id: string;
  timestamp: string;
  title: string;
  actionType: string;
  dryRun: boolean;
  status: 'planned' | 'executed' | 'failed';
  summary: string;
  metadata?: Record<string, unknown>;
}

interface ActiveAgentExecution {
  id: string;
  requestId?: string;
  agentName: string;
  startedAt: number;
  inputSize?: number;
}

function monitorId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) return '';

  const parts = Object.entries(metadata)
    .slice(0, 6)
    .map(([key, value]) => {
      if (value == null) return `${key}=null`;
      if (typeof value === 'object') return `${key}=${JSON.stringify(value)}`;
      return `${key}=${String(value)}`;
    });

  return parts.length > 0 ? ` { ${parts.join(' | ')} }` : '';
}

function toSeverity(level: LogLevel): MonitorSeverity {
  if (level >= LogLevel.ERROR) return 'error';
  if (level === LogLevel.WARN) return 'warn';
  if (level === LogLevel.INFO) return 'info';
  return 'debug';
}

function extractAgentName(message: string): string | null {
  const startMatch = message.match(/🤖\s+(.+?)\s+started$/u);
  if (startMatch?.[1]) return startMatch[1];

  const endMatch = message.match(/^[✓✗]\s+(.+?)\s+completed$/u);
  if (endMatch?.[1]) return endMatch[1];

  return null;
}

class OpsMonitorService extends EventEmitter {
  private readonly maxEvents = 800;
  private readonly maxHeartbeats = 120;
  private readonly maxAutofixRuns = 80;
  private readonly events: MonitorEvent[] = [];
  private readonly heartbeats: HeartbeatSnapshot[] = [];
  private readonly autofixRuns: AutofixRun[] = [];
  private readonly activeAgents = new Map<string, ActiveAgentExecution>();
  private readonly requestStarts: number[] = [];
  private readonly llmCalls: number[] = [];
  private readonly activityEvents: number[] = [];
  private readonly errors: number[] = [];
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    logger.on('log', (entry: LogEntry) => {
      this.ingestLog(entry);
    });

    this.heartbeatTimer = setInterval(() => {
      const heartbeat = this.buildHeartbeat();
      this.heartbeats.push(heartbeat);
      if (this.heartbeats.length > this.maxHeartbeats) {
        this.heartbeats.splice(0, this.heartbeats.length - this.maxHeartbeats);
      }

      this.recordEvent({
        id: monitorId('heartbeat'),
        timestamp: heartbeat.timestamp,
        kind: 'heartbeat',
        severity: heartbeat.unhealthySignals.length > 0 ? 'warn' : 'info',
        category: 'HEARTBEAT',
        title: heartbeat.unhealthySignals.length > 0 ? 'Degraded heartbeat' : 'Healthy heartbeat',
        message: heartbeat.unhealthySignals.length > 0
          ? heartbeat.unhealthySignals.join(' | ')
          : 'All monitored signals within threshold.',
        metadata: heartbeat as unknown as Record<string, unknown>,
        line: this.formatTerminalLine({
          timestamp: heartbeat.timestamp,
          levelName: heartbeat.unhealthySignals.length > 0 ? 'WARN' : 'INFO',
          category: 'HEARTBEAT',
          message:
            `requests=${heartbeat.activeRequests} agents=${heartbeat.activeAgents} rpm=${heartbeat.requestRatePerMinute} llm=${heartbeat.llmRatePerMinute} errors5m=${heartbeat.errorsLastFiveMinutes}`,
        }),
      });
    }, 5000);
    this.heartbeatTimer.unref?.();
  }

  private formatTerminalLine(entry: {
    timestamp: string;
    levelName: string;
    category: string;
    message: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): string {
    const rid = entry.requestId ? ` (${entry.requestId.slice(0, 8)})` : '';
    return `[${entry.timestamp}] [${entry.levelName}] [${entry.category}]${rid} ${entry.message}${formatMetadata(entry.metadata)}`;
  }

  private pruneBuckets(now = Date.now()): void {
    const minuteAgo = now - 60_000;
    const fiveMinutesAgo = now - 5 * 60_000;

    while (this.requestStarts.length > 0 && this.requestStarts[0] < minuteAgo) this.requestStarts.shift();
    while (this.llmCalls.length > 0 && this.llmCalls[0] < minuteAgo) this.llmCalls.shift();
    while (this.activityEvents.length > 0 && this.activityEvents[0] < minuteAgo) this.activityEvents.shift();
    while (this.errors.length > 0 && this.errors[0] < fiveMinutesAgo) this.errors.shift();
  }

  private classifyLogKind(entry: LogEntry): MonitorEventKind {
    if (entry.category === 'REQUEST' && entry.message.startsWith('▶ Started:')) return 'request_start';
    if (entry.category === 'REQUEST' && entry.message.includes('Completed:')) return 'request_end';
    if (entry.category === 'LLM' && entry.message.includes('API call')) return 'llm_call';
    if (entry.category === 'AGENT' && entry.message.includes('started')) return 'agent_start';
    if (entry.category === 'AGENT' && entry.message.includes('completed')) return 'agent_end';
    return 'log';
  }

  private ingestLog(entry: LogEntry): void {
    const kind = this.classifyLogKind(entry);
    const now = Date.now();
    const severity = toSeverity(entry.level);

    if (kind === 'request_start') this.requestStarts.push(now);
    if (kind === 'llm_call') this.llmCalls.push(now);
    if (severity === 'error' || severity === 'critical') this.errors.push(now);

    if (kind === 'agent_start') {
      const agentName = extractAgentName(entry.message);
      if (agentName) {
        const id = monitorId('agent');
        this.activeAgents.set(
          `${entry.requestId || 'global'}:${agentName}`,
          {
            id,
            requestId: entry.requestId,
            agentName,
            startedAt: now,
            inputSize: typeof entry.metadata?.inputSize === 'number' ? entry.metadata.inputSize : undefined,
          },
        );
      }
    }

    if (kind === 'agent_end') {
      const agentName = extractAgentName(entry.message);
      if (agentName) {
        this.activeAgents.delete(`${entry.requestId || 'global'}:${agentName}`);
      }
    }

    this.pruneBuckets(now);

    this.recordEvent({
      id: monitorId('evt'),
      timestamp: entry.timestamp,
      kind,
      severity,
      category: entry.category,
      title: entry.category,
      message: entry.message,
      requestId: entry.requestId,
      metadata: entry.metadata,
      line: this.formatTerminalLine({
        timestamp: entry.timestamp,
        levelName: entry.levelName,
        category: entry.category,
        message: entry.message,
        requestId: entry.requestId,
        metadata: entry.metadata,
      }),
    });
  }

  private recordEvent(event: MonitorEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    this.emit('event', event);
  }

  private buildHeartbeat(): HeartbeatSnapshot {
    const now = Date.now();
    this.pruneBuckets(now);

    const activeRequests = this.getActiveRequests();
    const activeAgents = this.getActiveAgents();
    const unhealthySignals: string[] = [];

    if (this.errors.length >= 5) unhealthySignals.push('Error spike detected in the last 5 minutes.');
    if (activeRequests.some((request) => request.ageMs > 60_000)) unhealthySignals.push('Long-running API request detected.');
    if (activeAgents.some((agent) => agent.ageMs > 45_000)) unhealthySignals.push('Long-running agent execution detected.');
    if (this.requestStarts.length >= 30 && activeRequests.length >= 8) unhealthySignals.push('Concurrent request pressure is elevated.');

    return {
      timestamp: new Date(now).toISOString(),
      activeRequests: activeRequests.length,
      activeAgents: activeAgents.length,
      requestRatePerMinute: this.requestStarts.length,
      llmRatePerMinute: this.llmCalls.length,
      activityRatePerMinute: this.activityEvents.length,
      errorsLastFiveMinutes: this.errors.length,
      unhealthySignals,
    };
  }

  getActiveRequests(): ActiveRequestSummary[] {
    return logger
      .getActiveRequestSnapshots()
      .map((snapshot) => ({
        requestId: snapshot.requestId,
        endpoint: snapshot.endpoint,
        method: snapshot.method,
        startedAt: snapshot.startedAt,
        ageMs: Date.now() - new Date(snapshot.startedAt).getTime(),
        llmCalls: snapshot.llmCallsCount,
        totalTokens: snapshot.totalTokens,
        totalCost: snapshot.totalCost,
        status: snapshot.status,
        statusCode: snapshot.statusCode,
      }))
      .sort((a, b) => b.ageMs - a.ageMs);
  }

  getActiveAgents(): ActiveAgentSummary[] {
    return Array.from(this.activeAgents.values())
      .map((agent) => ({
        id: agent.id,
        requestId: agent.requestId,
        agentName: agent.agentName,
        startedAt: new Date(agent.startedAt).toISOString(),
        ageMs: Date.now() - agent.startedAt,
        inputSize: agent.inputSize,
      }))
      .sort((a, b) => b.ageMs - a.ageMs);
  }

  getRecentEvents(limit = 200): MonitorEvent[] {
    return this.events.slice(-Math.max(1, limit));
  }

  getRecentHeartbeats(limit = 24): HeartbeatSnapshot[] {
    return this.heartbeats.slice(-Math.max(1, limit));
  }

  getRecentAutofixRuns(limit = 20): AutofixRun[] {
    return this.autofixRuns.slice(-Math.max(1, limit)).reverse();
  }

  getLiveSnapshot(): {
    activeRequests: ActiveRequestSummary[];
    activeAgents: ActiveAgentSummary[];
    latestHeartbeat: HeartbeatSnapshot;
  } {
    return {
      activeRequests: this.getActiveRequests(),
      activeAgents: this.getActiveAgents(),
      latestHeartbeat: this.buildHeartbeat(),
    };
  }

  listActiveRequestSnapshots(): RequestUsageSnapshot[] {
    return logger.getActiveRequestSnapshots();
  }

  recordActivityBatch(params: {
    userId: string;
    count: number;
    events: Array<{ eventType: string; path: string; element?: string | null }>;
  }): void {
    const now = Date.now();
    this.activityEvents.push(now);
    this.pruneBuckets(now);

    for (const activity of params.events.slice(0, 20)) {
      this.recordEvent({
        id: monitorId('activity'),
        timestamp: new Date(now).toISOString(),
        kind: 'activity',
        severity: 'info',
        category: 'ACTIVITY',
        title: activity.eventType,
        message: `${activity.eventType} ${activity.path}`,
        metadata: {
          userId: params.userId,
          element: activity.element || undefined,
          batchCount: params.count,
        },
        line: `[${new Date(now).toISOString()}] [INFO] [ACTIVITY] ${activity.eventType} ${activity.path}${activity.element ? ` element=${activity.element}` : ''}`,
      });
    }
  }

  recordAutofixRun(run: Omit<AutofixRun, 'id' | 'timestamp'> & { timestamp?: string }): AutofixRun {
    const savedRun: AutofixRun = {
      id: monitorId('autofix'),
      timestamp: run.timestamp || new Date().toISOString(),
      title: run.title,
      actionType: run.actionType,
      dryRun: run.dryRun,
      status: run.status,
      summary: run.summary,
      metadata: run.metadata,
    };

    this.autofixRuns.push(savedRun);
    if (this.autofixRuns.length > this.maxAutofixRuns) {
      this.autofixRuns.splice(0, this.autofixRuns.length - this.maxAutofixRuns);
    }

    this.recordEvent({
      id: monitorId('autofix_evt'),
      timestamp: savedRun.timestamp,
      kind: 'autofix',
      severity: savedRun.status === 'failed' ? 'error' : savedRun.dryRun ? 'info' : 'warn',
      category: 'AUTOFIX',
      title: savedRun.title,
      message: savedRun.summary,
      metadata: {
        actionType: savedRun.actionType,
        dryRun: savedRun.dryRun,
        status: savedRun.status,
        ...(savedRun.metadata || {}),
      },
      line: `[${savedRun.timestamp}] [${savedRun.status === 'failed' ? 'ERROR' : 'INFO'}] [AUTOFIX] ${savedRun.summary}`,
    });

    return savedRun;
  }
}

export const opsMonitor = new OpsMonitorService();
