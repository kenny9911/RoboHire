import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import '../types/auth.js';

const router = Router();

function getPeriodStart(period: string, from?: string): Date {
  const now = new Date();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), q, 1);
    }
    case 'year': {
      return new Date(now.getFullYear(), 0, 1);
    }
    case 'custom': {
      return from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    }
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

/**
 * GET /api/v1/dashboard/stats
 * Unified dashboard statistics for the current user.
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      period = 'month',
      from,
      to,
      client,
    } = req.query as Record<string, string | undefined>;

    const periodStart = getPeriodStart(period || 'month', from);
    const periodEnd = to ? new Date(to) : new Date();

    // Base filter for hiring requests (supports client filter)
    const hrWhere: any = { userId };
    if (client) {
      hrWhere.clientName = { equals: client, mode: 'insensitive' };
    }

    const [
      // Period stats
      newResumes,
      newMatches,
      newJobs,
      newRequests,
      // Cumulative stats
      totalResumes,
      matchedResumes,
      totalJobs,
      activeRequests,
      totalRequests,
      // Interview stats
      invitations,
      completedInterviews,
      passedInterviews,
      // Pipeline
      pipelineNew,
      pipelineScreening,
      pipelineMatched,
      pipelineInterviewing,
      pipelineEvaluated,
      // Pending items
      pendingCandidates,
      pendingProjects,
      pendingEvaluations,
      // Filter options
      clientNames,
    ] = await Promise.all([
      // ── Period stats ──
      prisma.resume.count({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
      }),
      prisma.resumeJobFit.count({
        where: { hiringRequest: hrWhere, createdAt: { gte: periodStart, lte: periodEnd } },
      }),
      prisma.job.count({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
      }),
      prisma.hiringRequest.count({
        where: { ...hrWhere, createdAt: { gte: periodStart, lte: periodEnd } },
      }),

      // ── Cumulative stats ──
      prisma.resume.count({ where: { userId, status: 'active' } }),
      prisma.resumeJobFit.count({ where: { hiringRequest: hrWhere } }),
      prisma.job.count({ where: { userId } }),
      prisma.hiringRequest.count({ where: { ...hrWhere, status: 'active' } }),
      prisma.hiringRequest.count({ where: hrWhere }),

      // ── Interview stats ──
      prisma.interview.count({
        where: { userId, status: { in: ['scheduled', 'in_progress'] } },
      }),
      prisma.interview.count({
        where: { userId, status: 'completed' },
      }),
      prisma.interview.count({
        where: {
          userId,
          status: 'completed',
          evaluation: { verdict: { in: ['strong_hire', 'hire', 'lean_hire'] } },
        },
      }),

      // ── Pipeline ──
      prisma.candidate.count({
        where: { hiringRequest: hrWhere, status: 'pending' },
      }),
      prisma.candidate.count({
        where: { hiringRequest: hrWhere, status: 'screening' },
      }),
      prisma.resumeJobFit.count({
        where: { hiringRequest: hrWhere, pipelineStatus: 'matched' },
      }),
      prisma.interview.count({
        where: { userId, status: { in: ['scheduled', 'in_progress'] } },
      }),
      prisma.interview.count({
        where: { userId, status: 'completed', evaluation: { isNot: null } },
      }),

      // ── Pending items ──
      prisma.candidate.count({
        where: { hiringRequest: hrWhere, status: 'pending' },
      }),
      prisma.hiringRequest.count({
        where: { ...hrWhere, status: 'active' },
      }),
      prisma.interview.count({
        where: { userId, status: 'completed', evaluation: null },
      }),

      // ── Filter options: distinct client names ──
      prisma.hiringRequest.findMany({
        where: { userId, clientName: { not: null } },
        select: { clientName: true },
        distinct: ['clientName'],
      }),
    ]);

    const clients = clientNames
      .map((r) => r.clientName)
      .filter((c): c is string => !!c)
      .sort();

    return res.json({
      success: true,
      data: {
        periodStats: { newResumes, newMatches, newJobs, newRequests },
        cumulativeStats: { totalResumes, matchedResumes, totalJobs, activeRequests, totalRequests },
        interviewStats: {
          invitations,
          completed: completedInterviews,
          passed: passedInterviews,
          offers: 0,
          onboarded: 0,
          rejectedOffers: 0,
        },
        pipeline: {
          new: pipelineNew,
          screening: pipelineScreening,
          matched: pipelineMatched,
          interviewing: pipelineInterviewing,
          evaluated: pipelineEvaluated,
          offered: 0,
        },
        pendingItems: { pendingCandidates, pendingProjects, pendingEvaluations },
        clients,
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
