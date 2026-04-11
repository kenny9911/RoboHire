/**
 * ContextRetrievalService — Phase 7c foundation
 *
 * Retrieves the top-K most relevant MemoryEntry rows for a new ICP
 * regeneration or run dispatch. Walks the scope hierarchy (user → team →
 * workspace → job), ranks by cosine similarity between the query embedding
 * and each memory's embedding, applies decay weights, and returns the best
 * matches for injection into the LLM prompt.
 *
 * **Phase 7c v1 scope** (this file):
 *   - Cosine similarity in JS over Json-serialized embeddings
 *   - Scope walk (user scope only for now — team/workspace/job come later
 *     when the UI for those scopes exists)
 *   - Decay-weighted scoring
 *   - Result formatting for prompt injection
 *
 * **Out of scope for this version** (follow-ups):
 *   - Embedding generation (blocked by a shared `embedText` adapter — noted)
 *   - pgvector migration for SQL-side ANN search
 *   - Team + workspace scopes once the opt-in UX ships
 *   - Synthesis worker that writes MemoryEntry rows from raw CandidateInteraction + AgentCandidate events
 *
 * The service is designed so the LLM-facing callers (IdealProfileService)
 * can drop in the `retrieveForRegen` method today and start receiving
 * memories as soon as the synthesis worker begins populating them.
 */

import prisma from '../../lib/prisma.js';

// Half-life matches the design doc §4.1: user 30d, team 60d, workspace 180d.
const HALF_LIFE_DAYS: Record<string, number> = {
  user: 30,
  team: 60,
  workspace: 180,
  job: 45,
};

// Scope boost per design doc §6.3 — job memories are most specific.
const SCOPE_BOOST: Record<string, number> = {
  job: 1.5,
  user: 1.2,
  team: 1.0,
  workspace: 0.8,
};

export interface RetrievalQuery {
  userId: string;
  jobId?: string | null;
  teamIds?: string[]; // user's opted-in team memberships
  workspaceId?: string | null;
  queryEmbedding: number[];
  k?: number; // default 15
}

export interface RetrievedMemory {
  id: string;
  content: string;
  scope: string;
  kind: string;
  score: number; // final ranked score
  weight: number; // decayed weight
  cosineSim: number; // raw similarity 0..1
  lastSeenAt: Date;
}

// Per-scope cap so no single scope drowns out the others
const PER_SCOPE_CAP: Record<string, number> = {
  user: 8,
  team: 3,
  workspace: 2,
  job: 2,
};

export class ContextRetrievalService {
  /**
   * Retrieve the top-K most relevant memories for an ICP regen or run.
   * Non-blocking for callers that don't yet have the synthesis worker
   * populating memories — returns an empty array if no memories exist.
   */
  async retrieveForRegen(query: RetrievalQuery): Promise<RetrievedMemory[]> {
    const k = query.k ?? 15;
    const now = Date.now();

    // Parallel fetch across scopes. Each scope is capped at 500 rows at the
    // DB level (hard cap) to bound memory cost; cosine similarity then runs
    // in JS on the result.
    const scopeFilters: Array<{ scope: string; scopeId: string }> = [
      { scope: 'user', scopeId: query.userId },
      ...(query.teamIds ?? []).map((teamId) => ({ scope: 'team', scopeId: teamId })),
    ];
    if (query.workspaceId) scopeFilters.push({ scope: 'workspace', scopeId: query.workspaceId });
    if (query.jobId) scopeFilters.push({ scope: 'job', scopeId: query.jobId });

    if (scopeFilters.length === 0) return [];

    const fetches = await Promise.all(
      scopeFilters.map(async (f) => {
        return prisma.memoryEntry.findMany({
          where: {
            scope: f.scope,
            scopeId: f.scopeId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          take: 500,
          orderBy: { lastSeenAt: 'desc' },
        });
      }),
    );

    // Flatten + score
    const scored: RetrievedMemory[] = [];
    for (const rows of fetches) {
      for (const row of rows) {
        const embedding = this.parseEmbedding(row.embedding);
        if (embedding.length === 0) continue;
        if (embedding.length !== query.queryEmbedding.length) continue;

        const cosineSim = cosineSimilarity(embedding, query.queryEmbedding);
        const decayedWeight = this.applyDecay(row.weight, row.lastSeenAt, row.scope, now);
        const boost = SCOPE_BOOST[row.scope] ?? 1.0;
        const score = cosineSim * decayedWeight * boost;

        scored.push({
          id: row.id,
          content: row.content,
          scope: row.scope,
          kind: row.kind,
          score,
          weight: decayedWeight,
          cosineSim,
          lastSeenAt: row.lastSeenAt,
        });
      }
    }

    // Sort by score desc, then enforce per-scope caps, then trim to k
    scored.sort((a, b) => b.score - a.score);

    const perScopeCount: Record<string, number> = {};
    const capped: RetrievedMemory[] = [];
    for (const m of scored) {
      const cap = PER_SCOPE_CAP[m.scope] ?? k;
      const used = perScopeCount[m.scope] ?? 0;
      if (used >= cap) continue;
      perScopeCount[m.scope] = used + 1;
      capped.push(m);
      if (capped.length >= k) break;
    }

    return capped;
  }

  /**
   * Format retrieved memories as a "Prior learnings" section for prompt
   * injection. Consumed by IdealProfileService.generateForAgent().
   */
  formatForPrompt(memories: RetrievedMemory[]): string {
    if (memories.length === 0) return '';
    const lines: string[] = ['## Prior learnings (top matches from your history, ranked by relevance)'];
    memories.forEach((m, i) => {
      lines.push(
        `${i + 1}. [${m.scope.toUpperCase()}, weight ${m.weight.toFixed(2)}] ${m.content}`,
      );
    });
    return lines.join('\n');
  }

  /**
   * Reinforce a memory after the LLM uses it. Updates lastSeenAt and bumps
   * reinforceCount, capping weight at 3× baseline so no single memory
   * dominates. Called by the synthesis + retrieval follow-up flow.
   */
  async reinforce(memoryId: string): Promise<void> {
    const existing = await prisma.memoryEntry.findUnique({ where: { id: memoryId } });
    if (!existing) return;
    const newCount = existing.reinforceCount + 1;
    const boosted = existing.baselineWeight * (1 + Math.log(newCount));
    const capped = Math.min(boosted, existing.baselineWeight * 3);
    await prisma.memoryEntry.update({
      where: { id: memoryId },
      data: {
        lastSeenAt: new Date(),
        reinforceCount: newCount,
        weight: capped,
      },
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private parseEmbedding(raw: unknown): number[] {
    if (Array.isArray(raw)) {
      return raw.filter((n): n is number => typeof n === 'number');
    }
    return [];
  }

  private applyDecay(baseWeight: number, lastSeenAt: Date, scope: string, nowMs: number): number {
    const halfLife = HALF_LIFE_DAYS[scope] ?? 30;
    const daysOld = (nowMs - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24);
    const decay = Math.pow(0.5, daysOld / halfLife);
    return baseWeight * decay;
  }
}

// ── Math helpers ────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two equal-length embeddings, returned in [0, 1]
 * where 1 = identical direction, 0 = orthogonal. Assumes both inputs are
 * non-zero vectors of the same length.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // Clamp to [0, 1] — embeddings are usually positive cosine but floats can drift
  return Math.max(0, Math.min(1, sim));
}

export const contextRetrievalService = new ContextRetrievalService();
