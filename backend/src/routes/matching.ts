import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { checkBatchUsage } from '../middleware/usageMeter.js';
import { logger } from '../services/LoggerService.js';
import { ResumeMatchAgent } from '../agents/ResumeMatchAgent.js';
import { PreMatchFilterAgent, PreMatchFilterResumeSummary } from '../agents/PreMatchFilterAgent.js';
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
  return parts.length > 0 ? parts.join('\n') : '';
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

/**
 * Run tasks with a concurrency limit
 */
async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  limit: number
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

/**
 * POST /api/v1/matching/run
 * Run AI matching for a job against selected or all resumes
 * Supports pre-filtering, concurrent processing, and session history
 */
router.post('/run', requireAuth, async (req, res) => {
  const requestId = req.requestId;
  const wantsStream = (req.headers.accept || '').includes('text/event-stream');
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

    // Verify job belongs to user
    let stepStart = Date.now();
    const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
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
    const resumeWhere: any = { userId };
    if (resumeIds && Array.isArray(resumeIds) && resumeIds.length > 0) {
      resumeWhere.id = { in: resumeIds };
    }
    const resumes = await prisma.resume.findMany({
      where: resumeWhere,
      select: {
        id: true,
        name: true,
        resumeText: true,
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
          totalMatched: 0,
          totalFailed: 0,
          results: [],
          preFilter: preFilterResult,
        },
        metrics,
      });
    }

    // Concurrent matching — progress tracked in real time
    const CONCURRENCY = parseInt(process.env.MATCH_CONCURRENCY || '5', 10);
    const matchModel = process.env.LLM_MATCH_RESUME || undefined;
    const matchAgent = new ResumeMatchAgent();
    if (matchModel) {
      logger.info('MATCHING_PERF', `Using dedicated match model: ${matchModel}`, { requestId, model: matchModel });
    }
    const results: any[] = [];
    let completed = 0;
    let failed = 0;
    let totalScore = 0;
    let bestGrade: string | null = null;
    const gradeRank: Record<string, number> = { 'A+': 10, A: 9, 'A-': 8, 'B+': 7, B: 6, 'B-': 5, 'C+': 4, C: 3, 'C-': 2, D: 1, F: 0 };
    const resumeTimings: { name: string; llmMs: number; upsertMs: number; totalMs: number }[] = [];

    logger.info('MATCHING_PERF', `Starting concurrent matching: ${resumesToMatch.length} resumes, concurrency=${CONCURRENCY}`, { requestId });

    const matchingStart = Date.now();

    const tasks = resumesToMatch.map((resume, idx) => async () => {
      const taskStart = Date.now();

      logger.info('MATCHING_PERF', `[resume_${idx}] START "${resume.name}" (slot acquired)`, { requestId, resumeId: resume.id });

      sendSSE('progress', {
        jobTitle: job.title,
        total: resumesToMatch.length,
        completed,
        failed,
        currentCandidateName: resume.name || 'Unnamed resume',
      });

      try {
        const candidatePrefs = formatCandidatePreferences((resume as any).preferences);

        const llmStart = Date.now();
        const matchResult = await matchAgent.execute(
          {
            resume: resume.resumeText,
            jd: job.description!,
            candidatePreferences: candidatePrefs || undefined,
            jobMetadata: jobMetadata || undefined,
          },
          job.description!,
          requestId,
          locale,
          matchModel
        );
        const llmMs = Date.now() - llmStart;

        const score = matchResult?.overallMatchScore?.score ?? null;
        const grade = matchResult?.overallMatchScore?.grade ?? null;

        // Upsert the match result
        const upsertStart = Date.now();
        const jobMatch = await prisma.jobMatch.upsert({
          where: { jobId_resumeId: { jobId, resumeId: resume.id } },
          update: {
            score,
            grade,
            matchData: matchResult as any,
            status: 'new',
          },
          create: {
            jobId,
            resumeId: resume.id,
            score,
            grade,
            matchData: matchResult as any,
            status: 'new',
          },
        });
        const upsertMs = Date.now() - upsertStart;

        const taskTotal = Date.now() - taskStart;
        resumeTimings.push({ name: resume.name, llmMs, upsertMs, totalMs: taskTotal });
        logger.info('MATCHING_PERF', `[resume_${idx}] DONE "${resume.name}" llm=${llmMs}ms upsert=${upsertMs}ms total=${taskTotal}ms`, {
          requestId, resumeId: resume.id, llmMs, upsertMs, totalMs: taskTotal,
        });

        const result = {
          id: jobMatch.id,
          resumeId: resume.id,
          resumeName: resume.name,
          score,
          grade,
          status: jobMatch.status,
          preferenceScore: matchResult?.preferenceAlignment?.overallScore ?? null,
          preferenceWarnings: matchResult?.preferenceAlignment?.warnings ?? [],
        };

        // Update counters immediately as each task completes
        completed += 1;
        if (score != null) totalScore += score;
        if (grade && (bestGrade === null || (gradeRank[grade] ?? 0) > (gradeRank[bestGrade] ?? 0))) {
          bestGrade = grade;
        }
        results.push(result);

        sendSSE('progress', {
          jobTitle: job.title,
          total: resumesToMatch.length,
          completed,
          failed,
          currentCandidateName: null,
        });

        return result;
      } catch (err: any) {
        const taskTotal = Date.now() - taskStart;
        failed += 1;
        logger.error('MATCHING', `Failed to match resume ${resume.id} after ${taskTotal}ms`, { requestId, error: err.message, durationMs: taskTotal });
        results.push({ resumeId: resume.id, resumeName: resume.name, error: 'Matching failed' });

        sendSSE('progress', {
          jobTitle: job.title,
          total: resumesToMatch.length,
          completed,
          failed,
          currentCandidateName: null,
        });

        throw err; // re-throw so runConcurrent records it
      }
    });

    await runConcurrent(tasks, CONCURRENCY);
    const matchingTotal = Date.now() - matchingStart;
    logTiming('all_matching', matchingStart);

    // Log concurrency analysis
    const avgLlm = resumeTimings.length > 0 ? Math.round(resumeTimings.reduce((s, t) => s + t.llmMs, 0) / resumeTimings.length) : 0;
    const sumLlm = resumeTimings.reduce((s, t) => s + t.llmMs, 0);
    const parallelismRatio = matchingTotal > 0 ? (sumLlm / matchingTotal).toFixed(2) : '0';
    logger.info('MATCHING_PERF', `Matching summary: wall=${matchingTotal}ms sumLLM=${sumLlm}ms avgLLM=${avgLlm}ms parallelism=${parallelismRatio}x concurrency=${CONCURRENCY}`, {
      requestId, wallMs: matchingTotal, sumLlmMs: sumLlm, avgLlmMs: avgLlm, parallelismRatio, concurrency: CONCURRENCY,
      perResume: resumeTimings,
    });

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
 * GET /api/v1/matching/sessions
 * List matching sessions for the current user
 */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { jobId, limit = '20', offset = '0' } = req.query;

    const where: any = { userId };
    if (jobId && typeof jobId === 'string') {
      where.jobId = jobId;
    }

    const [sessions, total] = await Promise.all([
      prisma.matchingSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string, 10),
        skip: parseInt(offset as string, 10),
        include: {
          job: { select: { id: true, title: true } },
        },
      }),
      prisma.matchingSession.count({ where }),
    ]);

    res.json({ success: true, data: sessions, meta: { total } });
  } catch (err: any) {
    logger.error('MATCHING', 'Failed to list sessions', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
});

/**
 * GET /api/v1/matching/sessions/:sessionId
 * Get session detail with associated match results
 */
router.get('/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    const session = await prisma.matchingSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        job: { select: { id: true, title: true, description: true } },
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Get match results for this session's job + resume IDs
    const config = session.config as any;
    const resumeIds = config?.resumeIds || [];

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
            currentRole: true,
            experienceYears: true,
            tags: true,
          },
        },
      },
    });

    res.json({ success: true, data: { session, matches } });
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
    const userId = req.user!.id;
    const { sessionId } = req.params;

    const session = await prisma.matchingSession.findFirst({
      where: { id: sessionId, userId },
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
    const userId = req.user!.id;
    const { jobId } = req.params;
    const { status, minScore, sort = 'score', order = 'desc' } = req.query;

    // Verify job ownership
    const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
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
      meta: { total: matches.length, jobId, jobTitle: job.title },
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

    const validStatuses = ['new', 'reviewed', 'shortlisted', 'rejected', 'invited'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    // Verify ownership through job
    const match = await prisma.jobMatch.findUnique({
      where: { id: matchId },
      include: { job: { select: { userId: true } } },
    });

    if (!match || match.job.userId !== userId) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    const updated = await prisma.jobMatch.update({
      where: { id: matchId },
      data: {
        status,
        reviewedAt: status !== 'new' ? new Date() : null,
        reviewedBy: status !== 'new' ? userId : null,
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
 * DELETE /api/v1/matching/results/:matchId
 * Delete a match result
 */
router.delete('/results/:matchId', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { matchId } = req.params;

    const match = await prisma.jobMatch.findUnique({
      where: { id: matchId },
      include: { job: { select: { userId: true } } },
    });

    if (!match || match.job.userId !== userId) {
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
