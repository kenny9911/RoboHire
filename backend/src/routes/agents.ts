import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import '../types/auth.js';

const router = Router();

// ── List agents ──
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { status, limit = '20', page = '1' } = req.query;

    const where: any = { userId };
    if (status && typeof status === 'string') where.status = status;

    const take = Math.min(parseInt(limit as string) || 20, 100);
    const skip = (Math.max(parseInt(page as string) || 1, 1) - 1) * take;

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          job: { select: { id: true, title: true } },
          _count: { select: { candidates: true } },
        },
      }),
      prisma.agent.count({ where }),
    ]);

    res.json({
      data: agents,
      pagination: { total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error('Failed to list agents:', err);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// ── Get single agent ──
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        job: { select: { id: true, title: true } },
        _count: { select: { candidates: true } },
      },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({ data: agent });
  } catch (err) {
    console.error('Failed to get agent:', err);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// ── Create agent ──
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, description, jobId, config } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    // Validate jobId if provided
    if (jobId) {
      const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
      if (!job) return res.status(400).json({ error: 'Job not found' });
    }

    const agent = await prisma.agent.create({
      data: { userId, name, description, jobId: jobId || null, config: config || null },
      include: {
        job: { select: { id: true, title: true } },
        _count: { select: { candidates: true } },
      },
    });

    res.status(201).json({ data: agent });
  } catch (err) {
    console.error('Failed to create agent:', err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// ── Update agent ──
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { name, description, status, jobId, config } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (jobId !== undefined) data.jobId = jobId || null;
    if (config !== undefined) data.config = config;

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data,
      include: {
        job: { select: { id: true, title: true } },
        _count: { select: { candidates: true } },
      },
    });

    res.json({ data: updated });
  } catch (err) {
    console.error('Failed to update agent:', err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// ── Delete agent ──
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    await prisma.agent.delete({ where: { id: agent.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete agent:', err);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// ── List candidates for an agent ──
router.get('/:id/candidates', requireAuth, async (req, res) => {
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { status, limit = '50', page = '1' } = req.query;
    const where: any = { agentId: agent.id };
    if (status && typeof status === 'string') where.status = status;

    const take = Math.min(parseInt(limit as string) || 50, 200);
    const skip = (Math.max(parseInt(page as string) || 1, 1) - 1) * take;

    const [candidates, total] = await Promise.all([
      prisma.agentCandidate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          resume: { select: { id: true, name: true, currentRole: true, email: true } },
        },
      }),
      prisma.agentCandidate.count({ where }),
    ]);

    res.json({
      data: candidates,
      pagination: { total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error('Failed to list agent candidates:', err);
    res.status(500).json({ error: 'Failed to list candidates' });
  }
});

// ── Update candidate status (approve/reject) ──
router.patch('/:id/candidates/:candidateId', requireAuth, async (req, res) => {
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const candidate = await prisma.agentCandidate.findFirst({
      where: { id: req.params.candidateId, agentId: agent.id },
    });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const { status, notes } = req.body;
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes;

    // Update agent counters
    if (status && status !== candidate.status) {
      const inc: any = {};
      if (status === 'approved') inc.totalApproved = { increment: 1 };
      if (status === 'rejected') inc.totalRejected = { increment: 1 };
      if (status === 'contacted') inc.totalContacted = { increment: 1 };
      if (Object.keys(inc).length > 0) {
        await prisma.agent.update({ where: { id: agent.id }, data: inc });
      }
    }

    const updated = await prisma.agentCandidate.update({
      where: { id: candidate.id },
      data,
      include: {
        resume: { select: { id: true, name: true, currentRole: true, email: true } },
      },
    });

    res.json({ data: updated });
  } catch (err) {
    console.error('Failed to update candidate:', err);
    res.status(500).json({ error: 'Failed to update candidate' });
  }
});

// ── Agent stats summary ──
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const [pending, approved, rejected, contacted] = await Promise.all([
      prisma.agentCandidate.count({ where: { agentId: agent.id, status: 'pending' } }),
      prisma.agentCandidate.count({ where: { agentId: agent.id, status: 'approved' } }),
      prisma.agentCandidate.count({ where: { agentId: agent.id, status: 'rejected' } }),
      prisma.agentCandidate.count({ where: { agentId: agent.id, status: 'contacted' } }),
    ]);

    res.json({
      data: {
        totalSourced: agent.totalSourced,
        pending,
        approved,
        rejected,
        contacted,
      },
    });
  } catch (err) {
    console.error('Failed to get agent stats:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
