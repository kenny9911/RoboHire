/**
 * UserRecruiterProfileService — Phase 7a
 *
 * Cross-agent aggregation of a single user's taste. Whenever any
 * AgentIdealProfile for the user is (re)generated, we enqueue a rebuild of
 * their UserRecruiterProfile. The profile is read at agent-create time to
 * seed the new agent's initial ICP, turning a cold start into a warm start.
 *
 * Design: non-incremental rebuild. Each call reads every one of the user's
 * latest AgentIdealProfile rows + every AgentCandidate row with a triage
 * decision, rolls them into frequency-weighted aggregates with recency decay,
 * and writes a single UserRecruiterProfile row (upsert).
 *
 * Throttle: max one rebuild per user per 60 seconds. Queued rebuild calls
 * that hit the throttle are silently dropped — the next real rebuild will
 * catch up naturally.
 */

import prisma from '../lib/prisma.js';

const REBUILD_MIN_INTERVAL_MS = 60_000;
const HALF_LIFE_DAYS = 30;

// Rebuild throttle — process-local. For horizontal scaling we'd move this to
// Redis, but at the current scale one backend process is fine.
const lastRebuildAt = new Map<string, number>();

interface WeightedTerm {
  key: string;
  weight: number;
  lastSeenAt: string; // ISO
  sourceCount: number;
}

interface RecurringHardReq {
  description: string;
  seenInAgents: string[];
  suggestApply: boolean;
}

interface UserProfileData {
  topSkills: WeightedTerm[];
  topAntiSkills: WeightedTerm[];
  topLocations: WeightedTerm[];
  topIndustries: WeightedTerm[];
  topCompanySizes: WeightedTerm[];
  recurringHardReqs: RecurringHardReq[];
  signalsLearned: number;
  agentCount: number;
}

export class UserRecruiterProfileService {
  /**
   * Fetch the user's current profile. Returns null if they haven't built one.
   */
  async getForUser(userId: string) {
    return prisma.userRecruiterProfile.findUnique({ where: { userId } });
  }

  /**
   * Enqueue a rebuild. Throttled to at most once per 60s per user.
   * Fire-and-forget — callers don't block on the rebuild completing.
   */
  enqueueRebuild(userId: string): void {
    const now = Date.now();
    const last = lastRebuildAt.get(userId) ?? 0;
    if (now - last < REBUILD_MIN_INTERVAL_MS) {
      return; // throttled
    }
    lastRebuildAt.set(userId, now);
    setImmediate(() => {
      void this.rebuildForUser(userId).catch((err) => {
        console.error(`[UserRecruiterProfile] rebuild failed for ${userId}:`, err);
      });
    });
  }

  /**
   * Synchronous rebuild. Reads every one of the user's AgentIdealProfile rows
   * (latest version per agent) and every AgentCandidate with a triage
   * decision, then writes a single aggregate row. Exposed publicly so routes
   * can force a rebuild on demand.
   */
  async rebuildForUser(userId: string): Promise<void> {
    // Fetch all the user's agents
    const agents = await prisma.agent.findMany({
      where: { userId },
      select: { id: true, config: true },
    });
    const agentIds = agents.map((a) => a.id);

    // Fetch the latest AgentIdealProfile per agent. The @@unique([agentId,
    // version]) constraint means we can select the max version per agent.
    const profiles = await prisma.agentIdealProfile.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: [{ agentId: 'asc' }, { version: 'desc' }],
    });
    // Keep only the latest per agent
    const latestByAgent = new Map<string, (typeof profiles)[number]>();
    for (const p of profiles) {
      if (!latestByAgent.has(p.agentId)) latestByAgent.set(p.agentId, p);
    }
    const latestProfiles = Array.from(latestByAgent.values());

    // Fetch every triaged candidate across all the user's agents
    const candidates = await prisma.agentCandidate.findMany({
      where: {
        agentId: { in: agentIds },
        status: { in: ['liked', 'disliked', 'invited', 'contacted', 'interviewed', 'hired', 'rejected'] },
      },
      select: {
        status: true,
        metadata: true,
        createdAt: true,
      },
    });

    // Build the aggregates
    const data = this.computeAggregates(latestProfiles, candidates, agents);

    // Upsert
    await prisma.userRecruiterProfile.upsert({
      where: { userId },
      create: {
        userId,
        topSkills: data.topSkills as unknown as object,
        topAntiSkills: data.topAntiSkills as unknown as object,
        topLocations: data.topLocations as unknown as object,
        topIndustries: data.topIndustries as unknown as object,
        topCompanySizes: data.topCompanySizes as unknown as object,
        recurringHardReqs: data.recurringHardReqs as unknown as object,
        signalsLearned: data.signalsLearned,
        agentCount: data.agentCount,
        lastRebuiltAt: new Date(),
      },
      update: {
        topSkills: data.topSkills as unknown as object,
        topAntiSkills: data.topAntiSkills as unknown as object,
        topLocations: data.topLocations as unknown as object,
        topIndustries: data.topIndustries as unknown as object,
        topCompanySizes: data.topCompanySizes as unknown as object,
        recurringHardReqs: data.recurringHardReqs as unknown as object,
        signalsLearned: data.signalsLearned,
        agentCount: data.agentCount,
        lastRebuiltAt: new Date(),
      },
    });
  }

  /**
   * Hard reset — delete the user's profile. Used by the "start fresh" flow.
   * Next agent they create will cold-start normally.
   */
  async resetForUser(userId: string): Promise<void> {
    await prisma.userRecruiterProfile.deleteMany({ where: { userId } });
    lastRebuildAt.delete(userId);
  }

  // ── Aggregation core ──────────────────────────────────────────────────────

  private computeAggregates(
    profiles: Array<{
      profile: unknown;
      generatedFromLikes: number;
      generatedFromDislikes: number;
      generatedAt: Date;
    }>,
    candidates: Array<{ status: string; metadata: unknown; createdAt: Date }>,
    agents: Array<{ id: string; config: unknown }>,
  ): UserProfileData {
    const now = Date.now();
    const skillBuckets = new Map<string, WeightedTerm>();
    const antiSkillBuckets = new Map<string, WeightedTerm>();
    const locationBuckets = new Map<string, WeightedTerm>();
    const industryBuckets = new Map<string, WeightedTerm>();
    const companySizeBuckets = new Map<string, WeightedTerm>();

    const addTo = (
      map: Map<string, WeightedTerm>,
      key: string,
      weightAt: Date,
      delta: number = 1,
    ) => {
      const decayedWeight = delta * this.decayFactor(now, weightAt);
      const normalized = key.trim().toLowerCase();
      if (!normalized) return;
      const existing = map.get(normalized);
      if (existing) {
        existing.weight += decayedWeight;
        existing.sourceCount += 1;
        if (weightAt.toISOString() > existing.lastSeenAt) {
          existing.lastSeenAt = weightAt.toISOString();
        }
      } else {
        map.set(normalized, {
          key,
          weight: decayedWeight,
          lastSeenAt: weightAt.toISOString(),
          sourceCount: 1,
        });
      }
    };

    // Mine the latest per-agent ICPs for structured signals
    for (const p of profiles) {
      const prof = (p.profile ?? {}) as {
        coreSkills?: Array<{ skill: string; importance?: string }>;
        bonusSkills?: string[];
        antiSkills?: string[];
        preferredLocations?: string[];
        preferredIndustries?: string[];
        preferredCompanySizes?: string[];
      };
      for (const c of prof.coreSkills ?? []) {
        const importanceBoost = c.importance === 'critical' ? 2 : c.importance === 'high' ? 1.5 : 1;
        addTo(skillBuckets, c.skill, p.generatedAt, importanceBoost);
      }
      for (const s of prof.bonusSkills ?? []) {
        addTo(skillBuckets, s, p.generatedAt, 0.5);
      }
      for (const s of prof.antiSkills ?? []) {
        addTo(antiSkillBuckets, s, p.generatedAt, 1);
      }
      for (const l of prof.preferredLocations ?? []) {
        addTo(locationBuckets, l, p.generatedAt, 1);
      }
      for (const i of prof.preferredIndustries ?? []) {
        addTo(industryBuckets, i, p.generatedAt, 1);
      }
      for (const cs of prof.preferredCompanySizes ?? []) {
        addTo(companySizeBuckets, cs, p.generatedAt, 1);
      }
    }

    // Mine candidate triage metadata — liked matched skills are positive
    // signals, disliked matched skills are weaker / neutral.
    for (const cand of candidates) {
      const meta = (cand.metadata ?? {}) as { matchedSkills?: string[]; gaps?: string[] };
      const isLiked =
        cand.status === 'liked' ||
        cand.status === 'invited' ||
        cand.status === 'interviewed' ||
        cand.status === 'hired';
      if (isLiked) {
        for (const s of meta.matchedSkills ?? []) addTo(skillBuckets, s, cand.createdAt, 0.5);
      }
      if (cand.status === 'disliked' || cand.status === 'rejected') {
        for (const s of meta.gaps ?? []) addTo(antiSkillBuckets, s, cand.createdAt, 0.5);
      }
    }

    // Recurring hard requirements — scan agent configs for identical text
    const hardReqSeen = new Map<string, { count: number; agentIds: string[] }>();
    for (const agent of agents) {
      const config = (agent.config ?? {}) as { hardRequirements?: Array<{ description?: string }> };
      const rules = Array.isArray(config.hardRequirements) ? config.hardRequirements : [];
      const seen = new Set<string>();
      for (const rule of rules) {
        const desc = (rule?.description ?? '').trim();
        if (!desc || seen.has(desc)) continue;
        seen.add(desc);
        const existing = hardReqSeen.get(desc);
        if (existing) {
          existing.count += 1;
          existing.agentIds.push(agent.id);
        } else {
          hardReqSeen.set(desc, { count: 1, agentIds: [agent.id] });
        }
      }
    }
    const recurringHardReqs: RecurringHardReq[] = [];
    for (const [description, info] of hardReqSeen.entries()) {
      if (info.count >= 2) {
        recurringHardReqs.push({
          description,
          seenInAgents: info.agentIds,
          suggestApply: info.count >= Math.max(2, Math.floor(agents.length / 2)),
        });
      }
    }

    // Sort each bucket by weight desc, keep top 20 (skills) / 10 (others)
    const sortTop = (m: Map<string, WeightedTerm>, limit: number): WeightedTerm[] =>
      Array.from(m.values())
        .sort((a, b) => b.weight - a.weight)
        .slice(0, limit);

    const signalsLearned = profiles.reduce(
      (acc, p) => acc + (p.generatedFromLikes ?? 0) + (p.generatedFromDislikes ?? 0),
      0,
    );

    return {
      topSkills: sortTop(skillBuckets, 20),
      topAntiSkills: sortTop(antiSkillBuckets, 15),
      topLocations: sortTop(locationBuckets, 10),
      topIndustries: sortTop(industryBuckets, 10),
      topCompanySizes: sortTop(companySizeBuckets, 5),
      recurringHardReqs,
      signalsLearned,
      agentCount: agents.length,
    };
  }

  /**
   * Recency decay: half-life 30 days. A signal 30 days old has 0.5 weight,
   * 60 days → 0.25. Keeps the profile responsive to current preferences.
   */
  private decayFactor(nowMs: number, at: Date): number {
    const daysOld = (nowMs - at.getTime()) / (1000 * 60 * 60 * 24);
    return Math.pow(0.5, daysOld / HALF_LIFE_DAYS);
  }
}

export const userRecruiterProfileService = new UserRecruiterProfileService();
