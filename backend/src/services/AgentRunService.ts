/**
 * AgentRunService
 *
 * Orchestrates a single execution of an Agent. Creates an AgentRun row,
 * dispatches to source adapters (instant_search, internal_minio, external_api),
 * persists AgentCandidate rows, and emits activity events via AgentActivityLogger.
 *
 * Phase 3: all three source adapters are real and use ResumeMatchAgent for
 * LLM-based scoring via `services/sources/llmMatcher.ts`.
 *
 * Cancellation is in-memory via AbortController keyed by runId.
 * For horizontal scaling, Phase 7 will replace this with a DB-backed flag.
 */

import prisma from '../lib/prisma.js';
import { agentActivityLogger } from './AgentActivityLogger.js';
import { matchResumesWithLLM, type MatchResumeInput } from './sources/llmMatcher.js';
import {
  searchWithCustomHttpDriver,
  type DriverConfig,
  type ExternalCandidate,
} from './sources/drivers/CustomHttpDriver.js';
import { decryptJson } from '../lib/crypto.js';
import { idealProfileService, extractHardRequirements } from './IdealProfileService.js';
import {
  applyHardRequirements,
  topRejectionReasons,
  type HRResumeInput,
  type HardRequirement,
} from '../lib/hardRequirementsFilter.js';
import type { IdealCandidateProfile } from '../types/icp.js';

export type RunTriggeredBy = 'user' | 'schedule' | 'event' | 'agent' | 'openclaw';

export interface StartRunOptions {
  agentId: string;
  triggeredBy: RunTriggeredBy;
  triggeredById?: string | null;
}

interface SourceModes {
  modes: string[];
  externalApiConfigId?: string;
}

interface AgentWithJob {
  id: string;
  userId: string;
  description: string;
  instructions: string | null;
  taskType: string;
  source: unknown;
  config: unknown;
  job: { id: string; title: string; description: string | null } | null;
}

interface StoredCriterion {
  id: string;
  text: string;
  pinned: boolean;
  bucket: 'most' | 'least';
}

function extractCriteria(config: unknown): StoredCriterion[] {
  if (!config || typeof config !== 'object') return [];
  const c = config as { criteria?: unknown };
  if (!Array.isArray(c.criteria)) return [];
  return c.criteria.filter(
    (x): x is StoredCriterion =>
      !!x &&
      typeof x === 'object' &&
      typeof (x as StoredCriterion).text === 'string' &&
      typeof (x as StoredCriterion).pinned === 'boolean' &&
      ((x as StoredCriterion).bucket === 'most' || (x as StoredCriterion).bucket === 'least'),
  );
}

interface RunContext {
  icp: IdealCandidateProfile | null;
  hardRequirements: HardRequirement[];
  icpVersion: number | null;
}

interface SourceResult {
  sourced: number;
  matched: number;
  errors: number;
  filteredByHardRequirements: number;
}

/**
 * Apply hard requirements to a pool and emit the matching activity events.
 * Returns the survivors to be handed to the LLM matcher.
 */
async function filterAndLog(
  agentId: string,
  runId: string,
  resumes: HRResumeInput[],
  hardRequirements: HardRequirement[],
): Promise<{ passed: HRResumeInput[]; rejectedCount: number }> {
  if (hardRequirements.length === 0 || resumes.length === 0) {
    return { passed: resumes, rejectedCount: 0 };
  }
  const { passed, rejected } = applyHardRequirements(resumes, hardRequirements);
  const byRule = topRejectionReasons(rejected, hardRequirements);

  await agentActivityLogger.log({
    agentId,
    runId,
    actor: 'system',
    eventType: 'hard_requirements.applied',
    message: `Filtered ${rejected.length} of ${resumes.length} by ${hardRequirements.length} rule(s)`,
    payload: {
      poolSize: resumes.length,
      passed: passed.length,
      rejected: rejected.length,
      ruleCount: hardRequirements.length,
      topRejectionReasons: byRule,
    },
  });

  // Per-candidate debug events, capped at 20 to avoid log spam.
  const sample = rejected.slice(0, 20);
  for (const r of sample) {
    await agentActivityLogger.log({
      agentId,
      runId,
      actor: 'system',
      eventType: 'match.filtered_by_hard_requirement',
      severity: 'debug',
      message: `${r.resume.name} excluded by hard requirement`,
      payload: { resumeId: r.resume.id, ruleId: r.ruleId, reason: r.reason },
    });
  }

  return { passed, rejectedCount: rejected.length };
}

const runCancellation = new Map<string, AbortController>();

// Reasonable pool caps so LLM cost is bounded until Phase 7 adds budgets.
const MAX_POOL_INSTANT = 50;
const MAX_POOL_MINIO = 100;
const MAX_EXTERNAL_PER_DRIVER = 25;

// ── Public API ──────────────────────────────────────────────────────────────

export async function startAgentRun(opts: StartRunOptions): Promise<{ runId: string }> {
  const run = await prisma.agentRun.create({
    data: {
      agentId: opts.agentId,
      triggeredBy: opts.triggeredBy,
      triggeredById: opts.triggeredById ?? null,
      status: 'queued',
    },
  });

  const ctrl = new AbortController();
  runCancellation.set(run.id, ctrl);

  const actor =
    opts.triggeredBy === 'user' && opts.triggeredById
      ? `user:${opts.triggeredById}`
      : opts.triggeredBy;

  await agentActivityLogger.log({
    agentId: opts.agentId,
    runId: run.id,
    actor,
    eventType: 'run.queued',
    message: `Run queued by ${opts.triggeredBy}`,
  });

  // Fire-and-forget execution. Next-tick so the HTTP response returns first.
  setImmediate(() => {
    void executeRun(run.id, opts.agentId, ctrl.signal).finally(() => {
      runCancellation.delete(run.id);
    });
  });

  return { runId: run.id };
}

export function cancelAgentRun(runId: string): boolean {
  const ctrl = runCancellation.get(runId);
  if (!ctrl) return false;
  ctrl.abort();
  return true;
}

// ── Execution ───────────────────────────────────────────────────────────────

async function executeRun(runId: string, agentId: string, signal: AbortSignal): Promise<void> {
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'running', startedAt: new Date() },
  });
  await agentActivityLogger.log({ agentId, runId, actor: 'system', eventType: 'run.started' });

  try {
    const agent = (await prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
      include: { job: { select: { id: true, title: true, description: true } } },
    })) as AgentWithJob;

    // ── Phase 6: load ICP + hard requirements once per run ──
    const icp = await idealProfileService.loadCurrent(agentId);
    const hardRequirements = extractHardRequirements(agent.config).filter(
      (r) => r.enabled !== false,
    );

    if (icp) {
      await agentActivityLogger.log({
        agentId,
        runId,
        actor: 'system',
        eventType: 'icp.loaded',
        message: `Using ICP v${icp.version} (confidence ${icp.confidence.toFixed(2)})`,
        payload: {
          icpVersion: icp.version,
          confidence: icp.confidence,
          coreSkillCount: icp.profile.coreSkills?.length ?? 0,
          anchorCount: icp.profile.anchorCandidateIds?.length ?? 0,
        },
      });
    } else {
      await agentActivityLogger.log({
        agentId,
        runId,
        actor: 'system',
        eventType: 'icp.skipped',
        severity: 'debug',
        message: 'No ICP yet — scoring with JD + criteria only',
      });
    }

    const runCtx: RunContext = {
      icp: icp?.profile ?? null,
      hardRequirements,
      icpVersion: icp?.version ?? null,
    };

    const stats = { sourced: 0, matched: 0, errors: 0, filteredByHardRequirements: 0 };

    if (agent.taskType === 'search_candidates') {
      const source = (agent.source as SourceModes | null) ?? { modes: ['instant_search'] };
      const modes = source.modes && source.modes.length > 0 ? source.modes : ['instant_search'];

      for (const mode of modes) {
        if (signal.aborted) throw new CancelledError();

        if (mode === 'instant_search') {
          const r = await runInstantSearch(agent, runId, signal, runCtx);
          stats.sourced += r.sourced;
          stats.matched += r.matched;
          stats.errors += r.errors;
          stats.filteredByHardRequirements += r.filteredByHardRequirements;
        } else if (mode === 'internal_minio') {
          const r = await runMinIOSearch(agent, runId, signal, runCtx);
          stats.sourced += r.sourced;
          stats.matched += r.matched;
          stats.errors += r.errors;
          stats.filteredByHardRequirements += r.filteredByHardRequirements;
        } else if (mode === 'external_api') {
          const r = await runExternalApiSearch(agent, runId, signal, source.externalApiConfigId);
          stats.sourced += r.sourced;
          stats.matched += r.matched;
          stats.errors += r.errors;
        }
      }
    } else if (agent.taskType === 'match_resumes') {
      const r = await runMatchResumes(agent, runId, signal, runCtx);
      stats.sourced += r.sourced;
      stats.matched += r.matched;
      stats.errors += r.errors;
      stats.filteredByHardRequirements += r.filteredByHardRequirements;
    }

    // Phase 5 — aggregate per-call LLM stats recorded on AgentActivityLog.
    // Each llm.call.completed event carries payload.{tokensIn, tokensOut,
    // costUsd, latencyMs}. Sum across all events for this run.
    const llmStats = await aggregateLlmStats(runId);
    const completedAt = new Date();
    const runStartedAt = (await prisma.agentRun.findUnique({
      where: { id: runId },
      select: { startedAt: true },
    }))?.startedAt;
    const durationMs = runStartedAt ? completedAt.getTime() - runStartedAt.getTime() : 0;

    const finalStats = {
      ...stats,
      ...(runCtx.icpVersion != null ? { icpVersion: runCtx.icpVersion } : {}),
    };

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        completedAt,
        stats: finalStats as unknown as object,
        tokensIn: llmStats.tokensIn,
        tokensOut: llmStats.tokensOut,
        costUsd: llmStats.costUsd,
        llmCallCount: llmStats.callCount,
        avgLatencyMs: llmStats.callCount > 0 ? Math.round(llmStats.totalLatencyMs / llmStats.callCount) : 0,
        durationMs,
      },
    });
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        lastRunAt: new Date(),
        totalSourced: { increment: stats.sourced },
      },
    });
    await agentActivityLogger.log({
      agentId,
      runId,
      actor: 'system',
      eventType: 'run.completed',
      payload: {
        ...finalStats,
        tokensIn: llmStats.tokensIn,
        tokensOut: llmStats.tokensOut,
        costUsd: llmStats.costUsd,
        llmCallCount: llmStats.callCount,
        durationMs,
      } as unknown as Record<string, unknown>,
    });
  } catch (err) {
    const cancelled = err instanceof CancelledError || signal.aborted;
    const errorMsg = err instanceof Error ? err.message : String(err);

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: cancelled ? 'cancelled' : 'failed',
        completedAt: new Date(),
        error: errorMsg,
      },
    });
    await agentActivityLogger.log({
      agentId,
      runId,
      actor: 'system',
      eventType: cancelled ? 'run.cancelled' : 'run.failed',
      severity: cancelled ? 'info' : 'error',
      message: errorMsg,
      errorStack: err instanceof Error ? err.stack : undefined,
    });
  }
}

// ── Source branch: instant_search — owner's private resume pool ─────────────

async function runInstantSearch(
  agent: AgentWithJob,
  runId: string,
  signal: AbortSignal,
  runCtx: RunContext,
): Promise<SourceResult> {
  // Exclude resumes already evaluated by this agent so "Run again" /
  // "Find more" actually pulls fresh candidates from deeper in the pool
  // instead of re-fetching the same top-50 only to dedup them post-query.
  const alreadyEvaluated = await alreadyEvaluatedResumeIds(agent.id);
  const resumes = await prisma.resume.findMany({
    where: {
      userId: agent.userId,
      status: 'active',
      resumeText: { not: '' },
      ...(alreadyEvaluated.length > 0 ? { id: { notIn: alreadyEvaluated } } : {}),
    },
    select: {
      id: true,
      name: true,
      resumeText: true,
      currentRole: true,
      highlight: true,
      email: true,
      tags: true,
      experienceYears: true,
      parsedData: true,
      preferences: true,
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_POOL_INSTANT,
  });

  await agentActivityLogger.log({
    agentId: agent.id,
    runId,
    actor: 'system',
    eventType: 'source.instant_search.hit',
    message: `Queried ${resumes.length} resume(s) from owner's private talent pool`,
    payload: { poolSize: resumes.length, scope: 'owner' },
  });

  const { passed, rejectedCount } = await filterAndLog(
    agent.id,
    runId,
    resumes as HRResumeInput[],
    runCtx.hardRequirements,
  );

  const stats = await matchResumesWithLLM(passed as MatchResumeInput[], {
    agentId: agent.id,
    runId,
    userId: agent.userId,
    sourceKey: 'instant_search',
    jdText: resolveJdText(agent),
    instructions: agent.instructions,
    criteria: extractCriteria(agent.config),
    idealProfile: runCtx.icp,
    signal,
  });
  return {
    sourced: resumes.length,
    matched: stats.matched,
    errors: stats.errors,
    filteredByHardRequirements: rejectedCount,
  };
}

// ── Source branch: internal_minio — shared company-wide archive ─────────────
// Implementation note: "MinIO" here means resumes stored via the S3-compatible
// ResumeOriginalFileStorageService with `originalFileProvider='s3'`. These are
// treated as a shared archive: the query deliberately ignores `userId` so the
// agent can reach beyond the owner's private upload history.

async function runMinIOSearch(
  agent: AgentWithJob,
  runId: string,
  signal: AbortSignal,
  runCtx: RunContext,
): Promise<SourceResult> {
  const alreadyEvaluated = await alreadyEvaluatedResumeIds(agent.id);
  const resumes = await prisma.resume.findMany({
    where: {
      status: 'active',
      resumeText: { not: '' },
      originalFileProvider: 's3',
      // Exclude the owner's own already-indexed resumes — those are covered by
      // instant_search. This keeps the two sources disjoint.
      NOT: { userId: agent.userId },
      ...(alreadyEvaluated.length > 0 ? { id: { notIn: alreadyEvaluated } } : {}),
    },
    select: {
      id: true,
      name: true,
      resumeText: true,
      currentRole: true,
      highlight: true,
      email: true,
      tags: true,
      experienceYears: true,
      parsedData: true,
      preferences: true,
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_POOL_MINIO,
  });

  await agentActivityLogger.log({
    agentId: agent.id,
    runId,
    actor: 'system',
    eventType: 'source.internal_minio.hit',
    message: `Queried ${resumes.length} resume(s) from shared MinIO archive`,
    payload: { poolSize: resumes.length, scope: 'shared' },
  });

  const { passed, rejectedCount } = await filterAndLog(
    agent.id,
    runId,
    resumes as HRResumeInput[],
    runCtx.hardRequirements,
  );

  const stats = await matchResumesWithLLM(passed as MatchResumeInput[], {
    agentId: agent.id,
    runId,
    userId: agent.userId,
    sourceKey: 'internal_minio',
    jdText: resolveJdText(agent),
    instructions: agent.instructions,
    criteria: extractCriteria(agent.config),
    idealProfile: runCtx.icp,
    signal,
  });
  return {
    sourced: resumes.length,
    matched: stats.matched,
    errors: stats.errors,
    filteredByHardRequirements: rejectedCount,
  };
}

// ── Source branch: external_api — third-party sourcing vendors ──────────────

async function runExternalApiSearch(
  agent: AgentWithJob,
  runId: string,
  signal: AbortSignal,
  preferredConfigId: string | undefined,
): Promise<{ sourced: number; matched: number; errors: number }> {
  // Load enabled configs. Prefer a single explicit one if the agent pinned it.
  const configs = await prisma.externalSourceConfig.findMany({
    where: {
      enabled: true,
      ...(preferredConfigId ? { id: preferredConfigId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (configs.length === 0) {
    await agentActivityLogger.log({
      agentId: agent.id,
      runId,
      actor: 'system',
      eventType: 'source.external_api.hit',
      severity: 'warn',
      message: 'No enabled external sources. Configure one under Admin → Agent Sources.',
    });
    return { sourced: 0, matched: 0, errors: 0 };
  }

  const stats = { sourced: 0, matched: 0, errors: 0 };
  const jdText = resolveJdText(agent);

  for (const cfg of configs) {
    if (signal.aborted) throw new CancelledError();

    let driverCfg: DriverConfig;
    try {
      const decryptedCreds = decryptJson<Record<string, unknown>>(
        typeof cfg.credentials === 'string' ? cfg.credentials : JSON.stringify(cfg.credentials),
      );
      driverCfg = {
        baseUrl: cfg.baseUrl,
        authType: cfg.authType,
        credentials: decryptedCreds,
        config: (cfg.config as Record<string, unknown> | null) ?? null,
      };
    } catch (err) {
      stats.errors++;
      await agentActivityLogger.log({
        agentId: agent.id,
        runId,
        actor: 'system',
        eventType: 'error.auth',
        severity: 'error',
        message: `Failed to decrypt credentials for external source "${cfg.name}"`,
        errorStack: err instanceof Error ? err.stack : undefined,
      });
      continue;
    }

    let externalCandidates: ExternalCandidate[] = [];
    try {
      externalCandidates = await searchWithCustomHttpDriver(
        driverCfg,
        {
          criteria: agent.description,
          instructions: agent.instructions,
          jobTitle: agent.job?.title ?? null,
          limit: MAX_EXTERNAL_PER_DRIVER,
        },
        signal,
      );
    } catch (err) {
      stats.errors++;
      await agentActivityLogger.log({
        agentId: agent.id,
        runId,
        actor: 'system',
        eventType: 'error.http',
        severity: 'error',
        message: `External source "${cfg.name}" request failed`,
        errorStack: err instanceof Error ? err.stack : undefined,
      });
      continue;
    }

    stats.sourced += externalCandidates.length;

    await agentActivityLogger.log({
      agentId: agent.id,
      runId,
      actor: 'system',
      eventType: 'source.external_api.hit',
      message: `"${cfg.name}" returned ${externalCandidates.length} candidate(s)`,
      payload: { provider: cfg.provider, configId: cfg.id, count: externalCandidates.length },
    });

    // External candidates don't live as Resume rows — persist them directly
    // as AgentCandidate without a resumeId. If the vendor supplied its own
    // score, use it; otherwise gate at threshold 60 (same floor as LLM path).
    for (const ec of externalCandidates) {
      const score = typeof ec.score === 'number' ? ec.score : null;
      if (score !== null && score < 60) continue;

      const candidate = await prisma.agentCandidate.create({
        data: {
          agentId: agent.id,
          runId,
          resumeId: null,
          name: ec.name,
          email: ec.email ?? null,
          profileUrl: ec.profileUrl ?? null,
          headline: ec.headline ?? null,
          matchScore: score,
          source: 'external_api',
          reason: ec.headline ?? `From ${cfg.name}`,
          status: 'pending',
          metadata: {
            provider: cfg.provider,
            externalSourceConfigId: cfg.id,
            location: ec.location ?? null,
            ...(ec.metadata ?? {}),
          } as unknown as object,
        },
      });

      stats.matched++;

      await agentActivityLogger.log({
        agentId: agent.id,
        runId,
        candidateId: candidate.id,
        actor: 'system',
        eventType: 'match.scored',
        message: `${candidate.name} (${cfg.provider})${score ? ` scored ${Math.round(score)}` : ''}`,
        payload: { score, source: 'external_api', provider: cfg.provider },
      });
    }
  }

  // Quick-and-dirty enhancement: if vendor returned raw resumeText we could
  // re-score with the LLM. Deferred until the first real external vendor ships.

  return stats;
}

// ── Task branch: match_resumes — score an explicit resume pool ──────────────
// The user selects resumes to match via agent.config.resumeIds (set in the
// create modal or via API). Falls back to the full owner pool if unspecified.

async function runMatchResumes(
  agent: AgentWithJob,
  runId: string,
  signal: AbortSignal,
  runCtx: RunContext,
): Promise<SourceResult> {
  const explicitIds = extractResumeIds(agent.config);
  const alreadyEvaluated = await alreadyEvaluatedResumeIds(agent.id);
  const exclude = alreadyEvaluated.length > 0 ? { id: { notIn: alreadyEvaluated } } : {};
  const where =
    explicitIds.length > 0
      ? { id: { in: explicitIds.filter((id) => !alreadyEvaluated.includes(id)) }, status: 'active', resumeText: { not: '' } }
      : { userId: agent.userId, status: 'active', resumeText: { not: '' }, ...exclude };

  const resumes = await prisma.resume.findMany({
    where,
    select: {
      id: true,
      name: true,
      resumeText: true,
      currentRole: true,
      highlight: true,
      email: true,
      tags: true,
      experienceYears: true,
      parsedData: true,
      preferences: true,
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_POOL_INSTANT,
  });

  await agentActivityLogger.log({
    agentId: agent.id,
    runId,
    actor: 'system',
    eventType: 'source.instant_search.hit',
    message: `Matching ${resumes.length} resume(s) against job`,
    payload: { poolSize: resumes.length, explicit: explicitIds.length > 0 },
  });

  const { passed, rejectedCount } = await filterAndLog(
    agent.id,
    runId,
    resumes as HRResumeInput[],
    runCtx.hardRequirements,
  );

  const stats = await matchResumesWithLLM(passed as MatchResumeInput[], {
    agentId: agent.id,
    runId,
    userId: agent.userId,
    sourceKey: 'instant_search',
    jdText: resolveJdText(agent),
    instructions: agent.instructions,
    criteria: extractCriteria(agent.config),
    idealProfile: runCtx.icp,
    signal,
  });
  return {
    sourced: resumes.length,
    matched: stats.matched,
    errors: stats.errors,
    filteredByHardRequirements: rejectedCount,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveJdText(agent: AgentWithJob): string {
  if (agent.job?.description) {
    return [`# ${agent.job.title}`, '', agent.job.description].join('\n');
  }
  return agent.description;
}

function extractResumeIds(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const c = config as { resumeIds?: unknown };
  if (!Array.isArray(c.resumeIds)) return [];
  return c.resumeIds.filter((id): id is string => typeof id === 'string');
}

class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

// Returns the resume IDs already evaluated by this agent across any run.
// Used by the source adapters so "Run again" pulls deeper into the pool
// instead of re-fetching the same top-N rows just to dedupe them.
async function alreadyEvaluatedResumeIds(agentId: string): Promise<string[]> {
  const rows = await prisma.agentCandidate.findMany({
    where: { agentId, resumeId: { not: null } },
    select: { resumeId: true },
  });
  return rows.map((r) => r.resumeId).filter((id): id is string => id !== null);
}

// Sum per-call LLM stats from AgentActivityLog for a single run. Used at
// run completion to populate AgentRun.{tokensIn, tokensOut, costUsd, ...}.
async function aggregateLlmStats(runId: string): Promise<{
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  callCount: number;
  totalLatencyMs: number;
}> {
  const events = await prisma.agentActivityLog.findMany({
    where: { runId, eventType: 'llm.call.completed' },
    select: { payload: true },
  });
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  let totalLatencyMs = 0;
  for (const ev of events) {
    const p = (ev.payload ?? {}) as {
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number;
      latencyMs?: number;
    };
    tokensIn += p.tokensIn ?? 0;
    tokensOut += p.tokensOut ?? 0;
    costUsd += p.costUsd ?? 0;
    totalLatencyMs += p.latencyMs ?? 0;
  }
  return { tokensIn, tokensOut, costUsd, callCount: events.length, totalLatencyMs };
}
