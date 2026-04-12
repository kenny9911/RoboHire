/**
 * Admin Agent Manager
 *
 * Mounted at `/api/v1/agent-manager` by `backend/src/index.ts`. The mount
 * point enforces `requireAuth + requireAdminOrInternal`, so every handler
 * can assume the caller is at least internal-role. Mutating handlers then
 * stack `requireAdmin` inline, giving internal users a read-only slice.
 *
 * Spec: docs/admin-agent-manager-prd.md §5 Track B + §4 Phase 4.
 *
 * Endpoints:
 *   GET    /agents                          fleet agents list (filterable)
 *   GET    /runs                            fleet runs list (filterable)
 *   GET    /cost-rollup                     cost panel data (today/7d/30d)
 *   GET    /summary                         header health summary card
 *   POST   /runs/sweep                      [admin] trigger watchdog on demand
 *   POST   /runs/:runId/cancel              [admin] force cancel one run
 *   POST   /runs/:runId/mark-failed         [admin] manual reap with reason
 *   POST   /agents/:id/pause                [admin] pause agent
 *   POST   /agents/:id/unpause              [admin] unpause agent
 *   POST   /agents/:id/run                  [admin] force a fresh run (re-run)
 *   DELETE /agents/:id                      [admin] delete agent
 *   POST   /bulk                            [admin] bulk action dispatcher
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/admin.js';
import { agentActivityLogger } from '../services/AgentActivityLogger.js';
import { agentRunWatchdog } from '../services/AgentRunWatchdogService.js';
import { startAgentRun, cancelAgentRun } from '../services/AgentRunService.js';

const router = Router();

// "Stale" = no heartbeat for the same threshold the watchdog uses. The
// admin manager flags rows as stale slightly before the watchdog reaps them
// so admins can see them coming and intervene if needed.
const STALE_MINUTES = Number(process.env.AGENT_RUN_STALE_MINUTES ?? 20);
const STALE_DISPLAY_MINUTES = Math.max(5, STALE_MINUTES - 10); // show in UI ~10m before reap

function isStale(lastHeartbeatAt: Date | null, startedAt: Date | null): boolean {
  const ref = lastHeartbeatAt ?? startedAt;
  if (!ref) return false;
  return Date.now() - ref.getTime() > STALE_DISPLAY_MINUTES * 60_000;
}

function parseIntSafe(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// ── GET /summary ────────────────────────────────────────────────────────────
// Single round-trip for the page header card. Returns counts that the
// frontend uses for the "152 agents · 12 active runs · 3 stale" line plus
// today's spend rollup.
router.get('/summary', async (_req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const staleCutoff = new Date(Date.now() - STALE_DISPLAY_MINUTES * 60_000);

    const [totalAgents, activeAgents, totalRuns, liveRuns, staleRuns, todayAgg] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { status: 'active' } }),
      prisma.agentRun.count(),
      prisma.agentRun.count({ where: { status: { in: ['queued', 'running'] } } }),
      prisma.agentRun.count({
        where: {
          status: { in: ['queued', 'running'] },
          OR: [
            { lastHeartbeatAt: { lt: staleCutoff } },
            { lastHeartbeatAt: null, startedAt: { lt: staleCutoff } },
          ],
        },
      }),
      prisma.agentRun.aggregate({
        where: { createdAt: { gte: startOfToday } },
        _count: { _all: true },
        _sum: { costUsd: true, tokensIn: true, tokensOut: true },
      }),
    ]);

    res.json({
      data: {
        totalAgents,
        activeAgents,
        totalRuns,
        liveRuns,
        staleRuns,
        today: {
          runs: todayAgg._count._all,
          costUsd: todayAgg._sum.costUsd ?? 0,
          tokensIn: todayAgg._sum.tokensIn ?? 0,
          tokensOut: todayAgg._sum.tokensOut ?? 0,
        },
        thresholds: {
          staleDisplayMinutes: STALE_DISPLAY_MINUTES,
          watchdogStaleMinutes: STALE_MINUTES,
        },
      },
    });
  } catch (err) {
    console.error('admin agent-manager summary failed:', err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

// ── GET /agents ─────────────────────────────────────────────────────────────
// Fleet-wide agent list. Filters: ownerId, status, calibrationState,
// taskType, hasStuckRun, q (name search), sort, page, limit.
router.get('/agents', async (req, res) => {
  try {
    const { ownerId, status, calibrationState, taskType, hasStuckRun, q } = req.query;
    const limit = parseIntSafe(req.query.limit, 25, 1, 200);
    const page = parseIntSafe(req.query.page, 1, 1, 10_000);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (typeof ownerId === 'string' && ownerId) where.userId = ownerId;
    if (typeof status === 'string' && status) where.status = status;
    if (typeof calibrationState === 'string' && calibrationState) where.calibrationState = calibrationState;
    if (typeof taskType === 'string' && taskType) where.taskType = taskType;
    if (typeof q === 'string' && q.trim()) {
      where.OR = [
        { name: { contains: q.trim(), mode: 'insensitive' } },
        { description: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          job: { select: { id: true, title: true } },
          _count: { select: { candidates: true, runs: true } },
        },
      }),
      prisma.agent.count({ where }),
    ]);

    // Look up the most-recent live run per agent in one round-trip so we can
    // flag the "has stuck run" badge on the row without an N+1.
    const ids = rows.map((r) => r.id);
    const liveRuns =
      ids.length === 0
        ? []
        : await prisma.agentRun.findMany({
            where: { agentId: { in: ids }, status: { in: ['queued', 'running'] } },
            select: {
              id: true,
              agentId: true,
              status: true,
              startedAt: true,
              lastHeartbeatAt: true,
              createdAt: true,
            },
          });
    const liveByAgent = new Map<string, (typeof liveRuns)[number]>();
    for (const r of liveRuns) {
      const existing = liveByAgent.get(r.agentId);
      if (!existing || r.createdAt > existing.createdAt) liveByAgent.set(r.agentId, r);
    }

    const agents = rows.map((a) => {
      const live = liveByAgent.get(a.id) ?? null;
      const stale = live ? isStale(live.lastHeartbeatAt, live.startedAt) : false;
      return {
        ...a,
        liveRun: live,
        hasStuckRun: stale,
      };
    });

    let filtered = agents;
    if (hasStuckRun === 'true') filtered = agents.filter((a) => a.hasStuckRun);

    res.json({
      data: filtered,
      pagination: {
        total: hasStuckRun === 'true' ? filtered.length : total,
        page,
        limit,
        totalPages: Math.ceil((hasStuckRun === 'true' ? filtered.length : total) / limit),
      },
    });
  } catch (err) {
    console.error('admin agent-manager /agents failed:', err);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// ── GET /runs ───────────────────────────────────────────────────────────────
// Fleet-wide run list. Filters: status, ownerId, agentId, durationOverSec,
// costOverUsd, startedAfter, startedBefore, q (agent name).
router.get('/runs', async (req, res) => {
  try {
    const { status, ownerId, agentId, durationOverSec, costOverUsd, startedAfter, startedBefore, stale } = req.query;
    const limit = parseIntSafe(req.query.limit, 50, 1, 500);
    const page = parseIntSafe(req.query.page, 1, 1, 10_000);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (typeof status === 'string' && status) where.status = status;
    if (typeof agentId === 'string' && agentId) where.agentId = agentId;
    if (typeof ownerId === 'string' && ownerId) where.agent = { userId: ownerId };
    if (typeof durationOverSec === 'string') {
      const d = parseInt(durationOverSec, 10);
      if (Number.isFinite(d)) where.durationMs = { gte: d * 1000 };
    }
    if (typeof costOverUsd === 'string') {
      const c = Number(costOverUsd);
      if (Number.isFinite(c)) where.costUsd = { gte: c };
    }
    const startedFilter: Record<string, Date> = {};
    if (typeof startedAfter === 'string' && startedAfter) {
      const d = new Date(startedAfter);
      if (!Number.isNaN(d.getTime())) startedFilter.gte = d;
    }
    if (typeof startedBefore === 'string' && startedBefore) {
      const d = new Date(startedBefore);
      if (!Number.isNaN(d.getTime())) startedFilter.lte = d;
    }
    if (Object.keys(startedFilter).length > 0) where.startedAt = startedFilter;

    const [rows, total] = await Promise.all([
      prisma.agentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              taskType: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
          _count: { select: { candidates: true, activities: true } },
        },
      }),
      prisma.agentRun.count({ where }),
    ]);

    const enriched = rows.map((r) => ({
      ...r,
      stale: r.status === 'queued' || r.status === 'running' ? isStale(r.lastHeartbeatAt, r.startedAt) : false,
    }));

    // Stale-only filter applied post-query (the SQL would otherwise need an
    // OR with the same cutoff; cheaper to filter the page rows here).
    const filtered = stale === 'true' ? enriched.filter((r) => r.stale) : enriched;

    res.json({
      data: filtered,
      pagination: {
        total: stale === 'true' ? filtered.length : total,
        page,
        limit,
        totalPages: Math.ceil((stale === 'true' ? filtered.length : total) / limit),
      },
    });
  } catch (err) {
    console.error('admin agent-manager /runs failed:', err);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// ── GET /cost-rollup ────────────────────────────────────────────────────────
// Cost panel data. Default window is 7d (Q3 answer). `window=today|7d|30d`.
router.get('/cost-rollup', async (req, res) => {
  try {
    const window = (req.query.window as string) || '7d';
    const now = new Date();
    let since: Date;
    if (window === 'today') {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (window === '30d') {
      since = new Date(Date.now() - 30 * 86400_000);
    } else {
      since = new Date(Date.now() - 7 * 86400_000);
    }

    // Fetch all runs in the window once; group in app code so we can compute
    // multiple rollups (by user, by agent, by day) without three queries.
    const runs = await prisma.agentRun.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        agentId: true,
        costUsd: true,
        tokensIn: true,
        tokensOut: true,
        llmCallCount: true,
        createdAt: true,
        agent: {
          select: {
            id: true,
            name: true,
            taskType: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const totals = runs.reduce(
      (acc, r) => {
        acc.runs++;
        acc.costUsd += r.costUsd ?? 0;
        acc.tokensIn += r.tokensIn ?? 0;
        acc.tokensOut += r.tokensOut ?? 0;
        acc.llmCallCount += r.llmCallCount ?? 0;
        return acc;
      },
      { runs: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, llmCallCount: 0 },
    );

    // By user
    const byUserMap = new Map<string, { userId: string; name: string | null; email: string; runs: number; costUsd: number; tokens: number }>();
    for (const r of runs) {
      const u = r.agent.user;
      const k = u.id;
      const e = byUserMap.get(k) ?? { userId: u.id, name: u.name, email: u.email, runs: 0, costUsd: 0, tokens: 0 };
      e.runs++;
      e.costUsd += r.costUsd ?? 0;
      e.tokens += (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
      byUserMap.set(k, e);
    }
    const byUser = Array.from(byUserMap.values()).sort((a, b) => b.costUsd - a.costUsd);

    // By agent
    const byAgentMap = new Map<string, { agentId: string; name: string; ownerEmail: string; runs: number; costUsd: number; tokens: number }>();
    for (const r of runs) {
      const k = r.agent.id;
      const e = byAgentMap.get(k) ?? {
        agentId: r.agent.id,
        name: r.agent.name,
        ownerEmail: r.agent.user.email,
        runs: 0,
        costUsd: 0,
        tokens: 0,
      };
      e.runs++;
      e.costUsd += r.costUsd ?? 0;
      e.tokens += (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
      byAgentMap.set(k, e);
    }
    const byAgent = Array.from(byAgentMap.values()).sort((a, b) => b.costUsd - a.costUsd);

    // By day (for the trend chart)
    const byDayMap = new Map<string, { date: string; runs: number; costUsd: number; tokens: number }>();
    for (const r of runs) {
      const d = r.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const e = byDayMap.get(key) ?? { date: key, runs: 0, costUsd: 0, tokens: 0 };
      e.runs++;
      e.costUsd += r.costUsd ?? 0;
      e.tokens += (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
      byDayMap.set(key, e);
    }
    const byDay = Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      data: {
        window,
        since: since.toISOString(),
        totals,
        byUser: byUser.slice(0, 50),
        byAgent: byAgent.slice(0, 50),
        byDay,
      },
    });
  } catch (err) {
    console.error('admin agent-manager /cost-rollup failed:', err);
    res.status(500).json({ error: 'Failed to compute cost rollup' });
  }
});

// ── POST /runs/sweep ────────────────────────────────────────────────────────
// On-demand watchdog trigger. Same code path as the cron — bounded, idempotent.
router.post('/runs/sweep', requireAdmin, async (_req, res) => {
  try {
    const result = await agentRunWatchdog.runtimeSweep();
    res.json({ data: result });
  } catch (err) {
    console.error('admin agent-manager sweep failed:', err);
    res.status(500).json({ error: 'Sweep failed' });
  }
});

// ── POST /runs/:runId/cancel ────────────────────────────────────────────────
// Admin force cancel — same DB-backed cancel as the user endpoint, but
// without the per-agent visibility check (admins see all).
router.post('/runs/:runId/cancel', requireAdmin, async (req, res) => {
  try {
    const run = await prisma.agentRun.findUnique({
      where: { id: req.params.runId },
      select: { id: true, agentId: true, status: true },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'running' && run.status !== 'queued') {
      return res.status(400).json({ error: `Cannot cancel run in status: ${run.status}` });
    }

    await prisma.agentRun.updateMany({
      where: { id: run.id, status: { in: ['queued', 'running'] } },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        error: `Admin force-cancel by user:${req.user!.id}`,
      },
    });
    void agentActivityLogger.log({
      agentId: run.agentId,
      runId: run.id,
      actor: `user:${req.user!.id}`,
      eventType: 'run.cancelled',
      severity: 'warn',
      message: 'Admin force-cancel from agent manager',
    });
    const aborted = cancelAgentRun(run.id);
    res.json({ data: { cancelled: true, abortedInMemory: aborted } });
  } catch (err) {
    console.error('admin agent-manager cancel failed:', err);
    res.status(500).json({ error: 'Cancel failed' });
  }
});

// ── POST /runs/:runId/mark-failed ───────────────────────────────────────────
// Manual reap with reason — for runs that are stuck but the executor is
// gone (e.g. process restarted, in-memory abort would be a no-op).
router.post('/runs/:runId/mark-failed', requireAdmin, async (req, res) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    const run = await prisma.agentRun.findUnique({
      where: { id: req.params.runId },
      select: { id: true, agentId: true, status: true },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'running' && run.status !== 'queued') {
      return res.status(400).json({ error: `Cannot mark-failed run in status: ${run.status}` });
    }

    await prisma.agentRun.updateMany({
      where: { id: run.id, status: { in: ['queued', 'running'] } },
      data: {
        status: 'failed',
        completedAt: new Date(),
        error: `Admin mark-failed: ${reason}`,
        swept: true,
        sweepReason: 'admin',
      },
    });
    void agentActivityLogger.log({
      agentId: run.agentId,
      runId: run.id,
      actor: `user:${req.user!.id}`,
      eventType: 'agent.run.swept',
      severity: 'warn',
      message: `Admin mark-failed: ${reason}`,
      payload: { reason: 'admin', adminReason: reason },
    });
    res.json({ data: { ok: true } });
  } catch (err) {
    console.error('admin agent-manager mark-failed failed:', err);
    res.status(500).json({ error: 'Mark-failed failed' });
  }
});

// ── POST /agents/:id/pause | unpause ────────────────────────────────────────
router.post('/agents/:id/pause', requireAdmin, async (req, res) => {
  try {
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: { status: 'paused' },
    });
    void agentActivityLogger.log({
      agentId: agent.id,
      actor: `user:${req.user!.id}`,
      eventType: 'agent.paused',
      message: 'Paused from admin agent manager',
    });
    res.json({ data: agent });
  } catch (err) {
    console.error('admin agent-manager pause failed:', err);
    res.status(500).json({ error: 'Pause failed' });
  }
});

router.post('/agents/:id/unpause', requireAdmin, async (req, res) => {
  try {
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: { status: 'active' },
    });
    void agentActivityLogger.log({
      agentId: agent.id,
      actor: `user:${req.user!.id}`,
      eventType: 'agent.unpaused',
      message: 'Unpaused from admin agent manager',
    });
    res.json({ data: agent });
  } catch (err) {
    console.error('admin agent-manager unpause failed:', err);
    res.status(500).json({ error: 'Unpause failed' });
  }
});

// ── POST /agents/:id/run ────────────────────────────────────────────────────
// Force re-run — admin trigger that bypasses calibration gating. Uses the
// same startAgentRun() machinery as user-triggered runs.
router.post('/agents/:id/run', requireAdmin, async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Concurrency: refuse to start a second run if one is already in flight.
    const existing = await prisma.agentRun.findFirst({
      where: { agentId: agent.id, status: { in: ['queued', 'running'] } },
      select: { id: true, status: true },
    });
    if (existing) {
      return res.status(409).json({
        error: `Agent already has a ${existing.status} run`,
        runId: existing.id,
      });
    }

    const { runId } = await startAgentRun({
      agentId: agent.id,
      triggeredBy: 'user',
      triggeredById: req.user!.id,
    });
    res.json({ data: { runId } });
  } catch (err) {
    console.error('admin agent-manager force-run failed:', err);
    res.status(500).json({ error: 'Force-run failed' });
  }
});

// ── DELETE /agents/:id ──────────────────────────────────────────────────────
router.delete('/agents/:id', requireAdmin, async (req, res) => {
  try {
    // Cancel any in-flight run first so we don't leave the executor poking
    // at a row that's about to be cascade-deleted.
    const live = await prisma.agentRun.findMany({
      where: { agentId: req.params.id, status: { in: ['queued', 'running'] } },
      select: { id: true },
    });
    for (const r of live) {
      cancelAgentRun(r.id);
      await prisma.agentRun.updateMany({
        where: { id: r.id, status: { in: ['queued', 'running'] } },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          error: `Cancelled by admin delete (user:${req.user!.id})`,
        },
      });
    }
    await prisma.agent.delete({ where: { id: req.params.id } });
    res.json({ data: { ok: true } });
  } catch (err) {
    console.error('admin agent-manager delete failed:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ── POST /bulk ──────────────────────────────────────────────────────────────
// Convenience batch endpoint for the bulk action toolbar. Accepts:
//   { action: 'cancel'|'mark-failed'|'pause'|'unpause'|'delete'|'force-run',
//     ids: string[],            // run IDs for cancel/mark-failed; agent IDs otherwise
//     reason?: string }         // required for mark-failed
// Returns per-id success/failure so the UI can show partial results.
router.post('/bulk', requireAdmin, async (req, res) => {
  try {
    const { action, ids, reason } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids[] required' });
    }
    if (typeof action !== 'string') {
      return res.status(400).json({ error: 'action required' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Bulk capped at 100 ids per request' });
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const id of ids) {
      try {
        if (action === 'cancel') {
          const run = await prisma.agentRun.findUnique({ where: { id }, select: { id: true, agentId: true, status: true } });
          if (!run) throw new Error('run not found');
          if (run.status !== 'running' && run.status !== 'queued') throw new Error(`status ${run.status}`);
          await prisma.agentRun.updateMany({
            where: { id, status: { in: ['queued', 'running'] } },
            data: { status: 'cancelled', completedAt: new Date(), error: `Bulk cancel by user:${req.user!.id}` },
          });
          cancelAgentRun(id);
          void agentActivityLogger.log({
            agentId: run.agentId,
            runId: id,
            actor: `user:${req.user!.id}`,
            eventType: 'run.cancelled',
            severity: 'warn',
            message: 'Bulk cancel from admin agent manager',
          });
        } else if (action === 'mark-failed') {
          if (typeof reason !== 'string' || !reason.trim()) throw new Error('reason required');
          const run = await prisma.agentRun.findUnique({ where: { id }, select: { id: true, agentId: true, status: true } });
          if (!run) throw new Error('run not found');
          if (run.status !== 'running' && run.status !== 'queued') throw new Error(`status ${run.status}`);
          await prisma.agentRun.updateMany({
            where: { id, status: { in: ['queued', 'running'] } },
            data: {
              status: 'failed',
              completedAt: new Date(),
              error: `Admin mark-failed: ${reason.trim()}`,
              swept: true,
              sweepReason: 'admin',
            },
          });
          void agentActivityLogger.log({
            agentId: run.agentId,
            runId: id,
            actor: `user:${req.user!.id}`,
            eventType: 'agent.run.swept',
            severity: 'warn',
            message: `Bulk mark-failed: ${reason.trim()}`,
            payload: { reason: 'admin', adminReason: reason.trim() },
          });
        } else if (action === 'pause') {
          await prisma.agent.update({ where: { id }, data: { status: 'paused' } });
          void agentActivityLogger.log({ agentId: id, actor: `user:${req.user!.id}`, eventType: 'agent.paused', message: 'Bulk pause' });
        } else if (action === 'unpause') {
          await prisma.agent.update({ where: { id }, data: { status: 'active' } });
          void agentActivityLogger.log({ agentId: id, actor: `user:${req.user!.id}`, eventType: 'agent.unpaused', message: 'Bulk unpause' });
        } else if (action === 'delete') {
          const live = await prisma.agentRun.findMany({
            where: { agentId: id, status: { in: ['queued', 'running'] } },
            select: { id: true },
          });
          for (const r of live) {
            cancelAgentRun(r.id);
            await prisma.agentRun.updateMany({
              where: { id: r.id, status: { in: ['queued', 'running'] } },
              data: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by bulk delete' },
            });
          }
          await prisma.agent.delete({ where: { id } });
        } else if (action === 'force-run') {
          const existing = await prisma.agentRun.findFirst({
            where: { agentId: id, status: { in: ['queued', 'running'] } },
            select: { id: true },
          });
          if (existing) throw new Error(`already has live run ${existing.id}`);
          await startAgentRun({ agentId: id, triggeredBy: 'user', triggeredById: req.user!.id });
        } else {
          throw new Error(`unknown action: ${action}`);
        }
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    res.json({ data: { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length } });
  } catch (err) {
    console.error('admin agent-manager bulk failed:', err);
    res.status(500).json({ error: 'Bulk action failed' });
  }
});

export default router;
