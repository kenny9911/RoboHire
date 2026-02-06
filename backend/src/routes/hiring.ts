import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { llmService } from '../services/llm/LLMService.js';
import { languageService } from '../services/LanguageService.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { createJDAgent } from '../agents/CreateJDAgent.js';
// Import auth types to extend Express
import '../types/auth.js';

const router = Router();

/**
 * POST /api/v1/hiring-requests/title-suggestion
 * Generate a suggested position title using LLM
 */
router.post('/title-suggestion', optionalAuth, async (req, res) => {
  const requestId = generateRequestId();
  logger.startRequest(requestId, '/api/v1/hiring-requests/title-suggestion', 'POST');

  try {
    const { role, requirements, jobDescription, language } = req.body || {};
    const roleText = typeof role === 'string' ? role.trim() : '';
    const requirementsText = typeof requirements === 'string' ? requirements.trim() : '';
    const jobDescriptionText = typeof jobDescription === 'string' ? jobDescription.trim() : '';
    const preferredLocale = typeof language === 'string' ? language.trim() : '';

    if (!roleText && !requirementsText && !jobDescriptionText) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Role, requirements, or job description is required',
      });
    }

    const languageSource = jobDescriptionText || requirementsText || roleText;
    const preferredLanguage = preferredLocale
      ? languageService.getLanguageFromLocale(preferredLocale)
      : null;
    const detectedLanguage = languageService.detectLanguage(languageSource || '');
    const resolvedLanguage = preferredLanguage || detectedLanguage;
    const languageInstruction = preferredLanguage
      ? languageService.getLanguageInstructionForLanguage(preferredLanguage)
      : languageService.getLanguageInstruction(languageSource || '');

    logger.logLanguageDetection(requestId, resolvedLanguage, preferredLanguage ? 'user-selected' : 'auto');

    const systemPrompt = `${languageInstruction}

User selected language: ${resolvedLanguage}.

You are a senior recruiter. Generate a concise, professional job title for this hiring request.
Rules:
- Output ONLY the title.
- Keep it short (2-6 words or equivalent length), max 60 characters.
- Use professional wording appropriate to the role.
- No quotes, bullets, or extra commentary.`;

    const promptParts: string[] = [];
    if (roleText) promptParts.push(`Role: ${roleText}`);
    if (requirementsText) {
      promptParts.push(`Requirements:\n${requirementsText.slice(0, 3000)}`);
    }
    if (jobDescriptionText) {
      promptParts.push(`Job description:\n${jobDescriptionText.slice(0, 3000)}`);
    }

    const userPrompt = promptParts.join('\n\n');

    const response = await llmService.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.2, requestId }
    );

    let title = response.trim();
    title = title.split('\n').find((line) => line.trim().length > 0) || '';
    title = title.replace(/^[-*•\d.\s]+/, '').trim();
    title = title.replace(/^["'`]+|["'`]+$/g, '').trim();
    title = title || roleText || 'New Hiring Request';

    logger.info('HIRING_TITLE', 'Generated title suggestion', {
      titleLength: title.length,
      language: resolvedLanguage,
      usedRole: Boolean(roleText),
      requirementsLength: requirementsText.length,
      jobDescriptionLength: jobDescriptionText.length,
    }, requestId);

    logger.endRequest(requestId, 'success', 200);

    return res.json({
      success: true,
      data: { title },
    });
  } catch (error) {
    logger.error('HIRING_TITLE', 'Title suggestion failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate title suggestion',
    });
  }
});

/**
 * POST /api/v1/hiring-requests/jd-draft
 * Generate a JD draft using LLM
 */
router.post('/jd-draft', optionalAuth, async (req, res) => {
  const requestId = generateRequestId();
  logger.startRequest(requestId, '/api/v1/hiring-requests/jd-draft', 'POST');

  try {
    const { title, requirements, jobDescription, language } = req.body || {};
    const titleText = typeof title === 'string' ? title.trim() : '';
    const requirementsText = typeof requirements === 'string' ? requirements.trim() : '';
    const jobDescriptionText = typeof jobDescription === 'string' ? jobDescription.trim() : '';
    const preferredLocale = typeof language === 'string' ? language.trim() : '';

    if (!titleText && !requirementsText && !jobDescriptionText) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Title, requirements, or job description is required',
      });
    }

    const languageSource = jobDescriptionText || requirementsText || titleText;
    const preferredLanguage = preferredLocale
      ? languageService.getLanguageFromLocale(preferredLocale)
      : null;
    const detectedLanguage = languageService.detectLanguage(languageSource || '');
    const resolvedLanguage = preferredLanguage || detectedLanguage;
    logger.logLanguageDetection(requestId, resolvedLanguage, preferredLanguage ? 'user-selected' : 'auto');

    const jobDescriptionDraft = await createJDAgent.generate({
      title: titleText || undefined,
      requirements: requirementsText || undefined,
      jobDescription: jobDescriptionText || undefined,
      language: preferredLocale || undefined,
      requestId,
    });

    logger.info('HIRING_JD', 'Generated JD draft', {
      draftLength: jobDescriptionDraft.length,
      language: resolvedLanguage,
      usedTitle: Boolean(titleText),
      requirementsLength: requirementsText.length,
      jobDescriptionLength: jobDescriptionText.length,
    }, requestId);

    logger.endRequest(requestId, 'success', 200);

    return res.json({
      success: true,
      data: {
        jobDescriptionDraft: jobDescriptionDraft.trim(),
      },
    });
  } catch (error) {
    logger.error('HIRING_JD', 'JD draft generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate JD draft',
    });
  }
});

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
