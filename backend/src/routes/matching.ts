import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { checkBatchUsage } from '../middleware/usageMeter.js';
import { logger } from '../services/LoggerService.js';
import { PreMatchFilterAgent, PreMatchFilterResumeSummary } from '../agents/PreMatchFilterAgent.js';
import { getVisibilityScope, buildUserIdFilter, buildAdminOverrideFilter } from '../lib/teamVisibility.js';
import {
  orchestrateMatching,
  screenMatchingResumes,
  matchTieredResume,
  getMatchOrchestratorConfig,
  type MatchResumeInput,
  type MatchJobInput,
  type MatchTaskResult,
} from '../services/MatchOrchestratorService.js';
import { getPreferredResumeEmail } from '../utils/resumeContact.js';
import { universityTierService } from '../services/UniversityTierService.js';
import type { TieredResume } from '../agents/skills/types.js';
import '../types/auth.js';

const router = Router();

function formatJobMetadata(job: any): string {
  const parts: string[] = [];
  if (job.locations && Array.isArray(job.locations) && job.locations.length > 0) {
    parts.push(`Locations: ${job.locations.map((l: any) => `${l.city}, ${l.country}`).join('; ')}`);
  } else if (job.location) {
    parts.push(`Location: ${job.location}`);
  }
  if (job.workType) parts.push(`Work Type: ${job.workType}`);
  if (job.employmentType) parts.push(`Employment Type: ${job.employmentType}`);
  if (job.salaryMin || job.salaryMax) {
    const cur = job.salaryCurrency || 'USD';
    const period = job.salaryPeriod || 'monthly';
    parts.push(`Salary Range: ${job.salaryMin || '?'}–${job.salaryMax || '?'} ${cur} (${period})`);
  }
  if (job.department) parts.push(`Department: ${job.department}`);
  if (job.companyName) parts.push(`Company: ${job.companyName}`);
  if (job.experienceLevel) parts.push(`Experience Level: ${job.experienceLevel}`);
  if (job.education) parts.push(`Education Requirement: ${job.education}`);
  if (job.hardRequirements) parts.push(`Hard Requirements:\n${job.hardRequirements}`);
  if (job.qualifications) parts.push(`Qualifications:\n${job.qualifications}`);
  if (job.niceToHave) parts.push(`Nice to Have:\n${job.niceToHave}`);
  if (job.evaluationRules) parts.push(`Evaluation Rules:\n${job.evaluationRules}`);
  return parts.length > 0 ? parts.join('\n') : '';
}

/**
 * Build a comprehensive JD text combining all relevant job fields.
 * Hard requirements are placed early so they survive truncation in batch screening.
 */
function buildComprehensiveJD(job: any): string {
  const sections: string[] = [];
  if (job.hardRequirements) {
    sections.push(`## 硬性要求 / Hard Requirements\n${job.hardRequirements}`);
  }
  if (job.qualifications) {
    sections.push(`## 任职要求 / Qualifications\n${job.qualifications}`);
  }
  if (job.description) {
    sections.push(`## 职位描述 / Job Description\n${job.description}`);
  }
  if (job.education) {
    sections.push(`## 学历要求 / Education Requirement\n${job.education}`);
  }
  if (job.niceToHave) {
    sections.push(`## 加分项 / Nice to Have\n${job.niceToHave}`);
  }
  if (job.evaluationRules) {
    sections.push(`## 评估规则 / Evaluation Rules\n${job.evaluationRules}`);
  }
  return sections.join('\n\n');
}

function formatCandidatePreferences(prefs: any): string {
  if (!prefs) return '';
  const parts: string[] = [];
  if (prefs.cities?.length > 0) parts.push(`Preferred Cities: ${prefs.cities.join(', ')}`);
  if (prefs.workType?.length > 0) parts.push(`Preferred Work Type: ${prefs.workType.join(', ')}`);
  if (prefs.salaryMin || prefs.salaryMax) {
    const cur = prefs.salaryCurrency || 'CNY';
    parts.push(`Expected Salary: ${prefs.salaryMin || '?'}–${prefs.salaryMax || '?'} ${cur}`);
  }
  if (prefs.preferredJobTypes?.length > 0) parts.push(`Preferred Job Types: ${prefs.preferredJobTypes.join(', ')}`);
  if (prefs.preferredCompanyTypes?.length > 0) parts.push(`Preferred Company Types: ${prefs.preferredCompanyTypes.join(', ')}`);
  if (prefs.notes) parts.push(`Additional Notes: ${prefs.notes}`);
  return parts.length > 0 ? parts.join('\n') : '';
}

function getProcessingMetrics(requestId?: string) {
  if (!requestId) return undefined;
  const snapshot = logger.getRequestSnapshot(requestId);
  if (!snapshot) return undefined;
  return {
    durationMs: snapshot.durationMs,
    promptTokens: snapshot.promptTokens,
    completionTokens: snapshot.completionTokens,
    totalTokens: snapshot.totalTokens,
    totalCost: snapshot.totalCost,
    model: snapshot.lastModel,
    provider: snapshot.lastProvider,
    llmCalls: snapshot.llmCallsCount,
  };
}

function getMatchingSessionConfig(config: unknown) {
  const raw = config && typeof config === 'object' ? (config as Record<string, any>) : {};
  const rawPreFilter =
    raw.preFilter && typeof raw.preFilter === 'object'
      ? (raw.preFilter as Record<string, any>)
      : null;

  const resumeIds = Array.isArray(raw.resumeIds)
    ? raw.resumeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const locations = Array.isArray(rawPreFilter?.locations)
    ? rawPreFilter.locations.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const jobTypes = Array.isArray(rawPreFilter?.jobTypes)
    ? rawPreFilter.jobTypes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const freeText =
    typeof rawPreFilter?.freeText === 'string' && rawPreFilter.freeText.trim().length > 0
      ? rawPreFilter.freeText.trim()
      : null;

  return {
    resumeIds,
    preFilter: rawPreFilter
      ? {
          locations,
          jobTypes,
          freeText,
        }
      : null,
  };
}

function getMatchingBatchConfig(config: unknown) {
  const raw = config && typeof config === 'object' ? (config as Record<string, any>) : {};
  const rawPreFilter =
    raw.preFilter && typeof raw.preFilter === 'object'
      ? (raw.preFilter as Record<string, any>)
      : null;

  const jobIds = Array.isArray(raw.jobIds)
    ? raw.jobIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const resumeIds = Array.isArray(raw.resumeIds)
    ? raw.resumeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const locations = Array.isArray(rawPreFilter?.locations)
    ? rawPreFilter.locations.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const jobTypes = Array.isArray(rawPreFilter?.jobTypes)
    ? rawPreFilter.jobTypes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const freeText =
    typeof rawPreFilter?.freeText === 'string' && rawPreFilter.freeText.trim().length > 0
      ? rawPreFilter.freeText.trim()
      : null;
  const maxAgents = Number.isFinite(Number(raw.maxAgents))
    ? Math.max(1, Math.min(6, Number(raw.maxAgents)))
    : 6;

  return {
    jobIds,
    resumeIds,
    maxAgents,
    preFilter: rawPreFilter
      ? {
          locations,
          jobTypes,
          freeText,
        }
      : null,
  };
}

function buildMatchingCriteriaSnapshot(session: { config: unknown; totalResumes?: number }) {
  const parsedConfig = getMatchingSessionConfig(session.config);
  const selectedResumeCount =
    parsedConfig.resumeIds.length > 0
      ? parsedConfig.resumeIds.length
      : (session.totalResumes ?? 0);

  return {
    selectedResumeCount,
    locations: parsedConfig.preFilter?.locations ?? [],
    jobTypes: parsedConfig.preFilter?.jobTypes ?? [],
    freeText: parsedConfig.preFilter?.freeText ?? null,
    hasPreFilter:
      !!parsedConfig.preFilter &&
      (
        parsedConfig.preFilter.locations.length > 0 ||
        parsedConfig.preFilter.jobTypes.length > 0 ||
        !!parsedConfig.preFilter.freeText
      ),
  };
}

function buildBatchConfigSnapshot(batch: { config: unknown; totalJobs?: number }) {
  const parsedConfig = getMatchingBatchConfig(batch.config);

  return {
    selectedJobCount:
      parsedConfig.jobIds.length > 0
        ? parsedConfig.jobIds.length
        : (batch.totalJobs ?? 0),
    selectedResumeCount: parsedConfig.resumeIds.length,
    maxAgents: parsedConfig.maxAgents,
    locations: parsedConfig.preFilter?.locations ?? [],
    jobTypes: parsedConfig.preFilter?.jobTypes ?? [],
    freeText: parsedConfig.preFilter?.freeText ?? null,
    hasPreFilter:
      !!parsedConfig.preFilter &&
      (
        parsedConfig.preFilter.locations.length > 0 ||
        parsedConfig.preFilter.jobTypes.length > 0 ||
        !!parsedConfig.preFilter.freeText
      ),
  };
}

type BatchJobStatus = 'queued' | 'filtering' | 'screening' | 'matching' | 'completed' | 'failed';
type AgentLaneStatus = 'idle' | 'running' | 'done' | 'error';

interface BatchJobRuntime {
  jobId: string;
  jobTitle: string;
  sessionId: string;
  sessionTitle: string | null;
  status: BatchJobStatus;
  totalResumes: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  filteredTasks: number;
  startedAt: string;
  completedAt: string | null;
  totalScore: number;
  bestGrade: string | null;
}

interface AgentLaneRuntime {
  slot: number;
  status: AgentLaneStatus;
  jobId: string | null;
  jobTitle: string | null;
  sessionId: string | null;
  resumeId: string | null;
  resumeName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

interface BatchRuntimeState {
  batchId: string;
  title: string | null;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  maxAgents: number;
  totalJobs: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  filteredTasks: number;
  peakActiveAgents: number;
  jobs: Record<string, BatchJobRuntime>;
  agentLanes: AgentLaneRuntime[];
}

interface BatchPreparedJob {
  job: any;
  matchJob: MatchJobInput;
  session: any;
  resumes: MatchResumeInput[];
  tieredResumes: TieredResume[];
  preFilterResult: any;
}

interface BatchQueuedTask {
  jobId: string;
  sessionId: string;
  matchJob: MatchJobInput;
  resume: TieredResume;
}

const MATCH_GRADE_RANK: Record<string, number> = {
  'A+': 10,
  A: 9,
  'A-': 8,
  'B+': 7,
  B: 6,
  'B-': 5,
  'C+': 4,
  C: 3,
  'C-': 2,
  D: 1,
  F: 0,
};

function getBatchMaxAgents(): number {
  const parsed = Number.parseInt(process.env.MATCH_MAX_AGENTS || '6', 10);
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(1, Math.min(6, parsed));
}

function buildChildSessionTitle(baseTitle: string | undefined, jobTitle: string, jobCount: number): string {
  if (jobCount > 1) {
    return `${baseTitle ? `${baseTitle} — ` : ''}${jobTitle}`;
  }
  return baseTitle || `${jobTitle} — ${new Date().toLocaleDateString()}`;
}

function cloneAgentLanes(agentLanes: AgentLaneRuntime[]) {
  return agentLanes.map((lane) => ({ ...lane }));
}

function buildBatchJobsSnapshot(jobs: Record<string, BatchJobRuntime>) {
  return Object.values(jobs)
    .sort((a, b) => a.jobTitle.localeCompare(b.jobTitle))
    .map((job) => ({
      jobId: job.jobId,
      jobTitle: job.jobTitle,
      sessionId: job.sessionId,
      sessionTitle: job.sessionTitle,
      status: job.status,
      totalResumes: job.totalResumes,
      totalTasks: job.totalTasks,
      completedTasks: job.completedTasks,
      failedTasks: job.failedTasks,
      filteredTasks: job.filteredTasks,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    }));
}

function buildBatchSummary(state: BatchRuntimeState) {
  return {
    peakActiveAgents: state.peakActiveAgents,
    jobs: buildBatchJobsSnapshot(state.jobs),
    sessionIds: buildBatchJobsSnapshot(state.jobs).map((job) => job.sessionId),
  };
}

async function saveMatchTaskResult(jobId: string, taskResult: MatchTaskResult) {
  if (!taskResult.matchResult) {
    return {
      id: null,
      score: null,
      grade: null,
      status: 'new',
      preferenceScore: null,
      preferenceWarnings: [],
      error: taskResult.error || 'Matching failed',
    };
  }

  const matchResult = taskResult.matchResult;
  const score = matchResult?.overallMatchScore?.score ?? null;
  const grade = matchResult?.overallMatchScore?.grade ?? null;

  try {
    const jobMatch = await prisma.jobMatch.upsert({
      where: { jobId_resumeId: { jobId, resumeId: taskResult.resumeId } },
      update: { score, grade, matchData: matchResult as any, status: 'new' },
      create: { jobId, resumeId: taskResult.resumeId, score, grade, matchData: matchResult as any, status: 'new' },
    });

    return {
      id: jobMatch.id,
      score,
      grade,
      status: jobMatch.status,
      preferenceScore: matchResult?.preferenceAlignment?.overallScore ?? null,
      preferenceWarnings: matchResult?.preferenceAlignment?.warnings ?? [],
      error: null,
    };
  } catch (error: any) {
    logger.error('MATCHING_BATCH', 'Failed to save batch match result', {
      jobId,
      resumeId: taskResult.resumeId,
      error: error.message,
    });

    return {
      id: null,
      score: null,
      grade: null,
      status: 'new',
      preferenceScore: null,
      preferenceWarnings: [],
      error: 'Failed to save result',
    };
  }
}

async function finalizeBatchSession(
  sessionId: string,
  runtime: BatchJobRuntime,
) {
  const status = runtime.failedTasks === runtime.totalTasks && runtime.totalTasks > 0
    ? 'failed'
    : 'completed';
  const resolvedMatches = runtime.completedTasks;
  const avgScore = resolvedMatches > 0 ? Math.round(runtime.totalScore / resolvedMatches) : null;

  await prisma.matchingSession.update({
    where: { id: sessionId },
    data: {
      status,
      completedAt: new Date(),
      totalMatched: runtime.completedTasks,
      totalFailed: runtime.failedTasks,
      totalFiltered: runtime.filteredTasks,
      avgScore,
      topGrade: runtime.bestGrade,
    },
  });
}

/**
 * POST /api/v1/matching/run
 * Run AI matching for a job against selected or all resumes
 * Supports pre-filtering, concurrent processing, and session history
 */
router.post('/run', requireAuth, async (req, res) => {
  const requestId = req.requestId;
  const wantsStream = (req.headers.accept || '').includes('text/event-stream');
  let sessionId: string | null = null;
  const sendSSE = (event: string, data: Record<string, unknown>) => {
    if (wantsStream && !res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const pipelineStart = Date.now();
    const timings: Record<string, number> = {};
    const logTiming = (step: string, startMs: number) => {
      const dur = Date.now() - startMs;
      timings[step] = dur;
      logger.info('MATCHING_PERF', `[${step}] ${dur}ms`, { requestId, step, durationMs: dur });
      return dur;
    };

    const userId = req.user!.id;
    const { jobId, resumeIds, preFilter, sessionName, locale } = req.body;

    if (!jobId) {
      return res.status(400).json({ success: false, error: 'jobId is required' });
    }

    // Verify job belongs to user or team
    const scope = await getVisibilityScope(req.user!);
    let stepStart = Date.now();
    const jobWhere: any = { id: jobId, ...buildUserIdFilter(scope) };
    const job = await prisma.job.findFirst({ where: jobWhere });
    logTiming('fetch_job', stepStart);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (!job.description) {
      return res.status(400).json({ success: false, error: 'Job must have a description to run matching' });
    }

    // Format structured job metadata for LLM context
    const jobMetadata = formatJobMetadata(job);

    // Get resumes to match
    stepStart = Date.now();
    const resumeWhere: any = { ...buildUserIdFilter(scope) };
    if (resumeIds && Array.isArray(resumeIds) && resumeIds.length > 0) {
      resumeWhere.id = { in: resumeIds };
    }
    const resumes = await prisma.resume.findMany({
      where: resumeWhere,
      select: {
        id: true,
        name: true,
        resumeText: true,
        parsedData: true,
        currentRole: true,
        experienceYears: true,
        tags: true,
        preferences: true,
      },
    });
    logTiming('fetch_resumes', stepStart);

    if (resumes.length === 0) {
      return res.status(400).json({ success: false, error: 'No resumes found to match' });
    }

    // Check and deduct usage for the batch
    stepStart = Date.now();
    const usageCheck = await checkBatchUsage(userId, 'match', resumes.length);
    logTiming('check_usage', stepStart);
    if (!usageCheck.ok) {
      return res.status(402).json({ success: false, error: usageCheck.error, code: usageCheck.code, details: usageCheck.details });
    }

    logger.info('MATCHING', `Running AI matching for job ${job.title} against ${resumes.length} resumes`, { requestId });

    // Create matching session
    stepStart = Date.now();
    const session = await prisma.matchingSession.create({
      data: {
        userId,
        jobId,
        title: sessionName || `${job.title} — ${new Date().toLocaleDateString()}`,
        status: 'running',
        config: {
          resumeIds: resumes.map((r) => r.id),
          preFilter: preFilter || null,
        },
        totalResumes: resumes.length,
      },
    });

    sessionId = session.id;
    logTiming('create_session', stepStart);
    logger.info('MATCHING', `Created matching session ${session.id}`, { requestId, sessionId: session.id });

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      sendSSE('session', { sessionId: session.id, title: session.title });
      sendSSE('progress', {
        jobTitle: job.title,
        total: resumes.length,
        completed: 0,
        failed: 0,
        currentCandidateName: null,
      });
    }

    // Pre-filter step
    let resumesToMatch = resumes;
    const preMatchFilter = new PreMatchFilterAgent();
    let preFilterResult: any = null;

    if (preMatchFilter.isEnabled() && preFilter) {
      logger.info('MATCHING', `Running pre-match filter with ${resumes.length} resumes`, { requestId });
      sendSSE('prefilter', { status: 'running', total: resumes.length });

      const filterStart = Date.now();
      const summaries: PreMatchFilterResumeSummary[] = resumes.map((r) => ({
        id: r.id,
        name: r.name,
        currentRole: r.currentRole,
        experienceYears: r.experienceYears,
        tags: r.tags || [],
        preview: (r.resumeText || '').slice(0, 500),
      }));

      const filterOutput = await preMatchFilter.filter(
        {
          jobTitle: job.title || '',
          jobDescription: job.description!,
          jobLocation: (job as any).location || null,
          jobWorkType: (job as any).workType || null,
          jobEmploymentType: (job as any).employmentType || null,
          resumes: summaries,
          preferences: {
            locations: preFilter.locations || [],
            jobTypes: preFilter.jobTypes || [],
            freeText: preFilter.freeText || '',
          },
        },
        requestId
      );

      const filterDuration = Date.now() - filterStart;
      preFilterResult = {
        passedIds: filterOutput.passedIds,
        excluded: filterOutput.excluded,
        durationMs: filterDuration,
      };

      // Filter resumes to only those that passed
      const passedSet = new Set(filterOutput.passedIds);
      resumesToMatch = resumes.filter((r) => passedSet.has(r.id));

      logger.info('MATCHING', `Pre-filter: ${resumesToMatch.length} passed, ${filterOutput.excluded.length} excluded`, {
        requestId,
        passed: resumesToMatch.length,
        excluded: filterOutput.excluded.length,
        durationMs: filterDuration,
      });

      // Update session with pre-filter results
      await prisma.matchingSession.update({
        where: { id: session.id },
        data: {
          preFilterModel: process.env.LLM_PREMATCH_FILTER || null,
          preFilterResult: preFilterResult,
          totalFiltered: filterOutput.excluded.length,
        },
      });

      sendSSE('prefilter', {
        status: 'completed',
        total: resumes.length,
        passed: resumesToMatch.length,
        excluded: filterOutput.excluded.length,
        excludedDetails: filterOutput.excluded,
        durationMs: filterDuration,
      });
    }

    if (resumesToMatch.length === 0) {
      // All resumes were filtered out
      await prisma.matchingSession.update({
        where: { id: session.id },
        data: { status: 'completed', completedAt: new Date(), totalMatched: 0 },
      });

      const metrics = getProcessingMetrics(requestId);

      if (wantsStream) {
        sendSSE('complete', {
          success: true,
          data: {
            sessionId: session.id,
            jobId,
            total: resumes.length,
            totalFiltered: resumes.length,
            totalMatched: 0,
            totalFailed: 0,
            results: [],
            preFilter: preFilterResult,
          },
          metrics,
        });
        return res.end();
      }

      return res.json({
        success: true,
        data: {
          sessionId: session.id,
          jobId,
          total: resumes.length,
          totalFiltered: resumes.length,
          totalMatched: 0,
          totalFailed: 0,
          results: [],
          preFilter: preFilterResult,
        },
        metrics,
      });
    }

    // Orchestrated matching — Phase 1 screening + Phase 2 deep analysis
    const results: any[] = [];
    let completed = 0;
    let failed = 0;
    let totalScore = 0;
    let bestGrade: string | null = null;
    const gradeRank: Record<string, number> = { 'A+': 10, A: 9, 'A-': 8, 'B+': 7, B: 6, 'B-': 5, 'C+': 4, C: 3, 'C-': 2, D: 1, F: 0 };

    logger.info('MATCHING_PERF', `Starting orchestrated matching: ${resumesToMatch.length} resumes`, { requestId });

    const matchingStart = Date.now();

    // Enrich resume texts with system-verified university tier annotations
    const enrichedResumes = resumesToMatch.map((r) => {
      const parsedEducation = (r as any).parsedData?.education;
      return {
        id: r.id,
        name: r.name,
        resumeText: universityTierService.annotateResumeEducation(r.resumeText || '', parsedEducation),
        currentRole: r.currentRole,
        experienceYears: r.experienceYears,
        tags: r.tags || [],
        preferences: (r as any).preferences,
      };
    });

    const orchestratorResults = await orchestrateMatching(
      enrichedResumes,
      {
        id: jobId,
        title: job.title || '',
        description: buildComprehensiveJD(job),
        jobMetadata,
      },
      formatCandidatePreferences,
      {
        onScreeningStart: (total) => {
          sendSSE('screening', { status: 'running', total });
        },
        onScreeningComplete: (tierCounts) => {
          sendSSE('screening', { status: 'completed', ...tierCounts });
        },
        onMatchStart: (resumeName) => {
          sendSSE('progress', {
            jobTitle: job.title,
            total: resumesToMatch.length,
            completed,
            failed,
            currentCandidateName: resumeName,
          });
        },
        onMatchComplete: (c, f) => {
          completed = c;
          failed = f;
          sendSSE('progress', {
            jobTitle: job.title,
            total: resumesToMatch.length,
            completed,
            failed,
            currentCandidateName: null,
          });
        },
      },
      requestId,
      locale,
    );

    // Persist results and build response
    for (const taskResult of orchestratorResults) {
      if (!taskResult.matchResult) {
        results.push({ resumeId: taskResult.resumeId, resumeName: taskResult.resumeName, error: taskResult.error || 'Matching failed' });
        continue;
      }

      const matchResult = taskResult.matchResult;
      const score = matchResult?.overallMatchScore?.score ?? null;
      const grade = matchResult?.overallMatchScore?.grade ?? null;

      try {
        const jobMatch = await prisma.jobMatch.upsert({
          where: { jobId_resumeId: { jobId, resumeId: taskResult.resumeId } },
          update: { score, grade, matchData: matchResult as any, status: 'new' },
          create: { jobId, resumeId: taskResult.resumeId, score, grade, matchData: matchResult as any, status: 'new' },
        });

        const result = {
          id: jobMatch.id,
          resumeId: taskResult.resumeId,
          resumeName: taskResult.resumeName,
          score,
          grade,
          status: jobMatch.status,
          tier: taskResult.tier,
          preferenceScore: matchResult?.preferenceAlignment?.overallScore ?? null,
          preferenceWarnings: matchResult?.preferenceAlignment?.warnings ?? [],
        };

        if (score != null) totalScore += score;
        if (grade && (bestGrade === null || (gradeRank[grade] ?? 0) > (gradeRank[bestGrade] ?? 0))) {
          bestGrade = grade;
        }
        results.push(result);
      } catch (upsertErr: any) {
        logger.error('MATCHING', `Failed to upsert match for ${taskResult.resumeId}`, { requestId, error: upsertErr.message });
        results.push({ resumeId: taskResult.resumeId, resumeName: taskResult.resumeName, error: 'Failed to save result' });
      }
    }

    // Recount from orchestrator results
    completed = orchestratorResults.filter((r) => r.matchResult != null).length;
    failed = orchestratorResults.filter((r) => r.matchResult == null).length;

    const matchingTotal = Date.now() - matchingStart;
    logTiming('all_matching', matchingStart);

    logger.info('MATCHING_PERF', `Matching complete: wall=${matchingTotal}ms completed=${completed} failed=${failed}`, { requestId, wallMs: matchingTotal });
    logger.info('MATCHING', `Completed matching: ${completed}/${resumesToMatch.length} successful`, { requestId });

    const metrics = getProcessingMetrics(requestId);
    const avgScore = completed > 0 ? Math.round(totalScore / completed) : null;

    // Update session with final stats
    stepStart = Date.now();
    await prisma.matchingSession.update({
      where: { id: session.id },
      data: {
        status: failed === resumesToMatch.length ? 'failed' : 'completed',
        completedAt: new Date(),
        totalMatched: completed,
        totalFailed: failed,
        avgScore,
        topGrade: bestGrade,
        totalCost: metrics?.totalCost ?? 0,
        totalTokens: metrics?.totalTokens ?? 0,
        totalLLMCalls: metrics?.llmCalls ?? 0,
      },
    });
    logTiming('update_session_final', stepStart);

    const pipelineTotal = Date.now() - pipelineStart;
    logger.info('MATCHING_PERF', `=== PIPELINE COMPLETE === total=${pipelineTotal}ms`, { requestId, pipelineTotalMs: pipelineTotal, timings });

    if (wantsStream) {
      sendSSE('complete', {
        success: true,
        data: {
          sessionId: session.id,
          jobId,
          total: resumes.length,
          totalFiltered: preFilterResult?.excluded?.length ?? 0,
          totalMatched: completed,
          totalFailed: failed,
          avgScore,
          topGrade: bestGrade,
          results,
          preFilter: preFilterResult,
        },
        metrics,
      });
      return res.end();
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        jobId,
        total: resumes.length,
        totalFiltered: preFilterResult?.excluded?.length ?? 0,
        totalMatched: completed,
        totalFailed: failed,
        avgScore,
        topGrade: bestGrade,
        results,
        preFilter: preFilterResult,
      },
      metrics,
    });
  } catch (err: any) {
    logger.error('MATCHING', 'Match run failed', { requestId, error: err.message });
    if (sessionId) {
      try {
        await prisma.matchingSession.update({
          where: { id: sessionId },
          data: {
            status: 'failed',
            completedAt: new Date(),
          },
        });
      } catch (sessionUpdateErr: any) {
        logger.error('MATCHING', 'Failed to update matching session after error', {
          requestId,
          sessionId,
          error: sessionUpdateErr.message,
        });
      }
    }
    if (wantsStream && !res.headersSent) {
      return res.status(500).json({ success: false, error: 'Failed to run matching' });
    }
    if (wantsStream) {
      sendSSE('error', { error: 'Failed to run matching' });
      return res.end();
    }
    res.status(500).json({ success: false, error: 'Failed to run matching' });
  }
});

/**
 * POST /api/v1/matching/run-batch
 * Run AI matching for multiple jobs with a shared 6-lane worker pool
 */
router.post('/run-batch', requireAuth, async (req, res) => {
  const requestId = req.requestId;
  const wantsStream = (req.headers.accept || '').includes('text/event-stream');
  let batchRunId: string | null = null;
  const childSessionIds: string[] = [];

  const sendSSE = (event: string, data: Record<string, unknown>) => {
    if (wantsStream && !res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const userId = req.user!.id;
    const { jobIds, resumeIds, preFilter, sessionName, locale } = req.body;
    const normalizedJobIds = Array.isArray(jobIds)
      ? Array.from(new Set(jobIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
      : [];
    const normalizedResumeIds = Array.isArray(resumeIds)
      ? Array.from(new Set(resumeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
      : [];

    if (normalizedJobIds.length === 0) {
      return res.status(400).json({ success: false, error: 'jobIds is required' });
    }

    const scope = await getVisibilityScope(req.user!);
    const userFilter = buildUserIdFilter(scope);

    const jobs = await prisma.job.findMany({
      where: {
        ...userFilter,
        id: { in: normalizedJobIds },
      },
    });

    if (jobs.length !== normalizedJobIds.length) {
      return res.status(404).json({ success: false, error: 'One or more jobs were not found' });
    }

    const orderedJobs = normalizedJobIds
      .map((jobId) => jobs.find((job) => job.id === jobId))
      .filter((job): job is NonNullable<typeof job> => !!job);

    const jobMissingDescription = orderedJobs.find((job) => !job.description);
    if (jobMissingDescription) {
      return res.status(400).json({
        success: false,
        error: `Job "${jobMissingDescription.title}" must have a description to run matching`,
      });
    }

    const resumeWhere: Record<string, unknown> = { ...userFilter };
    if (normalizedResumeIds.length > 0) {
      resumeWhere.id = { in: normalizedResumeIds };
    }

    const resumes = await prisma.resume.findMany({
      where: resumeWhere,
      select: {
        id: true,
        name: true,
        resumeText: true,
        parsedData: true,
        currentRole: true,
        experienceYears: true,
        tags: true,
        preferences: true,
      },
    });

    if (normalizedResumeIds.length > 0 && resumes.length !== normalizedResumeIds.length) {
      return res.status(404).json({ success: false, error: 'One or more resumes were not found' });
    }

    if (resumes.length === 0) {
      return res.status(400).json({ success: false, error: 'No resumes found to match' });
    }

    const orderedResumes = (normalizedResumeIds.length > 0 ? normalizedResumeIds : resumes.map((resume) => resume.id))
      .map((resumeId) => resumes.find((resume) => resume.id === resumeId))
      .filter((resume): resume is NonNullable<typeof resume> => !!resume);

    const totalTaskCount = orderedJobs.length * orderedResumes.length;
    const usageCheck = await checkBatchUsage(userId, 'match', totalTaskCount);
    if (!usageCheck.ok) {
      return res.status(402).json({ success: false, error: usageCheck.error, code: usageCheck.code, details: usageCheck.details });
    }

    const maxAgents = getBatchMaxAgents();
    const batchRun = await prisma.matchingBatchRun.create({
      data: {
        userId,
        title: typeof sessionName === 'string' && sessionName.trim().length > 0
          ? sessionName.trim()
          : `${orderedJobs[0]?.title || 'Matching'} — ${new Date().toLocaleDateString()}`,
        status: 'running',
        config: {
          jobIds: orderedJobs.map((job) => job.id),
          resumeIds: orderedResumes.map((resume) => resume.id),
          preFilter: preFilter || null,
          maxAgents,
        },
        totalJobs: orderedJobs.length,
        totalTasks: totalTaskCount,
      },
    });

    batchRunId = batchRun.id;
    logger.info('MATCHING_BATCH', 'Created batch matching run', {
      requestId,
      batchRunId,
      totalJobs: orderedJobs.length,
      totalResumes: orderedResumes.length,
      totalTasks: totalTaskCount,
      maxAgents,
    });

    const childSessions: Array<{
      jobId: string;
      session: Awaited<ReturnType<typeof prisma.matchingSession.create>>;
    }> = [];
    for (const job of orderedJobs) {
      const session = await prisma.matchingSession.create({
        data: {
          userId,
          jobId: job.id,
          batchRunId: batchRun.id,
          title: buildChildSessionTitle(
            typeof sessionName === 'string' && sessionName.trim().length > 0 ? sessionName.trim() : undefined,
            job.title || 'Untitled job',
            orderedJobs.length,
          ),
          status: 'running',
          config: {
            resumeIds: orderedResumes.map((resume) => resume.id),
            preFilter: preFilter || null,
          },
          totalResumes: orderedResumes.length,
        },
      });

      childSessionIds.push(session.id);
      childSessions.push({ jobId: job.id, session });
    }

    const runtime: BatchRuntimeState = {
      batchId: batchRun.id,
      title: batchRun.title,
      status: 'running',
      startedAt: batchRun.startedAt.toISOString(),
      completedAt: null,
      maxAgents,
      totalJobs: orderedJobs.length,
      totalTasks: totalTaskCount,
      completedTasks: 0,
      failedTasks: 0,
      filteredTasks: 0,
      peakActiveAgents: 0,
      jobs: Object.fromEntries(
        orderedJobs.map((job) => {
          const childSession = childSessions.find((session) => session.jobId === job.id)!.session;
          return [
            job.id,
            {
              jobId: job.id,
              jobTitle: job.title || 'Untitled job',
              sessionId: childSession.id,
              sessionTitle: childSession.title,
              status: 'queued' as BatchJobStatus,
              totalResumes: orderedResumes.length,
              totalTasks: orderedResumes.length,
              completedTasks: 0,
              failedTasks: 0,
              filteredTasks: 0,
              startedAt: childSession.createdAt.toISOString(),
              completedAt: null,
              totalScore: 0,
              bestGrade: null,
            } satisfies BatchJobRuntime,
          ];
        })
      ),
      agentLanes: Array.from({ length: maxAgents }, (_, index) => ({
        slot: index + 1,
        status: 'idle' as AgentLaneStatus,
        jobId: null,
        jobTitle: null,
        sessionId: null,
        resumeId: null,
        resumeName: null,
        startedAt: null,
        finishedAt: null,
        error: null,
      })),
    };

    const orchestratorConfig = getMatchOrchestratorConfig();

    const emitBatch = () => {
      sendSSE('batch', {
        batchId: runtime.batchId,
        title: runtime.title,
        status: runtime.status,
        startedAt: runtime.startedAt,
        completedAt: runtime.completedAt,
        totalJobs: runtime.totalJobs,
        totalTasks: runtime.totalTasks,
        completedTasks: runtime.completedTasks,
        failedTasks: runtime.failedTasks,
        filteredTasks: runtime.filteredTasks,
        maxAgents: runtime.maxAgents,
      });
    };

    const emitAgentPool = () => {
      sendSSE('agent_pool', {
        batchId: runtime.batchId,
        activeAgents: runtime.agentLanes.filter((lane) => lane.status === 'running').length,
        peakActiveAgents: runtime.peakActiveAgents,
        maxAgents: runtime.maxAgents,
        agents: cloneAgentLanes(runtime.agentLanes),
      });
    };

    const emitProgress = () => {
      sendSSE('progress', {
        batchId: runtime.batchId,
        status: runtime.status,
        totalJobs: runtime.totalJobs,
        totalTasks: runtime.totalTasks,
        completedTasks: runtime.completedTasks,
        failedTasks: runtime.failedTasks,
        filteredTasks: runtime.filteredTasks,
        jobs: buildBatchJobsSnapshot(runtime.jobs),
      });
    };

    const emitJobSession = (jobRuntime: BatchJobRuntime) => {
      sendSSE('job_session', { ...jobRuntime });
    };

    const updateJobPhase = (jobRuntime: BatchJobRuntime, status: BatchJobStatus) => {
      jobRuntime.status = status;
      logger.info('MATCHING_BATCH', 'Job phase updated', {
        requestId,
        batchRunId: runtime.batchId,
        jobId: jobRuntime.jobId,
        status,
      });
      emitJobSession(jobRuntime);
      emitProgress();
    };

    const completeJobIfResolved = async (jobRuntime: BatchJobRuntime) => {
      if (jobRuntime.completedAt) return;

      const resolvedCount = jobRuntime.completedTasks + jobRuntime.failedTasks + jobRuntime.filteredTasks;
      if (resolvedCount < jobRuntime.totalTasks) return;

      jobRuntime.status =
        jobRuntime.completedTasks === 0 && jobRuntime.failedTasks > 0
          ? 'failed'
          : 'completed';
      jobRuntime.completedAt = new Date().toISOString();

      await finalizeBatchSession(jobRuntime.sessionId, jobRuntime);
      emitJobSession(jobRuntime);
      emitProgress();
    };

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
    }

    emitBatch();
    Object.values(runtime.jobs).forEach(emitJobSession);
    emitAgentPool();
    emitProgress();

    const preMatchFilter = new PreMatchFilterAgent();
    const queuedTasks: BatchQueuedTask[] = [];

    for (const job of orderedJobs) {
      const jobRuntime = runtime.jobs[job.id];
      const childSession = childSessions.find((session) => session.jobId === job.id)!.session;
      const jobMetadata = formatJobMetadata(job);
      const matchJob: MatchJobInput = {
        id: job.id,
        title: job.title || '',
        description: buildComprehensiveJD(job),
        jobMetadata,
      };

      let resumesToMatch = orderedResumes;
      let preFilterResult: any = null;

      if (preMatchFilter.isEnabled() && preFilter) {
        updateJobPhase(jobRuntime, 'filtering');
        sendSSE('prefilter', {
          batchId: runtime.batchId,
          jobId: job.id,
          jobTitle: jobRuntime.jobTitle,
          sessionId: childSession.id,
          status: 'running',
          total: orderedResumes.length,
        });

        const summaries: PreMatchFilterResumeSummary[] = orderedResumes.map((resume) => ({
          id: resume.id,
          name: resume.name,
          currentRole: resume.currentRole,
          experienceYears: resume.experienceYears,
          tags: resume.tags || [],
          preview: (resume.resumeText || '').slice(0, 500),
        }));

        const filterStartedAt = Date.now();
        const filterOutput = await preMatchFilter.filter(
          {
            jobTitle: job.title || '',
            jobDescription: job.description!,
            jobLocation: (job as any).location || null,
            jobWorkType: (job as any).workType || null,
            jobEmploymentType: (job as any).employmentType || null,
            resumes: summaries,
            preferences: {
              locations: preFilter.locations || [],
              jobTypes: preFilter.jobTypes || [],
              freeText: preFilter.freeText || '',
            },
          },
          requestId
        );

        const durationMs = Date.now() - filterStartedAt;
        preFilterResult = {
          passedIds: filterOutput.passedIds,
          excluded: filterOutput.excluded,
          durationMs,
        };

        const passedResumeIds = new Set(filterOutput.passedIds);
        resumesToMatch = orderedResumes.filter((resume) => passedResumeIds.has(resume.id));
        const filteredCount = filterOutput.excluded.length;
        jobRuntime.filteredTasks = filteredCount;
        runtime.filteredTasks += filteredCount;

        await prisma.matchingSession.update({
          where: { id: childSession.id },
          data: {
            preFilterModel: process.env.LLM_PREMATCH_FILTER || null,
            preFilterResult,
            totalFiltered: filteredCount,
          },
        });

        sendSSE('prefilter', {
          batchId: runtime.batchId,
          jobId: job.id,
          jobTitle: jobRuntime.jobTitle,
          sessionId: childSession.id,
          status: 'completed',
          total: orderedResumes.length,
          passed: resumesToMatch.length,
          excluded: filteredCount,
          excludedDetails: filterOutput.excluded,
          durationMs,
        });
        emitProgress();
      }

      if (resumesToMatch.length === 0) {
        jobRuntime.completedAt = new Date().toISOString();
        await finalizeBatchSession(childSession.id, jobRuntime);
        updateJobPhase(jobRuntime, 'completed');
        emitJobSession(jobRuntime);
        continue;
      }

      updateJobPhase(jobRuntime, 'screening');
      sendSSE('screening', {
        batchId: runtime.batchId,
        jobId: job.id,
        jobTitle: jobRuntime.jobTitle,
        sessionId: childSession.id,
        status: 'running',
        total: resumesToMatch.length,
      });

      const enrichedResumes: MatchResumeInput[] = resumesToMatch.map((resume) => ({
        id: resume.id,
        name: resume.name,
        resumeText: universityTierService.annotateResumeEducation(
          resume.resumeText || '',
          (resume as any).parsedData?.education,
        ),
        currentRole: resume.currentRole,
        experienceYears: resume.experienceYears,
        tags: resume.tags || [],
        preferences: (resume as any).preferences,
      }));

      const screeningResult = await screenMatchingResumes(
        enrichedResumes,
        matchJob,
        requestId,
        locale,
        orchestratorConfig,
      );

      sendSSE('screening', {
        batchId: runtime.batchId,
        jobId: job.id,
        jobTitle: jobRuntime.jobTitle,
        sessionId: childSession.id,
        status: 'completed',
        total: resumesToMatch.length,
        A: screeningResult.tierCounts.A,
        B: screeningResult.tierCounts.B,
        C: screeningResult.tierCounts.C,
        durationMs: screeningResult.durationMs,
      });

      updateJobPhase(jobRuntime, 'matching');

      for (const resume of screeningResult.tieredResumes.filter((item) => item.tier === 'C')) {
        const taskResult = await matchTieredResume(
          resume,
          matchJob,
          formatCandidatePreferences,
          requestId,
          locale,
          orchestratorConfig,
        );
        const savedResult = await saveMatchTaskResult(job.id, taskResult);

        if (!savedResult.error && taskResult.matchResult) {
          jobRuntime.completedTasks += 1;
          runtime.completedTasks += 1;
          if (savedResult.score != null) {
            jobRuntime.totalScore += savedResult.score;
          }
          if (
            savedResult.grade &&
            (
              jobRuntime.bestGrade === null ||
              (MATCH_GRADE_RANK[savedResult.grade] ?? 0) > (MATCH_GRADE_RANK[jobRuntime.bestGrade] ?? 0)
            )
          ) {
            jobRuntime.bestGrade = savedResult.grade;
          }
        } else {
          jobRuntime.failedTasks += 1;
          runtime.failedTasks += 1;
        }
      }

      emitProgress();

      const llmTasks = screeningResult.tieredResumes.filter((item) => item.tier !== 'C');
      for (const resume of llmTasks) {
        queuedTasks.push({
          jobId: job.id,
          sessionId: childSession.id,
          matchJob,
          resume,
        });
      }

      logger.info('MATCHING_BATCH', 'Queue depth updated after job preparation', {
        requestId,
        batchRunId: runtime.batchId,
        jobId: job.id,
        queueDepth: queuedTasks.length,
      });

      if (llmTasks.length === 0) {
        await completeJobIfResolved(jobRuntime);
      }
    }

    let queueIndex = 0;
    const nextTask = () => {
      const task = queuedTasks[queueIndex];
      queueIndex += 1;
      return task ?? null;
    };

    const workerCount = Math.min(runtime.maxAgents, queuedTasks.length);
    const workerTasks = Array.from({ length: workerCount }, (_, index) => (async () => {
      const lane = runtime.agentLanes[index];

      while (true) {
        const task = nextTask();
        if (!task) {
          if (lane.status === 'running') {
            lane.status = 'done';
            lane.finishedAt = new Date().toISOString();
          }
          break;
        }

        lane.status = 'running';
        lane.jobId = task.jobId;
        lane.jobTitle = runtime.jobs[task.jobId]?.jobTitle || task.matchJob.title;
        lane.sessionId = task.sessionId;
        lane.resumeId = task.resume.id;
        lane.resumeName = task.resume.name;
        lane.startedAt = new Date().toISOString();
        lane.finishedAt = null;
        lane.error = null;

        const activeAgents = runtime.agentLanes.filter((item) => item.status === 'running').length;
        runtime.peakActiveAgents = Math.max(runtime.peakActiveAgents, activeAgents);
        logger.info('MATCHING_BATCH', 'Worker assigned', {
          requestId,
          batchRunId: runtime.batchId,
          slot: lane.slot,
          queueRemaining: Math.max(queuedTasks.length - queueIndex, 0),
          jobId: task.jobId,
          resumeId: task.resume.id,
          tier: task.resume.tier,
        });
        emitAgentPool();

        const taskResult = await matchTieredResume(
          task.resume,
          task.matchJob,
          formatCandidatePreferences,
          requestId,
          locale,
          orchestratorConfig,
        );

        const savedResult = await saveMatchTaskResult(task.jobId, taskResult);
        const jobRuntime = runtime.jobs[task.jobId];

        if (!savedResult.error && taskResult.matchResult) {
          jobRuntime.completedTasks += 1;
          runtime.completedTasks += 1;
          if (savedResult.score != null) {
            jobRuntime.totalScore += savedResult.score;
          }
          if (
            savedResult.grade &&
            (
              jobRuntime.bestGrade === null ||
              (MATCH_GRADE_RANK[savedResult.grade] ?? 0) > (MATCH_GRADE_RANK[jobRuntime.bestGrade] ?? 0)
            )
          ) {
            jobRuntime.bestGrade = savedResult.grade;
          }
          lane.status = 'done';
          lane.error = null;
        } else {
          jobRuntime.failedTasks += 1;
          runtime.failedTasks += 1;
          lane.status = 'error';
          lane.error = savedResult.error || taskResult.error || 'Matching failed';
        }

        lane.finishedAt = new Date().toISOString();
        emitProgress();
        emitAgentPool();
        await completeJobIfResolved(jobRuntime);

        logger.info('MATCHING_BATCH', 'Worker released', {
          requestId,
          batchRunId: runtime.batchId,
          slot: lane.slot,
          queueRemaining: Math.max(queuedTasks.length - queueIndex, 0),
          jobId: task.jobId,
          resumeId: task.resume.id,
          status: lane.status,
        });
      }
    })());

    await Promise.all(workerTasks);

    for (const jobRuntime of Object.values(runtime.jobs)) {
      await completeJobIfResolved(jobRuntime);
    }

    runtime.status =
      runtime.completedTasks === 0 && runtime.failedTasks > 0
        ? 'failed'
        : 'completed';
    runtime.completedAt = new Date().toISOString();

    await prisma.matchingBatchRun.update({
      where: { id: runtime.batchId },
      data: {
        status: runtime.status,
        completedAt: new Date(runtime.completedAt),
        totalJobs: runtime.totalJobs,
        totalTasks: runtime.totalTasks,
        completedTasks: runtime.completedTasks,
        failedTasks: runtime.failedTasks,
        filteredTasks: runtime.filteredTasks,
        summary: buildBatchSummary(runtime),
      },
    });

    logger.info('MATCHING_BATCH', 'Completed batch matching run', {
      requestId,
      batchRunId: runtime.batchId,
      status: runtime.status,
      totalJobs: runtime.totalJobs,
      totalTasks: runtime.totalTasks,
      completedTasks: runtime.completedTasks,
      failedTasks: runtime.failedTasks,
      filteredTasks: runtime.filteredTasks,
      peakActiveAgents: runtime.peakActiveAgents,
    });

    emitBatch();
    emitAgentPool();
    emitProgress();

    const responsePayload = {
      batchId: runtime.batchId,
      title: runtime.title,
      status: runtime.status,
      startedAt: runtime.startedAt,
      completedAt: runtime.completedAt,
      totalJobs: runtime.totalJobs,
      totalTasks: runtime.totalTasks,
      completedTasks: runtime.completedTasks,
      failedTasks: runtime.failedTasks,
      filteredTasks: runtime.filteredTasks,
      maxAgents: runtime.maxAgents,
      jobs: buildBatchJobsSnapshot(runtime.jobs),
      sessions: buildBatchJobsSnapshot(runtime.jobs).map((jobRuntime) => ({
        jobId: jobRuntime.jobId,
        sessionId: jobRuntime.sessionId,
      })),
    };

    if (wantsStream) {
      sendSSE('complete', {
        success: true,
        data: responsePayload,
      });
      return res.end();
    }

    return res.json({
      success: true,
      data: responsePayload,
    });
  } catch (err: any) {
    logger.error('MATCHING_BATCH', 'Batch matching run failed', {
      requestId,
      batchRunId,
      error: err.message,
    });

    const completedAt = new Date();
    if (childSessionIds.length > 0) {
      await prisma.matchingSession.updateMany({
        where: {
          id: { in: childSessionIds },
          completedAt: null,
        },
        data: {
          status: 'failed',
          completedAt,
        },
      });
    }

    if (batchRunId) {
      await prisma.matchingBatchRun.update({
        where: { id: batchRunId },
        data: {
          status: 'failed',
          completedAt,
        },
      }).catch(() => undefined);
    }

    if (wantsStream && !res.headersSent) {
      return res.status(500).json({ success: false, error: 'Failed to run batch matching' });
    }
    if (wantsStream) {
      sendSSE('error', { error: 'Failed to run batch matching' });
      return res.end();
    }
    return res.status(500).json({ success: false, error: 'Failed to run batch matching' });
  }
});

/**
 * GET /api/v1/matching/sessions
 * List matching sessions for the current user
 */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const { jobId, batchRunId, limit = '20', offset = '0', filterUserId, filterTeamId, teamView, includeTotal } = req.query;
    const scope = await getVisibilityScope(req.user!, (teamView as string) === 'true');
    const visFilter = await buildAdminOverrideFilter(scope, filterUserId as string | undefined, filterTeamId as string | undefined);
    const pageSize = Math.max(1, parseInt(limit as string, 10) || 20);
    const pageOffset = Math.max(0, parseInt(offset as string, 10) || 0);
    const shouldIncludeTotal = includeTotal !== 'false';
    const queryTake = shouldIncludeTotal ? pageSize : pageSize + 1;

    const where: any = { ...visFilter };
    if (jobId && typeof jobId === 'string') {
      where.jobId = jobId;
    }
    if (batchRunId && typeof batchRunId === 'string') {
      where.batchRunId = batchRunId;
    }

    const sessionsPromise = prisma.matchingSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: queryTake,
      skip: pageOffset,
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    const totalPromise = shouldIncludeTotal
      ? prisma.matchingSession.count({ where })
      : Promise.resolve<number | null>(null);

    const [sessions, total] = await Promise.all([sessionsPromise, totalPromise]);
    const hasMore = !shouldIncludeTotal && sessions.length > pageSize;
    const pageItems = hasMore ? sessions.slice(0, pageSize) : sessions;

    const hydratedSessions = pageItems.map((session) => ({
      ...session,
      criteriaSnapshot: buildMatchingCriteriaSnapshot(session),
    }));

    res.json({
      success: true,
      data: hydratedSessions,
      meta: { total, hasMore },
    });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to list sessions', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
});

router.get('/sessions/count', requireAuth, async (req, res) => {
  try {
    const { jobId, batchRunId, filterUserId, filterTeamId, teamView } = req.query;
    const scope = await getVisibilityScope(req.user!, (teamView as string) === 'true');
    const visFilter = await buildAdminOverrideFilter(scope, filterUserId as string | undefined, filterTeamId as string | undefined);

    const where: any = { ...visFilter };
    if (jobId && typeof jobId === 'string') {
      where.jobId = jobId;
    }
    if (batchRunId && typeof batchRunId === 'string') {
      where.batchRunId = batchRunId;
    }

    const total = await prisma.matchingSession.count({ where });

    res.json({ success: true, meta: { total } });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to count sessions', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to count sessions' });
  }
});

router.get('/batches', requireAuth, async (req, res) => {
  try {
    const { limit = '20', offset = '0', filterUserId, filterTeamId, teamView, includeTotal, status } = req.query;
    const scope = await getVisibilityScope(req.user!, (teamView as string) === 'true');
    const visFilter = await buildAdminOverrideFilter(scope, filterUserId as string | undefined, filterTeamId as string | undefined);
    const pageSize = Math.max(1, parseInt(limit as string, 10) || 20);
    const pageOffset = Math.max(0, parseInt(offset as string, 10) || 0);
    const shouldIncludeTotal = includeTotal !== 'false';
    const queryTake = shouldIncludeTotal ? pageSize : pageSize + 1;

    const where: any = { ...visFilter };
    if (status && typeof status === 'string') {
      where.status = status;
    }

    const batchesPromise = prisma.matchingBatchRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: queryTake,
      skip: pageOffset,
      include: {
        matchingSessions: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            completedAt: true,
            totalMatched: true,
            totalFailed: true,
            totalFiltered: true,
            job: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    const totalPromise = shouldIncludeTotal
      ? prisma.matchingBatchRun.count({ where })
      : Promise.resolve<number | null>(null);

    const [batches, total] = await Promise.all([batchesPromise, totalPromise]);
    const hasMore = !shouldIncludeTotal && batches.length > pageSize;
    const pageItems = hasMore ? batches.slice(0, pageSize) : batches;

    res.json({
      success: true,
      data: pageItems.map((batch) => ({
        ...batch,
        configSnapshot: buildBatchConfigSnapshot(batch),
      })),
      meta: { total, hasMore },
    });
  } catch (err: any) {
    logger.error('MATCHING_BATCH', 'Failed to list batch runs', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to list batch runs' });
  }
});

router.get('/batches/count', requireAuth, async (req, res) => {
  try {
    const { filterUserId, filterTeamId, teamView } = req.query;
    const scope = await getVisibilityScope(req.user!, (teamView as string) === 'true');
    const visFilter = await buildAdminOverrideFilter(scope, filterUserId as string | undefined, filterTeamId as string | undefined);
    const total = await prisma.matchingBatchRun.count({ where: visFilter });
    res.json({ success: true, meta: { total } });
  } catch (err: any) {
    logger.error('MATCHING_BATCH', 'Failed to count batch runs', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to count batch runs' });
  }
});

router.get('/batches/:batchRunId', requireAuth, async (req, res) => {
  try {
    const { batchRunId } = req.params;
    const { filterUserId, filterTeamId, teamView } = req.query;
    const scope = await getVisibilityScope(req.user!, (teamView as string) === 'true');
    const visFilter = await buildAdminOverrideFilter(scope, filterUserId as string | undefined, filterTeamId as string | undefined);

    const batch = await prisma.matchingBatchRun.findFirst({
      where: {
        id: batchRunId,
        ...visFilter,
      },
      include: {
        matchingSessions: {
          orderBy: { createdAt: 'asc' },
          include: {
            job: {
              select: {
                id: true,
                title: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch run not found' });
    }

    return res.json({
      success: true,
      data: {
        batch: {
          ...batch,
          configSnapshot: buildBatchConfigSnapshot(batch),
        },
        sessions: batch.matchingSessions.map((session) => ({
          ...session,
          criteriaSnapshot: buildMatchingCriteriaSnapshot(session),
        })),
      },
    });
  } catch (err: any) {
    logger.error('MATCHING_BATCH', 'Failed to get batch run detail', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get batch run detail' });
  }
});

router.delete('/batches/:batchRunId', requireAuth, async (req, res) => {
  try {
    const { batchRunId } = req.params;
    const scope = await getVisibilityScope(req.user!);

    const batch = await prisma.matchingBatchRun.findFirst({
      where: {
        id: batchRunId,
        ...buildUserIdFilter(scope),
      },
    });

    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch run not found' });
    }

    await prisma.matchingBatchRun.delete({ where: { id: batchRunId } });
    return res.json({ success: true });
  } catch (err: any) {
    logger.error('MATCHING_BATCH', 'Failed to delete batch run', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete batch run' });
  }
});

/**
 * GET /api/v1/matching/sessions/:sessionId
 * Get session detail with associated match results
 */
router.get('/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { filterUserId, filterTeamId, teamView } = req.query;
    const scope = await getVisibilityScope(req.user!, (teamView as string) === 'true');
    const visFilter = await buildAdminOverrideFilter(scope, filterUserId as string | undefined, filterTeamId as string | undefined);

    const session = await prisma.matchingSession.findFirst({
      where: { id: sessionId, ...visFilter },
      include: {
        job: { select: { id: true, title: true, description: true } },
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Get match results for this session's job + resume IDs
    const config = getMatchingSessionConfig(session.config);
    const resumeIds = config.resumeIds;

    const matches = await prisma.jobMatch.findMany({
      where: {
        jobId: session.jobId,
        resumeId: { in: resumeIds },
      },
      orderBy: { score: 'desc' },
      include: {
        resume: {
          select: {
            id: true,
            name: true,
            email: true,
            preferences: true,
            currentRole: true,
            experienceYears: true,
            tags: true,
          },
        },
      },
    });

    const selectedResumeRecords = resumeIds.length > 0
      ? await prisma.resume.findMany({
          where: {
            ...buildUserIdFilter(scope),
            id: { in: resumeIds },
          },
          select: {
            id: true,
            name: true,
            currentRole: true,
            experienceYears: true,
            tags: true,
          },
        })
      : [];

    const selectedResumeMap = new Map(selectedResumeRecords.map((resume) => [resume.id, resume]));
    const selectedResumes = resumeIds.reduce<typeof selectedResumeRecords>((acc, resumeId) => {
      const resume = selectedResumeMap.get(resumeId);
      if (resume) acc.push(resume);
      return acc;
    }, []);

    res.json({
      success: true,
      data: {
        session: {
          ...session,
          criteriaSnapshot: buildMatchingCriteriaSnapshot(session),
        },
        matches,
        selectedResumes,
      },
    });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to get session detail', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get session detail' });
  }
});

/**
 * DELETE /api/v1/matching/sessions/:sessionId
 * Delete a matching session record
 */
router.delete('/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const scope = await getVisibilityScope(req.user!);

    const session = await prisma.matchingSession.findFirst({
      where: { id: sessionId, ...buildUserIdFilter(scope) },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    await prisma.matchingSession.delete({ where: { id: sessionId } });
    res.json({ success: true });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to delete session', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete session' });
  }
});

/**
 * GET /api/v1/matching/results/:jobId
 * Get match results for a specific job
 */
router.get('/results/:jobId', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, minScore, sort = 'score', order = 'desc', filterUserId, filterTeamId, teamView } = req.query;

    // Verify job ownership using team visibility
    const scope = await getVisibilityScope(req.user!, (teamView as string) === 'true');
    const visFilter = await buildAdminOverrideFilter(scope, filterUserId as string | undefined, filterTeamId as string | undefined);
    const jobWhere: any = { id: jobId, ...visFilter };
    const job = await prisma.job.findFirst({ where: jobWhere });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const where: any = { jobId };
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (minScore) {
      where.score = { gte: parseInt(minScore as string, 10) };
    }

    const orderBy: any = {};
    if (sort === 'score') {
      orderBy.score = order === 'asc' ? 'asc' : 'desc';
    } else if (sort === 'date') {
      orderBy.createdAt = order === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.score = 'desc';
    }

    const matches = await prisma.jobMatch.findMany({
      where,
      orderBy,
      include: {
        resume: {
          select: {
            id: true,
            name: true,
            email: true,
            currentRole: true,
            experienceYears: true,
            tags: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: matches,
      meta: { total: matches.length, jobId, jobTitle: job.title, passingScore: job.passingScore ?? 60 },
    });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to get match results', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get match results' });
  }
});

/**
 * PATCH /api/v1/matching/results/:matchId
 * Update match status (review, shortlist, reject, invite)
 */
router.patch('/results/:matchId', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { matchId } = req.params;
    const { status } = req.body;

    const validStatuses = ['new', 'reviewed', 'shortlisted', 'rejected', 'invited', 'applied'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    // Verify ownership through job using team visibility
    const scope = await getVisibilityScope(req.user!);
    const match = await prisma.jobMatch.findUnique({
      where: { id: matchId },
      include: { job: { select: { userId: true, passingScore: true } } },
    });

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    if (!scope.isAdmin && !scope.userIds.includes(match.job.userId)) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    // Validate score meets passing threshold for apply
    if (status === 'applied') {
      const threshold = match.job.passingScore ?? 60;
      if ((match.score ?? 0) < threshold) {
        return res.status(400).json({ success: false, error: 'Score does not meet passing threshold' });
      }
    }

    const updated = await prisma.jobMatch.update({
      where: { id: matchId },
      data: {
        status,
        reviewedAt: status !== 'new' ? new Date() : null,
        reviewedBy: status !== 'new' ? userId : null,
        appliedAt: status === 'applied' ? new Date() : (match.appliedAt || null),
        appliedBy: status === 'applied' ? userId : (match.appliedBy || null),
      },
      include: {
        resume: {
          select: { id: true, name: true, email: true, currentRole: true },
        },
      },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to update match status', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update match status' });
  }
});

/**
 * POST /api/v1/matching/results/:matchId/apply-invite
 * Apply for the job and create an AI interview invitation in one step.
 */
router.post('/results/:matchId/apply-invite', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { matchId } = req.params;
    const { type = 'ai_video' } = req.body;

    const scope = await getVisibilityScope(req.user!);
    const match = await prisma.jobMatch.findUnique({
      where: { id: matchId },
      include: {
        job: { select: { id: true, userId: true, title: true, description: true, passingScore: true } },
        resume: { select: { id: true, name: true, email: true, preferences: true, resumeText: true } },
      },
    });

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    if (!scope.isAdmin && !scope.userIds.includes(match.job.userId)) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    const threshold = match.job.passingScore ?? 60;
    if ((match.score ?? 0) < threshold) {
      return res.status(400).json({ success: false, error: 'Score does not meet passing threshold' });
    }

    const crypto = await import('crypto');
    const accessToken = crypto.randomBytes(32).toString('hex');

    const [updatedMatch, interview] = await prisma.$transaction([
      prisma.jobMatch.update({
        where: { id: matchId },
        data: {
          status: 'applied',
          reviewedAt: new Date(),
          reviewedBy: userId,
          appliedAt: new Date(),
          appliedBy: userId,
        },
        include: {
          resume: { select: { id: true, name: true, email: true, preferences: true, currentRole: true } },
        },
      }),
      prisma.interview.create({
        data: {
          userId,
          jobId: match.job.id,
          resumeId: match.resume.id,
          candidateName: match.resume.name,
          candidateEmail: getPreferredResumeEmail(match.resume),
          jobTitle: match.job.title,
          jobDescription: match.job.description || null,
          resumeText: match.resume.resumeText || null,
          type,
          status: 'scheduled',
          accessToken,
        },
      }),
    ]);

    logger.info('MATCHING', `Applied and interview created for ${match.resume.name}`, {
      matchId,
      interviewId: interview.id,
      jobTitle: match.job.title,
    });

    res.json({
      success: true,
      data: {
        match: updatedMatch,
        interview: {
          id: interview.id,
          accessToken: interview.accessToken,
          status: interview.status,
        },
      },
    });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to apply and invite', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to apply and create interview' });
  }
});

/**
 * DELETE /api/v1/matching/results/:matchId
 * Delete a match result
 */
router.delete('/results/:matchId', requireAuth, async (req, res) => {
  try {
    const { matchId } = req.params;

    const scope = await getVisibilityScope(req.user!);
    const match = await prisma.jobMatch.findUnique({
      where: { id: matchId },
      include: { job: { select: { userId: true } } },
    });

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    if (!scope.isAdmin && !scope.userIds.includes(match.job.userId)) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    await prisma.jobMatch.delete({ where: { id: matchId } });
    res.json({ success: true });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to delete match', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete match' });
  }
});

export default router;
