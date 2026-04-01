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
      payment_method_types: ['card', 'link'],
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

const ALIPAY_TIER_SUBJECTS: Record<string, string> = {
  starter: 'RoboHire Starter 月度订阅',
  growth:  'RoboHire Growth 月度订阅',
  business: 'RoboHire Business 月度订阅',
};

/**
 * POST /api/v1/checkout/alipay
 * Create an Alipay payment order for a subscription tier.
 * Only used when the user's display currency is CNY.
 */
router.post('/checkout/alipay', requireAuth, async (req, res) => {
  try {
    const { tier } = req.body;
    if (!tier || !['starter', 'growth', 'business'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'Invalid tier' });
    }
    const requestedTier = tier as 'starter' | 'growth' | 'business';

    const user = req.user!;
    const currentTier = resolveEffectiveTier(user);
    if (currentTier === 'custom') {
      return res.status(400).json({
        success: false,
        error: 'Custom plan is managed by sales. Please contact support.',
      });
    }
    if (currentTier !== 'free' && TIER_RANK[requestedTier] <= TIER_RANK[currentTier]) {
      return res.status(400).json({
        success: false,
        error: 'You are already on this plan or a higher plan.',
      });
    }

    // Resolve CNY price from pricing config
    const pricingConfig = await loadPricingConfigFromDb();
    const cnyPrices = pricingConfig.prices?.CNY ?? { starter: 199, growth: 1369, business: 2749 };
    let amount: number = (cnyPrices as Record<string, number>)[requestedTier] ?? 0;
    if (amount <= 0) {
      return res.status(400).json({ success: false, error: 'Price not configured for this plan.' });
    }

    // Apply discount if active
    if (isDiscountActive(pricingConfig.discount) && pricingConfig.discount.percentOff > 0) {
      amount = Math.round(amount * (1 - pricingConfig.discount.percentOff / 100) * 100) / 100;
    }

    // Generate unique order ID
    const now = new Date();
    const ts = now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const uid = Math.random().toString(36).slice(2, 10);
    const outTradeNo = `ORDER_${ts}_${user.id.slice(0, 8)}_${uid}`;

    const backendUrl = process.env.BACKEND_URL || 'https://api.robohire.io';
    const frontendUrl = process.env.FRONTEND_URL || 'https://robohire.io';

    const alipayPayload = {
      out_trade_no: outTradeNo,
      total_amount: amount,
      subject: ALIPAY_TIER_SUBJECTS[requestedTier] || `RoboHire ${requestedTier} 月度订阅`,
      pay_channel: 'alipay',
      user_name: user.name || user.email,
      user_email: user.email,
      user_id: user.id,
      platform: 'gohire',
      package_data: {
        package_id: requestedTier,
        package_name: requestedTier,
        package_type: '1',
        package_price: String(amount),
      },
      notify_url: `${backendUrl}/api/v1/payment/callback`,
      return_url: `${frontendUrl}/dashboard?welcome=1`,
    };

    const alipayApiUrl = process.env.ALIPAY_API_URL || 'https://worker.gohire.top/payment/payment/create';
    const alipayRes = await fetch(alipayApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alipayPayload),
    });
    const alipayData = await alipayRes.json() as { code: number; data?: { pay_url: string; trade_status: string }; message?: string };

    if (alipayData.code !== 0 || !alipayData.data?.pay_url) {
      console.error('Alipay API error:', alipayData);
      return res.status(502).json({
        success: false,
        error: alipayData.message || 'Failed to create Alipay payment order.',
      });
    }

    // Persist order for idempotent callback handling
    await prisma.alipayOrder.create({
      data: {
        userId: user.id,
        outTradeNo,
        tier: requestedTier,
        amount,
        status: 'pending',
      },
    });

    res.json({ success: true, data: { url: alipayData.data.pay_url } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create Alipay order';
    console.error('Alipay checkout error:', msg, error);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * GET /api/v1/payment/callback
 * POST /api/v1/payment/callback
 * Alipay payment callback. Called by the Alipay payment service after payment.
 * Params (query or body): pay_status, out_trade_no
 */
async function handleAlipayCallback(req: import('express').Request, res: import('express').Response) {
  const callbackTime = new Date();
  const pay_status = (req.query.pay_status || req.body?.pay_status) as string | undefined;
  const out_trade_no = (req.query.out_trade_no || req.body?.out_trade_no) as string | undefined;

  console.log('[Alipay callback]', JSON.stringify({ time: callbackTime, pay_status, out_trade_no, query: req.query, body: req.body }));

  try {
    if (!pay_status || !out_trade_no) {
      console.warn('[Alipay callback] invalid params', { pay_status, out_trade_no });
      return res.status(400).json({ code: 40001, message: 'invalid callback params' });
    }

    const order = await prisma.alipayOrder.findUnique({ where: { outTradeNo: out_trade_no } });
    if (!order) {
      console.warn('[Alipay callback] order not found', { out_trade_no });
      return res.status(400).json({ code: 40002, message: 'order not found' });
    }

    if (pay_status === 'TRADE_SUCCESS' && order.status !== 'completed') {
      await prisma.$transaction(async (tx) => {
        const current = await tx.alipayOrder.findUnique({ where: { outTradeNo: out_trade_no } });
        if (current && current.status === 'completed') return; // idempotent
        await tx.alipayOrder.update({
          where: { outTradeNo: out_trade_no },
          data: { status: 'completed', completedAt: new Date() },
        });

        if (order.tier === 'topup') {
          // Credit the user's balance with the CNY amount
          await tx.user.update({
            where: { id: order.userId },
            data: { topUpBalance: { increment: order.amount } },
          });
          console.log(`Alipay topup: credited ¥${order.amount} to user ${order.userId} (order ${out_trade_no})`);
        } else {
          // Subscription activation
          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await tx.user.update({
            where: { id: order.userId },
            data: {
              subscriptionTier: order.tier,
              subscriptionStatus: 'active',
              currentPeriodEnd: periodEnd,
            },
          });
          console.log(`Alipay: activated ${order.tier} for user ${order.userId} (order ${out_trade_no})`);
        }
      });
      if (order.tier !== 'topup') await resetUsageCounters(order.userId);
      console.log('[Alipay callback] processed TRADE_SUCCESS', { out_trade_no, tier: order.tier, userId: order.userId, durationMs: Date.now() - callbackTime.getTime() });
    } else if (pay_status === 'TRADE_CLOSED' && order.status === 'pending') {
      await prisma.alipayOrder.update({
        where: { outTradeNo: out_trade_no },
        data: { status: 'closed' },
      });
      console.log('[Alipay callback] order closed', { out_trade_no });
    } else {
      console.log('[Alipay callback] no action taken', { pay_status, currentStatus: order.status, out_trade_no });
    }

    res.json({ code: 0, message: 'success' });
  } catch (error) {
    console.error('[Alipay callback] error', { out_trade_no, pay_status, error });
    res.status(500).json({ code: 50001, message: 'internal error' });
  }
}

router.get('/payment/callback', handleAlipayCallback);
router.post('/payment/callback', handleAlipayCallback);

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

const ALIPAY_TOPUP_MIN = 10;    // ¥10 CNY minimum
const ALIPAY_TOPUP_MAX = 10000; // ¥10,000 CNY maximum

/**
 * POST /api/v1/topup/alipay
 * Create an Alipay payment for a one-time credit top-up.
 * amount: CNY amount (number, e.g. 100 for ¥100)
 */
router.post('/topup/alipay', requireAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || typeof amount !== 'number' || !isFinite(amount) || amount < ALIPAY_TOPUP_MIN || amount > ALIPAY_TOPUP_MAX) {
      return res.status(400).json({
        success: false,
        error: `Invalid top-up amount. Must be between ¥${ALIPAY_TOPUP_MIN} and ¥${ALIPAY_TOPUP_MAX}.`,
      });
    }

    const user = req.user!;
    const now = new Date();
    const ts = now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const uid = Math.random().toString(36).slice(2, 10);
    const outTradeNo = `TOPUP_${ts}_${user.id.slice(0, 8)}_${uid}`;

    const backendUrl = process.env.BACKEND_URL || 'https://api.robohire.io';
    const frontendUrl = process.env.FRONTEND_URL || 'https://robohire.io';

    const alipayPayload = {
      out_trade_no: outTradeNo,
      total_amount: amount,
      subject: `RoboHire 充值 ¥${amount}`,
      pay_channel: 'alipay',
      user_name: user.name || user.email,
      user_email: user.email,
      user_id: user.id,
      platform: 'gohire',
      notify_url: `${backendUrl}/api/v1/payment/callback`,
      return_url: `${frontendUrl}/dashboard/account?topup=success`,
    };

    const alipayApiUrl = process.env.ALIPAY_API_URL || 'https://worker.gohire.top/payment/payment/create';
    const alipayRes = await fetch(alipayApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alipayPayload),
    });
    const alipayData = await alipayRes.json() as { code: number; data?: { pay_url: string }; message?: string };

    if (alipayData.code !== 0 || !alipayData.data?.pay_url) {
      console.error('Alipay topup API error:', alipayData);
      return res.status(502).json({
        success: false,
        error: alipayData.message || 'Failed to create Alipay top-up order.',
      });
    }

    await prisma.alipayOrder.create({
      data: {
        userId: user.id,
        outTradeNo,
        tier: 'topup',
        amount,
        status: 'pending',
      },
    });

    res.json({ success: true, data: { url: alipayData.data.pay_url } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create Alipay top-up';
    console.error('Alipay topup error:', msg, error);
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
      payment_method_types: ['card', 'link', 'alipay', 'wechat_pay'],
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
 * Poll for top-up completion. Covers both Stripe and Alipay top-ups.
 * Returns the most recent top-up record regardless of payment method.
 */
router.get('/topup/status', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const stripe = getStripe();
    const customerId = user.stripeCustomerId as string | null;

    // Find the most recent Stripe top-up record
    let latestStripe = await prisma.topUpRecord.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // Find the most recent Alipay top-up order
    const latestAlipay = await prisma.alipayOrder.findFirst({
      where: { userId: user.id, tier: 'topup' },
      orderBy: { createdAt: 'desc' },
    });

    // Determine which is more recent
    const useAlipay = latestAlipay
      ? !latestStripe || latestAlipay.createdAt > latestStripe.createdAt
      : false;

    // For Stripe pending records, actively sync with Stripe
    if (!useAlipay && latestStripe && latestStripe.status === 'pending' && stripe) {
      await syncTopUpRecord(stripe, latestStripe);
      const updated = await prisma.topUpRecord.findUnique({ where: { id: latestStripe.id } });
      if (updated) latestStripe = updated;
    }

    let latestTopup: { status: string; amount: number; creditedAt: Date | null; method: string } | null = null;
    if (useAlipay && latestAlipay) {
      latestTopup = {
        status: latestAlipay.status,
        amount: latestAlipay.amount,
        creditedAt: latestAlipay.completedAt,
        method: 'alipay',
      };
    } else if (latestStripe) {
      latestTopup = {
        status: latestStripe.status,
        amount: latestStripe.amountDollars,
        creditedAt: latestStripe.creditedAt,
        method: 'stripe',
      };
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
          const created = await prisma.topUpRecord.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
          });
          if (created) {
            latestTopup = {
              status: created.status,
              amount: created.amountDollars,
              creditedAt: created.creditedAt,
              method: 'stripe',
            };
          }
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
        latestTopup,
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

    // 3. Sync Alipay subscription — activate if completed order not yet reflected in user tier
    const latestAlipaySubscription = await prisma.alipayOrder.findFirst({
      where: { userId: user.id, tier: { in: ['starter', 'growth', 'business'] }, status: 'completed' },
      orderBy: { completedAt: 'desc' },
    });
    if (latestAlipaySubscription && latestAlipaySubscription.completedAt) {
      const periodEnd = new Date(latestAlipaySubscription.completedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      const isStillActive = periodEnd > new Date();
      if (isStillActive && user.subscriptionTier !== latestAlipaySubscription.tier) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionTier: latestAlipaySubscription.tier,
            subscriptionStatus: 'active',
            currentPeriodEnd: periodEnd,
          },
        });
        await resetUsageCounters(user.id);
        synced.subscription = true;
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
 * Unified payment history: Stripe invoices + charges + Alipay orders.
 */
router.get('/billing-history', requireAuth, async (req, res) => {
  type PaymentItem = {
    id: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
    date: string | null;
    method: 'stripe' | 'alipay';
    paymentType: 'subscription' | 'topup';
    invoiceUrl?: string | null;
    pdfUrl?: string | null;
    receiptUrl?: string | null;
    orderNo?: string;
  };

  try {
    const user = req.user!;
    const items: PaymentItem[] = [];

    // --- Stripe ---
    const stripe = getStripe();
    const customerId = user.stripeCustomerId as string | null;
    if (stripe && customerId) {
      const [invoices, charges] = await Promise.all([
        stripe.invoices.list({ customer: customerId, limit: 24 }),
        stripe.charges.list({ customer: customerId, limit: 24 }),
      ]);

      for (const inv of invoices.data) {
        items.push({
          id: inv.id,
          amount: inv.amount_paid / 100,
          currency: (inv.currency || 'usd').toUpperCase(),
          status: inv.status === 'paid' ? 'paid' : (inv.status || 'unknown'),
          description: inv.description || inv.lines?.data?.[0]?.description || 'Subscription',
          date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
          method: 'stripe',
          paymentType: 'subscription',
          invoiceUrl: inv.hosted_invoice_url,
          pdfUrl: inv.invoice_pdf,
        });
      }

      for (const ch of charges.data) {
        if ((ch as any).invoice) continue; // Skip — already covered by invoice above
        items.push({
          id: ch.id,
          amount: ch.amount / 100,
          currency: (ch.currency || 'usd').toUpperCase(),
          status: ch.status === 'succeeded' ? 'paid' : ch.status,
          description: ch.description || 'Top-up',
          date: new Date(ch.created * 1000).toISOString(),
          method: 'stripe',
          paymentType: 'topup',
          receiptUrl: ch.receipt_url,
        });
      }
    }

    // --- Alipay ---
    const alipayOrders = await prisma.alipayOrder.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });

    const TIER_LABELS: Record<string, string> = {
      starter: 'Starter 月度订阅',
      growth:  'Growth 月度订阅',
      business: 'Business 月度订阅',
      topup:   '支付宝充值',
    };

    const ALIPAY_STATUS_MAP: Record<string, string> = {
      completed: 'paid',
      pending:   'pending',
      closed:    'closed',
      failed:    'failed',
    };

    for (const order of alipayOrders) {
      items.push({
        id: order.outTradeNo,
        amount: order.amount,
        currency: 'CNY',
        status: ALIPAY_STATUS_MAP[order.status] ?? order.status,
        description: TIER_LABELS[order.tier] ?? order.tier,
        date: order.createdAt.toISOString(),
        method: 'alipay',
        paymentType: order.tier === 'topup' ? 'topup' : 'subscription',
        orderNo: order.outTradeNo,
      });
    }

    // Sort all items newest-first
    items.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());

    res.json({ success: true, data: { items } });
  } catch (error) {
    console.error('Billing history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch billing history' });
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

export default router;
