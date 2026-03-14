import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = Router();

/**
 * POST /api/v1/activity/track
 * Batch insert user activity events from the frontend.
 */
router.post('/track', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ success: false, error: 'events array required' });
    }

    // Cap batch size to prevent abuse
    const capped = events.slice(0, 100);

    await prisma.userActivity.createMany({
      data: capped.map((e: any) => ({
        userId,
        sessionId: String(e.sessionId || 'unknown'),
        eventType: String(e.eventType || 'click'),
        path: String(e.path || '/'),
        element: e.element ? String(e.element).slice(0, 200) : null,
        elementTag: e.elementTag ? String(e.elementTag).slice(0, 20) : null,
        metadata: e.metadata || null,
        timestamp: new Date(e.timestamp || Date.now()),
      })),
    });

    res.json({ success: true, tracked: capped.length });
  } catch (error) {
    console.error('Activity track error:', error);
    res.status(500).json({ success: false, error: 'Failed to track activity' });
  }
});

export default router;
