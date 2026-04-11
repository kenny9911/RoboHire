/**
 * AgentSchedulerService
 *
 * Phase 4 — in-process scheduler that fires agent runs on cron expressions.
 * Uses `node-cron`. Single-process safe; a DB-lock guard (UPDATE…WHERE
 * lastRunAt < NOW() - 30s) prevents double-fire when horizontal scaling is
 * added later.
 *
 * Lifecycle:
 *   1. `init()` on boot — loads all Agents where scheduleEnabled=true and
 *      registers a cron task for each. Also runs a missed-run catch-up pass
 *      for any agent whose `nextRunAt < now()`.
 *   2. `register(agent)` — called by routes/agents.ts after POST/PATCH so a
 *      schedule change takes effect immediately without a restart.
 *   3. `unregister(agentId)` — called on DELETE or when scheduleEnabled
 *      becomes false.
 *   4. `shutdown()` — called on SIGTERM/SIGINT to stop all tasks cleanly.
 *
 * Every fire emits activity events via AgentActivityLogger so the admin
 * terminal sees scheduled triggers identically to user-initiated ones.
 */

import cron, { type ScheduledTask } from 'node-cron';
import prisma from '../lib/prisma.js';
import { startAgentRun } from './AgentRunService.js';
import { agentActivityLogger } from './AgentActivityLogger.js';

interface RegisteredJob {
  agentId: string;
  cron: string;
  task: ScheduledTask;
}

const DOUBLE_FIRE_GUARD_SECONDS = 30;

class AgentSchedulerService {
  private jobs = new Map<string, RegisteredJob>();
  private booted = false;

  /** Boot-time initialization. Loads scheduled agents + runs missed-run catch-up. */
  async init(): Promise<void> {
    if (this.booted) return;
    this.booted = true;

    const agents = await prisma.agent.findMany({
      where: { scheduleEnabled: true, status: 'active' },
      select: { id: true, name: true, schedule: true, nextRunAt: true, userId: true },
    });

    console.log(`[AgentScheduler] Registering ${agents.length} scheduled agent(s) on boot`);

    for (const a of agents) {
      if (!a.schedule) continue;
      this.register({ id: a.id, schedule: a.schedule, scheduleEnabled: true });
    }

    // Missed-run catch-up: if the server was down when a scheduled run was
    // supposed to fire, run it once now.
    const now = new Date();
    const missed = agents.filter((a) => a.nextRunAt && a.nextRunAt < now);
    for (const a of missed) {
      console.log(`[AgentScheduler] Catch-up firing missed run for agent ${a.id}`);
      void this.fire(a.id, 'missed-catch-up');
    }
  }

  /**
   * Register or re-register a cron job for an agent. Called from routes when
   * an agent is created or updated with a new schedule.
   */
  register(agent: { id: string; schedule: string | null; scheduleEnabled: boolean }): void {
    // Unregister any existing job for this agent first (re-registration case)
    this.unregister(agent.id);

    if (!agent.scheduleEnabled || !agent.schedule) return;
    if (!cron.validate(agent.schedule)) {
      console.error(`[AgentScheduler] Invalid cron for agent ${agent.id}: ${agent.schedule}`);
      return;
    }

    const task = cron.schedule(
      agent.schedule,
      () => {
        void this.fire(agent.id, 'cron-tick');
      },
      { timezone: process.env.SCHEDULER_TZ || 'UTC' },
    );

    this.jobs.set(agent.id, { agentId: agent.id, cron: agent.schedule, task });
    console.log(`[AgentScheduler] Registered ${agent.id} @ "${agent.schedule}"`);
  }

  /** Stop and forget the cron task for an agent. */
  unregister(agentId: string): void {
    const job = this.jobs.get(agentId);
    if (!job) return;
    try {
      job.task.stop();
      // v4 API uses destroy(), older uses stop() only
      if (typeof (job.task as unknown as { destroy?: () => void }).destroy === 'function') {
        (job.task as unknown as { destroy: () => void }).destroy();
      }
    } catch (err) {
      console.error(`[AgentScheduler] Error stopping job ${agentId}:`, err);
    }
    this.jobs.delete(agentId);
    console.log(`[AgentScheduler] Unregistered ${agentId}`);
  }

  /**
   * Fire a single run. Applies a DB-lock guard so that if multiple backend
   * processes share the same database, only one of them will actually run
   * the job on this tick. In single-process dev, the guard is effectively
   * a no-op other than updating lastRunAt.
   */
  private async fire(agentId: string, reason: string): Promise<void> {
    try {
      // Double-fire guard: only run if nobody else has just run this agent.
      const cutoff = new Date(Date.now() - DOUBLE_FIRE_GUARD_SECONDS * 1000);
      const result = await prisma.agent.updateMany({
        where: {
          id: agentId,
          OR: [{ lastRunAt: null }, { lastRunAt: { lt: cutoff } }],
        },
        data: { lastRunAt: new Date() },
      });
      if (result.count === 0) {
        console.log(`[AgentScheduler] Skipping ${agentId} — another tick won the lock`);
        return;
      }

      await agentActivityLogger.log({
        agentId,
        actor: 'schedule',
        eventType: 'run.queued',
        message: `Scheduled trigger (${reason})`,
      });

      await startAgentRun({
        agentId,
        triggeredBy: 'schedule',
        triggeredById: reason,
      });
    } catch (err) {
      console.error(`[AgentScheduler] Failed to fire ${agentId}:`, err);
      await agentActivityLogger
        .log({
          agentId,
          actor: 'schedule',
          eventType: 'error.validation',
          severity: 'error',
          message: 'Scheduler failed to dispatch a run',
          errorStack: err instanceof Error ? err.stack : undefined,
        })
        .catch(() => {});
    }
  }

  /** Graceful shutdown — stops all cron tasks. */
  shutdown(): void {
    console.log(`[AgentScheduler] Shutting down (${this.jobs.size} registered jobs)`);
    for (const job of this.jobs.values()) {
      try {
        job.task.stop();
      } catch {
        /* ignore */
      }
    }
    this.jobs.clear();
  }

  /** Debug helper — list all currently-registered jobs. */
  list(): Array<{ agentId: string; cron: string }> {
    return Array.from(this.jobs.values()).map((j) => ({
      agentId: j.agentId,
      cron: j.cron,
    }));
  }

  /** Manual trigger — returns true if the agent was fired. */
  async triggerNow(agentId: string): Promise<boolean> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) return false;
    await this.fire(agentId, 'manual-trigger');
    return true;
  }
}

export const agentScheduler = new AgentSchedulerService();
