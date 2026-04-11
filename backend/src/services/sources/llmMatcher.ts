/**
 * llmMatcher — shared helper used by all CandidateSource adapters to run
 * LLM-based matching against a candidate pool.
 *
 * Takes a list of resumes + a JD + optional agent instructions, runs
 * `ResumeMatchAgent` in parallel batches, and writes `AgentCandidate` rows
 * for any resume that scores ≥ threshold. Every step emits an activity event
 * via `AgentActivityLogger` so the live SSE stream picks it up.
 *
 * Phase 3 replaces the Phase 2 keyword scorer with this helper.
 */

import prisma from '../../lib/prisma.js';
import { ResumeMatchAgent } from '../../agents/ResumeMatchAgent.js';
import { agentActivityLogger } from '../AgentActivityLogger.js';
import { logger } from '../LoggerService.js';
import type { IdealCandidateProfile } from '../../types/icp.js';

export interface MatchResumeInput {
  id: string;
  name: string;
  resumeText: string;
  currentRole: string | null;
  highlight: string | null;
  email: string | null;
  tags: string[];
}

/** Structured evaluation criterion — mirrors AgentCriteriaModal. */
export interface AgentCriterion {
  id: string;
  text: string;
  pinned: boolean;
  bucket: 'most' | 'least';
}

export interface MatchContext {
  agentId: string;
  runId: string;
  userId: string;
  /** Source label written to `AgentCandidate.source` */
  sourceKey: 'instant_search' | 'internal_minio' | 'external_api';
  /** Job description text to match against (from agent.job.description or agent.description fallback) */
  jdText: string;
  /** Optional agent instructions appended to the JD to steer the scorer */
  instructions?: string | null;
  /** Fine-tuned criteria from agent.config.criteria — pinned become mandatory */
  criteria?: AgentCriterion[];
  /** Optional Ideal Candidate Profile loaded once per run by AgentRunService */
  idealProfile?: IdealCandidateProfile | null;
  /** Score floor — candidates below this are skipped */
  threshold?: number;
  /** LLM calls in flight at once */
  concurrency?: number;
  signal: AbortSignal;
}

const DEFAULT_THRESHOLD = 60;
const DEFAULT_CONCURRENCY = 5;

/**
 * Runs LLM scoring on a pool of resumes. Returns counts. Writes AgentCandidate
 * rows for matches that clear the threshold. Safe against mid-run cancellation.
 */
export async function matchResumesWithLLM(
  resumes: MatchResumeInput[],
  ctx: MatchContext,
): Promise<{ scored: number; matched: number; errors: number }> {
  if (resumes.length === 0) return { scored: 0, matched: 0, errors: 0 };

  const threshold = ctx.threshold ?? DEFAULT_THRESHOLD;
  const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;

  // Lazy-resolve anchor digests once per run when an ICP is supplied. The
  // matcher prompt embeds them as positive / negative exemplars to anchor
  // the model's scoring; they cost one extra Prisma round-trip for the
  // whole run, not per resume.
  const anchors = await resolveAnchors(ctx.idealProfile ?? null);

  // Build the augmented JD: original JD + fine-tuned criteria + instructions
  // + ICP context (when present).
  const jd = buildAugmentedJd(
    ctx.jdText,
    ctx.criteria,
    ctx.instructions,
    ctx.idealProfile ?? null,
    anchors,
  );

  // Pre-filter: skip resumes that already have an AgentCandidate row for this agent.
  const existing = await prisma.agentCandidate.findMany({
    where: { agentId: ctx.agentId, resumeId: { in: resumes.map((r) => r.id) } },
    select: { resumeId: true },
  });
  const alreadyMatched = new Set(existing.map((e) => e.resumeId));
  const toMatch = resumes.filter((r) => !alreadyMatched.has(r.id));

  if (toMatch.length === 0) {
    await agentActivityLogger.log({
      agentId: ctx.agentId,
      runId: ctx.runId,
      actor: 'system',
      eventType: `source.${ctx.sourceKey}.hit`,
      message: `All ${resumes.length} resume(s) already matched in prior runs; nothing to do`,
      payload: { poolSize: resumes.length, skipped: resumes.length },
    });
    return { scored: 0, matched: 0, errors: 0 };
  }

  await agentActivityLogger.log({
    agentId: ctx.agentId,
    runId: ctx.runId,
    actor: 'system',
    eventType: `source.${ctx.sourceKey}.hit`,
    message: `Scoring ${toMatch.length} resume(s) with ResumeMatchAgent`,
    payload: { poolSize: resumes.length, toMatch: toMatch.length, threshold },
  });

  const agent = new ResumeMatchAgent();
  const stats = { scored: 0, matched: 0, errors: 0 };
  let callSeq = 0;

  for (let i = 0; i < toMatch.length; i += concurrency) {
    if (ctx.signal.aborted) break;
    const batch = toMatch.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (resume) => {
        // Per-call requestId lets us snapshot tokens/cost/latency for this
        // single invocation. Format: `${runId}-c${monotonic-seq}`.
        const seq = ++callSeq;
        const callRequestId = `${ctx.runId}-c${seq}`;

        // CRITICAL: LoggerService.logLLMCall() silently drops the row if no
        // request context exists for the requestId. Initialize one here so
        // tokens/cost/duration are persisted into the snapshot we read after
        // the call returns.
        logger.startRequest(callRequestId, 'agent.runs.match', 'INTERNAL');

        // Emit llm.call.started so the admin terminal shows dispatched calls
        // even before they return. Phase 5 taxonomy.
        await agentActivityLogger.log({
          agentId: ctx.agentId,
          runId: ctx.runId,
          actor: 'system',
          eventType: 'llm.call.started',
          severity: 'debug',
          message: `Dispatching match for ${resume.name}`,
          payload: { sequence: seq, resumeId: resume.id, callRequestId },
        });

        const startedAt = Date.now();
        let matchResult;
        try {
          matchResult = await agent.match(
            { resume: resume.resumeText, jd, candidatePreferences: undefined },
            callRequestId,
          );
        } catch (err) {
          const latencyMs = Date.now() - startedAt;
          await agentActivityLogger.log({
            agentId: ctx.agentId,
            runId: ctx.runId,
            actor: 'system',
            eventType: 'llm.call.failed',
            severity: 'error',
            message: `Match call failed for ${resume.name}`,
            payload: { sequence: seq, latencyMs, callRequestId },
            errorStack: err instanceof Error ? err.stack : undefined,
          });
          throw err;
        }

        // Snapshot token/cost/latency for just this call.
        const snapshot = logger.getRequestSnapshot(callRequestId);
        const latencyMs = Date.now() - startedAt;
        const tokensIn = snapshot?.promptTokens ?? 0;
        const tokensOut = snapshot?.completionTokens ?? 0;
        const costUsd = snapshot?.totalCost ?? 0;
        const model = snapshot?.lastModel ?? null;
        const provider = snapshot?.lastProvider ?? null;

        await agentActivityLogger.log({
          agentId: ctx.agentId,
          runId: ctx.runId,
          actor: 'system',
          eventType: 'llm.call.completed',
          severity: 'info',
          message: `Matched ${resume.name} in ${latencyMs}ms`,
          payload: {
            sequence: seq,
            resumeId: resume.id,
            callRequestId,
            tokensIn,
            tokensOut,
            costUsd,
            latencyMs,
            model,
            provider,
          },
        });

        const score = matchResult?.overallMatchScore?.score ?? 0;
        const grade = matchResult?.overallMatchScore?.grade ?? 'F';
        const verdict = matchResult?.overallFit?.verdict ?? 'Unknown';

        const matchedSkills: string[] = [];
        if (matchResult?.skillMatch?.matchedMustHave) {
          matchedSkills.push(
            ...matchResult.skillMatch.matchedMustHave
              .slice(0, 5)
              .map((s: unknown) =>
                typeof s === 'string' ? s : ((s as { skill?: string; name?: string }).skill ?? (s as { name?: string }).name ?? String(s)),
              ),
          );
        }
        const uniqueValue: string[] = matchResult?.candidatePotential?.uniqueValueProps?.slice(0, 2) ?? [];
        const gaps: string[] = (matchResult?.hardRequirementGaps ?? [])
          .slice(0, 3)
          .map((g: unknown) =>
            typeof g === 'string'
              ? g
              : ((g as { gap?: string; requirement?: string }).gap ?? (g as { requirement?: string }).requirement ?? String(g)),
          );

        return { resume, score, grade, verdict, matchedSkills, uniqueValue, gaps };
      }),
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        stats.errors++;
        await agentActivityLogger.log({
          agentId: ctx.agentId,
          runId: ctx.runId,
          actor: 'system',
          eventType: 'error.llm',
          severity: 'error',
          message: 'Match scoring failed for a resume',
          errorStack: r.reason instanceof Error ? r.reason.stack : String(r.reason),
        });
        continue;
      }

      stats.scored++;
      const { resume, score, grade, verdict, matchedSkills, uniqueValue, gaps } = r.value;

      if (score < threshold) {
        await agentActivityLogger.log({
          agentId: ctx.agentId,
          runId: ctx.runId,
          actor: 'system',
          eventType: 'match.rejected_below_threshold',
          severity: 'debug',
          message: `${resume.name} scored ${Math.round(score)} — below threshold ${threshold}`,
          payload: { score, grade, resumeId: resume.id },
        });
        continue;
      }

      // Build a one-line reason blending verdict + top matched skill + gap
      const reasonParts: string[] = [verdict];
      if (matchedSkills.length > 0) reasonParts.push(`strong in ${matchedSkills.slice(0, 2).join(', ')}`);
      if (uniqueValue.length > 0) reasonParts.push(uniqueValue[0]);
      const reason = reasonParts.join(' · ');

      const candidate = await prisma.agentCandidate.create({
        data: {
          agentId: ctx.agentId,
          runId: ctx.runId,
          resumeId: resume.id,
          name: resume.name || 'Unknown',
          email: resume.email,
          headline: resume.currentRole ?? resume.highlight ?? null,
          matchScore: score,
          source: ctx.sourceKey,
          reason,
          status: 'pending',
          metadata: {
            grade,
            verdict,
            matchedSkills,
            gaps,
            uniqueValue,
          } as unknown as object,
        },
      });

      stats.matched++;

      await agentActivityLogger.log({
        agentId: ctx.agentId,
        runId: ctx.runId,
        candidateId: candidate.id,
        actor: 'system',
        eventType: 'match.scored',
        message: `${candidate.name} scored ${Math.round(score)} (${grade})`,
        payload: { score, grade, verdict, resumeId: resume.id },
      });
    }
  }

  return stats;
}

// ── JD builder ──────────────────────────────────────────────────────────────
//
// Weaves the fine-tuned `AgentCriterion[]` list into the job description so
// the scoring agent treats pinned items as dealbreakers and weights MOST vs
// LEAST IMPORTANT appropriately. When no criteria are set, the JD is left
// unchanged (plus optional instructions).

interface AnchorDigest {
  id: string;
  name: string;
  headline: string | null;
  kind: 'positive' | 'negative';
}

async function resolveAnchors(icp: IdealCandidateProfile | null): Promise<AnchorDigest[]> {
  if (!icp) return [];
  const positiveIds = (icp.anchorCandidateIds ?? []).slice(0, 5);
  const negativeIds = (icp.antiAnchorCandidateIds ?? []).slice(0, 5);
  if (positiveIds.length === 0 && negativeIds.length === 0) return [];

  const rows = await prisma.agentCandidate.findMany({
    where: { id: { in: [...positiveIds, ...negativeIds] } },
    select: { id: true, name: true, headline: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const digests: AnchorDigest[] = [];
  for (const id of positiveIds) {
    const row = byId.get(id);
    if (!row) continue;
    digests.push({ id: row.id, name: row.name, headline: row.headline ?? null, kind: 'positive' });
  }
  for (const id of negativeIds) {
    const row = byId.get(id);
    if (!row) continue;
    digests.push({ id: row.id, name: row.name, headline: row.headline ?? null, kind: 'negative' });
  }
  return digests;
}

function buildAugmentedJd(
  jdText: string,
  criteria: AgentCriterion[] | undefined,
  instructions: string | null | undefined,
  icp: IdealCandidateProfile | null,
  anchors: AnchorDigest[],
): string {
  const sections: string[] = [jdText];

  if (criteria && criteria.length > 0) {
    const pinned = criteria.filter((c) => c.pinned);
    const mostImportant = criteria.filter((c) => !c.pinned && c.bucket === 'most');
    const leastImportant = criteria.filter((c) => !c.pinned && c.bucket === 'least');

    if (pinned.length > 0) {
      sections.push(
        '\n## Mandatory requirements (DEALBREAKERS)',
        'A candidate missing ANY of the following MUST be disqualified (grade F, verdict "Not Qualified"). These are non-negotiable:',
        ...pinned.map((c, i) => `${i + 1}. ${c.text}`),
      );
    }
    if (mostImportant.length > 0) {
      sections.push(
        '\n## Highly weighted preferences',
        'Weight these heavily when scoring. A candidate meeting several of these should receive a notable score boost:',
        ...mostImportant.map((c, i) => `${i + 1}. ${c.text}`),
      );
    }
    if (leastImportant.length > 0) {
      sections.push(
        '\n## Nice-to-haves',
        'Count these as minor bonuses; missing them is not penalizing:',
        ...leastImportant.map((c, i) => `${i + 1}. ${c.text}`),
      );
    }
  }

  if (instructions && instructions.trim()) {
    sections.push('\n## Recruiter instructions', instructions.trim());
  }

  if (icp) {
    const core = (icp.coreSkills ?? [])
      .map((s) => `${s.skill} (${s.importance})`)
      .join(', ');
    const bonus = (icp.bonusSkills ?? []).join(', ');
    const anti = (icp.antiSkills ?? []).join(', ');
    const yoe = icp.yearsOfExperience
      ? `${icp.yearsOfExperience.min}${icp.yearsOfExperience.max ? `-${icp.yearsOfExperience.max}` : '+'} (ideal ${icp.yearsOfExperience.ideal})`
      : null;

    const lines: string[] = ['\n## Recruiter\'s Ideal Candidate Profile'];
    if (core) lines.push(`Core skills: ${core}`);
    if (bonus) lines.push(`Bonus skills: ${bonus}`);
    if (anti) lines.push(`AVOID: ${anti}`);
    if (yoe) lines.push(`Years of full-time experience: ${yoe}`);
    if (icp.preferredLocations && icp.preferredLocations.length > 0) {
      lines.push(`Preferred locations: ${icp.preferredLocations.join(', ')}`);
    }
    if (icp.preferredIndustries && icp.preferredIndustries.length > 0) {
      lines.push(`Preferred industries: ${icp.preferredIndustries.join(', ')}`);
    }
    if (icp.signals && icp.signals.length > 0) {
      const likeSignals = icp.signals.filter((s) => s.source === 'liked');
      const dislikeSignals = icp.signals.filter((s) => s.source === 'disliked');
      if (likeSignals.length > 0) {
        lines.push('Soft signals to look for:');
        for (const s of likeSignals) lines.push(`  - ${s.trait}`);
      }
      if (dislikeSignals.length > 0) {
        lines.push('Soft signals to penalize:');
        for (const s of dislikeSignals) lines.push(`  - ${s.trait}`);
      }
    }
    sections.push(lines.join('\n'));
  }

  if (anchors.length > 0) {
    const positives = anchors.filter((a) => a.kind === 'positive');
    const negatives = anchors.filter((a) => a.kind === 'negative');
    const lines: string[] = ['\n## Anchor candidates (use as ground truth)'];
    if (positives.length > 0) {
      lines.push('POSITIVE EXEMPLARS — score this resume HIGHER if it resembles these:');
      positives.forEach((a, i) => {
        lines.push(`  ${i + 1}. ${a.name}${a.headline ? ` — ${a.headline}` : ''}`);
      });
    }
    if (negatives.length > 0) {
      lines.push('NEGATIVE EXEMPLARS — score this resume LOWER if it resembles these:');
      negatives.forEach((a, i) => {
        lines.push(`  ${i + 1}. ${a.name}${a.headline ? ` — ${a.headline}` : ''}`);
      });
    }
    sections.push(lines.join('\n'));
  }

  return sections.join('\n');
}
