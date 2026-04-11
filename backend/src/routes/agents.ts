import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getVisibilityScope, buildUserIdFilter, buildAdminOverrideFilter } from '../lib/teamVisibility.js';
import { startAgentRun, cancelAgentRun } from '../services/AgentRunService.js';
import { agentActivityLogger, type PersistedActivityEvent } from '../services/AgentActivityLogger.js';
import { agentScheduler } from '../services/AgentSchedulerService.js';
import { idealProfileService, extractHardRequirements } from '../services/IdealProfileService.js';
import {
  validateHardRequirement,
  applyHardRequirements,
  topRejectionReasons,
  type HardRequirement,
  type HRResumeInput,
} from '../lib/hardRequirementsFilter.js';
import '../types/auth.js';

const router = Router();

// Token usage and dollar cost are admin-only data — scrub them from responses
// going to non-admin recruiters. Latency stays visible (it's not sensitive
// and is useful for everyone diagnosing slow runs).
const SENSITIVE_RUN_FIELDS = ['tokensIn', 'tokensOut', 'costUsd', 'llmCallCount', 'avgLatencyMs'] as const;
const SENSITIVE_PAYLOAD_FIELDS = ['tokensIn', 'tokensOut', 'costUsd', 'model', 'provider'] as const;

function isAdmin(user: { role?: string | null } | undefined): boolean {
  return user?.role === 'admin';
}

function scrubRunStats<T extends Record<string, unknown> | null | undefined>(
  run: T,
  user: { role?: string | null } | undefined,
): T {
  if (!run || isAdmin(user)) return run;
  const clone = { ...run } as Record<string, unknown>;
  for (const f of SENSITIVE_RUN_FIELDS) delete clone[f];
  return clone as T;
}

function scrubActivityRow<T extends { eventType?: string; payload?: unknown } | null | undefined>(
  row: T,
  user: { role?: string | null } | undefined,
): T {
  if (!row || isAdmin(user)) return row;
  if (row.eventType !== 'llm.call.completed' && row.eventType !== 'llm.call.started' && row.eventType !== 'run.completed') {
    return row;
  }
  if (!row.payload || typeof row.payload !== 'object') return row;
  const cleanPayload = { ...(row.payload as Record<string, unknown>) };
  for (const f of SENSITIVE_PAYLOAD_FIELDS) delete cleanPayload[f];
  return { ...row, payload: cleanPayload };
}

async function buildAgentAccessWhere(
  user: { id: string; role?: string | null; teamId?: string | null },
  agentId: string
): Promise<Record<string, unknown>> {
  const scope = await getVisibilityScope(
    {
      id: user.id,
      role: user.role ?? undefined,
      teamId: user.teamId ?? null,
    },
    true
  );
  return { id: agentId, ...buildUserIdFilter(scope) };
}

// ── List jobs the caller may scope an agent to ──
// Recruiter/team/internal: own jobs (respecting teamView) — status 'open' or 'published'
// Admin: every open job in the system
router.get('/jobs-available', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { q, limit = '50' } = req.query;
    const scope = await getVisibilityScope(user);
    const userFilter = buildUserIdFilter(scope);

    const where: any = {
      ...userFilter,
      status: { in: ['open', 'published', 'active'] },
    };
    if (q && typeof q === 'string' && q.trim()) {
      where.title = { contains: q.trim(), mode: 'insensitive' };
    }

    const take = Math.min(parseInt(limit as string) || 50, 200);

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        userId: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({
      data: jobs,
      meta: {
        isAdmin: scope.isAdmin,
        scope: scope.isAdmin ? 'all' : 'own',
      },
    });
  } catch (err) {
    console.error('Failed to list jobs-available:', err);
    res.status(500).json({ error: 'Failed to list available jobs' });
  }
});

// ── List agents ──
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { status, taskType, createdBefore, createdAfter, limit = '20', page = '1', filterUserId, filterTeamId, teamView } = req.query;

    const scope = await getVisibilityScope(user, teamView === 'true');
    const userFilter = await buildAdminOverrideFilter(scope, filterUserId as string, filterTeamId as string);

    const where: any = { ...userFilter };
    if (status && typeof status === 'string') where.status = status;
    if (taskType && typeof taskType === 'string') where.taskType = taskType;
    if (createdBefore || createdAfter) {
      where.createdAt = {};
      if (createdBefore && typeof createdBefore === 'string') {
        const d = new Date(createdBefore);
        if (!isNaN(d.getTime())) where.createdAt.lte = d;
      }
      if (createdAfter && typeof createdAfter === 'string') {
        const d = new Date(createdAfter);
        if (!isNaN(d.getTime())) where.createdAt.gte = d;
      }
    }

    const take = Math.min(parseInt(limit as string) || 20, 100);
    const skip = (Math.max(parseInt(page as string) || 1, 1) - 1) * take;

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          job: { select: { id: true, title: true } },
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { candidates: true } },
        },
      }),
      prisma.agent.count({ where }),
    ]);

    res.json({
      data: agents,
      pagination: { total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error('Failed to list agents:', err);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// ── Get single agent ──
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({
      where: accessWhere,
      include: {
        job: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { candidates: true } },
      },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({ data: agent });
  } catch (err) {
    console.error('Failed to get agent:', err);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

const VALID_TASK_TYPES = ['search_candidates', 'match_resumes', 'search', 'match'] as const;
const VALID_SOURCE_MODES = ['instant_search', 'internal_minio', 'external_api'] as const;
const VALID_AUTONOMY = ['manual', 'scheduled', 'event'] as const;

function normalizeTaskType(t: unknown): string {
  if (typeof t !== 'string') return 'search_candidates';
  if (t === 'search') return 'search_candidates';
  if (t === 'match') return 'match_resumes';
  return (VALID_TASK_TYPES as readonly string[]).includes(t) ? t : 'search_candidates';
}

function validateSource(source: unknown): { modes: string[]; externalApiConfigId?: string } | null {
  if (!source || typeof source !== 'object') return null;
  const s = source as { modes?: unknown; externalApiConfigId?: unknown };
  if (!Array.isArray(s.modes)) return null;
  const modes = s.modes.filter((m): m is string => typeof m === 'string' && (VALID_SOURCE_MODES as readonly string[]).includes(m));
  if (modes.length === 0) return null;
  const result: { modes: string[]; externalApiConfigId?: string } = { modes };
  if (typeof s.externalApiConfigId === 'string') result.externalApiConfigId = s.externalApiConfigId;
  return result;
}

function isValidCron(expr: unknown): expr is string {
  if (typeof expr !== 'string') return false;
  // Minimal validation: 5 or 6 space-separated fields. Full validation happens in scheduler.
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

// ── Create agent ──
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      name,
      description,
      jobId,
      config,
      taskType,
      instructions,
      source,
      autonomy,
      schedule,
      scheduleEnabled,
      agentInheritsFromProfile,
    } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    const resolvedTaskType = normalizeTaskType(taskType);

    // Validate jobId against visibility scope (recruiter: own jobs; admin: any)
    if (jobId) {
      const scope = await getVisibilityScope(req.user!);
      const jobWhere: any = { id: jobId, ...buildUserIdFilter(scope) };
      const job = await prisma.job.findFirst({ where: jobWhere });
      if (!job) return res.status(400).json({ error: 'Job not found or not accessible' });
    }

    // Validate source (only meaningful for search_candidates)
    let validatedSource: ReturnType<typeof validateSource> = null;
    if (resolvedTaskType === 'search_candidates' && source !== undefined) {
      validatedSource = validateSource(source);
      if (source && !validatedSource) {
        return res.status(400).json({ error: 'Invalid source. Must include at least one of: instant_search, internal_minio, external_api' });
      }
    }

    // Validate schedule
    const resolvedAutonomy = typeof autonomy === 'string' && (VALID_AUTONOMY as readonly string[]).includes(autonomy) ? autonomy : 'manual';
    let resolvedSchedule: string | null = null;
    let resolvedScheduleEnabled = false;
    if (resolvedAutonomy === 'scheduled') {
      if (!isValidCron(schedule)) {
        return res.status(400).json({ error: 'A valid cron expression is required when autonomy=scheduled' });
      }
      resolvedSchedule = (schedule as string).trim();
      resolvedScheduleEnabled = scheduleEnabled !== false;
    }

    const inheritsFromProfile = agentInheritsFromProfile !== false;

    const agent = await prisma.agent.create({
      data: {
        userId,
        name,
        description,
        taskType: resolvedTaskType,
        instructions: instructions?.trim() || null,
        jobId: jobId || null,
        config: config || null,
        source: validatedSource ?? undefined,
        autonomy: resolvedAutonomy,
        schedule: resolvedSchedule,
        scheduleEnabled: resolvedScheduleEnabled,
        agentInheritsFromProfile: inheritsFromProfile,
      },
      include: {
        job: { select: { id: true, title: true } },
        _count: { select: { candidates: true } },
      },
    });

    // Register with scheduler if the agent was created with an active schedule.
    agentScheduler.register({
      id: agent.id,
      schedule: agent.schedule,
      scheduleEnabled: agent.scheduleEnabled,
    });

    // Phase 7a — warm-start: if the user has an aggregated recruiter profile
    // AND they didn't opt out, seed the agent's v1 ICP from their profile so
    // the first run already benefits from prior learning. Fire-and-forget so
    // agent creation never blocks on this.
    if (inheritsFromProfile) {
      void (async () => {
        try {
          const { userRecruiterProfileService } = await import(
            '../services/UserRecruiterProfileService.js'
          );
          const { idealProfileService } = await import('../services/IdealProfileService.js');
          const userProfile = await userRecruiterProfileService.getForUser(userId);
          if (userProfile) {
            await idealProfileService.seedFromUserProfile(agent.id, userId, userProfile);
          }
        } catch (err) {
          console.error('[agents.create] warm-start seeding failed:', err);
        }
      })();
    }

    res.status(201).json({ data: agent });
  } catch (err) {
    console.error('Failed to create agent:', err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// ── Update agent ──
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({
      where: accessWhere,
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { name, description, status, jobId, config, taskType, instructions, source, autonomy, schedule, scheduleEnabled } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (instructions !== undefined) data.instructions = instructions?.trim() || null;
    if (taskType !== undefined) data.taskType = normalizeTaskType(taskType);

    // jobId — re-validate against scope when changed
    if (jobId !== undefined) {
      if (jobId) {
        const scope = await getVisibilityScope(req.user!);
        const jobWhere: any = { id: jobId, ...buildUserIdFilter(scope) };
        const job = await prisma.job.findFirst({ where: jobWhere });
        if (!job) return res.status(400).json({ error: 'Job not found or not accessible' });
      }
      data.jobId = jobId || null;
    }
    if (config !== undefined) data.config = config;

    if (source !== undefined) {
      if (source === null) {
        data.source = null;
      } else {
        const validatedSource = validateSource(source);
        if (!validatedSource) {
          return res.status(400).json({ error: 'Invalid source' });
        }
        data.source = validatedSource;
      }
    }

    if (autonomy !== undefined) {
      if (!(VALID_AUTONOMY as readonly string[]).includes(autonomy)) {
        return res.status(400).json({ error: 'Invalid autonomy value' });
      }
      data.autonomy = autonomy;
      if (autonomy !== 'scheduled') {
        data.scheduleEnabled = false;
      }
    }

    if (schedule !== undefined) {
      if (schedule === null || schedule === '') {
        data.schedule = null;
        data.scheduleEnabled = false;
      } else if (isValidCron(schedule)) {
        data.schedule = (schedule as string).trim();
      } else {
        return res.status(400).json({ error: 'Invalid cron expression' });
      }
    }

    if (scheduleEnabled !== undefined && typeof scheduleEnabled === 'boolean') {
      if (scheduleEnabled && !(data.schedule ?? agent.schedule)) {
        return res.status(400).json({ error: 'Cannot enable schedule without a cron expression' });
      }
      data.scheduleEnabled = scheduleEnabled;
    }

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data,
      include: {
        job: { select: { id: true, title: true } },
        _count: { select: { candidates: true } },
      },
    });

    // Re-register the scheduler entry: `register` is idempotent and will
    // unregister any prior job before installing the new cron.
    agentScheduler.register({
      id: updated.id,
      schedule: updated.schedule,
      scheduleEnabled: updated.scheduleEnabled,
    });

    res.json({ data: updated });
  } catch (err) {
    console.error('Failed to update agent:', err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// ── Delete agent ──
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({
      where: accessWhere,
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    agentScheduler.unregister(agent.id);
    await prisma.agent.delete({ where: { id: agent.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete agent:', err);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// ── List candidates for an agent ──
router.get('/:id/candidates', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({
      where: accessWhere,
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { status, limit = '50', page = '1' } = req.query;
    const where: any = { agentId: agent.id };
    if (status && typeof status === 'string') where.status = status;

    const take = Math.min(parseInt(limit as string) || 50, 200);
    const skip = (Math.max(parseInt(page as string) || 1, 1) - 1) * take;

    const [candidates, total] = await Promise.all([
      prisma.agentCandidate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          resume: { select: { id: true, name: true, currentRole: true, email: true } },
        },
      }),
      prisma.agentCandidate.count({ where }),
    ]);

    res.json({
      data: candidates,
      pagination: { total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error('Failed to list agent candidates:', err);
    res.status(500).json({ error: 'Failed to list candidates' });
  }
});

// Lazy-load the full resume (including parsedData) for a single candidate.
// The SSE stream omits parsedData for payload-size reasons; the review
// profile view fetches this on demand as the recruiter steps through cards.
router.get('/:id/candidates/:candidateId/details', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const candidate = await prisma.agentCandidate.findFirst({
      where: { id: req.params.candidateId, agentId: agent.id },
      include: {
        resume: {
          select: {
            id: true, name: true, currentRole: true, email: true, phone: true,
            tags: true, summary: true, highlight: true, parsedData: true, experienceYears: true,
          },
        },
      },
    });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    res.json({ data: candidate });
  } catch (err) {
    console.error('Failed to get candidate details:', err);
    res.status(500).json({ error: 'Failed to get candidate details' });
  }
});

// ── Update candidate status (approve/reject) ──
router.patch('/:id/candidates/:candidateId', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({
      where: accessWhere,
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const candidate = await prisma.agentCandidate.findFirst({
      where: { id: req.params.candidateId, agentId: agent.id },
    });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const { status, notes } = req.body;
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes;

    // Update agent counters
    if (status && status !== candidate.status) {
      const inc: any = {};
      if (status === 'approved') inc.totalApproved = { increment: 1 };
      if (status === 'rejected') inc.totalRejected = { increment: 1 };
      if (status === 'contacted') inc.totalContacted = { increment: 1 };
      if (Object.keys(inc).length > 0) {
        await prisma.agent.update({ where: { id: agent.id }, data: inc });
      }
    }

    const updated = await prisma.agentCandidate.update({
      where: { id: candidate.id },
      data,
      include: {
        resume: { select: { id: true, name: true, currentRole: true, email: true } },
      },
    });

    res.json({ data: updated });
  } catch (err) {
    console.error('Failed to update candidate:', err);
    res.status(500).json({ error: 'Failed to update candidate' });
  }
});

// ── Agent stats summary ──
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({
      where: accessWhere,
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const [pending, approved, rejected, contacted] = await Promise.all([
      prisma.agentCandidate.count({ where: { agentId: agent.id, status: 'pending' } }),
      prisma.agentCandidate.count({ where: { agentId: agent.id, status: 'approved' } }),
      prisma.agentCandidate.count({ where: { agentId: agent.id, status: 'rejected' } }),
      prisma.agentCandidate.count({ where: { agentId: agent.id, status: 'contacted' } }),
    ]);

    res.json({
      data: {
        totalSourced: agent.totalSourced,
        pending,
        approved,
        rejected,
        contacted,
      },
    });
  } catch (err) {
    console.error('Failed to get agent stats:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ── Runs ────────────────────────────────────────────────────────────────────

// Start a new run for an agent
router.post('/:id/runs', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { runId } = await startAgentRun({
      agentId: agent.id,
      triggeredBy: 'user',
      triggeredById: req.user!.id,
    });

    res.status(201).json({
      data: {
        runId,
        streamUrl: `/api/v1/agents/${agent.id}/runs/${runId}/stream`,
      },
    });
  } catch (err) {
    console.error('Failed to start agent run:', err);
    res.status(500).json({ error: 'Failed to start run' });
  }
});

// List runs for an agent
router.get('/:id/runs', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { limit = '20', page = '1', status } = req.query;
    const where: any = { agentId: agent.id };
    if (status && typeof status === 'string') where.status = status;

    const take = Math.min(parseInt(limit as string) || 20, 100);
    const skip = (Math.max(parseInt(page as string) || 1, 1) - 1) * take;

    const [runs, total] = await Promise.all([
      prisma.agentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { _count: { select: { candidates: true, activities: true } } },
      }),
      prisma.agentRun.count({ where }),
    ]);

    const scrubbedRuns = runs.map((r) => scrubRunStats(r as unknown as Record<string, unknown>, req.user));
    res.json({
      data: scrubbedRuns,
      pagination: { total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error('Failed to list agent runs:', err);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// Get single run with candidates
router.get('/:id/runs/:runId', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const run = await prisma.agentRun.findFirst({
      where: { id: req.params.runId, agentId: agent.id },
      include: {
        candidates: {
          orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
          include: {
            resume: {
              select: {
                id: true, name: true, currentRole: true, email: true, phone: true,
                tags: true, summary: true, highlight: true, parsedData: true, experienceYears: true,
              },
            },
          },
        },
      },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });

    res.json({ data: scrubRunStats(run as unknown as Record<string, unknown>, req.user) });
  } catch (err) {
    console.error('Failed to get run:', err);
    res.status(500).json({ error: 'Failed to get run' });
  }
});

// Cancel a running agent run
router.post('/:id/runs/:runId/cancel', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const run = await prisma.agentRun.findFirst({
      where: { id: req.params.runId, agentId: agent.id },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'running' && run.status !== 'queued') {
      return res.status(400).json({ error: `Cannot cancel run in status: ${run.status}` });
    }

    const cancelled = cancelAgentRun(run.id);
    res.json({ data: { cancelled } });
  } catch (err) {
    console.error('Failed to cancel run:', err);
    res.status(500).json({ error: 'Failed to cancel run' });
  }
});

// SSE stream for live run events.
// Replays existing activity on connect, then streams new events until run completes.
router.get('/:id/runs/:runId/stream', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const run = await prisma.agentRun.findFirst({
      where: { id: req.params.runId, agentId: agent.id },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Lightweight resume shape for list/stream views — intentionally excludes
    // `parsedData` (can be 10–50KB per resume). Parsed data is lazy-loaded via
    // GET /:id/candidates/:candidateId/details when the review view needs it.
    const resumeListSelect = {
      id: true, name: true, currentRole: true, email: true, phone: true,
      tags: true, summary: true, highlight: true, experienceYears: true,
    } as const;

    // Replay history + existing candidates as a single `snapshot` event.
    // A per-row loop here used to serialize dozens of MB of JSON and triggered
    // one React re-render per event; the snapshot collapses it into one write
    // and one state update.
    const [history, existingCandidates] = await Promise.all([
      prisma.agentActivityLog.findMany({
        where: { runId: run.id },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.agentCandidate.findMany({
        where: { agentId: agent.id, runId: run.id },
        orderBy: { createdAt: 'asc' },
        include: { resume: { select: resumeListSelect } },
      }),
    ]);
    send('snapshot', { activities: history, candidates: existingCandidates });

    // If the run is already finished, close immediately
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      send('end', { status: run.status, stats: run.stats });
      res.end();
      return;
    }

    // Subscribe to live events
    const unsubscribe = agentActivityLogger.subscribeToRun(run.id, (event: PersistedActivityEvent) => {
      send('activity', event);
      // When a match.scored event comes in, fetch and push the candidate too.
      if (event.eventType === 'match.scored' && event.candidateId) {
        prisma.agentCandidate
          .findUnique({
            where: { id: event.candidateId },
            include: { resume: { select: resumeListSelect } },
          })
          .then((c) => {
            if (c) send('candidate', c);
          })
          .catch(() => { /* ignore */ });
      }
      if (event.eventType === 'run.completed' || event.eventType === 'run.failed' || event.eventType === 'run.cancelled') {
        send('end', { status: event.eventType.split('.')[1], stats: event.payload });
        unsubscribe();
        res.end();
      }
    });

    // Heartbeat every 25s to keep proxies from closing the connection
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (err) {
    console.error('SSE stream failed:', err);
    res.status(500).end();
  }
});

// ── Activity log ────────────────────────────────────────────────────────────

router.get('/:id/activity', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { runId, eventType, severity, limit = '50', page = '1' } = req.query;
    const where: any = { agentId: agent.id };
    if (runId && typeof runId === 'string') where.runId = runId;
    if (eventType && typeof eventType === 'string') where.eventType = eventType;
    if (severity && typeof severity === 'string') where.severity = severity;

    const take = Math.min(parseInt(limit as string) || 50, 200);
    const skip = (Math.max(parseInt(page as string) || 1, 1) - 1) * take;

    // Exclude errorStack from list responses — it's potentially huge and the
    // detail view fetches it on demand. The composite [agentId, createdAt]
    // index covers this query.
    const [activities, total] = await Promise.all([
      prisma.agentActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          agentId: true,
          runId: true,
          candidateId: true,
          actor: true,
          eventType: true,
          severity: true,
          message: true,
          payload: true,
          sequence: true,
          errorCode: true,
          createdAt: true,
        },
      }),
      prisma.agentActivityLog.count({ where }),
    ]);

    const scrubbed = activities.map((a) => scrubActivityRow(a as unknown as { eventType: string; payload: unknown }, req.user));
    res.json({
      data: scrubbed,
      meta: { agentName: agent.name },
      pagination: { total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error('Failed to list activity:', err);
    res.status(500).json({ error: 'Failed to list activity' });
  }
});

// Live SSE stream of activity events for a single agent. Replays the most
// recent 50 on connect, then pushes new events from AgentActivityLogger's
// in-memory bus. Used by the Activity tab in the workbench drawer.
router.get('/:id/activity/stream', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send the agent name once so the client can render it on every row
    // without an extra fetch.
    send('meta', { agentName: agent.name, agentId: agent.id });

    // Replay history (newest 50, returned oldest→newest for natural rendering)
    const history = await prisma.agentActivityLog.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        agentId: true,
        runId: true,
        candidateId: true,
        actor: true,
        eventType: true,
        severity: true,
        message: true,
        payload: true,
        sequence: true,
        errorCode: true,
        createdAt: true,
      },
    });
    for (const row of history.reverse()) {
      send('activity', scrubActivityRow(row as unknown as { eventType: string; payload: unknown }, req.user));
    }

    const unsubscribe = agentActivityLogger.subscribeToAgent(agent.id, (event) => {
      send('activity', scrubActivityRow(event as unknown as { eventType: string; payload: unknown }, req.user));
    });

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (err) {
    console.error('Activity stream failed:', err);
    res.status(500).end();
  }
});

// Live progress snapshot for a running run — used by RunsTab to render the
// rich "in-flight" card. Computes elapsed, last activity, and live counts
// from AgentActivityLog (which is being written in real time during the run).
router.get('/:id/runs/:runId/progress', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const run = await prisma.agentRun.findFirst({
      where: { id: req.params.runId, agentId: agent.id },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        triggeredBy: true,
        tokensIn: true,
        tokensOut: true,
        costUsd: true,
        llmCallCount: true,
        avgLatencyMs: true,
        durationMs: true,
      },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const now = new Date();
    const elapsedMs = run.startedAt ? now.getTime() - run.startedAt.getTime() : 0;

    // Last activity event
    const lastActivity = await prisma.agentActivityLog.findFirst({
      where: { agentId: agent.id, runId: run.id },
      orderBy: { createdAt: 'desc' },
      select: {
        eventType: true,
        message: true,
        severity: true,
        createdAt: true,
        payload: true,
      },
    });

    // Live counts from activity log — for in-flight runs, AgentRun.* columns
    // aren't populated yet. Aggregate the relevant event types here.
    const [scoredCount, matchedCount, errorCount, llmCompletedEvents, sourceHits] = await Promise.all([
      prisma.agentActivityLog.count({ where: { agentId: agent.id, runId: run.id, eventType: 'match.scored' } }),
      prisma.agentCandidate.count({ where: { agentId: agent.id, runId: run.id } }),
      prisma.agentActivityLog.count({ where: { agentId: agent.id, runId: run.id, severity: 'error' } }),
      prisma.agentActivityLog.findMany({
        where: { agentId: agent.id, runId: run.id, eventType: 'llm.call.completed' },
        select: { payload: true },
      }),
      prisma.agentActivityLog.count({
        where: {
          agentId: agent.id,
          runId: run.id,
          eventType: { in: ['source.instant_search.hit', 'source.internal_minio.hit', 'source.external_api.hit'] },
        },
      }),
    ]);

    let liveTokensIn = 0;
    let liveTokensOut = 0;
    let liveCostUsd = 0;
    let liveLatencyMs = 0;
    for (const ev of llmCompletedEvents) {
      const p = (ev.payload ?? {}) as {
        tokensIn?: number;
        tokensOut?: number;
        costUsd?: number;
        latencyMs?: number;
      };
      liveTokensIn += p.tokensIn ?? 0;
      liveTokensOut += p.tokensOut ?? 0;
      liveCostUsd += p.costUsd ?? 0;
      liveLatencyMs += p.latencyMs ?? 0;
    }

    const adminOnly = isAdmin(req.user);
    const live: Record<string, unknown> = {
      scored: scoredCount,
      matched: matchedCount,
      errors: errorCount,
      sourceHits,
    };
    if (adminOnly) {
      live.llmCallCount = llmCompletedEvents.length;
      live.tokensIn = liveTokensIn;
      live.tokensOut = liveTokensOut;
      live.costUsd = liveCostUsd;
      live.avgLatencyMs = llmCompletedEvents.length > 0 ? Math.round(liveLatencyMs / llmCompletedEvents.length) : 0;
    }

    res.json({
      data: {
        run: scrubRunStats(run as unknown as Record<string, unknown>, req.user),
        elapsedMs,
        lastActivity: scrubActivityRow(lastActivity as unknown as { eventType: string; payload: unknown } | null, req.user),
        live,
      },
    });
  } catch (err) {
    console.error('Failed to load run progress:', err);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

// Run summary — structured digest of a completed run. Used by the Results
// tab to render a summary card above the candidate list. Returns:
//   - top 5 candidates (name, score, reason)
//   - common matched skills aggregated across all matches (top 5)
//   - common gaps aggregated across all matches (top 3)
//   - duration, sourced/matched/error counts
//   - admin-only: tokens, cost, llm call count, avg latency
router.get('/:id/runs/:runId/summary', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const run = await prisma.agentRun.findFirst({
      where: { id: req.params.runId, agentId: agent.id },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const candidates = await prisma.agentCandidate.findMany({
      where: { agentId: agent.id, runId: run.id },
      orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        matchScore: true,
        reason: true,
        source: true,
        status: true,
        metadata: true,
        headline: true,
      },
    });

    // Aggregate matched skills + gaps from candidate.metadata (populated by llmMatcher)
    const skillFrequency = new Map<string, number>();
    const gapFrequency = new Map<string, number>();
    for (const c of candidates) {
      const meta = (c.metadata ?? {}) as { matchedSkills?: string[]; gaps?: string[] };
      for (const s of meta.matchedSkills ?? []) {
        if (typeof s === 'string' && s.trim()) {
          skillFrequency.set(s, (skillFrequency.get(s) ?? 0) + 1);
        }
      }
      for (const g of meta.gaps ?? []) {
        if (typeof g === 'string' && g.trim()) {
          gapFrequency.set(g, (gapFrequency.get(g) ?? 0) + 1);
        }
      }
    }

    const topSkills = Array.from(skillFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skill, count]) => ({ skill, count }));
    const topGaps = Array.from(gapFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([gap, count]) => ({ gap, count }));

    const top5 = candidates.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name,
      matchScore: c.matchScore,
      reason: c.reason,
      headline: c.headline,
      source: c.source,
    }));

    const liked = candidates.filter((c) => c.status === 'liked' || c.status === 'invited' || c.status === 'interviewed' || c.status === 'hired').length;
    const disliked = candidates.filter((c) => c.status === 'disliked').length;
    const pending = candidates.filter((c) => c.status === 'pending').length;

    // Try to count "scored" from activity log when run is in flight; for
    // completed runs, the AgentRun already has the totals.
    const errors = await prisma.agentActivityLog.count({
      where: { agentId: agent.id, runId: run.id, severity: 'error' },
    });

    const summary: Record<string, unknown> = {
      runId: run.id,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      counts: {
        matched: candidates.length,
        liked,
        disliked,
        pending,
        errors,
      },
      topCandidates: top5,
      topMatchedSkills: topSkills,
      topGaps,
    };

    if (isAdmin(req.user)) {
      summary.llm = {
        callCount: run.llmCallCount,
        tokensIn: run.tokensIn,
        tokensOut: run.tokensOut,
        costUsd: run.costUsd,
        avgLatencyMs: run.avgLatencyMs,
      };
    }

    res.json({ data: summary });
  } catch (err) {
    console.error('Failed to load run summary:', err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

// Generate criteria refinement suggestions when the recruiter has rejected
// candidates from a run. Reads disliked candidates' parsed metadata + the
// agent's current criteria, asks an LLM for 3-5 actionable changes.
router.post('/:id/runs/:runId/criteria-suggestions', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({
      where: accessWhere,
      include: { job: { select: { title: true, description: true } } },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Pull rejected candidates from this run
    const rejected = await prisma.agentCandidate.findMany({
      where: { agentId: agent.id, runId: req.params.runId, status: 'disliked' },
      take: 20,
      select: { name: true, headline: true, matchScore: true, reason: true, metadata: true },
    });
    if (rejected.length === 0) {
      return res.json({ data: { suggestions: [], reason: 'No rejected candidates in this run' } });
    }

    const currentCriteria = (agent.config as { criteria?: Array<{ text: string; pinned: boolean; bucket: string }> } | null)?.criteria ?? [];

    // Build the prompt
    const rejectedSummary = rejected
      .map((c, i) => {
        const meta = (c.metadata ?? {}) as { matchedSkills?: string[]; gaps?: string[]; verdict?: string };
        return `${i + 1}. ${c.name} (score ${Math.round(c.matchScore ?? 0)})
   Headline: ${c.headline ?? '—'}
   Verdict: ${meta.verdict ?? c.reason ?? '—'}
   Matched skills: ${(meta.matchedSkills ?? []).slice(0, 5).join(', ') || '—'}
   Gaps: ${(meta.gaps ?? []).slice(0, 5).join(', ') || '—'}`;
      })
      .join('\n\n');

    const criteriaList = currentCriteria.length > 0
      ? currentCriteria
          .map((c, i) => `${i + 1}. [${c.pinned ? 'PINNED/MANDATORY' : c.bucket.toUpperCase()}] ${c.text}`)
          .join('\n')
      : '(none — using job description only)';

    const userPrompt = `You are an expert recruiting consultant helping a recruiter refine their AI agent's evaluation criteria.

# Job
Title: ${agent.job?.title ?? '—'}
Description: ${agent.job?.description?.slice(0, 1500) ?? agent.description.slice(0, 1500)}

# Current criteria
${criteriaList}

# Agent's natural-language criteria
${agent.description}

# Candidates the recruiter REJECTED in the most recent run
${rejectedSummary}

The recruiter rejected these candidates despite the agent thinking they matched. Analyze the patterns and propose 3-5 SPECIFIC, ACTIONABLE changes to the criteria that would have filtered these candidates out OR identified better matches next time.

For each suggestion, specify:
- type: "add" (add a new criterion), "modify" (rephrase an existing one), or "remove" (drop one that's misleading)
- text: a one-sentence description of the change
- rationale: 1-2 sentences explaining why, referencing the rejected candidates
- newCriterion (only for "add"): { text: string, pinned: boolean, bucket: "most" | "least" } where pinned=true means dealbreaker
- targetIndex (only for "modify"/"remove"): the 1-indexed position in the criteria list above

Return ONLY a JSON object in this exact shape, no markdown, no commentary:
{
  "suggestions": [
    { "id": "s1", "type": "add", "text": "...", "rationale": "...", "newCriterion": {"text": "...", "pinned": true, "bucket": "most"} },
    { "id": "s2", "type": "modify", "text": "...", "rationale": "...", "targetIndex": 2 }
  ],
  "summary": "One-sentence summary of the recurring rejection pattern"
}`;

    // Lazy import so the route file stays light
    const { llmService } = await import('../services/llm/LLMService.js');
    const suggestionRequestId = `${req.params.runId}-suggestions`;
    const { logger } = await import('../services/LoggerService.js');
    logger.startRequest(suggestionRequestId, 'agent.criteriaSuggestions', 'INTERNAL');

    const responseText = await llmService.chat(
      [{ role: 'user', content: userPrompt }],
      { requestId: suggestionRequestId, temperature: 0.5 },
    );

    // Strip markdown fences if the model added them despite instructions
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed: { suggestions?: unknown[]; summary?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'LLM returned non-JSON', raw: cleaned.slice(0, 500) });
    }

    res.json({
      data: {
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        summary: typeof parsed.summary === 'string' ? parsed.summary : null,
        rejectedCount: rejected.length,
      },
    });
  } catch (err) {
    console.error('Failed to generate criteria suggestions:', err);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

router.get('/:id/runs/:runId/activity', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const activities = await prisma.agentActivityLog.findMany({
      where: { agentId: agent.id, runId: req.params.runId },
      orderBy: { createdAt: 'asc' },
    });
    const scrubbed = activities.map((a) => scrubActivityRow(a as unknown as { eventType: string; payload: unknown }, req.user));
    res.json({ data: scrubbed });
  } catch (err) {
    console.error('Failed to list run activity:', err);
    res.status(500).json({ error: 'Failed to list activity' });
  }
});

// ── Phase 6: ICP + Hard Requirements ────────────────────────────────────────

// GET current ICP for an agent
router.get('/:id/ideal-profile', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const icp = await idealProfileService.loadCurrent(agent.id);
    res.json({ data: icp });
  } catch (err) {
    console.error('Failed to load ideal profile:', err);
    res.status(500).json({ error: 'Failed to load ideal profile' });
  }
});

// GET version history (metadata only)
router.get('/:id/ideal-profile/history', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 50);
    const versions = await idealProfileService.getHistory(agent.id, limit);
    const total = await prisma.agentIdealProfile.count({ where: { agentId: agent.id } });

    res.json({ data: { versions, total } });
  } catch (err) {
    console.error('Failed to load ICP history:', err);
    res.status(500).json({ error: 'Failed to load ICP history' });
  }
});

// POST regenerate ICP (synchronous LLM call)
router.post('/:id/ideal-profile/regenerate', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const startedAt = Date.now();
    try {
      const icp = await idealProfileService.generateForAgent(agent.id, { triggeredBy: 'user' });
      const durationMs = Date.now() - startedAt;
      res.json({ data: { profile: icp, durationMs } });
    } catch (err) {
      console.error('Failed to regenerate ICP:', err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        error: { code: 'ICP_LLM_FAILED', message: `LLM call failed: ${message}` },
      });
    }
  } catch (err) {
    console.error('Failed to regenerate ICP:', err);
    res.status(500).json({ error: 'Failed to regenerate ICP' });
  }
});

// POST revert to a prior version (creates a new latest version)
router.post('/:id/ideal-profile/revert', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const version = Number((req.body ?? {}).version);
    if (!Number.isFinite(version) || version < 1) {
      return res.status(400).json({ error: { code: 'ICP_INVALID_VERSION', message: 'version must be a positive integer' } });
    }

    try {
      const icp = await idealProfileService.revertToVersion(agent.id, version);
      res.json({ data: icp });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return res.status(404).json({ error: { code: 'ICP_VERSION_NOT_FOUND', message } });
      }
      throw err;
    }
  } catch (err) {
    console.error('Failed to revert ICP:', err);
    res.status(500).json({ error: 'Failed to revert ICP' });
  }
});

// POST promote a suggested hard requirement to an enforced rule
router.post('/:id/ideal-profile/promote-suggestion', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const ruleId = String((req.body ?? {}).ruleId ?? '').trim();
    if (!ruleId) {
      return res.status(400).json({ error: { code: 'HR_INVALID_INPUT', message: 'ruleId is required' } });
    }

    const icp = await idealProfileService.loadCurrent(agent.id);
    if (!icp) {
      return res.status(404).json({ error: { code: 'ICP_NOT_FOUND', message: 'No ideal profile to promote from' } });
    }
    const suggestion = (icp.suggestedHardRequirements ?? []).find((s) => s.id === ruleId);
    if (!suggestion) {
      return res
        .status(404)
        .json({ error: { code: 'HR_SUGGESTION_NOT_FOUND', message: 'No suggestion with that id on current ICP' } });
    }

    const promoted: HardRequirement = {
      ...suggestion,
      enabled: true,
      source: 'icp_suggestion',
      sourceIcpVersion: icp.version,
      updatedAt: new Date().toISOString(),
      createdAt: suggestion.createdAt ?? new Date().toISOString(),
    };

    const check = validateHardRequirement(promoted);
    if (!check.ok) {
      return res.status(400).json({
        error: { code: 'HR_VALIDATION_FAILED', message: check.error ?? 'invalid rule' },
      });
    }

    const existing = extractHardRequirements(agent.config);
    // De-duplicate by id — if already present, overwrite (enables it).
    const next = existing.filter((r) => r.id !== promoted.id).concat(promoted);

    const config = {
      ...((agent.config as Record<string, unknown> | null) ?? {}),
      hardRequirements: next,
    };

    await prisma.agent.update({ where: { id: agent.id }, data: { config: config as unknown as object } });

    await agentActivityLogger.log({
      agentId: agent.id,
      actor: `user:${req.user!.id}`,
      eventType: 'hard_requirements.updated',
      message: `Promoted ICP suggestion "${promoted.description || promoted.field}"`,
      payload: { promotedRuleId: promoted.id, sourceIcpVersion: icp.version },
    });

    res.json({ data: { hardRequirements: next } });
  } catch (err) {
    console.error('Failed to promote ICP suggestion:', err);
    res.status(500).json({ error: 'Failed to promote suggestion' });
  }
});

// PATCH replace the agent's hard-requirement set
router.patch('/:id/hard-requirements', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const body = (req.body ?? {}) as { hardRequirements?: unknown };
    if (!Array.isArray(body.hardRequirements)) {
      return res.status(400).json({
        error: { code: 'HR_INVALID_INPUT', message: 'hardRequirements must be an array' },
      });
    }
    if (body.hardRequirements.length > 20) {
      return res.status(400).json({
        error: { code: 'HR_TOO_MANY', message: 'At most 20 hard requirements per agent' },
      });
    }

    const validated: HardRequirement[] = [];
    const errors: Array<{ index: number; ruleId: string; error: string }> = [];
    body.hardRequirements.forEach((raw, index) => {
      const rule = raw as HardRequirement;
      // Auto-assign id if client omitted one (defensive — spec says client supplies).
      if (!rule || typeof rule !== 'object') {
        errors.push({ index, ruleId: '(unknown)', error: 'rule is not an object' });
        return;
      }
      if (!rule.id) rule.id = randomUUID();
      const check = validateHardRequirement(rule);
      if (!check.ok) {
        errors.push({ index, ruleId: rule.id, error: check.error ?? 'invalid rule' });
        return;
      }
      validated.push({
        ...rule,
        updatedAt: new Date().toISOString(),
        createdAt: rule.createdAt ?? new Date().toISOString(),
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({
        error: {
          code: 'HR_VALIDATION_FAILED',
          message: `Validation failed for ${errors.length} rule(s)`,
          meta: { errors },
        },
      });
    }

    const previous = extractHardRequirements(agent.config);
    const config = {
      ...((agent.config as Record<string, unknown> | null) ?? {}),
      hardRequirements: validated,
    };

    await prisma.agent.update({ where: { id: agent.id }, data: { config: config as unknown as object } });

    await agentActivityLogger.log({
      agentId: agent.id,
      actor: `user:${req.user!.id}`,
      eventType: 'hard_requirements.updated',
      message: `Hard requirements updated (${previous.length} → ${validated.length})`,
      payload: {
        previousCount: previous.length,
        nextCount: validated.length,
      },
    });

    res.json({ data: { hardRequirements: validated } });
  } catch (err) {
    console.error('Failed to update hard requirements:', err);
    res.status(500).json({ error: 'Failed to update hard requirements' });
  }
});

// POST dry-run hard requirements against the next-run pool
router.post('/:id/hard-requirements/dry-run', requireAuth, async (req, res) => {
  try {
    const accessWhere = await buildAgentAccessWhere(req.user!, req.params.id);
    const agent = await prisma.agent.findFirst({ where: accessWhere });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const body = (req.body ?? {}) as { hardRequirements?: unknown };
    let rules: HardRequirement[];
    if (Array.isArray(body.hardRequirements)) {
      const validated: HardRequirement[] = [];
      for (const raw of body.hardRequirements) {
        const rule = raw as HardRequirement;
        if (!rule || typeof rule !== 'object') continue;
        if (!rule.id) rule.id = randomUUID();
        const check = validateHardRequirement(rule);
        if (!check.ok) {
          return res.status(400).json({
            error: { code: 'HR_VALIDATION_FAILED', message: check.error ?? 'invalid rule', meta: { ruleId: rule.id } },
          });
        }
        validated.push(rule);
      }
      rules = validated;
    } else {
      rules = extractHardRequirements(agent.config);
    }

    // Sample the same pool shape the real run would see: owner's active
    // resumes, capped to a reasonable size. Dry-run is cheap but we still
    // don't want to hydrate the whole company archive into memory here.
    const pool = await prisma.resume.findMany({
      where: { userId: agent.userId, status: 'active', resumeText: { not: '' } },
      select: {
        id: true,
        name: true,
        resumeText: true,
        currentRole: true,
        highlight: true,
        tags: true,
        experienceYears: true,
        parsedData: true,
        preferences: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const enabledRules = rules.filter((r) => r.enabled !== false);
    const { passed, rejected } = applyHardRequirements(pool as HRResumeInput[], enabledRules);
    const byRule = topRejectionReasons(rejected, enabledRules);

    res.json({
      data: {
        poolSize: pool.length,
        passedCount: passed.length,
        rejectedCount: rejected.length,
        topRejectionReasons: byRule.map((r) => ({
          rule: { id: r.ruleId, description: r.description },
          count: r.count,
        })),
      },
    });
  } catch (err) {
    console.error('Failed to dry-run hard requirements:', err);
    res.status(500).json({ error: 'Failed to dry-run hard requirements' });
  }
});

export default router;
