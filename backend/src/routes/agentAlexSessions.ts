import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { logger, generateRequestId } from '../services/LoggerService.js';

const router = Router();

/**
 * GET /api/v1/agent-alex/sessions
 * List user's sessions sorted by updatedAt desc
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const sessions = await prisma.agentAlexSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        messages: true,
        requirements: true,
        linkedJobId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 50,
    });
    res.json({ success: true, data: sessions });
  } catch (error) {
    logger.error('AGENT_ALEX', 'Failed to list sessions', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
});

/**
 * POST /api/v1/agent-alex/sessions
 * Create a new session
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { title, messages, requirements } = req.body;

    const session = await prisma.agentAlexSession.create({
      data: {
        userId,
        title: title || 'New Chat',
        messages: messages || [],
        requirements: requirements || {},
      },
    });

    res.status(201).json({ success: true, data: session });
  } catch (error) {
    logger.error('AGENT_ALEX', 'Failed to create session', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to create session' });
  }
});

/**
 * PATCH /api/v1/agent-alex/sessions/:id
 * Update session (messages, requirements, title, linkedJobId)
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await prisma.agentAlexSession.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const updateData: Record<string, unknown> = {};
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.messages !== undefined) updateData.messages = req.body.messages;
    if (req.body.requirements !== undefined) updateData.requirements = req.body.requirements;
    if (req.body.linkedJobId !== undefined) updateData.linkedJobId = req.body.linkedJobId || null;

    const session = await prisma.agentAlexSession.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: session });
  } catch (error) {
    logger.error('AGENT_ALEX', 'Failed to update session', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to update session' });
  }
});

/**
 * DELETE /api/v1/agent-alex/sessions/:id
 * Delete a session — blocked if it has a linked job that still exists
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await prisma.agentAlexSession.findFirst({
      where: { id, userId },
      include: { linkedJob: { select: { id: true, title: true, status: true } } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (existing.linkedJob) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete session linked to a job',
        linkedJob: { id: existing.linkedJob.id, title: existing.linkedJob.title },
      });
    }

    await prisma.agentAlexSession.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    logger.error('AGENT_ALEX', 'Failed to delete session', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to delete session' });
  }
});

export default router;
