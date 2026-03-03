import { Router } from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { resetUsageCounters } from '../middleware/usageMeter.js';
import { isDiscountActive, loadPricingConfigFromDb, toPublicPricingPayload } from '../services/pricingConfig.js';
import '../types/auth.js';

const router = Router();

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// Alipay configuration
function getAlipayConfig() {
  const backendUrl =
    process.env.BACKEND_URL ||
    process.env.API_BASE_URL ||
    process.env.API_URL ||
    `http://localhost:${process.env.PORT || 4607}`;
  return {
    baseUrl: process.env.ALIPAY_BASE_URL || 'https://worker.gohire.top',
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || `${backendUrl}/api/v1/payment/callback`,
  };
}

let PRICE_MAP: Record<string, string | undefined> = {
  'starter_monthly': process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
  'growth_monthly': process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID,
  'business_monthly': process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
};

/** Update a price ID in the in-memory map (called by admin pricing endpoint) */
export function updatePriceId(tier: string, priceId: string) {
  PRICE_MAP[`${tier}_monthly`] = priceId;
}

/** Load price IDs from AppConfig DB (fallback to env vars) */
async function loadPriceIdsFromConfig() {
  try {
    const configs = await prisma.appConfig.findMany({
      where: { key: { startsWith: 'stripe_price_id_' } },
    });
    for (const config of configs) {
      // key format: stripe_price_id_starter_monthly
      const mapKey = config.key.replace('stripe_price_id_', '');
      if (config.value) PRICE_MAP[mapKey] = config.value;
    }
  } catch {
    // DB not ready yet or no config rows — use env vars
  }
}

// Load on module init
loadPriceIdsFromConfig();

const TOPUP_MIN_CENTS = 1000;  // $10 minimum
const TOPUP_MAX_CENTS = 100000; // $1,000 maximum
const FREE_TRIAL_DAYS = parseInt(process.env.STRIPE_FREE_TRIAL_DAYS || '14', 10);
const TIER_RANK: Record<'free' | 'starter' | 'growth' | 'business' | 'custom', number> = {
  free: 0,
  starter: 1,
  growth: 2,
  business: 3,
  custom: 4,
};

function resolveEffectiveTier(user: Express.User): 'free' | 'starter' | 'growth' | 'business' | 'custom' {
  const tier = (user.subscriptionTier || 'free').toLowerCase();
  const status = (user.subscriptionStatus || 'active').toLowerCase();

  if (tier === 'custom') return 'custom';
  if (tier !== 'free' && status !== 'active' && status !== 'trialing') {
    return 'free';
  }
  if (tier === 'starter' || tier === 'growth' || tier === 'business' || tier === 'free') {
    return tier;
  }

  return 'free';
}

/**
 * Helper: ensure the user has a Stripe customer ID, creating one if needed.
 */
async function ensureStripeCustomer(stripe: Stripe, user: Express.User): Promise<string> {
  let customerId = user.stripeCustomerId as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }
  return customerId;
}

/**
 * POST /api/v1/checkout
 * Create a Stripe Checkout Session for a subscription.
 */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Payment processing is not configured. Please contact support.',
      });
    }

    const { tier, trial } = req.body;
    const interval = 'monthly'; // Only monthly billing for now
    if (!tier || !['starter', 'growth', 'business'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'Invalid tier' });
    }
    const requestedTier = tier as 'starter' | 'growth' | 'business';

    const priceId = PRICE_MAP[`${tier}_${interval}`];
    if (!priceId) {
      return res.status(400).json({
        success: false,
        error: 'Price not configured for this plan. Please contact support.',
      });
    }

    const user = req.user!;
    const currentTier = resolveEffectiveTier(user);
    if (currentTier === 'custom') {
      return res.status(400).json({
        success: false,
        error: 'Custom plan is managed by sales. Please contact support for changes.',
      });
    }
    if (currentTier !== 'free' && TIER_RANK[requestedTier] <= TIER_RANK[currentTier]) {
      return res.status(400).json({
        success: false,
        error: 'You are already on this plan or a higher plan. Please choose a higher tier.',
      });
    }

    const customerId = await ensureStripeCustomer(stripe, user);

    // Only allow trial for users who haven't had a paid subscription before
    const enableTrial = trial === true && user.subscriptionTier === 'free' && !user.subscriptionId;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3607';
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/dashboard?welcome=1`,
      cancel_url: `${frontendUrl}/pricing`,
      client_reference_id: user.id,
      metadata: { tier, interval, userId: user.id, trial: enableTrial ? 'true' : 'false' },
    };

    if (enableTrial) {
      sessionParams.subscription_data = {
        trial_period_days: FREE_TRIAL_DAYS,
      };
    }

    const pricingConfig = await loadPricingConfigFromDb();
    if (isDiscountActive(pricingConfig.discount) && pricingConfig.discount.stripeCouponId) {
      sessionParams.discounts = [{ coupon: pricingConfig.discount.stripeCouponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ success: true, data: { url: session.url } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create checkout session';
    console.error('Checkout session error:', msg, error);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * GET /api/v1/config/pricing
 * Public endpoint — returns current subscription prices.
 */
router.get('/config/pricing', async (_req, res) => {
  try {
    const snapshot = await loadPricingConfigFromDb();
    res.json({ success: true, data: toPublicPricingPayload(snapshot) });
  } catch (error) {
    res.json({
      success: true,
      data: {
        starter: 29,
        growth: 199,
        business: 399,
        prices: {
          USD: { starter: 29, growth: 199, business: 399 },
          CNY: { starter: 199, growth: 1369, business: 2749 },
          JPY: { starter: 4559, growth: 31329, business: 62799 },
        },
        discount: {
          enabled: false,
          percentOff: 0,
        },
      },
    });
  }
});

/**
 * POST /api/v1/checkout/alipay
 * Create an Alipay order for subscription.
 */
router.post('/checkout/alipay', requireAuth, async (req, res) => {
  try {
    const { tier, trial } = req.body;
    
    if (!tier || !['starter', 'growth', 'business'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'Invalid tier' });
    }

    const user = req.user!;
    const alipayConfig = getAlipayConfig();

    // Get price from database or use default
    const defaults: Record<string, number> = { starter: 29, growth: 199, business: 399 };
    const configs = await prisma.appConfig.findMany({
      where: { key: { in: ['price_starter_monthly', 'price_growth_monthly', 'price_business_monthly'] } },
    });
    const prices: Record<string, number> = { ...defaults };
    for (const c of configs) {
      const tierKey = c.key.replace('price_', '').replace('_monthly', '');
      const val = parseFloat(c.value);
      if (!isNaN(val)) prices[tierKey] = val;
    }

    const price = prices[tier];
    const outTradeNo = `ORDER_${Date.now()}_${user.id.slice(0, 8)}`;
    
    // Map tier to package data
    const packageData: Record<string, any> = {
      starter: {
        package_id: 'starter_monthly',
        package_name: `month_${price}`,
        package_type: '1',
        package_price: String(price),
        package_info: JSON.stringify({ number: 30, description: '当月有效', msg: '30次简历匹配', times: 30, type: 'resume' }),
      },
      growth: {
        package_id: 'growth_monthly',
        package_name: `month_${price}`,
        package_type: '1',
        package_price: String(price),
        package_info: JSON.stringify({ number: 120, description: '当月有效', msg: '120次面试', times: 120, type: 'interview' }),
      },
      business: {
        package_id: 'business_monthly',
        package_name: `month_${price}`,
        package_type: '1',
        package_price: String(price),
        package_info: JSON.stringify({ number: 280, description: '当月有效', msg: '280次面试', times: 280, type: 'interview' }),
      },
    };

    const alipayRequest = {
      out_trade_no: outTradeNo,
      total_amount: price,
      // total_amount: 0.01,
      subject: tier === 'starter' ? 'Starter套餐' : tier === 'growth' ? 'Growth套餐' : 'Business套餐',
      pay_channel: 'alipay',
      user_name: user.name || user.email?.split('@')[0] || 'user',
      user_email: user.email || '',
      user_id: user.id,
      platform: 'gohire',
      package_data: packageData[tier],
      notify_url: alipayConfig.notifyUrl,
    };
    console.log('Alipay request', alipayRequest);
    const response = await fetch(`${alipayConfig.baseUrl}/payment/payment/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alipayRequest),
    });

    const data: any = await response.json();

    // Alipay returns { code: 0, data: { pay_url: ... }, message: null } on success
    if (data.code === 0 && data.data?.pay_url) {
      // Create a pending payment record
      await prisma.paymentRecord.create({
        data: {
          userId: user.id,
          outTradeNo,
          amount: price,
          currency: 'CNY',
          paymentMethod: 'alipay',
          tier,
          status: 'pending',
          metadata: {
            trial: trial === true,
            packageData: packageData[tier],
          },
        },
      });

      // Return the pay_url directly for frontend to handle
      res.json({ code: 0, data: { pay_url: data.data.pay_url, outTradeNo } });
    } else {
      console.error('Alipay create order failed:', data);
      res.status(500).json({ code: data.code || 1, error: data.message || 'Failed to create Alipay order' });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create Alipay order';
    console.error('Alipay checkout error:', msg, error);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/v1/topup
 * Create a Stripe Checkout Session for a one-time top-up payment.
 */
router.post('/topup', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Payment processing is not configured. Please contact support.',
      });
    }

    const { amount } = req.body; // amount in cents
    if (!amount || typeof amount !== 'number' || !Number.isInteger(amount) || amount < TOPUP_MIN_CENTS || amount > TOPUP_MAX_CENTS) {
      return res.status(400).json({
        success: false,
        error: `Invalid top-up amount. Must be between $${TOPUP_MIN_CENTS / 100} and $${TOPUP_MAX_CENTS / 100}.`,
      });
    }

    const user = req.user!;
    const customerId = await ensureStripeCustomer(stripe, user);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3607';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: { name: `RoboHire Top-Up $${amount / 100}` },
        },
        quantity: 1,
      }],
      success_url: `${frontendUrl}/dashboard/account?topup=success`,
      cancel_url: `${frontendUrl}/dashboard/account?topup=canceled`,
      client_reference_id: user.id,
      metadata: { type: 'topup', amount: String(amount), userId: user.id },
    });

    // Create a pending TopUpRecord so we can track it
    await prisma.topUpRecord.create({
      data: {
        userId: user.id,
        stripeSessionId: session.id,
        amountCents: amount,
        amountDollars: amount / 100,
        status: 'pending',
      },
    });

    res.json({ success: true, data: { url: session.url } });
  } catch (error) {
    console.error('Top-up session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create top-up session' });
  }
});

/**
 * POST /api/v1/topup/alipay
 * Create an Alipay order for top-up payment.
 */
router.post('/topup/alipay', requireAuth, async (req, res) => {
  try {
    const { amount } = req.body; // amount in dollars
    if (!amount || typeof amount !== 'number' || amount < 10 || amount > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid top-up amount. Must be between $10 and $1,000.',
      });
    }

    const user = req.user!;
    const alipayConfig = getAlipayConfig();

    const outTradeNo = `TOPUP_${Date.now()}_${user.id.slice(0, 8)}`;

    const alipayRequest = {
      out_trade_no: outTradeNo,
      total_amount: amount,
      subject: `RoboHire Top-Up $${amount}`,
      pay_channel: 'alipay',
      user_name: user.name || user.email?.split('@')[0] || 'user',
      user_email: user.email || '',
      user_id: user.id,
      platform: 'gohire',
      package_data: {
        package_id: 'topup',
        package_name: `topup_${amount}`,
        package_type: '1',
        package_price: String(amount),
        package_info: JSON.stringify({ number: amount, description: '充值余额', msg: `充值$${amount}`, times: amount, type: 'topup' }),
      },
      notify_url: alipayConfig.notifyUrl,
    };
    console.log('Alipay topup request', alipayRequest);

    const response = await fetch(`${alipayConfig.baseUrl}/payment/payment/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alipayRequest),
    });

    const data: any = await response.json();

    // Alipay returns { code: 0, data: { pay_url: ... }, message: null } on success
    if (data.code === 0 && data.data?.pay_url) {
      // Create a pending topup record for Alipay (without metadata field)
      await prisma.topUpRecord.create({
        data: {
          userId: user.id,
          stripeSessionId: outTradeNo, // Reuse this field for Alipay outTradeNo
          amountCents: Math.round(amount * 100),
          amountDollars: amount,
          status: 'pending',
        },
      });

      // Also create a payment record for consistency
      await prisma.paymentRecord.create({
        data: {
          userId: user.id,
          outTradeNo,
          amount: amount,
          currency: 'CNY',
          paymentMethod: 'alipay',
          status: 'pending',
          metadata: {
            type: 'topup',
            amountDollars: amount,
          },
        },
      });

      // Return the pay_url directly for frontend to handle
      res.json({ code: 0, data: { pay_url: data.data.pay_url, outTradeNo } });
    } else {
      console.error('Alipay topup create order failed:', data);
      res.status(500).json({ code: data.code || 1, error: data.message || 'Failed to create Alipay order' });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create Alipay top-up order';
    console.error('Alipay topup error:', msg, error);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * Credit a pending top-up by checking its Stripe Checkout Session status.
 * Returns true if the top-up was newly credited.
 */
async function syncTopUpRecord(
  stripe: Stripe,
  record: { id: string; userId: string; stripeSessionId: string; amountCents: number; amountDollars: number; status: string }
): Promise<boolean> {
  if (record.status === 'completed') return false;

  const session = await stripe.checkout.sessions.retrieve(record.stripeSessionId);

  if (session.payment_status === 'paid') {
    // Credit the balance atomically
    await prisma.$transaction(async (tx) => {
      // Double-check inside the transaction to prevent race conditions
      const current = await tx.topUpRecord.findUnique({ where: { id: record.id } });
      if (current && current.status === 'completed') return;

      await tx.topUpRecord.update({
        where: { id: record.id },
        data: {
          status: 'completed',
          stripePaymentIntent: (session.payment_intent as string) || null,
          creditedAt: new Date(),
        },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { topUpBalance: { increment: record.amountDollars } },
      });
    });
    console.log(`Synced top-up: credited $${record.amountDollars} to user ${record.userId} (session ${record.stripeSessionId})`);
    return true;
  }

  // Mark expired/canceled sessions as failed
  if (session.status === 'expired') {
    await prisma.topUpRecord.update({
      where: { id: record.id },
      data: { status: 'failed' },
    });
  }

  return false;
}

/**
 * GET /api/v1/topup/status
 * Poll for top-up completion. Frontend calls this after redirect from Stripe.
 * If the latest top-up is still pending, actively checks Stripe to credit it.
 * If no TopUpRecord exists at all (legacy payment), checks Stripe sessions directly.
 */
router.get('/topup/status', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const stripe = getStripe();
    const customerId = user.stripeCustomerId as string | null;

    // Find the most recent top-up record
    let latestTopup = await prisma.topUpRecord.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // If still pending and Stripe is available, check Stripe directly
    if (latestTopup && latestTopup.status === 'pending' && stripe) {
      await syncTopUpRecord(stripe, latestTopup);
      const updated = await prisma.topUpRecord.findUnique({ where: { id: latestTopup.id } });
      if (updated) latestTopup = updated;
    }

    // Fallback: if no TopUpRecord at all but customer has Stripe sessions,
    // check the most recent payment session (handles legacy payments)
    if (!latestTopup && stripe && customerId) {
      const sessions = await stripe.checkout.sessions.list({
        customer: customerId,
        limit: 1,
      });
      const recent = sessions.data.find(
        s => s.mode === 'payment' && s.metadata?.type === 'topup' && s.payment_status === 'paid'
      );
      if (recent) {
        const amountCents = parseInt(recent.metadata?.amount || '0', 10) || (recent.amount_total || 0);
        if (amountCents > 0) {
          // Create the missing record and credit
          await prisma.$transaction(async (tx) => {
            await tx.topUpRecord.upsert({
              where: { stripeSessionId: recent.id },
              create: {
                userId: user.id,
                stripeSessionId: recent.id,
                stripePaymentIntent: (recent.payment_intent as string) || null,
                amountCents,
                amountDollars: amountCents / 100,
                status: 'completed',
                creditedAt: new Date(),
              },
              update: {},
            });
            await tx.user.update({
              where: { id: user.id },
              data: { topUpBalance: { increment: amountCents / 100 } },
            });
          });
          latestTopup = await prisma.topUpRecord.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
          });
        }
      }
    }

    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { topUpBalance: true },
    });

    res.json({
      success: true,
      data: {
        balance: freshUser?.topUpBalance ?? 0,
        latestTopup: latestTopup ? {
          status: latestTopup.status,
          amount: latestTopup.amountDollars,
          creditedAt: latestTopup.creditedAt,
        } : null,
      },
    });
  } catch (error) {
    console.error('Top-up status error:', error);
    res.status(500).json({ success: false, error: 'Failed to check top-up status' });
  }
});

/**
 * POST /api/v1/sync
 * Reconcile the user's balance and subscription with Stripe (source of truth).
 *
 * For top-ups: fetches all paid one-time Checkout Sessions from Stripe for this
 * customer, compares against our TopUpRecords, and credits any missed payments.
 * This handles: missed webhooks, payments made before TopUpRecord existed, etc.
 *
 * For subscriptions: fetches the active subscription status from Stripe.
 */
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ success: false, error: 'Payment processing is not configured.' });
    }

    const user = req.user!;
    const customerId = user.stripeCustomerId as string | null;
    const synced: { topups: number; subscription: boolean } = { topups: 0, subscription: false };

    // 1. Reconcile top-ups: use Stripe Checkout Sessions as source of truth
    if (customerId) {
      // Fetch all checkout sessions for this customer
      const sessions = await stripe.checkout.sessions.list({
        customer: customerId,
        limit: 100,
      });

      // Filter to paid top-up sessions only
      const paidTopups = sessions.data.filter(
        s => s.mode === 'payment' && s.payment_status === 'paid' && s.metadata?.type === 'topup'
      );

      // Get all existing TopUpRecords for this user (completed ones)
      const existingRecords = await prisma.topUpRecord.findMany({
        where: { userId: user.id },
        select: { stripeSessionId: true, status: true },
      });
      const creditedSessionIds = new Set(
        existingRecords.filter(r => r.status === 'completed').map(r => r.stripeSessionId)
      );

      for (const session of paidTopups) {
        if (creditedSessionIds.has(session.id)) continue; // Already credited

        const amountCents = parseInt(session.metadata?.amount || '0', 10);
        // Fallback: compute from amount_total if metadata.amount is missing (old sessions)
        const finalAmountCents = amountCents > 0 ? amountCents : (session.amount_total || 0);
        if (finalAmountCents <= 0) continue;

        const amountDollars = finalAmountCents / 100;

        try {
          await prisma.$transaction(async (tx) => {
            // Upsert: create if missing, update if pending
            await tx.topUpRecord.upsert({
              where: { stripeSessionId: session.id },
              create: {
                userId: user.id,
                stripeSessionId: session.id,
                stripePaymentIntent: (session.payment_intent as string) || null,
                amountCents: finalAmountCents,
                amountDollars,
                status: 'completed',
                creditedAt: new Date(),
              },
              update: {
                status: 'completed',
                stripePaymentIntent: (session.payment_intent as string) || null,
                creditedAt: new Date(),
              },
            });
            await tx.user.update({
              where: { id: user.id },
              data: { topUpBalance: { increment: amountDollars } },
            });
          });
          synced.topups++;
          console.log(`Sync: credited $${amountDollars} to user ${user.id} (session ${session.id})`);
        } catch (err) {
          console.error(`Sync: failed to credit session ${session.id}:`, err);
        }
      }

      // Mark stale pending records as failed if their Stripe session is expired
      const pendingRecords = existingRecords.filter(r => r.status === 'pending');
      for (const record of pendingRecords) {
        if (creditedSessionIds.has(record.stripeSessionId)) continue;
        // If this session wasn't in the paid list, check if it's expired
        const found = sessions.data.find(s => s.id === record.stripeSessionId);
        if (found && found.status === 'expired') {
          await prisma.topUpRecord.update({
            where: { stripeSessionId: record.stripeSessionId },
            data: { status: 'failed' },
          });
        }
      }
    }

    // 2. Sync subscription status from Stripe
    if (customerId && user.subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(user.subscriptionId as string);
        const statusMap: Record<string, string> = {
          active: 'active',
          trialing: 'trialing',
          past_due: 'past_due',
          canceled: 'canceled',
          unpaid: 'past_due',
        };
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: statusMap[sub.status] || sub.status,
            currentPeriodEnd: (sub as any).current_period_end
              ? new Date((sub as any).current_period_end * 1000)
              : null,
            trialEnd: (sub as any).trial_end
              ? new Date((sub as any).trial_end * 1000)
              : null,
          },
        });
        synced.subscription = true;
      } catch (err) {
        console.error('Failed to sync subscription:', err);
      }
    }

    // Return fresh user data
    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        topUpBalance: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        interviewsUsed: true,
        resumeMatchesUsed: true,
      },
    });

    res.json({
      success: true,
      data: {
        synced,
        user: freshUser,
      },
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ success: false, error: 'Failed to sync with Stripe' });
  }
});

/**
 * GET /api/v1/billing-history
 * Fetch billing history (invoices and standalone charges) from Stripe.
 */
router.get('/billing-history', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Payment processing is not configured.',
      });
    }

    const user = req.user!;
    const customerId = user.stripeCustomerId as string | null;
    if (!customerId) {
      return res.json({ success: true, data: { invoices: [], charges: [] } });
    }

    const [invoices, charges] = await Promise.all([
      stripe.invoices.list({ customer: customerId, limit: 20 }),
      stripe.charges.list({ customer: customerId, limit: 20 }),
    ]);

    res.json({
      success: true,
      data: {
        invoices: invoices.data.map(inv => ({
          id: inv.id,
          amount: inv.amount_paid / 100,
          currency: inv.currency,
          status: inv.status,
          description: inv.description || inv.lines?.data?.[0]?.description || 'Subscription',
          date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
          invoiceUrl: inv.hosted_invoice_url,
          pdfUrl: inv.invoice_pdf,
        })),
        charges: charges.data
          .filter(ch => !(ch as any).invoice) // Only standalone charges (top-ups)
          .map(ch => ({
            id: ch.id,
            amount: ch.amount / 100,
            currency: ch.currency,
            status: ch.status,
            description: ch.description || 'Top-up',
            date: new Date(ch.created * 1000).toISOString(),
            receiptUrl: ch.receipt_url,
          })),
      },
    });
  } catch (error) {
    console.error('Billing history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch billing history' });
  }
});

/**
 * GET /api/v1/payment-records
 * Fetch all payment records (Alipay, Stripe, etc.) from database.
 */
router.get('/payment-records', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.paymentRecord.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.paymentRecord.count({ where: { userId: user.id } }),
    ]);

    const paymentMethodLabels: Record<string, string> = {
      alipay: 'Alipay',
      stripe: 'Stripe',
      credit: 'Credit',
    };

    const tierLabels: Record<string, string> = {
      starter: 'Starter',
      growth: 'Growth',
      business: 'Business',
    };

    res.json({
      success: true,
      data: {
        records: records.map(r => ({
          id: r.id,
          outTradeNo: r.outTradeNo,
          amount: r.amount,
          currency: r.currency,
          paymentMethod: r.paymentMethod,
          paymentMethodLabel: paymentMethodLabels[r.paymentMethod] || r.paymentMethod,
          tier: r.tier,
          tierLabel: r.tier ? (tierLabels[r.tier] || r.tier) : null,
          status: r.status,
          paidAt: r.paidAt,
          createdAt: r.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Payment records error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment records' });
  }
});

/**
 * POST /api/v1/webhooks/stripe
 * Stripe webhook handler. Must receive raw body for signature verification.
 */
router.post('/webhooks/stripe', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).send('Stripe not configured');
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).send('Webhook secret not configured');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Handle top-up payments
        if (session.metadata?.type === 'topup') {
          const userId = session.client_reference_id || session.metadata?.userId;
          const amountCents = parseInt(session.metadata?.amount || '0', 10);
          if (userId && amountCents > 0) {
            // Check payment is actually paid (not pending)
            if (session.payment_status !== 'paid') {
              console.log(`Top-up checkout session ${session.id} not yet paid (status: ${session.payment_status})`);
              break;
            }
            // Idempotency: check if we already credited this session
            const existing = await prisma.topUpRecord.findUnique({
              where: { stripeSessionId: session.id },
            });
            if (existing && existing.status === 'completed') {
              console.log(`Top-up already credited for session ${session.id}, skipping`);
              break;
            }
            // Create or update the record and credit the balance atomically
            await prisma.$transaction(async (tx) => {
              await tx.topUpRecord.upsert({
                where: { stripeSessionId: session.id },
                create: {
                  userId,
                  stripeSessionId: session.id,
                  stripePaymentIntent: (session.payment_intent as string) || null,
                  amountCents,
                  amountDollars: amountCents / 100,
                  status: 'completed',
                  creditedAt: new Date(),
                },
                update: {
                  status: 'completed',
                  creditedAt: new Date(),
                },
              });
              await tx.user.update({
                where: { id: userId },
                data: { topUpBalance: { increment: amountCents / 100 } },
              });
            });
            console.log(`Credited $${amountCents / 100} to user ${userId} (session ${session.id})`);

            // Create PaymentRecord for top-up
            await prisma.paymentRecord.create({
              data: {
                userId,
                outTradeNo: `stripe_topup_${session.id}`,
                amount: amountCents / 100,
                currency: 'USD',
                paymentMethod: 'stripe',
                status: 'completed',
                tradeNo: session.payment_intent as string || undefined,
                paidAt: new Date(),
                metadata: {
                  stripeSessionId: session.id,
                  stripePaymentIntent: session.payment_intent as string,
                },
              },
            });
            console.log(`Created PaymentRecord for top-up: stripe_topup_${session.id}`);
          }
          break;
        }

        // Handle subscription checkout (with or without trial)
        const userId = session.client_reference_id || session.metadata?.userId;
        const tier = session.metadata?.tier;
        const isTrial = session.metadata?.trial === 'true';
        if (userId && tier) {
          const updateData: Record<string, any> = {
            subscriptionTier: tier,
            subscriptionStatus: isTrial ? 'trialing' : 'active',
            subscriptionId: (session.subscription as string) || null,
            stripeCustomerId: (session.customer as string) || undefined,
          };

          // Set trial end date if this is a trial subscription
          if (isTrial && FREE_TRIAL_DAYS > 0) {
            updateData.trialEnd = new Date(Date.now() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
          }

          await prisma.user.update({
            where: { id: userId },
            data: updateData,
          });
          // Reset usage counters when starting a new subscription
          await resetUsageCounters(userId);

          // Create PaymentRecord for subscription
          const subscriptionAmount = session.amount_total ? session.amount_total / 100 : 0;
          const subscriptionOutTradeNo = `stripe_sub_${session.id}`;
          await prisma.paymentRecord.create({
            data: {
              userId,
              outTradeNo: subscriptionOutTradeNo,
              amount: subscriptionAmount,
              currency: session.currency?.toUpperCase() || 'USD',
              paymentMethod: 'stripe',
              tier,
              status: 'completed',
              tradeNo: session.payment_intent as string || undefined,
              paidAt: new Date(),
              metadata: {
                stripeSessionId: session.id,
                stripeSubscriptionId: session.subscription as string,
                isTrial,
              },
            },
          });
          console.log(`Created PaymentRecord for subscription: ${subscriptionOutTradeNo}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (user) {
          const statusMap: Record<string, string> = {
            active: 'active',
            trialing: 'trialing',
            past_due: 'past_due',
          };
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: statusMap[sub.status] || sub.status,
              currentPeriodEnd: (sub as any).current_period_end
                ? new Date((sub as any).current_period_end * 1000)
                : null,
              trialEnd: (sub as any).trial_end
                ? new Date((sub as any).trial_end * 1000)
                : null,
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionTier: 'free',
              subscriptionStatus: 'canceled',
              subscriptionId: null,
              currentPeriodEnd: null,
              trialEnd: null,
            },
          });
        }
        break;
      }

      case 'invoice.paid': {
        // Reset monthly usage counters when a subscription invoice is paid (renewal)
        const paidInvoice = event.data.object as Stripe.Invoice;
        // Only reset for subscription invoices (not one-time), and skip the first invoice
        if ((paidInvoice as any).subscription && paidInvoice.billing_reason === 'subscription_cycle') {
          const customerId = paidInvoice.customer as string;
          const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
          if (user) {
            await resetUsageCounters(user.id);
            console.log(`Reset usage counters for user ${user.id} on subscription renewal`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: 'past_due' },
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).send('Webhook handler error');
  }

  res.json({ received: true });
});

/**
 * ALL /api/v1/payment/callback
 * Payment callback handler.
 *
 * Supports:
 * - Alipay-style POST body: { out_trade_no, trade_no, trade_status, total_amount }
 * - Worker notify GET example:
 *   notify_url + "?pay_status=" + tmp_status + "&out_trade_no=" + order.out_trade_no
 */
router.all('/payment/callback', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const query = (req.query || {}) as Record<string, unknown>;

    const out_trade_no =
      (body.out_trade_no as string | undefined) ||
      (body.outTradeNo as string | undefined) ||
      (query.out_trade_no as string | undefined) ||
      (query.outTradeNo as string | undefined);

    const trade_no =
      (body.trade_no as string | undefined) ||
      (body.tradeNo as string | undefined) ||
      (query.trade_no as string | undefined) ||
      (query.tradeNo as string | undefined);

    const trade_status =
      (body.trade_status as string | undefined) ||
      (body.tradeStatus as string | undefined) ||
      (query.trade_status as string | undefined) ||
      (query.tradeStatus as string | undefined);

    const pay_status =
      (body.pay_status as string | undefined) ||
      (body.payStatus as string | undefined) ||
      (query.pay_status as string | undefined) ||
      (query.payStatus as string | undefined);

    const total_amount =
      (body.total_amount as string | number | undefined) ||
      (query.total_amount as string | number | undefined);

    console.log('Payment callback received:', {
      method: req.method,
      out_trade_no,
      trade_no,
      trade_status,
      pay_status,
      total_amount,
    });

    if (!out_trade_no) {
      return res.status(400).json({ success: false, error: 'Missing out_trade_no' });
    }

    // Find the payment record
    const payment = await prisma.paymentRecord.findUnique({
      where: { outTradeNo: out_trade_no },
    });

    if (!payment) {
      console.error('Payment record not found:', out_trade_no);
      return res.status(404).json({ success: false, error: 'Payment record not found' });
    }

    // Check if payment is already completed
    if (payment.status === 'completed') {
      return res.json({ success: true, message: 'Payment already processed' });
    }

    // Verify status (supports both trade_status and pay_status)
    const successStatuses = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED', 'SUCCESS', 'success', 'paid', 'PAID', '1', 'true', 'TRUE']);
    const failureStatuses = new Set(['FAILED', 'failed', '0', 'false', 'FALSE']);
    const statusToken = String((trade_status ?? pay_status ?? '')).trim();

    const isSuccess = successStatuses.has(statusToken);
    const isFailure = failureStatuses.has(statusToken);

    if (!statusToken) {
      return res.status(400).json({ success: false, error: 'Missing trade_status/pay_status' });
    }

    if (isSuccess) {
      // Update payment record
      await prisma.paymentRecord.update({
        where: { id: payment.id },
        data: {
          status: 'completed',
          tradeNo: trade_no,
          paidAt: new Date(),
        },
      });

      // Update user subscription or top-up balance
      const metadata = payment.metadata as any;
      if (metadata?.type === 'topup') {
        // Handle top-up: credit the balance
        const amountDollars = metadata?.amountDollars || payment.amount;
        await prisma.user.update({
          where: { id: payment.userId },
          data: {
            topUpBalance: { increment: amountDollars },
          },
        });

        // Also update TopUpRecord if exists
        const topupRecord = await prisma.topUpRecord.findFirst({
          where: { stripeSessionId: payment.outTradeNo },
        });
        if (topupRecord) {
          await prisma.topUpRecord.update({
            where: { id: topupRecord.id },
            data: {
              status: 'completed',
              creditedAt: new Date(),
            },
          });
        }

        console.log(`Top-up completed for user ${payment.userId}, amount: $${amountDollars}`);
      } else {
        // Handle subscription
        await prisma.user.update({
          where: { id: payment.userId },
          data: {
            subscriptionTier: payment.tier || 'starter',
            subscriptionStatus: 'active',
            trialEnd: metadata?.trial ? new Date(Date.now() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000) : null,
          },
        });

        // Reset usage counters
        await resetUsageCounters(payment.userId);

        console.log(`Payment completed for user ${payment.userId}, tier: ${payment.tier}`);
      }
    } else if (isFailure || !isSuccess) {
      // Update payment status to failed
      await prisma.paymentRecord.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      console.log('Payment failed:', statusToken);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Alipay callback error:', error);
    res.status(500).json({ success: false, error: 'Callback processing error' });
  }
});

/**
 * GET /api/v1/payment/status/:outTradeNo
 * Check payment status
 */
router.get('/payment/status/:outTradeNo', requireAuth, async (req, res) => {
  try {
    const { outTradeNo } = req.params;
    const user = req.user!;

    const payment = await prisma.paymentRecord.findFirst({
      where: { outTradeNo, userId: user.id },
    });

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({
      success: true,
      data: {
        status: payment.status,
        tier: payment.tier,
        amount: payment.amount,
        paidAt: payment.paidAt,
      },
    });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ success: false, error: 'Failed to check payment status' });
  }
});

export default router;
