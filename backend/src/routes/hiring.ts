import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
// Import auth types to extend Express
import '../types/auth.js';

const router = Router();

// All hiring routes require authentication
router.use(requireAuth);

/**
 * POST /api/v1/hiring-requests
 * Create a new hiring request
 */
router.post('/', async (req, res) => {
  try {
    const { title, requirements, jobDescription, webhookUrl } = req.body;
    const userId = req.user!.id;

    if (!title || !requirements) {
      return res.status(400).json({
        success: false,
        error: 'Title and requirements are required',
      });
    }

    const hiringRequest = await prisma.hiringRequest.create({
      data: {
        userId,
        title,
        requirements,
        jobDescription,
        webhookUrl,
      },
    });

    res.status(201).json({
      success: true,
      data: hiringRequest,
    });
  } catch (error) {
    console.error('Create hiring request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create hiring request',
    });
  }
});

/**
 * GET /api/v1/hiring-requests
 * List all hiring requests for the current user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { status, limit = 20, offset = 0 } = req.query;

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [hiringRequests, total] = await Promise.all([
      prisma.hiringRequest.findMany({
        where,
        include: {
          _count: {
            select: { candidates: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.hiringRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: hiringRequests,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    console.error('List hiring requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list hiring requests',
    });
  }
});

/**
 * GET /api/v1/hiring-requests/:id
 * Get a single hiring request with candidates
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const hiringRequest = await prisma.hiringRequest.findFirst({
      where: { id, userId },
      include: {
        candidates: {
          orderBy: { matchScore: 'desc' },
        },
      },
    });

    if (!hiringRequest) {
      return res.status(404).json({
        success: false,
        error: 'Hiring request not found',
      });
    }

    res.json({
      success: true,
      data: hiringRequest,
    });
  } catch (error) {
    console.error('Get hiring request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get hiring request',
    });
  }
});

/**
 * PATCH /api/v1/hiring-requests/:id
 * Update a hiring request
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { title, requirements, jobDescription, webhookUrl, status } = req.body;

    // Verify ownership
    const existing = await prisma.hiringRequest.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Hiring request not found',
      });
    }

    // Validate status if provided
    if (status && !['active', 'paused', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: active, paused, closed',
      });
    }

    const hiringRequest = await prisma.hiringRequest.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(requirements !== undefined && { requirements }),
        ...(jobDescription !== undefined && { jobDescription }),
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(status !== undefined && { status }),
      },
    });

    res.json({
      success: true,
      data: hiringRequest,
    });
  } catch (error) {
    console.error('Update hiring request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update hiring request',
    });
  }
});

/**
 * DELETE /api/v1/hiring-requests/:id
 * Delete a hiring request
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify ownership
    const existing = await prisma.hiringRequest.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Hiring request not found',
      });
    }

    await prisma.hiringRequest.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Hiring request deleted successfully',
    });
  } catch (error) {
    console.error('Delete hiring request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete hiring request',
    });
  }
});

/**
 * GET /api/v1/hiring-requests/:id/candidates
 * List candidates for a hiring request
 */
router.get('/:id/candidates', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { status, limit = 50, offset = 0 } = req.query;

    // Verify ownership
    const hiringRequest = await prisma.hiringRequest.findFirst({
      where: { id, userId },
    });

    if (!hiringRequest) {
      return res.status(404).json({
        success: false,
        error: 'Hiring request not found',
      });
    }

    const where: any = { hiringRequestId: id };
    if (status) {
      where.status = status;
    }

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        orderBy: { matchScore: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.candidate.count({ where }),
    ]);

    res.json({
      success: true,
      data: candidates,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    console.error('List candidates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list candidates',
    });
  }
});

/**
 * PATCH /api/v1/hiring-requests/:id/candidates/:candidateId
 * Update a candidate's status
 */
router.patch('/:id/candidates/:candidateId', async (req, res) => {
  try {
    const { id, candidateId } = req.params;
    const userId = req.user!.id;
    const { status } = req.body;

    // Verify ownership
    const hiringRequest = await prisma.hiringRequest.findFirst({
      where: { id, userId },
    });

    if (!hiringRequest) {
      return res.status(404).json({
        success: false,
        error: 'Hiring request not found',
      });
    }

    // Validate status
    if (!['pending', 'screening', 'interviewed', 'shortlisted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: pending, screening, interviewed, shortlisted, rejected',
      });
    }

    const candidate = await prisma.candidate.update({
      where: { id: candidateId },
      data: { status },
    });

    res.json({
      success: true,
      data: candidate,
    });
  } catch (error) {
    console.error('Update candidate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update candidate',
    });
  }
});

export default router;
