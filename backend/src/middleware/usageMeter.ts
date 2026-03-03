import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';

/**
 * Default plan limits (fallback when no DB config exists).
 */
const DEFAULT_PLAN_LIMITS: Record<string, { interviews: number; matches: number }> = {
  free: { interviews: 0, matches: 0 },
  starter: { interviews: 15, matches: 30 },
  growth: { interviews: 120, matches: 240 },
  business: { interviews: 280, matches: 500 },
  custom: { interviews: Infinity, matches: Infinity },
};

/** Default pay-per-use prices */
const DEFAULT_PAY_PER_USE = {
  interview: 2.0,   // $2.00 per interview
  match: 0.4,       // $0.40 per resume match
};

// ---------------------------------------------------------------------------
// In-memory cache for DB-backed config (5-minute TTL)
// ---------------------------------------------------------------------------
let cachedLimits: Record<string, { interviews: number; matches: number }> | null = null;
let cachedPayPerUse: { interview: number; match: number } | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Clear the in-memory cache (called after admin updates limits). */
export function clearLimitsCache(): void {
  cachedLimits = null;
  cachedPayPerUse = null;
  cacheTimestamp = 0;
}

async function loadConfigFromDb(): Promise<void> {
  if (cachedLimits && cachedPayPerUse && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return; // cache still fresh
  }

  try {
    const rows = await prisma.appConfig.findMany({
      where: {
        key: { startsWith: 'limit_' },
      },
    });
    const ppuRows = await prisma.appConfig.findMany({
      where: {
        key: { startsWith: 'payperuse_' },
      },
    });

    // Build limits from DB rows, merging with defaults
    const limits: Record<string, { interviews: number; matches: number }> = {};
    for (const [tier, defaults] of Object.entries(DEFAULT_PLAN_LIMITS)) {
      limits[tier] = { ...defaults };
    }
    for (const row of rows) {
      // key format: limit_{tier}_{action}  e.g. limit_starter_interviews
      const match = row.key.match(/^limit_(\w+)_(interviews|matches)$/);
      if (match) {
        const tier = match[1];
        const action = match[2] as 'interviews' | 'matches';
        const val = Number(row.value);
        if (limits[tier] && Number.isFinite(val) && val >= 0) {
          limits[tier][action] = val;
        }
      }
    }
    // custom tier is always unlimited
    limits.custom = { interviews: Infinity, matches: Infinity };

    // Build pay-per-use from DB
    const ppu = { ...DEFAULT_PAY_PER_USE };
    for (const row of ppuRows) {
      if (row.key === 'payperuse_interview') {
        const val = Number(row.value);
        if (Number.isFinite(val) && val > 0) ppu.interview = val;
      }
      if (row.key === 'payperuse_match') {
        const val = Number(row.value);
        if (Number.isFinite(val) && val > 0) ppu.match = val;
      }
    }

    cachedLimits = limits;
    cachedPayPerUse = ppu;
    cacheTimestamp = Date.now();
  } catch {
    // On DB error, fall back to defaults
    cachedLimits = { ...DEFAULT_PLAN_LIMITS };
    cachedPayPerUse = { ...DEFAULT_PAY_PER_USE };
    cacheTimestamp = Date.now();
  }
}

/** Get plan limits (DB-backed with fallback). */
export async function getPlanLimits(): Promise<Record<string, { interviews: number; matches: number }>> {
  await loadConfigFromDb();
  return cachedLimits!;
}

/** Get pay-per-use rates (DB-backed with fallback). */
export async function getPayPerUseRates(): Promise<{ interview: number; match: number }> {
  await loadConfigFromDb();
  return cachedPayPerUse!;
}

type BillableAction = 'interview' | 'match';

function isBillableEndpointForAction(action: BillableAction, path: string): boolean {
  const normalized = path.toLowerCase();

  if (action === 'match') {
    return normalized.endsWith('/match-resume');
  }

  if (action === 'interview') {
    return normalized.endsWith('/invite-candidate') || normalized.endsWith('/batch-invite');
  }

  return false;
}

/**
 * Middleware factory that checks usage limits and handles billing
 * before allowing a billable API call to proceed.
 *
 * Logic:
 * 1. Check if user's plan has remaining quota for this action
 * 2. If within plan limits → allow and increment counter
 * 3. If over plan limits → check topUpBalance, deduct pay-per-use fee, allow
 * 4. If no balance → reject with 402 Payment Required
 */
export function checkUsageLimit(action: BillableAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Safety guard: only bill explicitly billable endpoints for the given action.
      // This prevents accidental quota deduction if middleware is attached to free endpoints.
      if (!isBillableEndpointForAction(action, req.path)) {
        (req as any).usageBilling = { source: 'free', action, cost: 0 };
        next();
        return;
      }

      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
        return;
      }

      // Fetch fresh user data from DB for accurate counters
      const freshUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          subscriptionTier: true,
          subscriptionStatus: true,
          interviewsUsed: true,
          resumeMatchesUsed: true,
          topUpBalance: true,
          currentPeriodEnd: true,
          customMaxInterviews: true,
          customMaxMatches: true,
        },
      });

      if (!freshUser) {
        res.status(401).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }

      const tier = freshUser.subscriptionTier || 'free';
      const planLimits = await getPlanLimits();
      const payPerUse = await getPayPerUseRates();
      const limits = planLimits[tier] || planLimits.free;
      const status = freshUser.subscriptionStatus;

      // Check subscription is in a valid state (active, trialing, or free tier)
      if (tier !== 'free' && status !== 'active' && status !== 'trialing') {
        // Past due or canceled subscription — only allow if they have top-up balance
        if (freshUser.topUpBalance <= 0) {
          res.status(402).json({
            success: false,
            error: 'Your subscription is inactive. Please update your payment method or top up your balance.',
            code: 'SUBSCRIPTION_INACTIVE',
          });
          return;
        }
      }

      const usedField = action === 'interview' ? 'interviewsUsed' : 'resumeMatchesUsed';
      const used = action === 'interview' ? freshUser.interviewsUsed : freshUser.resumeMatchesUsed;
      // Per-user admin override takes precedence over plan defaults
      const limit = action === 'interview'
        ? (freshUser.customMaxInterviews ?? limits.interviews)
        : (freshUser.customMaxMatches ?? limits.matches);
      const price = action === 'interview' ? payPerUse.interview : payPerUse.match;

      if (used < limit) {
        // Within plan limits — increment counter
        await prisma.user.update({
          where: { id: user.id },
          data: { [usedField]: { increment: 1 } },
        });
        // Tag the request so downstream knows it was plan-included
        (req as any).usageBilling = { source: 'plan', action, cost: 0 };
        next();
        return;
      }

      // Over plan limits — charge from top-up balance
      if (freshUser.topUpBalance >= price) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            [usedField]: { increment: 1 },
            topUpBalance: { decrement: price },
          },
        });
        (req as any).usageBilling = { source: 'topup', action, cost: price };
        next();
        return;
      }

      // Insufficient balance
      const actionLabel = action === 'interview' ? 'interview' : 'resume match';
      res.status(402).json({
        success: false,
        error: `You've reached your monthly ${actionLabel} limit (${limit}). Top up your balance to continue — $${price.toFixed(2)} per ${actionLabel}.`,
        code: 'USAGE_LIMIT_EXCEEDED',
        details: {
          action,
          used,
          limit,
          pricePerUnit: price,
          currentBalance: freshUser.topUpBalance,
          requiredBalance: price,
        },
      });
    } catch (error) {
      console.error('Usage meter error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check usage limits',
        code: 'USAGE_CHECK_ERROR',
      });
    }
  };
}

/**
 * Reset usage counters for a user. Called when subscription renews.
 */
export async function resetUsageCounters(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      interviewsUsed: 0,
      resumeMatchesUsed: 0,
    },
  });
}
