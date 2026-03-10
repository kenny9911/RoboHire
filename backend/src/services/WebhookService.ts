import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from './LoggerService.js';

const prisma = new PrismaClient();

// Retry delays in milliseconds: 1min, 5min, 30min, 2hr, 24hr
const RETRY_DELAYS = [60_000, 300_000, 1_800_000, 7_200_000, 86_400_000];

export interface WebhookPayload {
  webhookId: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver a webhook to a URL with HMAC-SHA256 signature.
 * Creates a WebhookDelivery record for tracking.
 */
export async function deliverWebhook(
  event: string,
  url: string,
  data: Record<string, unknown>,
  options?: {
    secret?: string;
    hiringRequestId?: string;
    integrationId?: string;
  },
): Promise<void> {
  const webhookId = crypto.randomUUID();
  const payload: WebhookPayload = {
    webhookId,
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const body = JSON.stringify(payload);

  // Create delivery record
  const delivery = await prisma.webhookDelivery.create({
    data: {
      event,
      url,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: 'pending',
      hiringRequestId: options?.hiringRequestId,
      integrationId: options?.integrationId,
    },
  });

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-RoboHire-Event': event,
      'X-RoboHire-Webhook-Id': webhookId,
    };

    if (options?.secret) {
      headers['X-RoboHire-Signature'] = signPayload(body, options.secret);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: res.ok ? 'delivered' : 'pending',
        statusCode: res.status,
        attempts: 1,
        lastAttemptAt: new Date(),
        response: await res.text().catch(() => '').then(t => t.substring(0, 1000)),
        nextRetryAt: res.ok ? null : new Date(Date.now() + RETRY_DELAYS[0]),
      },
    });

    if (res.ok) {
      logger.info('WEBHOOK', `Delivered ${event} to ${url}`, { webhookId, statusCode: res.status });
    } else {
      logger.warn('WEBHOOK', `Delivery failed ${event} to ${url} (${res.status}), will retry`, { webhookId });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'pending',
        attempts: 1,
        lastAttemptAt: new Date(),
        response: errorMsg.substring(0, 1000),
        nextRetryAt: new Date(Date.now() + RETRY_DELAYS[0]),
      },
    });
    logger.warn('WEBHOOK', `Delivery error ${event} to ${url}: ${errorMsg}`, { webhookId });
  }
}

/**
 * Process pending webhook retries.
 * Call this on a timer (e.g., every 60 seconds).
 */
export async function processWebhookRetries(): Promise<void> {
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      status: 'pending',
      nextRetryAt: { lte: new Date() },
      attempts: { lt: 5 },
    },
    take: 50,
    orderBy: { nextRetryAt: 'asc' },
  });

  for (const delivery of pending) {
    const body = JSON.stringify(delivery.payload);
    const attempt = delivery.attempts + 1;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-RoboHire-Event': delivery.event,
        'X-RoboHire-Webhook-Id': (delivery.payload as Record<string, unknown>).webhookId as string || delivery.id,
      };

      const res = await fetch(delivery.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      });

      const isFinalAttempt = attempt >= delivery.maxAttempts;
      const succeeded = res.ok;

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: succeeded ? 'delivered' : (isFinalAttempt ? 'failed' : 'pending'),
          statusCode: res.status,
          attempts: attempt,
          lastAttemptAt: new Date(),
          response: await res.text().catch(() => '').then(t => t.substring(0, 1000)),
          nextRetryAt: succeeded || isFinalAttempt ? null : new Date(Date.now() + (RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1])),
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isFinalAttempt = attempt >= delivery.maxAttempts;

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isFinalAttempt ? 'failed' : 'pending',
          attempts: attempt,
          lastAttemptAt: new Date(),
          response: errorMsg.substring(0, 1000),
          nextRetryAt: isFinalAttempt ? null : new Date(Date.now() + (RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1])),
        },
      });
    }
  }
}

/**
 * Fire webhook for a hiring request if it has a webhookUrl configured.
 */
export async function fireHiringRequestWebhook(
  hiringRequestId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  const hr = await prisma.hiringRequest.findUnique({
    where: { id: hiringRequestId },
    select: { webhookUrl: true },
  });

  if (!hr?.webhookUrl) return;

  await deliverWebhook(event, hr.webhookUrl, data, { hiringRequestId });
}

// Start retry processor (runs every 60 seconds)
let retryInterval: ReturnType<typeof setInterval> | null = null;

export function startWebhookRetryProcessor(): void {
  if (retryInterval) return;
  retryInterval = setInterval(() => {
    processWebhookRetries().catch((err) => {
      logger.error('WEBHOOK', 'Retry processor error', { error: String(err) });
    });
  }, 60_000);
}

export function stopWebhookRetryProcessor(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
}
