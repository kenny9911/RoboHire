/**
 * AgentRunWatchdogService
 *
 * Reaps zombie AgentRun rows. Two entry points:
 *
 *   1. `bootSweep()` — called once on backend startup. Marks any run that
 *      was already in `running`/`queued` for longer than the boot threshold
 *      as `failed`. Necessary because the in-memory AbortController map and
 *      the executor itself live in process memory; a process restart leaves
 *      the DB row dangling forever.
 *
 *   2. `start()` — registers a node-cron job that runs every 2 minutes and
 *      sweeps any `running`/`queued` row whose `lastHeartbeatAt` has gone
 *      cold for longer than the runtime threshold. Catches mid-flight hangs
 *      that the boot sweep wouldn't see.
 *
 * Both code paths emit an `agent.run.swept` activity event and (per
 * admin-agent-manager-prd §11 Q5+Q6) drop an in-app notification on the
 * agent owner so they know their run died.
 *
 * See docs/admin-agent-manager-prd.md §5 (Track A1+A2+A3) for the design
 * rationale and chosen thresholds.
 */

import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { agentActivityLogger } from './AgentActivityLogger.js';
import { logger } from './LoggerService.js';

// Threshold knobs — kept in env so SRE can tune without a redeploy.
// Defaults match docs/admin-agent-manager-prd.md §11 Q1+Q2 (15 / 20 min).
const BOOT_SWEEP_MINUTES = Number(process.env.AGENT_RUN_BOOT_SWEEP_MINUTES ?? 15);
const RUNTIME_STALE_MINUTES = Number(process.env.AGENT_RUN_STALE_MINUTES ?? 20);
const WATCHDOG_CRON_EXPR = process.env.AGENT_RUN_WATCHDOG_CRON ?? '*/2 * * * *';

interface SweptRun {
  id: string;
  agentId: string;
  agentName: string;
  ownerUserId: string;
  startedAt: Date | null;
  lastHeartbeatAt: Date | null;
  reason: 'boot' | 'watchdog' | 'admin';
}

class AgentRunWatchdogService {
  private cronTask: ReturnType<typeof cron.schedule> | null = null;
  private running = false;

  /**
   * Boot-time sweep — runs once when the backend starts. Catches runs left
   * over from a previous process lifecycle (deploy, OOM kill, SIGKILL).
   */
  async bootSweep(): Promise<{ swept: number }> {
    return this.sweep('boot', BOOT_SWEEP_MINUTES, /* useStartedAt */ true);
  }

  /**
   * Cron sweep — runs every 2 minutes. Uses lastHeartbeatAt as the staleness
   * signal so a long-but-progressing run isn't reaped, while a hung process
   * mid-flight gets caught within ~22 minutes worst case.
   */
  start(): void {
    if (this.cronTask) return;
    if (!cron.validate(WATCHDOG_CRON_EXPR)) {
      logger.warn('AGENT_WATCHDOG', 'Invalid cron expression — falling back to */2 * * * *', {
        cron: WATCHDOG_CRON_EXPR,
      });
    }
    const expr = cron.validate(WATCHDOG_CRON_EXPR) ? WATCHDOG_CRON_EXPR : '*/2 * * * *';
    this.cronTask = cron.schedule(expr, () => {
      void this.runtimeSweep().catch((err) => {
        logger.error('AGENT_WATCHDOG', 'Cron sweep failed', { error: String(err) });
      });
    });
    logger.info('AGENT_WATCHDOG', 'Watchdog started', {
      cron: expr,
      runtimeStaleMinutes: RUNTIME_STALE_MINUTES,
      bootSweepMinutes: BOOT_SWEEP_MINUTES,
    });
  }

  stop(): void {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }
  }

  /** Public so the admin "Run sweep" endpoint can trigger it on demand. */
  async runtimeSweep(): Promise<{ swept: number }> {
    return this.sweep('watchdog', RUNTIME_STALE_MINUTES, /* useStartedAt */ false);
  }

  /**
   * Shared sweep implementation. Finds candidates, marks them failed inside
   * a single transaction-friendly updateMany, then walks the list to emit
   * activity events + notifications.
   *
   * `useStartedAt=true` (boot sweep) compares against `startedAt` because
   * `lastHeartbeatAt` may not yet exist on rows from before this column was
   * added. `useStartedAt=false` (runtime sweep) compares against
   * `lastHeartbeatAt` and falls back to `startedAt` for safety.
   */
  private async sweep(
    reason: 'boot' | 'watchdog' | 'admin',
    minutes: number,
    useStartedAt: boolean,
  ): Promise<{ swept: number }> {
    if (this.running) return { swept: 0 }; // re-entrancy guard
    this.running = true;
    try {
      const cutoff = new Date(Date.now() - minutes * 60_000);

      // Pull the candidate rows + the agent name + owner so we can notify.
      // Bounded at 200 per pass — if there's more than that, the next tick
      // will pick up the rest.
      const candidates = await prisma.agentRun.findMany({
        where: {
          status: { in: ['queued', 'running'] },
          ...(useStartedAt
            ? { OR: [{ startedAt: { lt: cutoff } }, { startedAt: null, createdAt: { lt: cutoff } }] }
            : {
                OR: [
                  { lastHeartbeatAt: { lt: cutoff } },
                  // Older rows that pre-date the heartbeat column won't have
                  // a value yet — fall back to startedAt to catch those too.
                  { lastHeartbeatAt: null, startedAt: { lt: cutoff } },
                ],
              }),
        },
        select: {
          id: true,
          agentId: true,
          startedAt: true,
          lastHeartbeatAt: true,
          agent: { select: { name: true, userId: true } },
        },
        take: 200,
      });

      if (candidates.length === 0) return { swept: 0 };

      const errorMessage =
        reason === 'boot'
          ? `Stale run detected on server restart (older than ${minutes}m)`
          : `Watchdog: no heartbeat for ${minutes}m`;

      const ids = candidates.map((c) => c.id);
      const completedAt = new Date();
      await prisma.agentRun.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'failed',
          completedAt,
          error: errorMessage,
          swept: true,
          sweepReason: reason,
        },
      });

      const swept: SweptRun[] = candidates.map((c) => ({
        id: c.id,
        agentId: c.agentId,
        agentName: c.agent.name,
        ownerUserId: c.agent.userId,
        startedAt: c.startedAt,
        lastHeartbeatAt: c.lastHeartbeatAt,
        reason,
      }));

      // Emit one activity event per swept run + one in-app notification per
      // owner. We deliberately fan out sequentially in small batches rather
      // than Promise.all everything to keep DB pressure low during a big
      // boot sweep on a recovering process.
      for (const r of swept) {
        try {
          await agentActivityLogger.log({
            agentId: r.agentId,
            runId: r.id,
            actor: 'system',
            eventType: 'agent.run.swept',
            severity: 'warn',
            message: errorMessage,
            payload: {
              reason: r.reason,
              startedAt: r.startedAt?.toISOString() ?? null,
              lastHeartbeatAt: r.lastHeartbeatAt?.toISOString() ?? null,
              thresholdMinutes: minutes,
            },
          });
        } catch (err) {
          logger.error('AGENT_WATCHDOG', 'Failed to log sweep activity', {
            runId: r.id,
            error: String(err),
          });
        }

        try {
          await prisma.notification.create({
            data: {
              userId: r.ownerUserId,
              type: 'agent_run_swept',
              title: `Agent run failed — "${r.agentName}"`,
              message: errorMessage,
              actionUrl: `/product/agents/${r.agentId}`,
            },
          });
        } catch (err) {
          logger.error('AGENT_WATCHDOG', 'Failed to notify owner', {
            runId: r.id,
            ownerUserId: r.ownerUserId,
            error: String(err),
          });
        }
      }

      logger.info('AGENT_WATCHDOG', 'Sweep complete', {
        reason,
        swept: swept.length,
        thresholdMinutes: minutes,
      });
      return { swept: swept.length };
    } finally {
      this.running = false;
    }
  }
}

export const agentRunWatchdog = new AgentRunWatchdogService();
