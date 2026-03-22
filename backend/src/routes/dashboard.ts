import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getVisibilityScope, buildAdminOverrideFilter } from '../lib/teamVisibility.js';
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
 * Unified dashboard — merges stats + enhanced into a single response.
 * Deduplicates ~15 queries that were previously run across two endpoints.
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const {
      period = 'month',
      from,
      to,
      client,
      filterUserId,
      filterTeamId,
      teamView,
    } = req.query as Record<string, string | undefined>;

    const periodStart = getPeriodStart(period || 'month', from);
    const periodEnd = to ? new Date(to) : new Date();

    const scope = await getVisibilityScope(user, teamView === 'true');
    const userFilter = await buildAdminOverrideFilter(scope, filterUserId, filterTeamId);

    const hrWhere: any = { ...userFilter };
    if (client) {
      hrWhere.clientName = { equals: client, mode: 'insensitive' };
    }

    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - 7);
    const followupThreshold = new Date();
    followupThreshold.setDate(followupThreshold.getDate() - 3);

    // All queries in a single Promise.all — deduplicated
    const [
      // Period stats (also serves as KPI uploads/matches)
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
      // Interview stats (reused for pipeline)
      invitations,
      completedInterviews,
      passedInterviews,
      // Pipeline
      pipelineScreening,
      pipelineMatched,
      pipelineEvaluated,
      // Pending
      pendingCandidates,
      pendingEvaluations,
      // Client names
      clientNames,
      // KPI extras (not duplicated above)
      kpiInvitations,
      kpiCompleted,
      kpiVerdicts,
      // To-do items
      staleRequestCount,
      staleRequestItems,
      unreviewedMatchCount,
      unreviewedMatchItems,
      awaitingFollowupCount,
      awaitingFollowupItems,
      needsEvalItems,
      // Agent performance
      activeAgentCount,
      agentTotals,
      topAgents,
      // Activity feed
      recentInterviews,
      recentMatches,
      recentAgentFinds,
      // Conversion funnel
      funnelInvited,
    ] = await Promise.all([
      // ── Period stats ──
      prisma.resume.count({
        where: { ...userFilter, createdAt: { gte: periodStart, lte: periodEnd } },
      }),
      prisma.resumeJobFit.count({
        where: { hiringRequest: hrWhere, createdAt: { gte: periodStart, lte: periodEnd } },
      }),
      prisma.job.count({
        where: { ...userFilter, createdAt: { gte: periodStart, lte: periodEnd } },
      }),
      prisma.hiringRequest.count({
        where: { ...hrWhere, createdAt: { gte: periodStart, lte: periodEnd } },
      }),

      // ── Cumulative stats ──
      prisma.resume.count({ where: { ...userFilter, status: 'active' } }),
      prisma.resumeJobFit.count({ where: { hiringRequest: hrWhere } }),
      prisma.job.count({ where: { ...userFilter } }),
      prisma.hiringRequest.count({ where: { ...hrWhere, status: 'active' } }),
      prisma.hiringRequest.count({ where: hrWhere }),

      // ── Interview stats (reused: invitations=pipelineInterviewing, completedInterviews, passedInterviews) ──
      prisma.interview.count({
        where: { ...userFilter, status: { in: ['scheduled', 'in_progress'] } },
      }),
      prisma.interview.count({
        where: { ...userFilter, status: 'completed' },
      }),
      prisma.interview.count({
        where: {
          ...userFilter,
          status: 'completed',
          evaluation: { verdict: { in: ['strong_hire', 'hire', 'lean_hire'] } },
        },
      }),

      // ── Pipeline (deduplicated: pipelineNew=pendingCandidates, pipelineInterviewing=invitations) ──
      prisma.candidate.count({
        where: { hiringRequest: hrWhere, status: 'screening' },
      }),
      prisma.resumeJobFit.count({
        where: { hiringRequest: hrWhere, pipelineStatus: 'matched' },
      }),
      prisma.interview.count({
        where: { ...userFilter, status: 'completed', evaluation: { isNot: null } },
      }),

      // ── Pending (pendingProjects=activeRequests, deduplicated) ──
      prisma.candidate.count({
        where: { hiringRequest: hrWhere, status: 'pending' },
      }),
      prisma.interview.count({
        where: { ...userFilter, status: 'completed', evaluation: null },
      }),

      // ── Client filter options ──
      prisma.hiringRequest.findMany({
        where: { ...userFilter, clientName: { not: null } },
        select: { clientName: true },
        distinct: ['clientName'],
      }),

      // ── KPI extras ──
      prisma.resumeJobFit.count({
        where: { hiringRequest: hrWhere, pipelineStatus: 'invited', invitedAt: { gte: periodStart, lte: periodEnd } },
      }),
      prisma.interview.count({
        where: { ...userFilter, status: 'completed', completedAt: { gte: periodStart, lte: periodEnd } },
      }),
      prisma.interviewEvaluation.groupBy({
        by: ['verdict'],
        _count: true,
        where: {
          interview: { ...userFilter, completedAt: { gte: periodStart, lte: periodEnd } },
        },
      }),

      // ── To-do: Stale requests ──
      prisma.hiringRequest.count({
        where: { ...hrWhere, status: 'active', updatedAt: { lt: staleThreshold } },
      }),
      prisma.hiringRequest.findMany({
        where: { ...hrWhere, status: 'active', updatedAt: { lt: staleThreshold } },
        take: 3,
        orderBy: { updatedAt: 'asc' },
        select: { id: true, title: true, updatedAt: true },
      }),

      // ── To-do: Unreviewed matches ──
      prisma.resumeJobFit.count({
        where: { hiringRequest: hrWhere, pipelineStatus: 'matched' },
      }),
      prisma.resumeJobFit.findMany({
        where: { hiringRequest: hrWhere, pipelineStatus: 'matched' },
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          resume: { select: { name: true } },
          hiringRequest: { select: { title: true } },
        },
      }),

      // ── To-do: Awaiting follow-up ──
      prisma.interview.count({
        where: {
          ...userFilter,
          status: 'completed',
          completedAt: { lt: followupThreshold },
          evaluation: { verdict: { in: ['strong_hire', 'hire'] } },
        },
      }),
      prisma.interview.findMany({
        where: {
          ...userFilter,
          status: 'completed',
          completedAt: { lt: followupThreshold },
          evaluation: { verdict: { in: ['strong_hire', 'hire'] } },
        },
        take: 3,
        orderBy: { completedAt: 'desc' },
        select: { id: true, candidateName: true, jobTitle: true, completedAt: true },
      }),

      // ── To-do: Needs evaluation (count = pendingEvaluations, deduplicated) ──
      prisma.interview.findMany({
        where: { ...userFilter, status: 'completed', evaluation: null },
        take: 3,
        orderBy: { completedAt: 'desc' },
        select: { id: true, candidateName: true, jobTitle: true, completedAt: true },
      }),

      // ── Agent performance ──
      prisma.agent.count({ where: { ...userFilter, status: 'active' } }),
      prisma.agent.aggregate({
        where: userFilter,
        _sum: { totalSourced: true, totalApproved: true, totalContacted: true },
      }),
      prisma.agent.findMany({
        where: { ...userFilter, status: 'active' },
        take: 5,
        orderBy: { totalSourced: 'desc' },
        select: {
          id: true,
          name: true,
          totalSourced: true,
          totalApproved: true,
          totalContacted: true,
          job: { select: { title: true } },
        },
      }),

      // ── Activity feed ──
      prisma.interview.findMany({
        where: { ...userFilter, status: 'completed', completedAt: { gte: periodStart, lte: periodEnd } },
        take: 10,
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          candidateName: true,
          jobTitle: true,
          completedAt: true,
          evaluation: { select: { verdict: true, overallScore: true, grade: true } },
        },
      }),
      prisma.resumeJobFit.findMany({
        where: { hiringRequest: hrWhere, createdAt: { gte: periodStart, lte: periodEnd } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fitScore: true,
          fitGrade: true,
          createdAt: true,
          resume: { select: { name: true } },
          hiringRequest: { select: { title: true } },
        },
      }),
      prisma.agentCandidate.findMany({
        where: { agent: userFilter, createdAt: { gte: periodStart, lte: periodEnd } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          matchScore: true,
          createdAt: true,
          agent: { select: { name: true, id: true } },
        },
      }),

      // ── Conversion funnel (totalMatched=matchedResumes, totalCompleted=completedInterviews, totalPassed=passedInterviews — all reused) ──
      prisma.resumeJobFit.count({ where: { hiringRequest: hrWhere, pipelineStatus: 'invited' } }),
    ]);

    const clients = clientNames
      .map((r) => r.clientName)
      .filter((c): c is string => !!c)
      .sort();

    // Build verdicts map
    const verdictMap: Record<string, number> = {};
    for (const v of kpiVerdicts) {
      if (v.verdict) verdictMap[v.verdict] = v._count;
    }

    // Build to-do items
    const todoItems = [
      {
        type: 'stale_request',
        count: staleRequestCount,
        items: staleRequestItems.map((r) => ({
          id: r.id,
          label: r.title,
          subLabel: r.updatedAt?.toISOString(),
          href: '/product/hiring',
        })),
      },
      {
        type: 'unreviewed_match',
        count: unreviewedMatchCount,
        items: unreviewedMatchItems.map((r) => ({
          id: r.id,
          label: r.resume?.name || 'Unknown',
          subLabel: r.hiringRequest?.title,
          href: '/product/matching',
        })),
      },
      {
        type: 'awaiting_followup',
        count: awaitingFollowupCount,
        items: awaitingFollowupItems.map((r) => ({
          id: r.id,
          label: r.candidateName,
          subLabel: r.jobTitle || undefined,
          href: '/product/evaluations',
        })),
      },
      {
        type: 'needs_evaluation',
        count: pendingEvaluations, // reused
        items: needsEvalItems.map((r) => ({
          id: r.id,
          label: r.candidateName,
          subLabel: r.jobTitle || undefined,
          href: '/product/evaluations',
        })),
      },
    ];

    // Merge activity feed and sort by timestamp
    const activity: Array<{ type: string; timestamp: string; data: Record<string, any> }> = [];
    for (const iv of recentInterviews) {
      activity.push({
        type: iv.evaluation ? 'evaluation_completed' : 'interview_completed',
        timestamp: iv.completedAt?.toISOString() || '',
        data: {
          id: iv.id,
          candidateName: iv.candidateName,
          jobTitle: iv.jobTitle,
          verdict: iv.evaluation?.verdict,
          score: iv.evaluation?.overallScore,
          grade: iv.evaluation?.grade,
        },
      });
    }
    for (const m of recentMatches) {
      activity.push({
        type: 'new_match',
        timestamp: m.createdAt.toISOString(),
        data: {
          id: m.id,
          resumeName: m.resume?.name,
          requestTitle: m.hiringRequest?.title,
          fitScore: m.fitScore,
          fitGrade: m.fitGrade,
        },
      });
    }
    for (const ac of recentAgentFinds) {
      activity.push({
        type: 'agent_discovery',
        timestamp: ac.createdAt.toISOString(),
        data: {
          id: ac.id,
          candidateName: ac.name,
          agentName: ac.agent?.name,
          agentId: ac.agent?.id,
          matchScore: ac.matchScore,
        },
      });
    }
    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const recentActivity = activity.slice(0, 15);

    const safeRate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

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
          new: pendingCandidates, // reused
          screening: pipelineScreening,
          matched: pipelineMatched,
          interviewing: invitations, // reused
          evaluated: pipelineEvaluated,
          offered: 0,
        },
        pendingItems: { pendingCandidates, pendingProjects: activeRequests, pendingEvaluations },
        clients,
        // Enhanced data (previously separate endpoint)
        enhanced: {
          kpiScorecard: {
            uploads: newResumes, // reused
            invitationsSent: kpiInvitations,
            completedInterviews: kpiCompleted,
            matchesCreated: newMatches, // reused
            verdicts: {
              strongHire: verdictMap['strong_hire'] || 0,
              hire: verdictMap['hire'] || 0,
              leanHire: verdictMap['lean_hire'] || 0,
              leanNoHire: verdictMap['lean_no_hire'] || 0,
              noHire: verdictMap['no_hire'] || 0,
            },
          },
          todoItems,
          agentPerformance: {
            activeAgents: activeAgentCount,
            totalSourced: agentTotals._sum.totalSourced || 0,
            totalApproved: agentTotals._sum.totalApproved || 0,
            totalContacted: agentTotals._sum.totalContacted || 0,
            topAgents: topAgents.map((a) => ({
              id: a.id,
              name: a.name,
              jobTitle: a.job?.title || null,
              totalSourced: a.totalSourced,
              totalApproved: a.totalApproved,
              totalContacted: a.totalContacted,
            })),
          },
          recentActivity,
          conversionFunnel: {
            totalMatched: matchedResumes, // reused
            totalInvited: funnelInvited,
            totalCompleted: completedInterviews, // reused
            totalPassed: passedInterviews, // reused
            matchToInviteRate: safeRate(funnelInvited, matchedResumes),
            inviteToCompleteRate: safeRate(completedInterviews, funnelInvited),
            completeToPassRate: safeRate(passedInterviews, completedInterviews),
          },
        },
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
  }
});

/**
 * GET /api/v1/dashboard/enhanced
 * @deprecated — Kept for backwards compatibility. Data is now included in /stats response under `enhanced`.
 */
router.get('/enhanced', requireAuth, async (_req, res) => {
  return res.json({ success: true, data: null });
});

export default router;
