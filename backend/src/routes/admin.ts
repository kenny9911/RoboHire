import { Router } from 'express';
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import prisma from '../lib/prisma.js';
import { clearLimitsCache, getPlanLimits, resolveUserUsageLimitsFromPlan } from '../middleware/usageMeter.js';
import { updatePriceId } from './checkout.js';
import adminMonitorRouter from './adminMonitor.js';
import adminAgentSourcesRouter from './adminAgentSources.js';
import adminAgentsTerminalRouter from './adminAgentsTerminal.js';
import adminMemoryRouter from './adminMemory.js';
import {
  PRICING_CURRENCIES,
  PRICING_DISCOUNT_COUPON_KEY,
  PRICING_DISCOUNT_ENABLED_KEY,
  PRICING_DISCOUNT_PERCENT_KEY,
  PRICING_TIERS,
  getPriceConfigKey,
  loadPricingConfigFromDb,
  normalizeDiscountPercent,
  type PricingCurrency,
  type PricingTier,
} from '../services/pricingConfig.js';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);
router.use('/monitor', adminMonitorRouter);
router.use('/agent-sources', adminAgentSourcesRouter);
router.use('/agents-terminal', adminAgentsTerminalRouter);
router.use('/memory', adminMemoryRouter);
// NOTE: agent-manager used to mount here. It moved out in Phase 4 so that
// internal-role users can read it. See backend/src/index.ts for the new
// mount point under /api/v1/agent-manager with its own middleware stack.

type UsageBucket = 'hour' | 'day' | 'week';

function startOfDayUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeekUTC(date: Date): string {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday week start
  copy.setUTCDate(copy.getUTCDate() + diff);
  return startOfDayUTC(copy);
}

function bucketTimestamp(date: Date, bucket: UsageBucket): string {
  if (bucket === 'hour') {
    return `${date.toISOString().slice(0, 13)}:00`;
  }
  if (bucket === 'week') {
    return startOfWeekUTC(date);
  }
  return startOfDayUTC(date);
}

/**
 * GET /api/v1/admin/filter-options
 * Lightweight list of users and teams for admin filter dropdowns
 */
router.get('/filter-options', async (_req, res) => {
  try {
    const [users, teams] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
      prisma.team.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    res.json({ success: true, data: { users, teams } });
  } catch (error) {
    console.error('Admin filter-options error:', error);
    res.status(500).json({ success: false, error: 'Failed to load filter options' });
  }
});

/**
 * GET /api/v1/admin/users
 * List users with pagination and search
 */
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string)?.trim() || '';
    const company = (req.query.company as string)?.trim() || '';
    const skip = (page - 1) * limit;

    const filters: Prisma.UserWhereInput[] = [];
    if (search) {
      filters.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
          { company: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }
    if (company) {
      filters.push({
        company: { contains: company, mode: 'insensitive' as const },
      });
    }
    const where: Prisma.UserWhereInput =
      filters.length === 0 ? {} : filters.length === 1 ? filters[0] : { AND: filters };

    const [users, total, planLimits] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          role: true,
          provider: true,
          createdAt: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          interviewsUsed: true,
          resumeMatchesUsed: true,
          topUpBalance: true,
          currentPeriodEnd: true,
          trialEnd: true,
          customMaxInterviews: true,
          customMaxMatches: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
      getPlanLimits(),
    ]);

    const usersWithLimits = users.map((user) => ({
      ...user,
      ...resolveUserUsageLimitsFromPlan(user, planLimits),
    }));

    res.json({
      success: true,
      data: {
        users: usersWithLimits,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ success: false, error: 'Failed to list users' });
  }
});

/**
 * GET /api/v1/admin/users/:userId
 * Get full user details including adjustment history, team memberships, and usage stats
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        jobTitle: true,
        company: true,
        avatar: true,
        role: true,
        provider: true,
        teamId: true,
        createdAt: true,
        updatedAt: true,
        stripeCustomerId: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionId: true,
        currentPeriodEnd: true,
        trialEnd: true,
        interviewsUsed: true,
        resumeMatchesUsed: true,
        topUpBalance: true,
        customMaxInterviews: true,
        customMaxMatches: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const [adjustments, teamMemberships, recentActivities, usageStats] = await Promise.all([
      prisma.adminAdjustment.findMany({
        where: { userId: user.id },
        include: { admin: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.teamMember.findMany({
        where: { userId: user.id },
        include: { team: { select: { id: true, name: true, description: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.apiRequestLog.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          endpoint: true,
          method: true,
          module: true,
          apiName: true,
          statusCode: true,
          durationMs: true,
          totalTokens: true,
          cost: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      // Usage stats: aggregate API request logs for the last 30 days
      (async () => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const [totalRequests, totalTokensAgg, totalCostAgg, dailyUsage] = await Promise.all([
          prisma.apiRequestLog.count({ where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } } }),
          prisma.apiRequestLog.aggregate({ where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } }, _sum: { totalTokens: true } }),
          prisma.apiRequestLog.aggregate({ where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } }, _sum: { cost: true } }),
          prisma.apiRequestLog.groupBy({
            by: ['createdAt'],
            where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } },
            _count: { _all: true },
            _sum: { totalTokens: true, cost: true },
            orderBy: { createdAt: 'asc' },
          }).then(rows => {
            const byDay: Record<string, { count: number; tokens: number; cost: number }> = {};
            for (const r of rows) {
              const day = r.createdAt.toISOString().slice(0, 10);
              if (!byDay[day]) byDay[day] = { count: 0, tokens: 0, cost: 0 };
              byDay[day].count += r._count?._all ?? 0;
              byDay[day].tokens += r._sum?.totalTokens ?? 0;
              byDay[day].cost += r._sum?.cost ?? 0;
            }
            return Object.entries(byDay).map(([date, v]) => ({ date, ...v }));
          }),
        ]);
        return {
          totalRequests,
          totalTokens: totalTokensAgg._sum?.totalTokens ?? 0,
          totalCost: totalCostAgg._sum?.cost ?? 0,
          dailyUsage,
        };
      })(),
    ]);

    const planLimits = await getPlanLimits();
    const userWithLimits = {
      ...user,
      ...resolveUserUsageLimitsFromPlan(user, planLimits),
    };

    // Derive team lead teams
    const teamLeadTeams = teamMemberships.filter(m => m.role === 'lead').map(m => m.team);

    res.json({
      success: true,
      data: {
        user: userWithLimits,
        adjustments,
        teamMemberships,
        teamLeadTeams,
        recentActivities,
        usageStats,
      },
    });
  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user details' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/adjust-balance
 * Adjust a user's top-up balance
 * Body: { amount: number, reason: string }
 * amount > 0 = credit, amount < 0 = debit
 */
router.post('/users/:userId/adjust-balance', async (req, res) => {
  try {
    const { amount, reason } = req.body;

    if (typeof amount !== 'number' || amount === 0) {
      res.status(400).json({ success: false, error: 'amount must be a non-zero number' });
      return;
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, topUpBalance: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const oldBalance = user.topUpBalance;
    const newBalance = Math.max(0, oldBalance + amount); // Never go negative

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { topUpBalance: newBalance },
      select: { id: true, topUpBalance: true },
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: 'balance',
        amount,
        oldValue: oldBalance.toFixed(2),
        newValue: newBalance.toFixed(2),
        reason: reason.trim(),
      },
    });

    res.json({
      success: true,
      data: {
        oldBalance,
        newBalance: updatedUser.topUpBalance,
        adjustment: amount,
      },
    });
  } catch (error) {
    console.error('Admin adjust balance error:', error);
    res.status(500).json({ success: false, error: 'Failed to adjust balance' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/adjust-usage
 * Adjust a user's usage counters
 * Body: { action: 'interview' | 'match', amount: number, reason: string }
 * amount > 0 = add usage, amount < 0 = credit back
 */
router.post('/users/:userId/adjust-usage', async (req, res) => {
  try {
    const { action, amount, reason } = req.body;

    if (action !== 'interview' && action !== 'match') {
      res.status(400).json({ success: false, error: 'action must be "interview" or "match"' });
      return;
    }
    if (typeof amount !== 'number' || amount === 0) {
      res.status(400).json({ success: false, error: 'amount must be a non-zero number' });
      return;
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const field = action === 'interview' ? 'interviewsUsed' : 'resumeMatchesUsed';
    const adjustmentType = action === 'interview' ? 'usage_interview' : 'usage_match';

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, interviewsUsed: true, resumeMatchesUsed: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const oldValue = user[field];
    const newValue = Math.max(0, oldValue + amount); // Never go negative

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { [field]: newValue },
      select: { id: true, interviewsUsed: true, resumeMatchesUsed: true },
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: adjustmentType,
        amount,
        oldValue: String(oldValue),
        newValue: String(newValue),
        reason: reason.trim(),
      },
    });

    res.json({
      success: true,
      data: {
        action,
        oldValue,
        newValue: updatedUser[field],
        adjustment: amount,
      },
    });
  } catch (error) {
    console.error('Admin adjust usage error:', error);
    res.status(500).json({ success: false, error: 'Failed to adjust usage' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/set-subscription
 * Override a user's subscription tier and status
 * Body: { tier: string, status?: string, reason: string }
 */
router.post('/users/:userId/set-subscription', async (req, res) => {
  try {
    const { tier, status, reason } = req.body;

    const validTiers = ['free', 'starter', 'growth', 'business', 'custom'];
    if (!tier || !validTiers.includes(tier)) {
      res.status(400).json({ success: false, error: `tier must be one of: ${validTiers.join(', ')}` });
      return;
    }
    if (status) {
      const validStatuses = ['active', 'trialing', 'past_due', 'canceled'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
        return;
      }
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, subscriptionTier: true, subscriptionStatus: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const oldValue = JSON.stringify({ tier: user.subscriptionTier, status: user.subscriptionStatus });

    const updateData: Record<string, string> = { subscriptionTier: tier };
    if (status) updateData.subscriptionStatus = status;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: { id: true, subscriptionTier: true, subscriptionStatus: true },
    });

    const newValue = JSON.stringify({ tier: updatedUser.subscriptionTier, status: updatedUser.subscriptionStatus });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: 'subscription',
        oldValue,
        newValue,
        reason: reason.trim(),
      },
    });

    const result = {
      oldTier: user.subscriptionTier,
      oldStatus: user.subscriptionStatus,
      newTier: updatedUser.subscriptionTier,
      newStatus: updatedUser.subscriptionStatus,
    };

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin set subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to set subscription' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/set-limits
 * Override a user's maximum API call limits (interviews & matches)
 * Body: { maxInterviews?: number | null, maxMatches?: number | null, reason: string }
 * Pass null to clear an override and revert to plan defaults.
 */
router.post('/users/:userId/set-limits', async (req, res) => {
  try {
    const { maxInterviews, maxMatches, reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    // Validate: must be null or a non-negative integer
    const validate = (v: unknown, name: string) => {
      if (v === null || v === undefined) return; // clearing override
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        throw new Error(`${name} must be null or a non-negative integer`);
      }
    };
    try {
      validate(maxInterviews, 'maxInterviews');
      validate(maxMatches, 'maxMatches');
    } catch (e) {
      res.status(400).json({ success: false, error: (e as Error).message });
      return;
    }

    if (maxInterviews === undefined && maxMatches === undefined) {
      res.status(400).json({ success: false, error: 'Provide at least one of maxInterviews or maxMatches' });
      return;
    }

    // Avoid interactive $transaction — Neon serverless can timeout holding a connection.
    // Use sequential queries instead.
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, customMaxInterviews: true, customMaxMatches: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const oldValue = JSON.stringify({
      maxInterviews: user.customMaxInterviews,
      maxMatches: user.customMaxMatches,
    });

    const updateData: Record<string, number | null> = {};
    if (maxInterviews !== undefined) updateData.customMaxInterviews = maxInterviews;
    if (maxMatches !== undefined) updateData.customMaxMatches = maxMatches;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: { id: true, customMaxInterviews: true, customMaxMatches: true },
    });

    const newValue = JSON.stringify({
      maxInterviews: updatedUser.customMaxInterviews,
      maxMatches: updatedUser.customMaxMatches,
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: 'limits',
        oldValue,
        newValue,
        reason: reason.trim(),
      },
    });

    const result = {
      old: { maxInterviews: user.customMaxInterviews, maxMatches: user.customMaxMatches },
      new: { maxInterviews: updatedUser.customMaxInterviews, maxMatches: updatedUser.customMaxMatches },
    };

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin set limits error:', error);
    res.status(500).json({ success: false, error: 'Failed to set limits' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/reset-usage
 * Reset usage counters to zero
 * Body: { reason: string }
 */
router.post('/users/:userId/reset-usage', async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, interviewsUsed: true, resumeMatchesUsed: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { interviewsUsed: 0, resumeMatchesUsed: 0 },
    });

    // Batch audit records using non-interactive transaction
    const auditOps = [
      prisma.adminAdjustment.create({
        data: {
          userId: user.id,
          adminId: req.user!.id,
          type: 'usage_interview',
          amount: -user.interviewsUsed,
          oldValue: String(user.interviewsUsed),
          newValue: '0',
          reason: `[Reset] ${reason.trim()}`,
        },
      }),
    ];
    if (user.resumeMatchesUsed > 0) {
      auditOps.push(
        prisma.adminAdjustment.create({
          data: {
            userId: user.id,
            adminId: req.user!.id,
            type: 'usage_match',
            amount: -user.resumeMatchesUsed,
            oldValue: String(user.resumeMatchesUsed),
            newValue: '0',
            reason: `[Reset] ${reason.trim()}`,
          },
        }),
      );
    }
    await prisma.$transaction(auditOps);

    res.json({
      success: true,
      data: {
        oldInterviews: user.interviewsUsed,
        oldMatches: user.resumeMatchesUsed,
        newInterviews: 0,
        newMatches: 0,
      },
    });
  } catch (error) {
    console.error('Admin reset usage error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset usage' });
  }
});

/**
 * GET /api/v1/admin/adjustments
 * List recent admin adjustments across all users
 */
router.get('/adjustments', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    const adjustments = await prisma.adminAdjustment.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        admin: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ success: true, data: { adjustments } });
  } catch (error) {
    console.error('Admin list adjustments error:', error);
    res.status(500).json({ success: false, error: 'Failed to list adjustments' });
  }
});

/**
 * GET /api/v1/admin/stats
 * System overview statistics
 */
router.get('/stats', async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      tierCounts,
      activeSubscriptions,
      newUsersThisMonth,
      totalRevenue,
      usageTotals,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['subscriptionTier'], _count: true }),
      prisma.user.count({
        where: { subscriptionTier: { not: 'free' }, subscriptionStatus: 'active' },
      }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.topUpRecord.aggregate({
        where: { status: 'completed' },
        _sum: { amountDollars: true },
      }),
      prisma.user.aggregate({
        _sum: { interviewsUsed: true, resumeMatchesUsed: true },
      }),
    ]);

    const byTier: Record<string, number> = {};
    for (const t of tierCounts) byTier[t.subscriptionTier] = t._count;

    res.json({
      success: true,
      data: {
        totalUsers,
        byTier,
        usersByTier: byTier,
        activeSubscriptions,
        newUsersThisMonth,
        totalRevenue: totalRevenue._sum.amountDollars || 0,
        totalInterviews: usageTotals._sum.interviewsUsed || 0,
        totalMatches: usageTotals._sum.resumeMatchesUsed || 0,
        totalInterviewsUsed: usageTotals._sum.interviewsUsed || 0,
        totalMatchesUsed: usageTotals._sum.resumeMatchesUsed || 0,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

/**
 * GET /api/v1/admin/usage/analytics
 * Comprehensive usage analytics across request logs.
 * Query params:
 * - from, to (ISO date/datetime)
 * - userId
 * - module
 * - endpoint (contains)
 * - bucket: hour | day | week
 */
router.get('/usage/analytics', async (req, res) => {
  try {
    const now = new Date();
    const to = req.query.to ? new Date(String(req.query.to)) : now;
    const from = req.query.from
      ? new Date(String(req.query.from))
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const bucket = (String(req.query.bucket || 'day') as UsageBucket);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      res.status(400).json({ success: false, error: 'Invalid from/to date format' });
      return;
    }
    if (!['hour', 'day', 'week'].includes(bucket)) {
      res.status(400).json({ success: false, error: 'bucket must be one of: hour, day, week' });
      return;
    }

    const userId = (req.query.userId as string | undefined)?.trim();
    const moduleFilter = (req.query.module as string | undefined)?.trim();
    const endpointFilter = (req.query.endpoint as string | undefined)?.trim();

    const where: Record<string, unknown> = {
      createdAt: { gte: from, lte: to },
    };

    if (userId) where.userId = userId;
    if (moduleFilter) where.module = moduleFilter;
    if (endpointFilter) where.endpoint = { contains: endpointFilter, mode: 'insensitive' };

    const [
      totalCalls,
      aggregates,
      userGroups,
      moduleGroups,
      apiGroups,
      providerGroups,
      modelGroups,
      timelineRecords,
    ] = await Promise.all([
      prisma.apiRequestLog.count({ where }),
      prisma.apiRequestLog.aggregate({
        where,
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          llmCalls: true,
          cost: true,
          durationMs: true,
        },
        _avg: { durationMs: true },
      }),
      prisma.apiRequestLog.groupBy({
        by: ['userId'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, cost: true, llmCalls: true, durationMs: true },
      }),
      prisma.apiRequestLog.groupBy({
        by: ['module'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, cost: true, llmCalls: true, durationMs: true },
      }),
      prisma.apiRequestLog.groupBy({
        by: ['apiName', 'endpoint', 'method', 'module'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, cost: true, llmCalls: true, durationMs: true },
      }),
      prisma.apiRequestLog.groupBy({
        by: ['provider'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, cost: true, llmCalls: true },
      }),
      prisma.apiRequestLog.groupBy({
        by: ['model'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, cost: true, llmCalls: true },
      }),
      prisma.apiRequestLog.findMany({
        where,
        select: {
          createdAt: true,
          userId: true,
          module: true,
          endpoint: true,
          method: true,
          statusCode: true,
          durationMs: true,
          totalTokens: true,
          llmCalls: true,
          cost: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 50000,
      }),
    ]);

    const userIds = userGroups
      .map((g) => g.userId)
      .filter((id): id is string => Boolean(id));
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true, company: true, role: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const byUser = userGroups
      .map((g) => {
        const profile = g.userId ? userMap.get(g.userId) : null;
        const calls = g._count._all;
        return {
          userId: g.userId,
          email: profile?.email || 'Anonymous / Unauthenticated',
          name: profile?.name || null,
          company: profile?.company || null,
          role: profile?.role || null,
          calls,
          llmCalls: g._sum.llmCalls ?? 0,
          totalTokens: g._sum.totalTokens ?? 0,
          cost: g._sum.cost ?? 0,
          avgLatencyMs: calls > 0 ? Math.round((g._sum.durationMs ?? 0) / calls) : 0,
        };
      })
      .sort((a, b) => b.calls - a.calls);

    const byModule = moduleGroups
      .map((g) => {
        const calls = g._count._all;
        return {
          module: g.module,
          calls,
          llmCalls: g._sum.llmCalls ?? 0,
          totalTokens: g._sum.totalTokens ?? 0,
          cost: g._sum.cost ?? 0,
          avgLatencyMs: calls > 0 ? Math.round((g._sum.durationMs ?? 0) / calls) : 0,
        };
      })
      .sort((a, b) => b.calls - a.calls);

    const byApi = apiGroups
      .map((g) => {
        const calls = g._count._all;
        return {
          apiName: g.apiName,
          endpoint: g.endpoint,
          method: g.method,
          module: g.module,
          calls,
          llmCalls: g._sum.llmCalls ?? 0,
          totalTokens: g._sum.totalTokens ?? 0,
          cost: g._sum.cost ?? 0,
          avgLatencyMs: calls > 0 ? Math.round((g._sum.durationMs ?? 0) / calls) : 0,
        };
      })
      .sort((a, b) => b.calls - a.calls);

    const byProvider = providerGroups
      .reduce<Array<{
        provider: string;
        calls: number;
        llmCalls: number;
        totalTokens: number;
        cost: number;
      }>>((acc, g) => {
        if (!g.provider) return acc;
        acc.push({
          provider: g.provider,
          calls: g._count._all,
          llmCalls: g._sum.llmCalls ?? 0,
          totalTokens: g._sum.totalTokens ?? 0,
          cost: g._sum.cost ?? 0,
        });
        return acc;
      }, [])
      .sort((a, b) => b.llmCalls - a.llmCalls);

    const byModel = modelGroups
      .reduce<Array<{
        model: string;
        calls: number;
        llmCalls: number;
        totalTokens: number;
        cost: number;
      }>>((acc, g) => {
        if (!g.model) return acc;
        acc.push({
          model: g.model,
          calls: g._count._all,
          llmCalls: g._sum.llmCalls ?? 0,
          totalTokens: g._sum.totalTokens ?? 0,
          cost: g._sum.cost ?? 0,
        });
        return acc;
      }, [])
      .sort((a, b) => b.llmCalls - a.llmCalls);

    const byDayMap = new Map<string, {
      date: string;
      calls: number;
      llmCalls: number;
      totalTokens: number;
      cost: number;
      totalLatencyMs: number;
      errors: number;
    }>();
    const byPeriodMap = new Map<string, {
      period: string;
      calls: number;
      llmCalls: number;
      totalTokens: number;
      cost: number;
      totalLatencyMs: number;
      errors: number;
    }>();

    const INTERVIEW_MODULES = new Set(['interview_evaluation', 'interview_invite']);
    let interviewCalls = 0;
    let interviewTokens = 0;
    let interviewCost = 0;
    let interviewLatencyMs = 0;
    let interviewErrors = 0;
    let resumeMatchCalls = 0;
    let resumeMatchTokens = 0;
    let resumeMatchCost = 0;
    let resumeMatchLatencyMs = 0;
    let resumeMatchErrors = 0;
    let errorCount = 0;

    for (const r of timelineRecords) {
      const dayKey = startOfDayUTC(r.createdAt);
      const periodKey = bucketTimestamp(r.createdAt, bucket);

      const dayEntry = byDayMap.get(dayKey) ?? {
        date: dayKey,
        calls: 0,
        llmCalls: 0,
        totalTokens: 0,
        cost: 0,
        totalLatencyMs: 0,
        errors: 0,
      };
      dayEntry.calls += 1;
      dayEntry.llmCalls += r.llmCalls;
      dayEntry.totalTokens += r.totalTokens;
      dayEntry.cost += r.cost;
      dayEntry.totalLatencyMs += r.durationMs;
      if (r.statusCode >= 400) dayEntry.errors += 1;
      byDayMap.set(dayKey, dayEntry);

      const periodEntry = byPeriodMap.get(periodKey) ?? {
        period: periodKey,
        calls: 0,
        llmCalls: 0,
        totalTokens: 0,
        cost: 0,
        totalLatencyMs: 0,
        errors: 0,
      };
      periodEntry.calls += 1;
      periodEntry.llmCalls += r.llmCalls;
      periodEntry.totalTokens += r.totalTokens;
      periodEntry.cost += r.cost;
      periodEntry.totalLatencyMs += r.durationMs;
      if (r.statusCode >= 400) periodEntry.errors += 1;
      byPeriodMap.set(periodKey, periodEntry);

      if (r.statusCode >= 400) errorCount += 1;

      if (r.module === 'resume_match') {
        resumeMatchCalls += 1;
        resumeMatchTokens += r.totalTokens;
        resumeMatchCost += r.cost;
        resumeMatchLatencyMs += r.durationMs;
        if (r.statusCode >= 400) resumeMatchErrors += 1;
      }

      if (INTERVIEW_MODULES.has(r.module)) {
        interviewCalls += 1;
        interviewTokens += r.totalTokens;
        interviewCost += r.cost;
        interviewLatencyMs += r.durationMs;
        if (r.statusCode >= 400) interviewErrors += 1;
      }
    }

    const byDay = Array.from(byDayMap.values())
      .map((entry) => ({
        ...entry,
        avgLatencyMs: entry.calls > 0 ? Math.round(entry.totalLatencyMs / entry.calls) : 0,
        errorRate: entry.calls > 0 ? entry.errors / entry.calls : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byPeriod = Array.from(byPeriodMap.values())
      .map((entry) => ({
        ...entry,
        avgLatencyMs: entry.calls > 0 ? Math.round(entry.totalLatencyMs / entry.calls) : 0,
        errorRate: entry.calls > 0 ? entry.errors / entry.calls : 0,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    const byInterview = byApi.filter((entry) => INTERVIEW_MODULES.has(entry.module));
    const byResumeMatch = byApi.filter((entry) => entry.module === 'resume_match');

    const uniqueUsers = new Set(timelineRecords.map((r) => r.userId).filter(Boolean)).size;

    res.json({
      success: true,
      data: {
        filters: {
          from: from.toISOString(),
          to: to.toISOString(),
          bucket,
          userId: userId || null,
          module: moduleFilter || null,
          endpoint: endpointFilter || null,
        },
        totals: {
          calls: totalCalls,
          uniqueUsers,
          llmCalls: aggregates._sum.llmCalls ?? 0,
          promptTokens: aggregates._sum.promptTokens ?? 0,
          completionTokens: aggregates._sum.completionTokens ?? 0,
          totalTokens: aggregates._sum.totalTokens ?? 0,
          cost: aggregates._sum.cost ?? 0,
          totalLatencyMs: aggregates._sum.durationMs ?? 0,
          avgLatencyMs: Math.round(aggregates._avg.durationMs ?? 0),
          errorCount,
          errorRate: totalCalls > 0 ? errorCount / totalCalls : 0,
          interviewCalls,
          resumeMatchCalls,
        },
        workflow: {
          interview: {
            calls: interviewCalls,
            totalTokens: interviewTokens,
            cost: interviewCost,
            avgLatencyMs: interviewCalls > 0 ? Math.round(interviewLatencyMs / interviewCalls) : 0,
            errorRate: interviewCalls > 0 ? interviewErrors / interviewCalls : 0,
          },
          resumeMatch: {
            calls: resumeMatchCalls,
            totalTokens: resumeMatchTokens,
            cost: resumeMatchCost,
            avgLatencyMs: resumeMatchCalls > 0 ? Math.round(resumeMatchLatencyMs / resumeMatchCalls) : 0,
            errorRate: resumeMatchCalls > 0 ? resumeMatchErrors / resumeMatchCalls : 0,
          },
        },
        byDay,
        byPeriod,
        byUser,
        byModule,
        byApi,
        byInterview,
        byResumeMatch,
        byProvider,
        byModel,
      },
    });
  } catch (error) {
    console.error('Admin usage analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to load usage analytics' });
  }
});

/**
 * GET /api/v1/admin/config
 * Returns all AppConfig rows
 */
router.get('/config', async (_req, res) => {
  try {
    const configs = await prisma.appConfig.findMany({ orderBy: { key: 'asc' } });
    res.json({ success: true, data: { configs } });
  } catch (error) {
    console.error('Admin config error:', error);
    res.status(500).json({ success: false, error: 'Failed to load config' });
  }
});

/**
 * GET /api/v1/admin/config/agent-alex
 * Get Agent Alex configuration (provider, web search)
 */
router.get('/config/agent-alex', async (_req, res) => {
  try {
    const configs = await prisma.appConfig.findMany({
      where: { key: { in: ['agent_alex_provider', 'agent_alex_web_search_enabled'] } },
    });
    const configMap = Object.fromEntries(configs.map((c) => [c.key, c.value]));
    res.json({
      success: true,
      data: {
        provider: configMap['agent_alex_provider'] || process.env.AGENT_ALEX_PROVIDER || 'gemini',
        webSearchEnabled: (configMap['agent_alex_web_search_enabled'] ?? process.env.AGENT_ALEX_WEB_SEARCH_ENABLED) === 'true',
      },
    });
  } catch (error) {
    console.error('Admin agent-alex config error:', error);
    res.status(500).json({ success: false, error: 'Failed to load Agent Alex config' });
  }
});

/**
 * POST /api/v1/admin/config/agent-alex
 * Update Agent Alex configuration
 * Body: { provider?: 'claude' | 'gemini', webSearchEnabled?: boolean }
 */
router.post('/config/agent-alex', async (req, res) => {
  try {
    const { provider, webSearchEnabled } = req.body as { provider?: string; webSearchEnabled?: boolean };

    if (provider && !['claude', 'gemini'].includes(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider. Must be "claude" or "gemini".' });
    }

    const updates: Array<{ key: string; value: string }> = [];
    if (provider) updates.push({ key: 'agent_alex_provider', value: provider });
    if (typeof webSearchEnabled === 'boolean') {
      updates.push({ key: 'agent_alex_web_search_enabled', value: String(webSearchEnabled) });
    }

    for (const { key, value } of updates) {
      await prisma.appConfig.upsert({
        where: { key },
        update: { value, updatedBy: req.user?.id || null },
        create: { key, value, updatedBy: req.user?.id || null },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Admin agent-alex config update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update Agent Alex config' });
  }
});

/**
 * POST /api/v1/admin/config/pricing
 * Update subscription prices and discount settings.
 * Body:
 * {
 *   starter?: number, growth?: number, business?: number, // legacy USD-only fields
 *   prices?: { USD?: { starter?: number, ... }, CNY?: { ... }, JPY?: { ... } },
 *   discount?: { enabled?: boolean, percentOff?: number }
 * }
 */
router.post('/config/pricing', async (req, res) => {
  try {
    const payload = (req.body ?? {}) as {
      starter?: number;
      growth?: number;
      business?: number;
      prices?: Partial<Record<PricingCurrency, Partial<Record<PricingTier, number>>>>;
      discount?: { enabled?: boolean; percentOff?: number };
    };

    const priceUpdateMap = new Map<string, { currency: PricingCurrency; tier: PricingTier; price: number }>();
    const pushPriceUpdate = (currency: PricingCurrency, tier: PricingTier, value: unknown) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return;
      priceUpdateMap.set(`${currency}_${tier}`, { currency, tier, price: value });
    };

    // Legacy USD-only fields
    pushPriceUpdate('USD', 'starter', payload.starter);
    pushPriceUpdate('USD', 'growth', payload.growth);
    pushPriceUpdate('USD', 'business', payload.business);

    // New multi-currency format
    if (payload.prices && typeof payload.prices === 'object') {
      for (const currency of PRICING_CURRENCIES) {
        const currencyPrices = payload.prices[currency];
        if (!currencyPrices || typeof currencyPrices !== 'object') continue;
        for (const tier of PRICING_TIERS) {
          pushPriceUpdate(currency, tier, currencyPrices[tier]);
        }
      }
    }

    const hasDiscountPayload = !!payload.discount && typeof payload.discount === 'object';
    if (priceUpdateMap.size === 0 && !hasDiscountPayload) {
      res.status(400).json({ success: false, error: 'Provide at least one price update or discount update' });
      return;
    }

    const stripe = getStripe();
    const currentConfig = await loadPricingConfigFromDb();
    const priceUpdates = Array.from(priceUpdateMap.values());
    const results: {
      prices: Record<PricingCurrency, Partial<Record<PricingTier, { price: number; stripePriceId?: string }>>>;
      discount?: { enabled: boolean; percentOff: number; stripeCouponId: string | null };
    } = {
      prices: {
        USD: {},
        CNY: {},
        JPY: {},
        TWD: {},
      },
    };

    for (const { currency, tier, price } of priceUpdates) {
      const key = getPriceConfigKey(currency, tier);
      await prisma.appConfig.upsert({
        where: { key },
        update: { value: String(price), updatedBy: req.user!.id },
        create: { key, value: String(price), updatedBy: req.user!.id },
      });

      // Keep legacy USD keys in sync for compatibility
      if (currency === 'USD') {
        await prisma.appConfig.upsert({
          where: { key: `price_${tier}_monthly` },
          update: { value: String(price), updatedBy: req.user!.id },
          create: { key: `price_${tier}_monthly`, value: String(price), updatedBy: req.user!.id },
        });
      }

      results.prices[currency][tier] = { price };
    }

    const usdUpdates = priceUpdates.filter((u) => u.currency === 'USD');
    for (const { tier, price } of usdUpdates) {
      if (!stripe) continue;
      try {
        // Get or create product for this tier
        let productId: string;
        const configKey = `stripe_product_id_${tier}`;
        const existingProduct = await prisma.appConfig.findUnique({ where: { key: configKey } });

        if (existingProduct) {
          productId = existingProduct.value;
        } else {
          const product = await stripe.products.create({
            name: `RoboHire ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
            metadata: { tier },
          });
          productId = product.id;
          await prisma.appConfig.create({ data: { key: configKey, value: productId } });
        }

        // Create new Stripe price (Stripe prices are immutable)
        const newPrice = await stripe.prices.create({
          product: productId,
          unit_amount: Math.round(price * 100),
          currency: 'usd',
          recurring: { interval: 'month' },
          metadata: { tier, updatedBy: req.user!.id },
        });

        // Archive old price if exists
        const oldPriceConfig = await prisma.appConfig.findUnique({
          where: { key: `stripe_price_id_${tier}_monthly` },
        });
        if (oldPriceConfig?.value) {
          try {
            await stripe.prices.update(oldPriceConfig.value, { active: false });
          } catch {
            // old price may not exist anymore
          }
        }

        await prisma.appConfig.upsert({
          where: { key: `stripe_price_id_${tier}_monthly` },
          update: { value: newPrice.id, updatedBy: req.user!.id },
          create: { key: `stripe_price_id_${tier}_monthly`, value: newPrice.id, updatedBy: req.user!.id },
        });

        updatePriceId(tier, newPrice.id);
        const existing = results.prices.USD[tier];
        if (existing) {
          existing.stripePriceId = newPrice.id;
        } else {
          results.prices.USD[tier] = { price, stripePriceId: newPrice.id };
        }
      } catch (stripeErr) {
        console.error(`Failed to create Stripe price for ${tier}:`, stripeErr);
      }
    }

    if (hasDiscountPayload) {
      let enabled =
        typeof payload.discount!.enabled === 'boolean'
          ? payload.discount!.enabled
          : currentConfig.discount.enabled;
      let percentOff =
        typeof payload.discount!.percentOff === 'number'
          ? normalizeDiscountPercent(payload.discount!.percentOff)
          : currentConfig.discount.percentOff;

      if (!enabled) {
        percentOff = 0;
      }

      if (enabled && percentOff <= 0) {
        res.status(400).json({ success: false, error: 'Discount percent must be greater than 0 when enabled' });
        return;
      }

      let stripeCouponId = currentConfig.discount.stripeCouponId;
      const shouldCreateOrRefreshCoupon =
        enabled &&
        percentOff > 0 &&
        (
          !stripeCouponId ||
          !currentConfig.discount.enabled ||
          Math.abs(percentOff - currentConfig.discount.percentOff) > 0.0001
        );

      if (shouldCreateOrRefreshCoupon && stripe) {
        const oldCouponId = stripeCouponId;
        const coupon = await stripe.coupons.create({
          percent_off: percentOff,
          duration: 'forever',
          name: `RoboHire ${percentOff}% off`,
          metadata: {
            source: 'admin_pricing',
            updatedBy: req.user!.id,
          },
        });
        stripeCouponId = coupon.id;

        if (oldCouponId) {
          try {
            await stripe.coupons.del(oldCouponId);
          } catch {
            // ignore coupon deletion errors
          }
        }
      }

      if (!enabled && stripeCouponId && stripe) {
        try {
          await stripe.coupons.del(stripeCouponId);
          stripeCouponId = null;
        } catch {
          // ignore coupon deletion errors
        }
      }
      if (!enabled) {
        stripeCouponId = null;
      }

      await prisma.appConfig.upsert({
        where: { key: PRICING_DISCOUNT_ENABLED_KEY },
        update: { value: String(enabled), updatedBy: req.user!.id },
        create: { key: PRICING_DISCOUNT_ENABLED_KEY, value: String(enabled), updatedBy: req.user!.id },
      });
      await prisma.appConfig.upsert({
        where: { key: PRICING_DISCOUNT_PERCENT_KEY },
        update: { value: String(percentOff), updatedBy: req.user!.id },
        create: { key: PRICING_DISCOUNT_PERCENT_KEY, value: String(percentOff), updatedBy: req.user!.id },
      });
      await prisma.appConfig.upsert({
        where: { key: PRICING_DISCOUNT_COUPON_KEY },
        update: { value: stripeCouponId || '', updatedBy: req.user!.id },
        create: { key: PRICING_DISCOUNT_COUPON_KEY, value: stripeCouponId || '', updatedBy: req.user!.id },
      });

      results.discount = {
        enabled,
        percentOff,
        stripeCouponId: stripeCouponId || null,
      };
    }

    const reasonParts: string[] = [];
    if (priceUpdates.length > 0) {
      reasonParts.push(
        ...priceUpdates.map((u) => `${u.currency}.${u.tier}=${u.price}`)
      );
    }
    if (results.discount) {
      reasonParts.push(
        results.discount.enabled
          ? `discount=${results.discount.percentOff}%`
          : 'discount=off'
      );
    }

    await prisma.adminAdjustment.create({
      data: {
        userId: req.user!.id,
        adminId: req.user!.id,
        type: 'pricing',
        oldValue: null,
        newValue: JSON.stringify(results),
        reason: `Updated pricing config: ${reasonParts.join(', ')}`,
      },
    });

    res.json({ success: true, data: { updated: results } });
  } catch (error) {
    console.error('Admin pricing update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update pricing' });
  }
});

/**
 * POST /api/v1/admin/config/limits
 * Update plan usage limits and pay-per-use rates.
 * Body:
 * {
 *   limits?: { free?: { interviews?: number, matches?: number }, starter?: {...}, growth?: {...}, business?: {...} },
 *   payPerUse?: { interview?: number, match?: number }
 * }
 */
router.post('/config/limits', async (req, res) => {
  try {
    const { limits, payPerUse } = req.body ?? {};
    const upserts: { key: string; value: string }[] = [];
    const tiers = ['free', 'starter', 'growth', 'business'] as const;

    if (limits) {
      for (const tier of tiers) {
        const tierLimits = limits[tier];
        if (!tierLimits) continue;
        for (const action of ['interviews', 'matches'] as const) {
          if (tierLimits[action] !== undefined) {
            const val = Number(tierLimits[action]);
            if (!Number.isFinite(val) || val < 0 || !Number.isInteger(val)) {
              res.status(400).json({ success: false, error: `Invalid limit for ${tier}.${action}: must be a non-negative integer` });
              return;
            }
            upserts.push({ key: `limit_${tier}_${action}`, value: String(val) });
          }
        }
      }
    }

    if (payPerUse) {
      for (const action of ['interview', 'match'] as const) {
        if (payPerUse[action] !== undefined) {
          const val = Number(payPerUse[action]);
          if (!Number.isFinite(val) || val <= 0) {
            res.status(400).json({ success: false, error: `Invalid pay-per-use rate for ${action}: must be a positive number` });
            return;
          }
          upserts.push({ key: `payperuse_${action}`, value: String(val) });
        }
      }
    }

    if (upserts.length === 0) {
      res.status(400).json({ success: false, error: 'No valid limits or rates provided' });
      return;
    }

    const adminId = req.user!.id;

    // Fetch all existing config values in a single query to minimize DB round-trips
    // (Neon serverless can be slow per-query).
    const existingRows = await prisma.appConfig.findMany({
      where: { key: { in: upserts.map((u) => u.key) } },
    });
    const existingMap = new Map(existingRows.map((r) => [r.key, r.value]));

    // Batch all upserts + audit records into a single $transaction (batch form, not interactive)
    await prisma.$transaction(
      upserts.flatMap(({ key, value }) => [
        prisma.appConfig.upsert({
          where: { key },
          create: { key, value, updatedBy: adminId },
          update: { value, updatedBy: adminId },
        }),
        prisma.adminAdjustment.create({
          data: {
            userId: adminId,
            adminId,
            type: 'limits',
            amount: Number(value),
            oldValue: existingMap.get(key) ?? null,
            newValue: value,
            reason: `Admin updated ${key} to ${value}`,
          },
        }),
      ])
    );

    clearLimitsCache();

    res.json({ success: true, data: { updated: upserts.length } });
  } catch (error) {
    console.error('Admin limits update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update limits' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/cancel-subscription
 * Cancel a user's Stripe subscription
 * Body: { reason: string, immediate?: boolean }
 */
router.post('/users/:userId/cancel-subscription', async (req, res) => {
  try {
    const { reason, immediate } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, subscriptionId: true, subscriptionTier: true, subscriptionStatus: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const stripe = getStripe();
    if (stripe && user.subscriptionId) {
      try {
        if (immediate) {
          await stripe.subscriptions.cancel(user.subscriptionId);
        } else {
          await stripe.subscriptions.update(user.subscriptionId, { cancel_at_period_end: true });
        }
      } catch (stripeErr) {
        console.error('Stripe cancel error:', stripeErr);
      }
    }

    const newStatus = immediate ? 'canceled' : 'active'; // end-of-period keeps active until then
    const newTier = immediate ? 'free' : user.subscriptionTier;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: newStatus,
        subscriptionTier: newTier,
        ...(immediate ? { subscriptionId: null } : {}),
      },
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: 'subscription',
        oldValue: JSON.stringify({ tier: user.subscriptionTier, status: user.subscriptionStatus }),
        newValue: JSON.stringify({ tier: newTier, status: newStatus, cancelMode: immediate ? 'immediate' : 'end_of_period' }),
        reason: reason.trim(),
      },
    });

    res.json({
      success: true,
      data: { canceled: true, immediate: !!immediate, newTier, newStatus },
    });
  } catch (error) {
    console.error('Admin cancel subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/disable
 * Disable a user account (cancel subscription + mark inactive)
 * Body: { reason: string }
 */
router.post('/users/:userId/disable', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, subscriptionId: true, subscriptionTier: true, subscriptionStatus: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Cancel Stripe subscription if active
    const stripe = getStripe();
    if (stripe && user.subscriptionId) {
      try { await stripe.subscriptions.cancel(user.subscriptionId); } catch { /* ignore */ }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
        subscriptionId: null,
      },
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: 'subscription',
        oldValue: JSON.stringify({ tier: user.subscriptionTier, status: user.subscriptionStatus }),
        newValue: JSON.stringify({ tier: 'free', status: 'canceled', disabled: true }),
        reason: `[Disabled] ${reason.trim()}`,
      },
    });

    res.json({ success: true, data: { disabled: true } });
  } catch (error) {
    console.error('Admin disable user error:', error);
    res.status(500).json({ success: false, error: 'Failed to disable user' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/enable
 * Re-enable a disabled user account
 * Body: { reason: string }
 */
router.post('/users/:userId/enable', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, subscriptionTier: true, subscriptionStatus: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: 'active' },
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: 'subscription',
        oldValue: JSON.stringify({ tier: user.subscriptionTier, status: user.subscriptionStatus }),
        newValue: JSON.stringify({ tier: user.subscriptionTier, status: 'active', enabled: true }),
        reason: `[Enabled] ${reason.trim()}`,
      },
    });

    res.json({ success: true, data: { enabled: true } });
  } catch (error) {
    console.error('Admin enable user error:', error);
    res.status(500).json({ success: false, error: 'Failed to enable user' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/set-role
 * Change a user's role (admin/internal/agency/user)
 * Body: { role: 'admin' | 'internal' | 'agency' | 'user', reason: string }
 */
router.post('/users/:userId/set-role', async (req, res) => {
  try {
    const { role, reason } = req.body;

    if (role !== 'admin' && role !== 'internal' && role !== 'agency' && role !== 'user') {
      res.status(400).json({ success: false, error: 'role must be "admin", "internal", "agency", or "user"' });
      return;
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, role: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role },
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: 'subscription',
        oldValue: JSON.stringify({ role: user.role }),
        newValue: JSON.stringify({ role }),
        reason: `[Role change] ${reason.trim()}`,
      },
    });

    res.json({ success: true, data: { oldRole: user.role, newRole: role } });
  } catch (error) {
    console.error('Admin set role error:', error);
    res.status(500).json({ success: false, error: 'Failed to set role' });
  }
});

/**
 * PATCH /api/v1/admin/users/:userId/profile
 * Update user profile fields
 */
router.patch('/users/:userId/profile', async (req, res) => {
  try {
    const { name, phone, jobTitle, company } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true } });
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined ? { name: name?.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(jobTitle !== undefined ? { jobTitle: jobTitle?.trim() || null } : {}),
        ...(company !== undefined ? { company: company?.trim() || null } : {}),
      },
      select: { id: true, name: true, phone: true, jobTitle: true, company: true },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Admin update user profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/assign-teams
 * Set the teams a user belongs to. Body: { teamIds: string[] }
 */
router.post('/users/:userId/assign-teams', async (req, res) => {
  try {
    const { teamIds } = req.body;
    if (!Array.isArray(teamIds)) {
      res.status(400).json({ success: false, error: 'teamIds array is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, teamId: true } });
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    // Remove all existing memberships
    await prisma.teamMember.deleteMany({ where: { userId: user.id } });

    // Create new memberships (preserve lead role if re-assigning)
    if (teamIds.length > 0) {
      await prisma.teamMember.createMany({
        data: teamIds.map((teamId: string) => ({ userId: user.id, teamId, role: 'member' })),
        skipDuplicates: true,
      });
      // Also set the primary teamId to the first team
      await prisma.user.update({ where: { id: user.id }, data: { teamId: teamIds[0] } });
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { teamId: null } });
    }

    const memberships = await prisma.teamMember.findMany({
      where: { userId: user.id },
      include: { team: { select: { id: true, name: true, description: true } } },
    });

    res.json({ success: true, data: memberships });
  } catch (error) {
    console.error('Admin assign teams error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign teams' });
  }
});

/**
 * POST /api/v1/admin/users/:userId/set-team-lead
 * Set which teams this user leads. Body: { teamIds: string[], reason: string }
 */
router.post('/users/:userId/set-team-lead', async (req, res) => {
  try {
    const { teamIds, reason } = req.body;
    if (!Array.isArray(teamIds)) {
      res.status(400).json({ success: false, error: 'teamIds array is required' });
      return;
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true } });
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    // Reset all existing lead roles to member
    await prisma.teamMember.updateMany({
      where: { userId: user.id, role: 'lead' },
      data: { role: 'member' },
    });

    if (teamIds.length > 0) {
      // Ensure user is a member of each team, then set as lead
      for (const teamId of teamIds) {
        await prisma.teamMember.upsert({
          where: { userId_teamId: { userId: user.id, teamId } },
          create: { userId: user.id, teamId, role: 'lead' },
          update: { role: 'lead' },
        });
      }
    }

    // Log the adjustment
    const oldLeadTeams = await prisma.teamMember.findMany({
      where: { userId: user.id, role: 'lead' },
      include: { team: { select: { name: true } } },
    });

    await prisma.adminAdjustment.create({
      data: {
        userId: user.id,
        adminId: req.user!.id,
        type: 'subscription',
        oldValue: '{}',
        newValue: JSON.stringify({ teamLeadTeams: oldLeadTeams.map(m => m.team.name) }),
        reason: `[Team Lead] ${reason.trim()}`,
      },
    });

    const memberships = await prisma.teamMember.findMany({
      where: { userId: user.id },
      include: { team: { select: { id: true, name: true, description: true } } },
    });

    res.json({ success: true, data: memberships });
  } catch (error) {
    console.error('Admin set team lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to set team lead' });
  }
});

/**
 * DELETE /api/v1/admin/users/:userId
 * Permanently delete a user and all their data (cascading).
 * Admin cannot delete themselves.
 */
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user!.id) {
      res.status(400).json({ success: false, error: 'Cannot delete your own account' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, subscriptionId: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Cancel Stripe subscription if active
    const stripe = getStripe();
    if (stripe && user.subscriptionId) {
      try { await stripe.subscriptions.cancel(user.subscriptionId); } catch { /* ignore */ }
    }

    // Delete user — cascading relations handle related records
    await prisma.user.delete({ where: { id: userId } });

    console.log(`[Admin] User ${user.email} (${userId}) deleted by admin ${req.user!.id}`);
    res.json({ success: true, data: { deleted: true, email: user.email } });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

// ──────────────────────────────────────────────────────
// Request Logs & LLM Call Logs endpoints
// ──────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/request-logs
 * Paginated, filtered request log viewer
 */
router.get('/request-logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const skip = (page - 1) * limit;

    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const userId = (req.query.userId as string | undefined)?.trim() || undefined;
    const moduleFilter = (req.query.module as string | undefined)?.trim() || undefined;
    const endpointFilter = (req.query.endpoint as string | undefined)?.trim() || undefined;
    const statusCode = req.query.statusCode ? parseInt(String(req.query.statusCode), 10) : undefined;
    const statusGroup = (req.query.statusGroup as string | undefined)?.trim(); // '2xx','4xx','5xx'
    const sort = (req.query.sort as string) || 'createdAt';
    const order = (req.query.order as string) === 'asc' ? 'asc' : 'desc';

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (userId) where.userId = userId;
    if (moduleFilter) where.module = moduleFilter;
    if (endpointFilter) where.endpoint = { contains: endpointFilter, mode: 'insensitive' };
    if (statusCode) {
      where.statusCode = statusCode;
    } else if (statusGroup === '2xx') {
      where.statusCode = { gte: 200, lt: 300 };
    } else if (statusGroup === '4xx') {
      where.statusCode = { gte: 400, lt: 500 };
    } else if (statusGroup === '5xx') {
      where.statusCode = { gte: 500, lt: 600 };
    }

    const validSortFields = ['createdAt', 'durationMs', 'cost', 'totalTokens', 'llmCalls', 'statusCode'];
    const orderBy: Record<string, string> = {};
    orderBy[validSortFields.includes(sort) ? sort : 'createdAt'] = order;

    const [total, records] = await Promise.all([
      prisma.apiRequestLog.count({ where }),
      prisma.apiRequestLog.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true } },
          llmCallLog: {
            select: {
              id: true,
              provider: true,
              model: true,
              promptTokens: true,
              completionTokens: true,
              totalTokens: true,
              cost: true,
              durationMs: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin request-logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch request logs' });
  }
});

/**
 * GET /api/v1/admin/llm-calls
 * Paginated, filtered LLM call log viewer
 */
router.get('/llm-calls', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const skip = (page - 1) * limit;

    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const userId = (req.query.userId as string | undefined)?.trim() || undefined;
    const moduleFilter = (req.query.module as string | undefined)?.trim() || undefined;
    const providerFilter = (req.query.provider as string | undefined)?.trim() || undefined;
    const modelFilter = (req.query.model as string | undefined)?.trim() || undefined;
    const sort = (req.query.sort as string) || 'createdAt';
    const order = (req.query.order as string) === 'asc' ? 'asc' : 'desc';

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (userId) where.userId = userId;
    if (moduleFilter) where.module = moduleFilter;
    if (providerFilter) where.provider = providerFilter;
    if (modelFilter) where.model = modelFilter;

    const validSortFields = ['createdAt', 'cost', 'totalTokens', 'durationMs', 'promptTokens', 'completionTokens'];
    const orderBy: Record<string, string> = {};
    orderBy[validSortFields.includes(sort) ? sort : 'createdAt'] = order;

    const [total, records, aggregates] = await Promise.all([
      prisma.lLMCallLog.count({ where }),
      prisma.lLMCallLog.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.lLMCallLog.aggregate({
        where,
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, cost: true, durationMs: true },
        _avg: { cost: true, durationMs: true },
        _count: { _all: true },
      }),
    ]);

    res.json({
      success: true,
      data: records,
      summary: {
        totalCalls: aggregates._count._all,
        totalPromptTokens: aggregates._sum.promptTokens ?? 0,
        totalCompletionTokens: aggregates._sum.completionTokens ?? 0,
        totalTokens: aggregates._sum.totalTokens ?? 0,
        totalCost: aggregates._sum.cost ?? 0,
        totalDurationMs: aggregates._sum.durationMs ?? 0,
        avgCostPerCall: aggregates._avg.cost ?? 0,
        avgDurationMs: aggregates._avg.durationMs ?? 0,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin llm-calls error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch LLM call logs' });
  }
});

/**
 * GET /api/v1/admin/llm-calls/summary
 * Grouped aggregates for charting
 */
router.get('/llm-calls/summary', async (req, res) => {
  try {
    const now = new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : now;
    const groupBy = (req.query.groupBy as string) || 'day';

    const where = { createdAt: { gte: from, lte: to } };

    if (groupBy === 'model' || groupBy === 'provider' || groupBy === 'module') {
      const groups = await prisma.lLMCallLog.groupBy({
        by: [groupBy],
        where,
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, cost: true, durationMs: true },
        _avg: { cost: true, durationMs: true },
      });

      res.json({
        success: true,
        groupBy,
        data: groups.map((g) => ({
          key: g[groupBy],
          calls: g._count._all,
          promptTokens: g._sum.promptTokens ?? 0,
          completionTokens: g._sum.completionTokens ?? 0,
          totalTokens: g._sum.totalTokens ?? 0,
          cost: g._sum.cost ?? 0,
          avgCost: g._avg.cost ?? 0,
          avgDurationMs: g._avg.durationMs ?? 0,
        })),
      });
    } else {
      // Group by day — fetch raw records and bucket in JS (Prisma doesn't support date_trunc groupBy)
      const records = await prisma.lLMCallLog.findMany({
        where,
        select: { createdAt: true, promptTokens: true, completionTokens: true, totalTokens: true, cost: true },
        orderBy: { createdAt: 'asc' },
        take: 100000,
      });

      const buckets: Record<string, { calls: number; promptTokens: number; completionTokens: number; totalTokens: number; cost: number }> = {};
      for (const r of records) {
        const day = r.createdAt.toISOString().slice(0, 10);
        if (!buckets[day]) {
          buckets[day] = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
        }
        buckets[day].calls += 1;
        buckets[day].promptTokens += r.promptTokens;
        buckets[day].completionTokens += r.completionTokens;
        buckets[day].totalTokens += r.totalTokens;
        buckets[day].cost += r.cost;
      }

      res.json({
        success: true,
        groupBy: 'day',
        data: Object.entries(buckets).map(([day, v]) => ({ key: day, ...v })),
      });
    }
  } catch (error) {
    console.error('Admin llm-calls/summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch LLM call summary' });
  }
});

// ──────────────────────────────────────────────────────
// Interview Configuration (LiveKit)
// ──────────────────────────────────────────────────────

const INTERVIEW_CONFIG_KEYS = [
  'interview.instructions',
  'interview.agentName',
  'interview.sttProvider',
  'interview.sttModel',
  'interview.llmProvider',
  'interview.llmModel',
  'interview.ttsProvider',
  'interview.ttsModel',
  'interview.ttsVoice',
  'interview.language',
  'interview.turnDetection',
  'interview.allowInterruptions',
  'interview.discardAudioIfUninterruptible',
  'interview.preemptiveGeneration',
  'interview.minInterruptionDurationMs',
  'interview.minInterruptionWords',
  'interview.minEndpointingDelayMs',
  'interview.maxEndpointingDelayMs',
  'interview.aecWarmupDurationMs',
  'interview.useTtsAlignedTranscript',
  'interview.logInterimTranscripts',
];
const INTERVIEW_CONFIG_VERSION_LIMIT = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function buildInterviewConfigMap(rows: Array<{ key: string; value: string }>): Record<string, string> {
  const configMap: Record<string, string> = {};
  for (const key of INTERVIEW_CONFIG_KEYS) {
    configMap[key] = '';
  }
  for (const row of rows) {
    if (INTERVIEW_CONFIG_KEYS.includes(row.key)) {
      configMap[row.key] = row.value;
    }
  }
  return configMap;
}

function normalizeInterviewConfigSnapshot(source: Record<string, unknown>): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const key of INTERVIEW_CONFIG_KEYS) {
    snapshot[key] = typeof source[key] === 'string' ? source[key] : '';
  }
  return snapshot;
}

async function syncInterviewAppConfig(
  tx: Prisma.TransactionClient,
  config: Record<string, string>,
  adminId?: string,
) {
  await Promise.all(
    INTERVIEW_CONFIG_KEYS.map((key) =>
      tx.appConfig.upsert({
        where: { key },
        create: { key, value: config[key] ?? '', updatedBy: adminId },
        update: { value: config[key] ?? '', updatedBy: adminId },
      }),
    ),
  );
}

async function ensureInterviewConfigBaselineVersion(adminId?: string) {
  const existingVersion = await prisma.interviewRoomConfigVersion.findFirst({
    orderBy: { versionNumber: 'asc' },
  });
  if (existingVersion) {
    return;
  }

  const existingConfigs = await prisma.appConfig.findMany({
    where: { key: { in: INTERVIEW_CONFIG_KEYS } },
  });
  const baselineConfig = buildInterviewConfigMap(existingConfigs);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const versionCount = await tx.interviewRoomConfigVersion.count();
    if (versionCount > 0) {
      return;
    }

    await syncInterviewAppConfig(tx, baselineConfig, adminId);

    await tx.interviewRoomConfigVersion.create({
      data: {
        versionNumber: 1,
        versionLabel: 'v1.0',
        changeNote: 'Baseline snapshot created from the current production interview configuration.',
        config: baselineConfig as Prisma.InputJsonValue,
        isActive: true,
        activatedAt: now,
        createdById: adminId,
      },
    });
  });
}

function serializeInterviewConfigVersion(
  version: {
    id: string;
    versionNumber: number;
    versionLabel: string | null;
    changeNote: string | null;
    isActive: boolean;
    createdAt: Date;
    activatedAt: Date | null;
    config: unknown;
    createdByUser?: { id: string; name: string | null; email: string } | null;
  },
) {
  const config = isRecord(version.config)
    ? normalizeInterviewConfigSnapshot(version.config)
    : buildInterviewConfigMap([]);

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    versionLabel: version.versionLabel,
    changeNote: version.changeNote,
    isActive: version.isActive,
    createdAt: version.createdAt.toISOString(),
    activatedAt: version.activatedAt?.toISOString() || null,
    createdBy: version.createdByUser
      ? {
          id: version.createdByUser.id,
          name: version.createdByUser.name,
          email: version.createdByUser.email,
        }
      : null,
    config,
    populatedKeys: Object.entries(config)
      .filter(([, value]) => value.trim().length > 0)
      .map(([key]) => key),
  };
}

/**
 * GET /api/v1/admin/interview-config
 * Returns all interview configuration values
 */
router.get('/interview-config', async (req, res) => {
  try {
    await ensureInterviewConfigBaselineVersion(req.user?.id);

    const [configs, activeVersion, versions] = await Promise.all([
      prisma.appConfig.findMany({
        where: { key: { in: INTERVIEW_CONFIG_KEYS } },
      }),
      prisma.interviewRoomConfigVersion.findFirst({
        where: { isActive: true },
        orderBy: { versionNumber: 'desc' },
        include: {
          createdByUser: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.interviewRoomConfigVersion.findMany({
        orderBy: { versionNumber: 'desc' },
        take: INTERVIEW_CONFIG_VERSION_LIMIT,
        include: {
          createdByUser: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    const configMap = buildInterviewConfigMap(configs);

    res.json({
      success: true,
      data: {
        config: configMap,
        activeVersion: activeVersion ? serializeInterviewConfigVersion(activeVersion) : null,
        versions: versions.map(serializeInterviewConfigVersion),
        productionStatus: {
          mode: 'immediate_for_new_interviews',
          note:
            'Publishing a new version or activating a saved version updates the production config immediately for newly started interview rooms.',
        },
      },
    });
  } catch (error) {
    console.error('Admin interview-config error:', error);
    res.status(500).json({ success: false, error: 'Failed to load interview config' });
  }
});

/**
 * PUT /api/v1/admin/interview-config
 * Upsert interview configuration values
 * Body: { "interview.instructions": "...", "interview.llmModel": "...", ... }
 */
router.put('/interview-config', async (req, res) => {
  try {
    const adminId = req.user!.id;
    const body = (isRecord(req.body) ? req.body : {}) as Record<string, unknown>;
    const rawConfig = isRecord(body.config) ? body.config : body;
    const incomingConfig = Object.fromEntries(
      Object.entries(rawConfig)
        .filter(([key]) => INTERVIEW_CONFIG_KEYS.includes(key))
        .filter(([, value]) => typeof value === 'string'),
    ) as Record<string, string>;
    const versionLabel = toOptionalTrimmedString(body.versionLabel);
    const changeNote = toOptionalTrimmedString(body.changeNote);

    if (Object.keys(incomingConfig).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid config keys provided' });
    }

    const [existingConfigs, versionAggregate] = await Promise.all([
      prisma.appConfig.findMany({
        where: { key: { in: INTERVIEW_CONFIG_KEYS } },
      }),
      prisma.interviewRoomConfigVersion.aggregate({
        _max: { versionNumber: true },
      }),
    ]);

    const currentConfig = buildInterviewConfigMap(existingConfigs);
    const nextConfig = {
      ...currentConfig,
      ...incomingConfig,
    };
    const nextVersionNumber = (versionAggregate._max.versionNumber ?? 0) + 1;
    const effectiveVersionLabel = versionLabel || (nextVersionNumber === 1 ? 'v1.0' : undefined);
    const now = new Date();

    const version = await prisma.$transaction(async (tx) => {
      await tx.interviewRoomConfigVersion.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      await syncInterviewAppConfig(tx, nextConfig, adminId);

      return tx.interviewRoomConfigVersion.create({
        data: {
          versionNumber: nextVersionNumber,
          versionLabel: effectiveVersionLabel,
          changeNote,
          config: nextConfig as Prisma.InputJsonValue,
          isActive: true,
          activatedAt: now,
          createdById: adminId,
        },
        include: {
          createdByUser: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    });

    const latestVersions = await prisma.interviewRoomConfigVersion.findMany({
      orderBy: { versionNumber: 'desc' },
      take: INTERVIEW_CONFIG_VERSION_LIMIT,
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      success: true,
      data: {
        updated: Object.keys(incomingConfig).length,
        config: nextConfig,
        activeVersion: serializeInterviewConfigVersion(version),
        versions: latestVersions.map(serializeInterviewConfigVersion),
        productionEffectiveAt: now.toISOString(),
        productionStatus: {
          mode: 'immediate_for_new_interviews',
          note:
            'This version is now active for newly started interview rooms in production.',
        },
      },
    });
  } catch (error) {
    console.error('Admin interview-config update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update interview config' });
  }
});

/**
 * POST /api/v1/admin/interview-config/:versionId/activate
 * Makes a saved config version the active production config.
 */
router.post('/interview-config/:versionId/activate', async (req, res) => {
  try {
    const adminId = req.user!.id;
    const versionId = req.params.versionId;
    const now = new Date();

    const activatedVersion = await prisma.$transaction(async (tx) => {
      const existingVersion = await tx.interviewRoomConfigVersion.findUnique({
        where: { id: versionId },
        include: {
          createdByUser: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (!existingVersion) {
        return null;
      }

      const snapshot = isRecord(existingVersion.config)
        ? normalizeInterviewConfigSnapshot(existingVersion.config)
        : buildInterviewConfigMap([]);

      await tx.interviewRoomConfigVersion.updateMany({
        where: { isActive: true, id: { not: versionId } },
        data: { isActive: false },
      });

      await syncInterviewAppConfig(tx, snapshot, adminId);

      const updatedVersion = await tx.interviewRoomConfigVersion.update({
        where: { id: versionId },
        data: {
          isActive: true,
          activatedAt: now,
        },
        include: {
          createdByUser: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return {
        config: snapshot,
        version: updatedVersion,
      };
    });

    if (!activatedVersion) {
      return res.status(404).json({ success: false, error: 'Config version not found' });
    }

    const latestVersions = await prisma.interviewRoomConfigVersion.findMany({
      orderBy: { versionNumber: 'desc' },
      take: INTERVIEW_CONFIG_VERSION_LIMIT,
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      success: true,
      data: {
        config: activatedVersion.config,
        activeVersion: serializeInterviewConfigVersion(activatedVersion.version),
        versions: latestVersions.map(serializeInterviewConfigVersion),
        productionEffectiveAt: now.toISOString(),
        productionStatus: {
          mode: 'immediate_for_new_interviews',
          note:
            'This saved version is now active for newly started interview rooms in production.',
        },
      },
    });
  } catch (error) {
    console.error('Admin interview-config activation error:', error);
    res.status(500).json({ success: false, error: 'Failed to activate interview config version' });
  }
});

// ── Activity Tracking Endpoints ──────────────────────────────────────

/**
 * GET /api/v1/admin/activity/signups
 * Recent user signups
 */
router.get('/activity/signups', async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, email: true, name: true, company: true, provider: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.user.count(),
    ]);

    res.json({ success: true, data: { users, total } });
  } catch (error) {
    console.error('Admin activity/signups error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch signups' });
  }
});

/**
 * GET /api/v1/admin/activity/logins
 * Recent login events from ApiRequestLog
 */
router.get('/activity/logins', async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const logins = await prisma.apiRequestLog.findMany({
      where: {
        endpoint: { contains: '/api/auth/login' },
        statusCode: { in: [200, 201] },
      },
      select: {
        id: true,
        userId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    res.json({ success: true, data: { logins } });
  } catch (error) {
    console.error('Admin activity/logins error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch logins' });
  }
});

/**
 * GET /api/v1/admin/activity/feed
 * User click/page_view activity feed
 */
router.get('/activity/feed', async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const userId = req.query.userId as string | undefined;

    const where: any = {};
    if (userId) where.userId = userId;

    const [activities, total] = await Promise.all([
      prisma.userActivity.findMany({
        where,
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userActivity.count({ where }),
    ]);

    res.json({ success: true, data: { activities, total } });
  } catch (error) {
    console.error('Admin activity/feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activity feed' });
  }
});

/**
 * GET /api/v1/admin/activity/journey/:userId
 * Per-user click journey timeline with session grouping
 */
router.get('/activity/journey/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const sessionId = req.query.sessionId as string | undefined;
    const limit = Math.min(500, parseInt(req.query.limit as string) || 200);

    const where: any = { userId };
    if (sessionId) where.sessionId = sessionId;

    const [activities, sessions] = await Promise.all([
      prisma.userActivity.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        take: limit,
      }),
      prisma.userActivity.groupBy({
        by: ['sessionId'],
        where: { userId },
        _min: { timestamp: true },
        _max: { timestamp: true },
        _count: true,
        orderBy: { _min: { timestamp: 'desc' } },
        take: 50,
      }),
    ]);

    res.json({ success: true, data: { activities, sessions } });
  } catch (error) {
    console.error('Admin activity/journey error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user journey' });
  }
});

/**
 * GET /api/v1/admin/activity/users
 * List users for activity filter dropdowns
 */
router.get('/activity/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ success: true, data: { users } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// ─── Team Management ──────────────────────────────────────────────────

// List all teams
router.get('/teams', async (_req, res) => {
  try {
    const teams = await prisma.team.findMany({
      include: { members: { select: { id: true, name: true, email: true, role: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch teams' });
  }
});

// Create a team
router.post('/teams', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Team name is required' });
    }
    const team = await prisma.team.create({
      data: { name: name.trim(), description: description?.trim() || null },
      include: { members: { select: { id: true, name: true, email: true, role: true, avatar: true } } },
    });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create team' });
  }
});

// Update a team
router.patch('/teams/:teamId', async (req, res) => {
  try {
    const { name, description } = req.body;
    const team = await prisma.team.update({
      where: { id: req.params.teamId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
      },
      include: { members: { select: { id: true, name: true, email: true, role: true, avatar: true } } },
    });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update team' });
  }
});

// Delete a team (unsets teamId for all members)
router.delete('/teams/:teamId', async (req, res) => {
  try {
    await prisma.user.updateMany({
      where: { teamId: req.params.teamId },
      data: { teamId: null },
    });
    await prisma.team.delete({ where: { id: req.params.teamId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete team' });
  }
});

// Add members to a team
router.post('/teams/:teamId/members', async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'userIds array is required' });
    }
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { teamId: req.params.teamId },
    });
    const team = await prisma.team.findUnique({
      where: { id: req.params.teamId },
      include: { members: { select: { id: true, name: true, email: true, role: true, avatar: true } } },
    });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add members' });
  }
});

// Remove a member from a team
router.delete('/teams/:teamId/members/:userId', async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { teamId: null },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

export default router;
