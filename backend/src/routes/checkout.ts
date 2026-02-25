import { Router } from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import '../types/auth.js';

const router = Router();

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

const PRICE_MAP: Record<string, string | undefined> = {
  'startup_monthly': process.env.STRIPE_STARTUP_MONTHLY_PRICE_ID,
  'startup_annual': process.env.STRIPE_STARTUP_ANNUAL_PRICE_ID,
  'business_monthly': process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
  'business_annual': process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
};

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

    const { tier, interval } = req.body;
    if (!tier || !['startup', 'business'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'Invalid tier' });
    }
    if (!interval || !['monthly', 'annual'].includes(interval)) {
      return res.status(400).json({ success: false, error: 'Invalid billing interval' });
    }

    const priceId = PRICE_MAP[`${tier}_${interval}`];
    if (!priceId) {
      return res.status(400).json({
        success: false,
        error: 'Price not configured for this plan. Please contact support.',
      });
    }

    const user = req.user!;

    let customerId = (user as any).stripeCustomerId as string | null;
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

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3607';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card', 'alipay'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/dashboard?welcome=1`,
      cancel_url: `${frontendUrl}/pricing`,
      client_reference_id: user.id,
      metadata: { tier, interval, userId: user.id },
    });

    res.json({ success: true, data: { url: session.url } });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create checkout session' });
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
        const userId = session.client_reference_id || session.metadata?.userId;
        const tier = session.metadata?.tier;
        if (userId && tier) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionTier: tier,
              subscriptionStatus: 'active',
              subscriptionId: (session.subscription as string) || null,
              stripeCustomerId: (session.customer as string) || undefined,
            },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: sub.status === 'active' ? 'active' : 'past_due',
              currentPeriodEnd: (sub as any).current_period_end
                ? new Date((sub as any).current_period_end * 1000)
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
            },
          });
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
