/**
 * Admin-only realtime terminal window for the Agents Workbench.
 *
 * Phase 5. Mounted under /api/v1/admin/agents-terminal/* — the parent admin
 * router already enforces requireAuth + requireAdmin.
 *
 * Endpoints:
 *   GET /history?limit=200         — initial backfill: most recent N events
 *                                     across every agent in the system.
 *   GET /stream                    — SSE. Subscribes to AgentActivityLogger
 *                                     global bus; streams every event as it
 *                                     lands with the agent name joined in.
 *   GET /runs?limit=50             — sorted list of recent AgentRuns with
 *                                     token/cost/latency for the admin to
 *                                     drill into specific runs.
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { agentActivityLogger, type PersistedActivityEvent } from '../services/AgentActivityLogger.js';

const router = Router();

// ── History backfill ────────────────────────────────────────────────────────

router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '200')) || 200, 1000);
    const events = await prisma.agentActivityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        agent: { select: { id: true, name: true } },
      },
    });
    // Reverse so the client renders oldest→newest naturally
    res.json({ data: events.reverse() });
  } catch (err) {
    console.error('Failed to load terminal history:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// ── SSE firehose ────────────────────────────────────────────────────────────

router.get('/stream', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send a connect marker so the frontend knows it's live.
    send('connected', { at: new Date().toISOString() });

    // Cache agent names so we only hit the DB once per agent during a session.
    const agentNameCache = new Map<string, string>();
    const resolveAgentName = async (agentId: string): Promise<string> => {
      if (agentNameCache.has(agentId)) return agentNameCache.get(agentId) ?? agentId;
      const a = await prisma.agent
        .findUnique({ where: { id: agentId }, select: { name: true } })
        .catch(() => null);
      const name = a?.name ?? agentId;
      agentNameCache.set(agentId, name);
      return name;
    };

    const unsubscribe = agentActivityLogger.subscribeToAll((event: PersistedActivityEvent) => {
      void (async () => {
        try {
          const agentName = await resolveAgentName(event.agentId);
          send('event', { ...event, agentName });
        } catch {
          /* ignore individual event failures */
        }
      })();
    });

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (err) {
    console.error('Terminal stream failed:', err);
    res.status(500).end();
  }
});

// ── Recent runs table (for the sidebar in the terminal UI) ──────────────────

router.get('/runs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')) || 50, 200);
    const runs = await prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        agent: { select: { id: true, name: true, userId: true, user: { select: { name: true, email: true } } } },
        _count: { select: { candidates: true, activities: true } },
      },
    });
    res.json({ data: runs });
  } catch (err) {
    console.error('Failed to load recent runs:', err);
    res.status(500).json({ error: 'Failed to load runs' });
  }
});

export default router;
