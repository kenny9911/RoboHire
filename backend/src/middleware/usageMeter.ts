import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';

/**
 * Plan limits based on pricing.md
 * Matches per month / Interviews per month
 */
const PLAN_LIMITS: Record<string, { interviews: number; matches: number }> = {
  free: { interviews: 0, matches: 0 },
  starter: { interviews: 15, matches: 30 },
  growth: { interviews: 120, matches: 240 },
  business: { interviews: 280, matches: 500 },
  custom: { interviews: Infinity, matches: Infinity },
};

/** Pay-per-use prices when plan limits are exceeded */
const PAY_PER_USE = {
  interview: 2.0,   // $2.00 per interview
  match: 0.4,       // $0.40 per resume match
};

type BillableAction = 'interview' | 'match';

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
        },
      });

      if (!freshUser) {
        res.status(401).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }

      const tier = freshUser.subscriptionTier || 'free';
      const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free;
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
      const limitField = action === 'interview' ? 'interviews' : 'matches';
      const used = action === 'interview' ? freshUser.interviewsUsed : freshUser.resumeMatchesUsed;
      const limit = limits[limitField];
      const price = action === 'interview' ? PAY_PER_USE.interview : PAY_PER_USE.match;

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
