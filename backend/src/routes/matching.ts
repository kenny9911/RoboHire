import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { checkBatchUsage } from '../middleware/usageMeter.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { ResumeMatchAgent } from '../agents/ResumeMatchAgent.js';
import '../types/auth.js';

const router = Router();

/**
 * POST /api/v1/matching/run
 * Run AI matching for a job against selected or all resumes
 */
router.post('/run', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const { jobId, resumeIds } = req.body;

    if (!jobId) {
      return res.status(400).json({ success: false, error: 'jobId is required' });
    }

    // Verify job belongs to user
    const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (!job.description) {
      return res.status(400).json({ success: false, error: 'Job must have a description to run matching' });
    }

    // Get resumes to match
    const resumeWhere: any = { userId };
    if (resumeIds && Array.isArray(resumeIds) && resumeIds.length > 0) {
      resumeWhere.id = { in: resumeIds };
    }
    const resumes = await prisma.resume.findMany({
      where: resumeWhere,
      select: { id: true, name: true, resumeText: true },
    });

    if (resumes.length === 0) {
      return res.status(400).json({ success: false, error: 'No resumes found to match' });
    }

    // Check and deduct usage for the batch
    const usageCheck = await checkBatchUsage(userId, 'match', resumes.length);
    if (!usageCheck.ok) {
      return res.status(402).json({ success: false, error: usageCheck.error, code: usageCheck.code, details: usageCheck.details });
    }

    logger.info('MATCHING', `Running AI matching for job ${job.title} against ${resumes.length} resumes`, { requestId });

    const matchAgent = new ResumeMatchAgent();
    const results: any[] = [];

    // Process matches sequentially to avoid overloading the LLM
    for (const resume of resumes) {
      try {
        const matchResult = await matchAgent.execute(
          { resume: resume.resumeText, jd: job.description! },
          undefined,
          requestId
        );

        const score = matchResult?.overallMatchScore?.score ?? null;
        const grade = matchResult?.overallMatchScore?.grade ?? null;

        // Upsert the match result
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

        results.push({
          id: jobMatch.id,
          resumeId: resume.id,
          resumeName: resume.name,
          score,
          grade,
          status: jobMatch.status,
        });
      } catch (err: any) {
        logger.error('MATCHING', `Failed to match resume ${resume.id}`, { requestId, error: err.message });
        results.push({
          resumeId: resume.id,
          resumeName: resume.name,
          error: 'Matching failed',
        });
      }
    }

    logger.info('MATCHING', `Completed matching: ${results.filter(r => !r.error).length}/${resumes.length} successful`, { requestId });

    res.json({
      success: true,
      data: {
        jobId,
        totalMatched: results.filter(r => !r.error).length,
        totalFailed: results.filter(r => r.error).length,
        results,
      },
    });
  } catch (err: any) {
    logger.error('MATCHING', 'Match run failed', { requestId, error: err.message });
    res.status(500).json({ success: false, error: 'Failed to run matching' });
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
