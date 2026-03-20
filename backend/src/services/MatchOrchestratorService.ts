import { logger } from './LoggerService.js';
import { ResumeMatchAgent } from '../agents/ResumeMatchAgent.js';
import { batchScreenSkill } from '../agents/skills/BatchScreenSkill.js';
import { skillMatchSkill } from '../agents/skills/SkillMatchSkill.js';
import { experienceMatchSkill } from '../agents/skills/ExperienceMatchSkill.js';
import { preferenceMatchSkill } from '../agents/skills/PreferenceMatchSkill.js';
import { mergeSkillResults, buildTierCResult } from '../agents/skills/matchMerger.js';
import type { MatchResult } from '../types/index.js';
import type {
  BatchScreenInput,
  TieredResume,
} from '../agents/skills/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchResumeInput {
  id: string;
  name: string;
  resumeText: string;
  currentRole?: string | null;
  experienceYears?: string | number | null;
  tags?: string[];
  preferences?: any;
}

export interface MatchJobInput {
  id: string;
  title: string;
  description: string;
  jobMetadata: string;
}

export interface MatchTaskResult {
  resumeId: string;
  resumeName: string;
  matchResult: MatchResult | null;
  error?: string;
  tier?: 'A' | 'B' | 'C';
  llmMs?: number;
}

export interface OrchestratorCallbacks {
  onScreeningStart?: (total: number) => void;
  onScreeningComplete?: (tierCounts: { A: number; B: number; C: number }) => void;
  onMatchStart?: (resumeName: string) => void;
  onMatchComplete?: (completed: number, failed: number) => void;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig() {
  const screenModel = process.env.LLM_MATCH_SCREEN || '';
  const matchModel = process.env.LLM_MATCH_RESUME || undefined;
  const skillDecomposition = process.env.MATCH_SKILL_DECOMPOSITION === 'true';
  const batchSize = parseInt(process.env.MATCH_SCREEN_BATCH_SIZE || '10', 10);
  const screenConcurrency = parseInt(process.env.MATCH_SCREEN_CONCURRENCY || '3', 10);
  const skillConcurrency = parseInt(process.env.MATCH_SKILL_CONCURRENCY || '10', 10);
  const matchConcurrency = parseInt(process.env.MATCH_CONCURRENCY || '5', 10);
  const tierAThreshold = parseInt(process.env.MATCH_TIER_A_THRESHOLD || '70', 10);
  const tierBThreshold = parseInt(process.env.MATCH_TIER_B_THRESHOLD || '40', 10);

  return {
    screenModel,
    matchModel,
    skillDecomposition,
    batchSize,
    screenConcurrency,
    skillConcurrency,
    matchConcurrency,
    tierAThreshold,
    tierBThreshold,
    screeningEnabled: !!screenModel,
  };
}

// ---------------------------------------------------------------------------
// Concurrency helper (same as in matching.ts)
// ---------------------------------------------------------------------------

async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const p = (async () => {
      try {
        const value = await task();
        results.push({ status: 'fulfilled', value });
      } catch (reason: any) {
        results.push({ status: 'rejected', reason });
      }
    })();
    const tracked = p.finally(() => executing.delete(tracked));
    executing.add(tracked);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

// ---------------------------------------------------------------------------
// Phase 1: Batch Screening
// ---------------------------------------------------------------------------

async function runBatchScreening(
  resumes: MatchResumeInput[],
  job: MatchJobInput,
  config: ReturnType<typeof getConfig>,
  requestId?: string,
  locale?: string,
): Promise<TieredResume[]> {
  const { batchSize, screenConcurrency, screenModel, tierAThreshold, tierBThreshold } = config;

  // Split resumes into batches
  const batches: MatchResumeInput[][] = [];
  for (let i = 0; i < resumes.length; i += batchSize) {
    batches.push(resumes.slice(i, i + batchSize));
  }

  logger.info('MATCHING_ORCHESTRATOR', `Phase 1: screening ${resumes.length} resumes in ${batches.length} batches`, {
    requestId, batchSize, batches: batches.length,
  });

  // Run batches concurrently
  const batchTasks = batches.map((batch) => async () => {
    const input: BatchScreenInput = {
      jobTitle: job.title,
      jobDescription: job.description.slice(0, 4000),
      jobMetadata: job.jobMetadata || undefined,
      resumes: batch.map((r) => ({
        id: r.id,
        name: r.name,
        currentRole: r.currentRole || undefined,
        experienceYears: r.experienceYears != null ? Number(r.experienceYears) || undefined : undefined,
        tags: r.tags || [],
        preview: (r.resumeText || '').slice(0, 500),
      })),
    };

    return batchScreenSkill.screen(input, requestId, locale, screenModel);
  });

  const batchResults = await runConcurrent(batchTasks, screenConcurrency);

  // Build screening map: resumeId → screening result
  const screeningMap = new Map<string, { quickScore: number; tier: 'A' | 'B' | 'C'; keyFindings: string[] }>();
  for (const result of batchResults) {
    if (result.status === 'fulfilled') {
      for (const s of result.value.screenings) {
        // Re-apply tier thresholds (in case the LLM deviated)
        let tier: 'A' | 'B' | 'C';
        if (s.quickScore >= tierAThreshold) tier = 'A';
        else if (s.quickScore >= tierBThreshold) tier = 'B';
        else tier = 'C';

        screeningMap.set(s.resumeId, { quickScore: s.quickScore, tier, keyFindings: s.keyFindings });
      }
    }
  }

  // Assign tiers to all resumes (default to B for any missed by screening)
  return resumes.map((r) => {
    const screening = screeningMap.get(r.id);
    return {
      id: r.id,
      name: r.name,
      resumeText: r.resumeText,
      currentRole: r.currentRole,
      experienceYears: r.experienceYears,
      tags: r.tags,
      preferences: r.preferences,
      tier: screening?.tier ?? 'B',
      quickScore: screening?.quickScore ?? 50,
      keyFindings: screening?.keyFindings ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Phase 2: Deep Analysis
// ---------------------------------------------------------------------------

async function matchWithSkillDecomposition(
  resume: TieredResume,
  job: MatchJobInput,
  candidatePrefs: string,
  requestId?: string,
  locale?: string,
  model?: string,
): Promise<MatchResult> {
  // Run 3 skills in parallel
  const [skillOut, expOut, prefOut] = await Promise.all([
    skillMatchSkill.analyze(
      { resume: resume.resumeText, jd: job.description, jobMetadata: job.jobMetadata || undefined },
      requestId, locale, model,
    ),
    experienceMatchSkill.analyze(
      { resume: resume.resumeText, jd: job.description, jobMetadata: job.jobMetadata || undefined },
      requestId, locale, model,
    ),
    preferenceMatchSkill.analyze(
      { resume: resume.resumeText, jd: job.description, candidatePreferences: candidatePrefs || undefined, jobMetadata: job.jobMetadata || undefined },
      requestId, locale, model,
    ),
  ]);

  return mergeSkillResults(skillOut, expOut, prefOut);
}

async function matchWithResumeMatchAgent(
  resume: TieredResume,
  job: MatchJobInput,
  candidatePrefs: string,
  requestId?: string,
  locale?: string,
  model?: string,
): Promise<MatchResult> {
  const matchAgent = new ResumeMatchAgent();
  return matchAgent.execute(
    {
      resume: resume.resumeText,
      jd: job.description,
      candidatePreferences: candidatePrefs || undefined,
      jobMetadata: job.jobMetadata || undefined,
    },
    job.description,
    requestId,
    locale,
    model,
  );
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

export async function orchestrateMatching(
  resumes: MatchResumeInput[],
  job: MatchJobInput,
  formatCandidatePrefs: (prefs: any) => string,
  callbacks: OrchestratorCallbacks,
  requestId?: string,
  locale?: string,
): Promise<MatchTaskResult[]> {
  const config = getConfig();

  // Phase 1: Batch screening (if enabled)
  let tieredResumes: TieredResume[];

  if (config.screeningEnabled) {
    callbacks.onScreeningStart?.(resumes.length);

    const screenStart = Date.now();
    tieredResumes = await runBatchScreening(resumes, job, config, requestId, locale);
    const screenDuration = Date.now() - screenStart;

    const tierCounts = { A: 0, B: 0, C: 0 };
    for (const r of tieredResumes) tierCounts[r.tier]++;

    logger.info('MATCHING_ORCHESTRATOR', `Phase 1 complete: A=${tierCounts.A} B=${tierCounts.B} C=${tierCounts.C} (${screenDuration}ms)`, {
      requestId, ...tierCounts, durationMs: screenDuration,
    });

    callbacks.onScreeningComplete?.(tierCounts);
  } else {
    // No screening — all resumes go through as Tier B (standard path)
    tieredResumes = resumes.map((r) => ({
      ...r,
      tier: 'B' as const,
      quickScore: 50,
      keyFindings: [],
    }));
  }

  // Phase 2: Deep analysis (tiered dispatch)
  const results: MatchTaskResult[] = [];
  let completed = 0;
  let failed = 0;

  // Tier C: synthetic results (no LLM call)
  const tierC = tieredResumes.filter((r) => r.tier === 'C');
  for (const resume of tierC) {
    const matchResult = buildTierCResult(resume.quickScore, resume.keyFindings, resume.name);
    results.push({
      resumeId: resume.id,
      resumeName: resume.name,
      matchResult,
      tier: 'C',
      llmMs: 0,
    });
    completed++;
    callbacks.onMatchComplete?.(completed, failed);
  }

  // Tier A + Tier B: LLM-based matching
  const tierAB = tieredResumes.filter((r) => r.tier !== 'C');

  const matchTasks = tierAB.map((resume) => async (): Promise<MatchTaskResult> => {
    const taskStart = Date.now();
    callbacks.onMatchStart?.(resume.name);

    try {
      const candidatePrefs = formatCandidatePrefs(resume.preferences);
      let matchResult: MatchResult;

      if (resume.tier === 'A' && config.skillDecomposition) {
        // Tier A: 3 parallel skills → merge
        matchResult = await matchWithSkillDecomposition(
          resume, job, candidatePrefs, requestId, locale, config.matchModel,
        );
      } else {
        // Tier B (or Tier A without skill decomposition): single ResumeMatchAgent
        matchResult = await matchWithResumeMatchAgent(
          resume, job, candidatePrefs, requestId, locale, config.matchModel,
        );
      }

      const llmMs = Date.now() - taskStart;
      completed++;
      callbacks.onMatchComplete?.(completed, failed);

      return {
        resumeId: resume.id,
        resumeName: resume.name,
        matchResult,
        tier: resume.tier,
        llmMs,
      };
    } catch (err: any) {
      const llmMs = Date.now() - taskStart;
      failed++;
      callbacks.onMatchComplete?.(completed, failed);

      logger.error('MATCHING_ORCHESTRATOR', `Failed to match ${resume.name}`, {
        requestId, resumeId: resume.id, error: err.message, durationMs: llmMs,
      });

      return {
        resumeId: resume.id,
        resumeName: resume.name,
        matchResult: null,
        error: 'Matching failed',
        tier: resume.tier,
        llmMs,
      };
    }
  });

  // Use skill concurrency for Tier A (more tasks per resume), standard for others
  const concurrency = config.skillDecomposition
    ? config.skillConcurrency
    : config.matchConcurrency;

  const settledResults = await runConcurrent(matchTasks, concurrency);

  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      results.push(settled.value);
    }
  }

  return results;
}
