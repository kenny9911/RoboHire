/**
 * AgentActivityLogger
 *
 * Centralized durable audit log for the Agents Workbench.
 * All agent lifecycle events — run start/stop, sourcing, scoring, triage,
 * invitations, outreach, OpenClaw IM, errors — funnel through here so every
 * event has the same shape and every caller (backend, human, remote OpenClaw)
 * writes to the same table.
 *
 * Persists to `AgentActivityLog` in Neon and broadcasts to in-memory
 * EventEmitter channels so SSE subscribers can receive live updates.
 *
 * Event type taxonomy: see docs/agents-redesign-spec.md §5.3.
 */

import { EventEmitter } from 'node:events';
import prisma from '../lib/prisma.js';

export type ActivitySeverity = 'debug' | 'info' | 'warn' | 'error';

export interface ActivityEventInput {
  agentId: string;
  runId?: string | null;
  candidateId?: string | null;
  actor: string; // 'system' | 'user:<id>' | 'agent:<id>' | 'openclaw:<instanceId>'
  eventType: string;
  severity?: ActivitySeverity;
  message?: string;
  payload?: Record<string, unknown>;
  errorCode?: string;
  errorStack?: string;
  /** Monotonic per-run sequence; derived from payload.sequence if omitted. */
  sequence?: number;
}

export interface PersistedActivityEvent {
  id: string;
  agentId: string;
  runId: string | null;
  candidateId: string | null;
  actor: string;
  eventType: string;
  severity: string;
  message: string | null;
  payload: unknown;
  sequence: number;
  errorCode: string | null;
  errorStack: string | null;
  createdAt: Date;
}

class AgentActivityLogger {
  readonly bus = new EventEmitter();

  constructor() {
    // SSE subscribers can stack; no default listener cap.
    this.bus.setMaxListeners(0);
  }

  /**
   * Persist an activity event and broadcast it to in-memory subscribers.
   * Fire-and-forget safe: errors are logged but never thrown.
   */
  async log(event: ActivityEventInput): Promise<PersistedActivityEvent | null> {
    try {
      // Derive sequence from payload.sequence if the caller didn't pass one.
      const sequence =
        event.sequence ??
        (typeof event.payload?.sequence === 'number' ? event.payload.sequence : 0);

      const row = await prisma.agentActivityLog.create({
        data: {
          agentId: event.agentId,
          runId: event.runId ?? null,
          candidateId: event.candidateId ?? null,
          actor: event.actor,
          eventType: event.eventType,
          severity: event.severity ?? 'info',
          message: event.message ?? null,
          payload: (event.payload ?? undefined) as object | undefined,
          sequence,
          errorCode: event.errorCode ?? null,
          errorStack: event.errorStack ?? null,
        },
      });

      // Heartbeat: any event with a runId means the executor is still alive
      // and progressing, so refresh AgentRun.lastHeartbeatAt. The watchdog
      // service uses this column to detect zombies. Best-effort — we don't
      // want a heartbeat write failure to block the activity log itself.
      if (event.runId) {
        prisma.agentRun
          .updateMany({
            where: { id: event.runId, status: { in: ['queued', 'running'] } },
            data: { lastHeartbeatAt: new Date() },
          })
          .catch((err: unknown) => {
            console.error('AgentActivityLogger heartbeat write failed:', err);
          });
      }

      const persisted: PersistedActivityEvent = {
        id: row.id,
        agentId: row.agentId,
        runId: row.runId,
        candidateId: row.candidateId,
        actor: row.actor,
        eventType: row.eventType,
        severity: row.severity,
        message: row.message,
        payload: row.payload,
        sequence: row.sequence,
        errorCode: row.errorCode,
        errorStack: row.errorStack,
        createdAt: row.createdAt,
      };

      // Broadcast on two channels so subscribers can pick their scope.
      this.bus.emit(`agent:${event.agentId}`, persisted);
      if (event.runId) this.bus.emit(`run:${event.runId}`, persisted);
      // Global broadcast for the admin terminal (Phase 5).
      this.bus.emit('all', persisted);

      return persisted;
    } catch (err) {
      console.error('AgentActivityLogger.log failed:', err);
      return null;
    }
  }

  subscribeToRun(runId: string, handler: (event: PersistedActivityEvent) => void): () => void {
    const channel = `run:${runId}`;
    this.bus.on(channel, handler);
    return () => this.bus.off(channel, handler);
  }

  subscribeToAgent(agentId: string, handler: (event: PersistedActivityEvent) => void): () => void {
    const channel = `agent:${agentId}`;
    this.bus.on(channel, handler);
    return () => this.bus.off(channel, handler);
  }

  /** Subscribe to the firehose of every agent event in the system. Admin only. */
  subscribeToAll(handler: (event: PersistedActivityEvent) => void): () => void {
    this.bus.on('all', handler);
    return () => this.bus.off('all', handler);
  }
}

export const agentActivityLogger = new AgentActivityLogger();
