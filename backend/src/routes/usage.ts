import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All usage endpoints require authentication
router.use(requireAuth);

/**
 * GET /api/v1/usage
 * Paginated list of usage records for the authenticated user.
 * Query params: apiKeyId, endpoint, from, to, page, limit
 */
router.get('/', async (req: Request, res: Response) => {
  try {
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
    const userId = req.user!.id;
    const { from, to, apiKeyId } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = { userId };
    if (apiKeyId) where.apiKeyId = apiKeyId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const agg = await prisma.apiUsageRecord.aggregate({
      where,
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        cost: true,
      },
      _count: true,
    });

    // Daily breakdown for charting
    const records = await prisma.apiUsageRecord.findMany({
      where,
      select: {
        createdAt: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        cost: true,
        endpoint: true,
        apiKeyId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

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

    return res.json({
      success: true,
      data: {
        totals: {
          calls: agg._count,
          promptTokens: agg._sum.promptTokens ?? 0,
          completionTokens: agg._sum.completionTokens ?? 0,
          totalTokens: agg._sum.totalTokens ?? 0,
          cost: agg._sum.cost ?? 0,
        },
        daily: Array.from(dailyMap.values()),
        byEndpoint: Array.from(endpointMap.values()).sort((a, b) => b.calls - a.calls),
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
    const userId = req.user!.id;
    const { from, to } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = { userId };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const grouped = await prisma.apiUsageRecord.groupBy({
      by: ['apiKeyId'],
      where,
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        cost: true,
      },
      _count: true,
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
        calls: g._count,
        promptTokens: g._sum.promptTokens ?? 0,
        completionTokens: g._sum.completionTokens ?? 0,
        totalTokens: g._sum.totalTokens ?? 0,
        cost: g._sum.cost ?? 0,
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
