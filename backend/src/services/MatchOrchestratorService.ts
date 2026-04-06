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

export interface TierCounts {
  A: number;
  B: number;
  C: number;
}

export interface OrchestratorCallbacks {
  onScreeningStart?: (total: number) => void;
  onScreeningComplete?: (tierCounts: { A: number; B: number; C: number }) => void;
  onMatchStart?: (resumeName: string) => void;
  onMatchComplete?: (completed: number, failed: number) => void;
}

export interface ScreeningPhaseResult {
  tieredResumes: TieredResume[];
  tierCounts: TierCounts;
  durationMs: number;
  screeningEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getMatchOrchestratorConfig() {
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
  config: ReturnType<typeof getMatchOrchestratorConfig>,
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

export async function screenMatchingResumes(
  resumes: MatchResumeInput[],
  job: MatchJobInput,
  requestId?: string,
  locale?: string,
  config = getMatchOrchestratorConfig(),
): Promise<ScreeningPhaseResult> {
  if (!config.screeningEnabled) {
    return {
      tieredResumes: resumes.map((r) => ({
        ...r,
        tier: 'B' as const,
        quickScore: 50,
        keyFindings: [],
      })),
      tierCounts: {
        A: 0,
        B: resumes.length,
        C: 0,
      },
      durationMs: 0,
      screeningEnabled: false,
    };
  }

  const screenStart = Date.now();
  const tieredResumes = await runBatchScreening(resumes, job, config, requestId, locale);
  const durationMs = Date.now() - screenStart;

  const tierCounts: TierCounts = { A: 0, B: 0, C: 0 };
  for (const resume of tieredResumes) {
    tierCounts[resume.tier]++;
  }

  logger.info('MATCHING_ORCHESTRATOR', `Phase 1 complete: A=${tierCounts.A} B=${tierCounts.B} C=${tierCounts.C} (${durationMs}ms)`, {
    requestId,
    ...tierCounts,
    durationMs,
  });

  return {
    tieredResumes,
    tierCounts,
    durationMs,
    screeningEnabled: true,
  };
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

export async function matchTieredResume(
  resume: TieredResume,
  job: MatchJobInput,
  formatCandidatePrefs: (prefs: any) => string,
  requestId?: string,
  locale?: string,
  config = getMatchOrchestratorConfig(),
): Promise<MatchTaskResult> {
  const taskStart = Date.now();

  try {
    if (resume.tier === 'C') {
      return {
        resumeId: resume.id,
        resumeName: resume.name,
        matchResult: buildTierCResult(resume.quickScore, resume.keyFindings, resume.name),
        tier: 'C',
        llmMs: 0,
      };
    }

    const candidatePrefs = formatCandidatePrefs(resume.preferences);
    const matchResult = resume.tier === 'A' && config.skillDecomposition
      ? await matchWithSkillDecomposition(resume, job, candidatePrefs, requestId, locale, config.matchModel)
      : await matchWithResumeMatchAgent(resume, job, candidatePrefs, requestId, locale, config.matchModel);

    return {
      resumeId: resume.id,
      resumeName: resume.name,
      matchResult,
      tier: resume.tier,
      llmMs: Date.now() - taskStart,
    };
  } catch (err: any) {
    const llmMs = Date.now() - taskStart;

    logger.error('MATCHING_ORCHESTRATOR', `Failed to match ${resume.name}`, {
      requestId,
      resumeId: resume.id,
      error: err.message,
      durationMs: llmMs,
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
  const config = getMatchOrchestratorConfig();

  // Phase 1: Batch screening (if enabled)
  let tieredResumes: TieredResume[];

  if (config.screeningEnabled) {
    callbacks.onScreeningStart?.(resumes.length);
  }
  const screeningResult = await screenMatchingResumes(resumes, job, requestId, locale, config);
  tieredResumes = screeningResult.tieredResumes;
  if (screeningResult.screeningEnabled) {
    callbacks.onScreeningComplete?.(screeningResult.tierCounts);
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
    callbacks.onMatchStart?.(resume.name);
    const result = await matchTieredResume(resume, job, formatCandidatePrefs, requestId, locale, config);
    if (result.matchResult) {
      completed++;
    } else {
      failed++;
    }
    callbacks.onMatchComplete?.(completed, failed);
    return result;
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
