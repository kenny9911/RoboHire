import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All usage endpoints require authentication
router.use(requireAuth);

type UsageFilters = {
  userId: string;
  apiKeyId?: string;
  endpoint?: string;
  from?: string;
  to?: string;
};

function buildRequestLogWhere(filters: UsageFilters): Record<string, unknown> {
  const { userId, apiKeyId, endpoint, from, to } = filters;
  const where: Record<string, unknown> = {
    userId,
    // Keep usage analytics aligned with "real API calls" that have captured payloads.
    requestPayload: { not: null },
  };
  if (apiKeyId) where.apiKeyId = apiKeyId;
  if (endpoint) where.endpoint = { contains: endpoint };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  return where;
}

function canViewCost(req: Request): boolean {
  return req.user?.role === 'admin';
}

/**
 * GET /api/v1/usage/calls
 * Paginated list of individual API calls (with payloads) for the authenticated user.
 * Query params: endpoint, from, to, page, limit
 */
router.get('/calls', async (req: Request, res: Response) => {
  try {
    const showCost = canViewCost(req);
    const userId = req.user!.id;
    const { endpoint, from, to, page = '1', limit = '20' } = req.query as Record<string, string | undefined>;

    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where = buildRequestLogWhere({ userId, endpoint, from, to });

    const [records, total] = await Promise.all([
      prisma.apiRequestLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          requestId: true,
          endpoint: true,
          method: true,
          module: true,
          apiName: true,
          statusCode: true,
          durationMs: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          llmCalls: true,
          ...(showCost ? { cost: true } : {}),
          provider: true,
          model: true,
          createdAt: true,
        },
      }),
      prisma.apiRequestLog.count({ where }),
    ]);

    return res.json({
      success: true,
      data: records,
      pagination: {
        page: Math.floor(skip / take) + 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch call history',
    });
  }
});

/**
 * GET /api/v1/usage/calls/:id
 * Full detail of a single API call including request/response payloads.
 */
router.get('/calls/:id', async (req: Request, res: Response) => {
  try {
    const showCost = canViewCost(req);
    const userId = req.user!.id;
    const { id } = req.params;

    const record = await prisma.apiRequestLog.findFirst({
      where: { id, userId },
      include: {
        llmCallLog: {
          orderBy: { createdAt: 'asc' },
        },
        apiKey: {
          select: { id: true, name: true, prefix: true },
        },
      },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Call not found',
      });
    }

    if (!showCost) {
      const { cost: _recordCost, llmCallLog, ...restRecord } = record;
      return res.json({
        success: true,
        data: {
          ...restRecord,
          llmCallLog: llmCallLog.map(({ cost: _llmCost, ...restLlm }) => restLlm),
        },
      });
    }

    return res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch call detail',
    });
  }
});

/**
 * GET /api/v1/usage
 * Paginated list of usage records for the authenticated user.
 * Query params: apiKeyId, endpoint, from, to, page, limit
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const showCost = canViewCost(req);
    const userId = req.user!.id;
    const {
      apiKeyId,
      endpoint,
      from,
      to,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string | undefined>;

    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where: Record<string, unknown> = { userId };
    if (apiKeyId) where.apiKeyId = apiKeyId;
    if (endpoint) where.endpoint = { contains: endpoint };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [records, total] = await Promise.all([
      prisma.apiUsageRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          apiKey: { select: { id: true, name: true, prefix: true } },
        },
      }),
      prisma.apiUsageRecord.count({ where }),
    ]);

    return res.json({
      success: true,
      data: showCost
        ? records
        : records.map(({ cost: _cost, ...rest }) => rest),
      pagination: {
        page: Math.floor(skip / take) + 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch usage',
    });
  }
});

/**
 * GET /api/v1/usage/summary
 * Aggregated usage summary for the authenticated user.
 * Query params: from, to, apiKeyId
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const showCost = canViewCost(req);
    const userId = req.user!.id;
    const { from, to, apiKeyId } = req.query as Record<string, string | undefined>;

    const where = buildRequestLogWhere({ userId, apiKeyId, from, to });

    const [agg, totalCalls, records] = await Promise.all([
      prisma.apiRequestLog.aggregate({
        where,
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          cost: true,
        },
      }),
      prisma.apiRequestLog.count({ where }),
      prisma.apiRequestLog.findMany({
        where,
        select: {
          createdAt: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          cost: true,
          endpoint: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Group by day
    const dailyMap = new Map<string, {
      date: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost: number;
    }>();
    for (const r of records) {
      const day = r.createdAt.toISOString().split('T')[0];
      const entry = dailyMap.get(day) ?? {
        date: day,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
      };
      entry.calls++;
      entry.promptTokens += r.promptTokens;
      entry.completionTokens += r.completionTokens;
      entry.totalTokens += r.totalTokens;
      entry.cost += r.cost;
      dailyMap.set(day, entry);
    }

    // Group by endpoint
    const endpointMap = new Map<string, { endpoint: string; calls: number; totalTokens: number; cost: number }>();
    for (const r of records) {
      const entry = endpointMap.get(r.endpoint) ?? { endpoint: r.endpoint, calls: 0, totalTokens: 0, cost: 0 };
      entry.calls++;
      entry.totalTokens += r.totalTokens;
      entry.cost += r.cost;
      endpointMap.set(r.endpoint, entry);
    }

    const daily = Array.from(dailyMap.values());
    const byEndpoint = Array.from(endpointMap.values()).sort((a, b) => b.calls - a.calls);

    return res.json({
      success: true,
      data: {
        totals: {
          calls: totalCalls,
          promptTokens: agg._sum.promptTokens ?? 0,
          completionTokens: agg._sum.completionTokens ?? 0,
          totalTokens: agg._sum.totalTokens ?? 0,
          ...(showCost ? { cost: agg._sum.cost ?? 0 } : {}),
        },
        daily: showCost ? daily : daily.map(({ cost: _cost, ...rest }) => rest),
        byEndpoint: showCost ? byEndpoint : byEndpoint.map(({ cost: _cost, ...rest }) => rest),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch summary',
    });
  }
});

/**
 * GET /api/v1/usage/by-key
 * Per-API-key usage breakdown for the authenticated user.
 * Query params: from, to
 */
router.get('/by-key', async (req: Request, res: Response) => {
  try {
    const showCost = canViewCost(req);
    const userId = req.user!.id;
    const { from, to } = req.query as Record<string, string | undefined>;

    const where = buildRequestLogWhere({ userId, from, to });

    const grouped = await prisma.apiRequestLog.groupBy({
      by: ['apiKeyId'],
      where,
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        cost: true,
      },
      _count: {
        _all: true,
      },
    });

    // Fetch key names
    const keyIds = grouped.map((g) => g.apiKeyId).filter(Boolean) as string[];
    const keys = keyIds.length
      ? await prisma.apiKey.findMany({
          where: { id: { in: keyIds } },
          select: { id: true, name: true, prefix: true, isActive: true, lastUsedAt: true },
        })
      : [];
    const keyMap = new Map(keys.map((k) => [k.id, k]));

    const data = grouped.map((g) => {
      const key = g.apiKeyId ? keyMap.get(g.apiKeyId) : null;
      return {
        apiKeyId: g.apiKeyId,
        keyName: key?.name ?? (g.apiKeyId ? 'Deleted Key' : 'Session (Web App)'),
        keyPrefix: key?.prefix ?? null,
        isActive: key?.isActive ?? null,
        lastUsedAt: key?.lastUsedAt ?? null,
        calls: g._count._all,
        promptTokens: g._sum.promptTokens ?? 0,
        completionTokens: g._sum.completionTokens ?? 0,
        totalTokens: g._sum.totalTokens ?? 0,
        ...(showCost ? { cost: g._sum.cost ?? 0 } : {}),
      };
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch by-key usage',
    });
  }
});

export default router;
