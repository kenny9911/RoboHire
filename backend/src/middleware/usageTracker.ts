import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../services/LoggerService.js';

/**
 * Records API usage to the database after the response finishes.
 * Must be placed AFTER attachRequestId and auth middleware.
 *
 * Only records when a user is attached (authenticated requests).
 */
export function trackUsage(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Intercept response finish to capture status code and usage
  res.on('finish', () => {
    if (!req.user) return;

    const durationMs = Date.now() - startTime;
    const requestId = req.requestId;

    // Pull accumulated token data from the LoggerService request context
    const ctx = requestId ? logger.getRequestContext(requestId) : null;

    const promptTokens = ctx?.promptTokens ?? 0;
    const completionTokens = ctx?.completionTokens ?? 0;
    const totalTokens = ctx?.totalTokens ?? 0;
    const cost = ctx?.totalCost ?? 0;
    const model = ctx?.lastModel ?? null;
    const provider = ctx?.lastProvider ?? null;

    // Set usage header for the client (already sent, but useful for streaming later)
    // We set it before finish via the response interceptor pattern when possible,
    // but X-Request-Id is already set by attachRequestId middleware.

    prisma.apiUsageRecord.create({
      data: {
        userId: req.user.id,
        apiKeyId: req.apiKeyId ?? null,
        requestId: requestId ?? null,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
        model,
        provider,
        durationMs,
      },
    }).catch((err) => {
      console.error('Failed to record API usage:', err);
    });
  });

  next();
}
