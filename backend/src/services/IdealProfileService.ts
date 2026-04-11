/**
 * IdealProfileService
 *
 * Orchestrates ICP generation, versioning, loading, and reverts. Called by:
 *   - `routes/agents.ts` for explicit user-triggered regeneration + history
 *   - `services/AgentRunService.ts` to load the current ICP at run time
 *
 * See docs/icp-architecture.md §6 for the sequence diagrams.
 */

import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import {
  IdealCandidateProfileAgent,
  buildResumeDigest,
  type ExemplarCandidate,
} from '../agents/IdealCandidateProfileAgent.js';
import type {
  HardRequirement,
  IdealCandidateProfile,
  IdealProfileInput,
  PersistedIdealProfile,
} from '../types/icp.js';
import { agentActivityLogger } from './AgentActivityLogger.js';
import { logger } from './LoggerService.js';

// ── Cache ─────────────────────────────────────────────────────────────────
//
// Agents Workbench is chatty about loadCurrent — the route handler, the run
// orchestrator, and the matcher may all call it within one request. 60s TTL
// is plenty; the cache is invalidated explicitly on regenerate / revert.

interface CacheEntry {
  value: PersistedIdealProfile | null;
  expiresAt: number;
}
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function getCached(agentId: string): PersistedIdealProfile | null | undefined {
  const entry = cache.get(agentId);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(agentId);
    return undefined;
  }
  return entry.value;
}

function setCached(agentId: string, value: PersistedIdealProfile | null): void {
  cache.set(agentId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateCache(agentId: string): void {
  cache.delete(agentId);
}

// ── Row mapping ───────────────────────────────────────────────────────────

function mapRow(row: {
  id: string;
  agentId: string;
  userId: string;
  version: number;
  profile: unknown;
  suggestedHardRequirements: unknown;
  narrativeSummary: string | null;
  confidence: number;
  generatedFromLikes: number;
  generatedFromDislikes: number;
  generatedAt: Date;
  updatedAt: Date;
}): PersistedIdealProfile {
  return {
    id: row.id,
    agentId: row.agentId,
    userId: row.userId,
    version: row.version,
    profile: (row.profile ?? {}) as IdealCandidateProfile,
    suggestedHardRequirements:
      (row.suggestedHardRequirements as HardRequirement[] | null | undefined) ?? null,
    narrativeSummary: row.narrativeSummary,
    confidence: row.confidence,
    generatedFromLikes: row.generatedFromLikes,
    generatedFromDislikes: row.generatedFromDislikes,
    generatedAt: row.generatedAt,
    updatedAt: row.updatedAt,
  };
}

// ── Criterion extraction (mirrors AgentRunService helper) ────────────────

interface StoredCriterion {
  id?: string;
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

export function extractHardRequirements(config: unknown): HardRequirement[] {
  if (!config || typeof config !== 'object') return [];
  const c = config as { hardRequirements?: unknown };
  if (!Array.isArray(c.hardRequirements)) return [];
  return c.hardRequirements.filter(
    (r): r is HardRequirement =>
      !!r &&
      typeof r === 'object' &&
      typeof (r as HardRequirement).id === 'string' &&
      typeof (r as HardRequirement).field === 'string' &&
      typeof (r as HardRequirement).operator === 'string',
  );
}

// ── Service ───────────────────────────────────────────────────────────────

class IdealProfileService {
  private agent = new IdealCandidateProfileAgent();

  /**
   * Load the latest ICP version for an agent. Returns null if none exists.
   * Per-request cached (60s TTL). Cleared on regenerate / revert.
   */
  async loadCurrent(agentId: string): Promise<PersistedIdealProfile | null> {
    const cached = getCached(agentId);
    if (cached !== undefined) return cached;

    const row = await prisma.agentIdealProfile.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' },
    });
    const mapped = row ? mapRow(row) : null;
    setCached(agentId, mapped);
    return mapped;
  }

  /** Specific version. */
  async loadVersion(agentId: string, version: number): Promise<PersistedIdealProfile | null> {
    const row = await prisma.agentIdealProfile.findFirst({
      where: { agentId, version },
    });
    return row ? mapRow(row) : null;
  }

  /**
   * All versions, newest first. Returns only metadata columns — no full
   * profile body — so the history drawer is cheap to render.
   */
  async getHistory(
    agentId: string,
    limit = 20,
  ): Promise<
    Array<{
      version: number;
      generatedAt: Date;
      confidence: number;
      generatedFromLikes: number;
      generatedFromDislikes: number;
      narrativeSummary: string | null;
    }>
  > {
    const rows = await prisma.agentIdealProfile.findMany({
      where: { agentId },
      orderBy: { version: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      select: {
        version: true,
        generatedAt: true,
        confidence: true,
        generatedFromLikes: true,
        generatedFromDislikes: true,
        narrativeSummary: true,
      },
    });
    return rows;
  }

  /**
   * Generate a new ICP version for an agent. Loads context, calls the LLM,
   * persists a new row, emits activity events, returns the new profile.
   *
   * Cold start (0 likes + 0 dislikes) is supported: the agent produces a
   * JD-only profile with low confidence. See architecture spec §9.
   */
  async generateForAgent(
    agentId: string,
    opts?: { triggeredBy?: 'user' | 'auto' },
  ): Promise<PersistedIdealProfile> {
    const triggeredBy = opts?.triggeredBy ?? 'user';

    const agent = await prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
      include: { job: { select: { id: true, title: true, description: true } } },
    });

    const currentICP = await this.loadCurrent(agentId);

    const [liked, disliked] = await Promise.all([
      prisma.agentCandidate.findMany({
        where: { agentId, status: 'liked' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: {
          resume: {
            select: {
              id: true,
              name: true,
              currentRole: true,
              highlight: true,
              parsedData: true,
            },
          },
        },
      }),
      prisma.agentCandidate.findMany({
        where: { agentId, status: 'disliked' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: {
          resume: {
            select: {
              id: true,
              name: true,
              currentRole: true,
              highlight: true,
              parsedData: true,
            },
          },
        },
      }),
    ]);

    const toExemplar = (
      c: (typeof liked)[number],
      status: 'liked' | 'disliked',
    ): ExemplarCandidate => {
      const name = c.name || c.resume?.name || 'Unknown';
      const headline = c.headline ?? c.resume?.currentRole ?? c.resume?.highlight ?? null;
      const digest = buildResumeDigest({
        name,
        headline,
        parsedData: c.resume?.parsedData ?? null,
      });
      return {
        id: c.id,
        name,
        headline,
        matchScore: c.matchScore ?? null,
        reason: c.reason ?? null,
        resumeDigest: digest,
        status,
      };
    };

    const likedCandidates = liked.map((c) => toExemplar(c, 'liked'));
    const dislikedCandidates = disliked.map((c) => toExemplar(c, 'disliked'));

    const jobTitle = agent.job?.title ?? 'Untitled role';
    const jobDescription = agent.job?.description ?? agent.description ?? '';

    const input: IdealProfileInput = {
      jobTitle,
      jobDescription,
      agentInstructions: agent.instructions ?? null,
      currentCriteria: extractCriteria(agent.config),
      currentICP: currentICP?.profile ?? null,
      currentHardRequirements: extractHardRequirements(agent.config),
      likedCandidates,
      dislikedCandidates,
    };

    // Phase 5 bug fix — the request context must exist BEFORE the LLM call
    // so LoggerService.logLLMCall() can persist tokens/cost on the snapshot.
    const requestId = `icp-${agentId}-${Date.now()}`;
    logger.startRequest(requestId, 'agent.icp.regenerate', 'INTERNAL');

    await agentActivityLogger.log({
      agentId,
      actor: triggeredBy === 'user' ? 'user' : 'system',
      eventType: 'icp.regeneration.started',
      message: `Regenerating ICP from ${liked.length} like(s) + ${disliked.length} dislike(s)`,
      payload: {
        likeCount: liked.length,
        dislikeCount: disliked.length,
        priorVersion: currentICP?.version ?? null,
      },
    });

    const startedAt = Date.now();
    let llmOutput;
    try {
      llmOutput = await this.agent.generate(input, requestId);
    } catch (err) {
      await agentActivityLogger.log({
        agentId,
        actor: 'system',
        eventType: 'icp.regeneration.failed',
        severity: 'error',
        message: 'LLM call failed while regenerating ICP',
        errorStack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }

    const snapshot = logger.getRequestSnapshot(requestId);
    const tokensIn = snapshot?.promptTokens ?? 0;
    const tokensOut = snapshot?.completionTokens ?? 0;
    const costUsd = snapshot?.totalCost ?? 0;
    const model = snapshot?.lastModel ?? null;
    const provider = snapshot?.lastProvider ?? null;
    const durationMs = Date.now() - startedAt;

    // Compute next version number monotonically. Neon doesn't need a tx
    // for this because the unique index (agentId, version) would error
    // out on a race; the caller can then retry.
    const latest = await prisma.agentIdealProfile.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    // Tag suggestions with the source version so they can be traced.
    const suggestionsToSave = (llmOutput.suggestedHardRequirements ?? []).map((s) => ({
      ...s,
      id: s.id || randomUUID(),
      sourceIcpVersion: nextVersion,
      enabled: false,
      source: 'icp_suggestion' as const,
    }));

    const row = await prisma.agentIdealProfile.create({
      data: {
        agentId,
        userId: agent.userId,
        version: nextVersion,
        profile: llmOutput.profile as unknown as object,
        suggestedHardRequirements: suggestionsToSave as unknown as object,
        narrativeSummary: llmOutput.narrativeSummary,
        confidence: llmOutput.confidence,
        generatedFromLikes: liked.length,
        generatedFromDislikes: disliked.length,
      },
    });

    const mapped = mapRow(row);
    invalidateCache(agentId);
    setCached(agentId, mapped);

    await agentActivityLogger.log({
      agentId,
      actor: triggeredBy === 'user' ? 'user' : 'system',
      eventType: 'icp.regenerated',
      message: `ICP v${mapped.version} synthesized (confidence ${mapped.confidence.toFixed(2)})`,
      payload: {
        version: mapped.version,
        confidence: mapped.confidence,
        coreSkillCount: mapped.profile.coreSkills?.length ?? 0,
        suggestedHardRequirementsCount: suggestionsToSave.length,
        generatedFromLikes: liked.length,
        generatedFromDislikes: disliked.length,
        durationMs,
        tokensIn,
        tokensOut,
        costUsd,
        model,
        provider,
      },
    });

    // Phase 7a — enqueue a cross-agent profile rebuild for the owning user so
    // their UserRecruiterProfile reflects this new taste data. Throttled
    // internally to once per 60s per user; fire-and-forget.
    try {
      const { userRecruiterProfileService } = await import('./UserRecruiterProfileService.js');
      userRecruiterProfileService.enqueueRebuild(agent.userId);
    } catch (err) {
      console.error('[IdealProfileService] failed to enqueue profile rebuild:', err);
    }

    return mapped;
  }

  /**
   * Copy an older version forward as a new latest version (soft revert).
   * The original version stays intact; the new row is marked as a revert
   * in its activity payload.
   */
  async revertToVersion(agentId: string, version: number): Promise<PersistedIdealProfile> {
    const source = await this.loadVersion(agentId, version);
    if (!source) throw new Error(`ICP version ${version} not found for agent ${agentId}`);

    const latest = await prisma.agentIdealProfile.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const row = await prisma.agentIdealProfile.create({
      data: {
        agentId,
        userId: source.userId,
        version: nextVersion,
        profile: source.profile as unknown as object,
        suggestedHardRequirements:
          (source.suggestedHardRequirements ?? []) as unknown as object,
        narrativeSummary: source.narrativeSummary,
        confidence: source.confidence,
        generatedFromLikes: source.generatedFromLikes,
        generatedFromDislikes: source.generatedFromDislikes,
      },
    });
    const mapped = mapRow(row);
    invalidateCache(agentId);
    setCached(agentId, mapped);

    await agentActivityLogger.log({
      agentId,
      actor: 'user',
      eventType: 'icp.reverted',
      message: `ICP reverted to v${version} → new v${nextVersion}`,
      payload: { fromVersion: version, toVersion: nextVersion },
    });

    return mapped;
  }

  /**
   * Invalidate the per-agent cache — call after mutating actions that
   * don't already flow through this service (e.g. DELETE cascade).
   */
  invalidate(agentId: string): void {
    invalidateCache(agentId);
  }

  /**
   * Phase 7a — cold-start seeding. When a new agent is created for a user
   * who already has a UserRecruiterProfile, synthesize a v1 AgentIdealProfile
   * from their aggregated taste data. No LLM call — pure data transformation.
   * This turns the agent's first run from a blind cold-start into a warm
   * start that already reflects prior learning.
   *
   * Marked as "synthesized_from_profile" in the activity log so users see
   * where it came from and can revert if they prefer a blank slate.
   */
  async seedFromUserProfile(
    agentId: string,
    userId: string,
    userProfile: {
      topSkills: unknown;
      topAntiSkills: unknown;
      topLocations: unknown;
      topIndustries: unknown;
      topCompanySizes: unknown;
      signalsLearned: number;
    },
  ): Promise<PersistedIdealProfile | null> {
    // Do nothing if the agent already has an ICP — never clobber a real one
    const existing = await prisma.agentIdealProfile.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    if (existing) return null;

    const skills = Array.isArray(userProfile.topSkills)
      ? (userProfile.topSkills as Array<{ key: string; weight: number }>)
      : [];
    const antiSkills = Array.isArray(userProfile.topAntiSkills)
      ? (userProfile.topAntiSkills as Array<{ key: string; weight: number }>)
      : [];
    const locations = Array.isArray(userProfile.topLocations)
      ? (userProfile.topLocations as Array<{ key: string; weight: number }>)
      : [];
    const industries = Array.isArray(userProfile.topIndustries)
      ? (userProfile.topIndustries as Array<{ key: string; weight: number }>)
      : [];
    const companySizes = Array.isArray(userProfile.topCompanySizes)
      ? (userProfile.topCompanySizes as Array<{ key: string; weight: number }>)
      : [];

    // Map aggregated terms into the IdealCandidateProfile shape. Years of
    // experience aren't aggregated yet (they'd need median from anchors) —
    // use a wide default and let the first real triage refine it.
    const profile: IdealCandidateProfile = {
      coreSkills: skills.slice(0, 5).map((s) => ({
        skill: s.key,
        importance: (s.weight > 2 ? 'critical' : s.weight > 1 ? 'high' : 'medium') as 'critical' | 'high' | 'medium',
        rationale: `Inherited from cross-agent profile (weight ${s.weight.toFixed(2)})`,
      })),
      bonusSkills: skills.slice(5, 12).map((s) => s.key),
      antiSkills: antiSkills.slice(0, 10).map((s) => s.key),
      preferredLocations: locations.slice(0, 5).map((l) => l.key),
      preferredIndustries: industries.slice(0, 5).map((i) => i.key),
      preferredCompanySizes: companySizes.slice(0, 3).map((c) => c.key as 'startup' | 'midsize' | 'enterprise'),
      yearsOfExperience: { min: 0, ideal: 5 },
      anchorCandidateIds: [],
      antiAnchorCandidateIds: [],
      signals: [],
      generatedAt: new Date().toISOString(),
    };

    // Confidence starts modest — this is a transferred profile, not one
    // trained on the agent's own data. First real triage will boost it.
    const confidence = Math.min(0.4, 0.15 + (userProfile.signalsLearned ?? 0) * 0.005);

    const row = await prisma.agentIdealProfile.create({
      data: {
        agentId,
        userId,
        version: 1,
        profile: profile as unknown as object,
        suggestedHardRequirements: undefined,
        narrativeSummary: 'Warm-start profile synthesized from your cross-agent learning history.',
        confidence,
        generatedFromLikes: 0,
        generatedFromDislikes: 0,
      },
    });

    const mapped: PersistedIdealProfile = {
      id: row.id,
      agentId: row.agentId,
      userId: row.userId,
      version: row.version,
      profile,
      suggestedHardRequirements: [],
      narrativeSummary: row.narrativeSummary,
      confidence: row.confidence,
      generatedFromLikes: row.generatedFromLikes,
      generatedFromDislikes: row.generatedFromDislikes,
      generatedAt: row.generatedAt,
      updatedAt: row.updatedAt,
    };
    setCached(agentId, mapped);

    await agentActivityLogger.log({
      agentId,
      actor: 'system',
      eventType: 'icp.seeded_from_profile',
      message: `Warm-start ICP v1 seeded from user profile (confidence ${confidence.toFixed(2)})`,
      payload: {
        signalsInherited: userProfile.signalsLearned ?? 0,
        skillsInherited: profile.coreSkills?.length ?? 0,
        locationsInherited: profile.preferredLocations?.length ?? 0,
      },
    });

    return mapped;
  }
}

export const idealProfileService = new IdealProfileService();
export { IdealProfileService };
