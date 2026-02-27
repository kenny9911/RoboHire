import { Router } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import prisma from '../lib/prisma.js';
import { updatePriceId } from './checkout.js';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

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
 * GET /api/v1/admin/users
 * List users with pagination and search
 */
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string)?.trim() || '';
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
            { company: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
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
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        users,
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
 * Get full user details including adjustment history
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        avatar: true,
        role: true,
        provider: true,
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
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const adjustments = await prisma.adminAdjustment.findMany({
      where: { userId: user.id },
      include: {
        admin: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: { user, adjustments } });
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

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, topUpBalance: true },
      });

      if (!user) throw new Error('USER_NOT_FOUND');

      const oldBalance = user.topUpBalance;
      const newBalance = Math.max(0, oldBalance + amount); // Never go negative

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { topUpBalance: newBalance },
        select: { id: true, topUpBalance: true },
      });

      await tx.adminAdjustment.create({
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

      return { oldBalance, newBalance: updatedUser.topUpBalance };
    });

    res.json({
      success: true,
      data: {
        oldBalance: result.oldBalance,
        newBalance: result.newBalance,
        adjustment: amount,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
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

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, interviewsUsed: true, resumeMatchesUsed: true },
      });

      if (!user) throw new Error('USER_NOT_FOUND');

      const oldValue = user[field];
      const newValue = Math.max(0, oldValue + amount); // Never go negative

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { [field]: newValue },
        select: { id: true, interviewsUsed: true, resumeMatchesUsed: true },
      });

      await tx.adminAdjustment.create({
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

      return { oldValue, newValue: updatedUser[field] };
    });

    res.json({
      success: true,
      data: {
        action,
        oldValue: result.oldValue,
        newValue: result.newValue,
        adjustment: amount,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
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

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, subscriptionTier: true, subscriptionStatus: true },
      });

      if (!user) throw new Error('USER_NOT_FOUND');

      const oldValue = JSON.stringify({ tier: user.subscriptionTier, status: user.subscriptionStatus });

      const updateData: Record<string, string> = { subscriptionTier: tier };
      if (status) updateData.subscriptionStatus = status;

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: updateData,
        select: { id: true, subscriptionTier: true, subscriptionStatus: true },
      });

      const newValue = JSON.stringify({ tier: updatedUser.subscriptionTier, status: updatedUser.subscriptionStatus });

      await tx.adminAdjustment.create({
        data: {
          userId: user.id,
          adminId: req.user!.id,
          type: 'subscription',
          oldValue,
          newValue,
          reason: reason.trim(),
        },
      });

      return {
        oldTier: user.subscriptionTier,
        oldStatus: user.subscriptionStatus,
        newTier: updatedUser.subscriptionTier,
        newStatus: updatedUser.subscriptionStatus,
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    console.error('Admin set subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to set subscription' });
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

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, interviewsUsed: true, resumeMatchesUsed: true },
      });

      if (!user) throw new Error('USER_NOT_FOUND');

      await tx.user.update({
        where: { id: user.id },
        data: { interviewsUsed: 0, resumeMatchesUsed: 0 },
      });

      await tx.adminAdjustment.create({
        data: {
          userId: user.id,
          adminId: req.user!.id,
          type: 'usage_interview',
          amount: -user.interviewsUsed,
          oldValue: String(user.interviewsUsed),
          newValue: '0',
          reason: `[Reset] ${reason.trim()}`,
        },
      });

      if (user.resumeMatchesUsed > 0) {
        await tx.adminAdjustment.create({
          data: {
            userId: user.id,
            adminId: req.user!.id,
            type: 'usage_match',
            amount: -user.resumeMatchesUsed,
            oldValue: String(user.resumeMatchesUsed),
            newValue: '0',
            reason: `[Reset] ${reason.trim()}`,
          },
        });
      }

      return {
        oldInterviews: user.interviewsUsed,
        oldMatches: user.resumeMatchesUsed,
      };
    });

    res.json({
      success: true,
      data: {
        ...result,
        newInterviews: 0,
        newMatches: 0,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
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
 * POST /api/v1/admin/config/pricing
 * Update subscription prices. Creates new Stripe prices (they're immutable).
 * Body: { starter?: number, growth?: number, business?: number }
 */
router.post('/config/pricing', async (req, res) => {
  try {
    const { starter, growth, business } = req.body;
    const updates: { tier: string; price: number }[] = [];

    if (typeof starter === 'number' && starter > 0) updates.push({ tier: 'starter', price: starter });
    if (typeof growth === 'number' && growth > 0) updates.push({ tier: 'growth', price: growth });
    if (typeof business === 'number' && business > 0) updates.push({ tier: 'business', price: business });

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'Provide at least one tier price to update' });
      return;
    }

    const stripe = getStripe();
    const results: Record<string, { price: number; stripePriceId?: string }> = {};

    for (const { tier, price } of updates) {
      // Update AppConfig
      await prisma.appConfig.upsert({
        where: { key: `price_${tier}_monthly` },
        update: { value: String(price), updatedBy: req.user!.id },
        create: { key: `price_${tier}_monthly`, value: String(price), updatedBy: req.user!.id },
      });

      let stripePriceId: string | undefined;

      // Create new Stripe price if Stripe is configured
      if (stripe) {
        try {
          // Get or create a product for this tier
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

          // Create new price (Stripe prices are immutable)
          const newPrice = await stripe.prices.create({
            product: productId,
            unit_amount: Math.round(price * 100),
            currency: 'usd',
            recurring: { interval: 'month' },
            metadata: { tier, updatedBy: req.user!.id },
          });

          stripePriceId = newPrice.id;

          // Archive old price if exists
          const oldPriceConfig = await prisma.appConfig.findUnique({
            where: { key: `stripe_price_id_${tier}_monthly` },
          });
          if (oldPriceConfig?.value) {
            try {
              await stripe.prices.update(oldPriceConfig.value, { active: false });
            } catch { /* old price may not exist */ }
          }

          // Store new price ID
          await prisma.appConfig.upsert({
            where: { key: `stripe_price_id_${tier}_monthly` },
            update: { value: newPrice.id, updatedBy: req.user!.id },
            create: { key: `stripe_price_id_${tier}_monthly`, value: newPrice.id, updatedBy: req.user!.id },
          });

          // Update in-memory map
          updatePriceId(tier, newPrice.id);
        } catch (stripeErr) {
          console.error(`Failed to create Stripe price for ${tier}:`, stripeErr);
        }
      }

      results[tier] = { price, stripePriceId };
    }

    // Audit trail
    await prisma.adminAdjustment.create({
      data: {
        userId: req.user!.id,
        adminId: req.user!.id,
        type: 'pricing',
        oldValue: null,
        newValue: JSON.stringify(results),
        reason: `Updated pricing: ${updates.map(u => `${u.tier}=$${u.price}`).join(', ')}`,
      },
    });

    res.json({ success: true, data: { updated: results } });
  } catch (error) {
    console.error('Admin pricing update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update pricing' });
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
 * Change a user's role (admin/user)
 * Body: { role: 'admin' | 'user', reason: string }
 */
router.post('/users/:userId/set-role', async (req, res) => {
  try {
    const { role, reason } = req.body;

    if (role !== 'admin' && role !== 'user') {
      res.status(400).json({ success: false, error: 'role must be "admin" or "user"' });
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

export default router;
