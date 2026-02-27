import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { logger } from '../services/LoggerService.js';
import { classifyApiRequest } from '../lib/requestClassification.js';

function getClientIp(req: Request): string | null {
  const xfwd = req.headers['x-forwarded-for'];
  if (typeof xfwd === 'string' && xfwd.length > 0) {
    return xfwd.split(',')[0]?.trim() || null;
  }
  return req.ip || null;
}

export function beginRequestLogging(req: Request, _res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  const requestId = req.requestId;
  if (requestId) {
    logger.startRequest(requestId, req.path, req.method);
  }

  next();
}

export function persistRequestAudit(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  const startedAt = Date.now();
  let finalized = false;

  const finalize = async (): Promise<void> => {
    if (finalized) return;
    finalized = true;

    const endedAt = Date.now();
    const requestId = req.requestId || null;
    const path = req.path;
    const classification = classifyApiRequest(path);
    const statusCode = res.statusCode || 200;

    if (requestId && logger.hasActiveRequestContext(requestId)) {
      logger.endRequest(requestId, statusCode >= 400 ? 'error' : 'success', statusCode);
    }

    const snapshot = requestId ? logger.getRequestSnapshot(requestId) : null;
    const durationMs = snapshot?.durationMs ?? endedAt - startedAt;
    const promptTokens = snapshot?.promptTokens ?? 0;
    const completionTokens = snapshot?.completionTokens ?? 0;
    const totalTokens = snapshot?.totalTokens ?? 0;
    const totalCost = snapshot?.totalCost ?? 0;
    const provider = snapshot?.lastProvider ?? null;
    const model = snapshot?.lastModel ?? null;
    const llmCalls = snapshot?.llmCalls ?? [];

    try {
      const requestLog = await prisma.apiRequestLog.create({
        data: {
          requestId,
          userId: req.user?.id ?? null,
          apiKeyId: req.apiKeyId ?? null,
          endpoint: path,
          method: req.method,
          module: classification.module,
          apiName: classification.apiName,
          statusCode,
          durationMs,
          promptTokens,
          completionTokens,
          totalTokens,
          llmCalls: llmCalls.length,
          cost: totalCost,
          provider,
          model,
          ipAddress: getClientIp(req),
          userAgent: req.get('user-agent') || null,
        },
      });

      if (llmCalls.length > 0) {
        await prisma.lLMCallLog.createMany({
          data: llmCalls.map((call) => ({
            requestId,
            apiRequestLogId: requestLog.id,
            userId: req.user?.id ?? null,
            endpoint: path,
            module: classification.module,
            provider: call.provider,
            model: call.model,
            promptTokens: call.promptTokens,
            completionTokens: call.completionTokens,
            totalTokens: call.totalTokens,
            cost: call.cost,
            durationMs: call.duration,
          })),
        });
      }
    } catch (error) {
      console.error('Failed to persist request audit log:', error);
    }
  };

  res.on('finish', () => {
    void finalize();
  });
  res.on('close', () => {
    void finalize();
  });

  next();
}
