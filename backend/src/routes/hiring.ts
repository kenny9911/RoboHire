import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { checkBatchUsage } from '../middleware/usageMeter.js';
import { llmService } from '../services/llm/LLMService.js';
import { languageService } from '../services/LanguageService.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { createJDAgent } from '../agents/CreateJDAgent.js';
import { screeningAgent } from '../agents/ScreeningAgent.js';
import { inviteAgent } from '../agents/InviteAgent.js';
import { recruitmentIntelligenceService } from '../services/RecruitmentIntelligenceService.js';
import { DocumentParsingService } from '../services/DocumentParsingService.js';
import { fireHiringRequestWebhook } from '../services/WebhookService.js';
// Import auth types to extend Express
import '../types/auth.js';

const router = Router();

/**
 * POST /api/v1/hiring-requests/title-suggestion
 * Generate a suggested position title using LLM
 */
router.post('/title-suggestion', optionalAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
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
 * POST /api/v1/hiring-requests/generate-brief
 * Generate a realistic, varied hiring brief for a given role using LLM
 */
router.post('/generate-brief', optionalAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  logger.startRequest(requestId, '/api/v1/hiring-requests/generate-brief', 'POST');

  try {
    const { role, language } = req.body || {};
    const roleText = typeof role === 'string' ? role.trim() : '';
    const preferredLocale = typeof language === 'string' ? language.trim() : '';

    if (!roleText) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({ success: false, error: 'Role is required' });
    }

    const preferredLanguage = preferredLocale
      ? languageService.getLanguageFromLocale(preferredLocale)
      : null;
    const resolvedLanguage = preferredLanguage || 'English';
    const languageInstruction = preferredLanguage
      ? languageService.getLanguageInstructionForLanguage(preferredLanguage)
      : '';

    const systemPrompt = `${languageInstruction}
User selected language: ${resolvedLanguage}.

You are a hiring manager writing a realistic hiring request to a recruitment consultant.
Generate a concrete, specific hiring brief for the role "${roleText}".

Rules:
- Write in first person as the hiring manager (e.g. "I'm looking for..." / "我们需要招聘...")
- Include ALL of these details with specific, realistic values (not generic):
  * Industry/company context (e.g. fintech startup, enterprise SaaS, autonomous driving, semiconductor)
  * Specific sub-specialty or focus area (e.g. backend, full-stack, NLP, computer vision, analog IC)
  * Employment type (full-time, contract, part-time)
  * Work location & remote policy (e.g. "San Francisco, hybrid 3 days/week" or "北京海淀，可弹性办公")
  * Team size and reporting line
  * Salary/compensation range (use realistic numbers for the role and market)
  * 3-5 must-have skills/qualifications
  * 2-3 nice-to-have skills
  * Key responsibilities (2-3 sentences)
  * Urgency or timeline (e.g. "need to fill within 6 weeks")
- Vary the details each time — different industries, locations, salary ranges, company stages
- Keep it 150-250 words, natural and conversational
- Do NOT use bullet points or structured format — write it as a natural paragraph or two
- End by asking the consultant to help refine requirements and create a job posting

Output ONLY the hiring brief text. No titles, headers, or meta-commentary.`;
    const briefModel = (process.env.LLM_FAST || '').trim() || llmService.getModel();

    const response = await llmService.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a hiring brief for: ${roleText}` },
      ],
      { temperature: 0.9, requestId, model: briefModel }
    );

    const brief = response.trim();

    logger.info('HIRING_BRIEF', 'Generated hiring brief', {
      role: roleText,
      briefLength: brief.length,
      language: resolvedLanguage,
      model: briefModel,
    }, requestId);
    logger.endRequest(requestId, 'success', 200);

    return res.json({ success: true, data: { brief } });
  } catch (error) {
    logger.error('HIRING_BRIEF', 'Brief generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({ success: false, error: 'Failed to generate brief' });
  }
});
/**
 * POST /api/v1/hiring-requests/jd-draft
 * Generate a JD draft using LLM
 */
router.post('/jd-draft', optionalAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
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
        requirements: DocumentParsingService.cleanTextContent(requirements),
        jobDescription: jobDescription ? DocumentParsingService.cleanTextContent(jobDescription) : undefined,
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
    const { status, title, limit, offset = 0 } = req.query;
    const pageSize = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));
    const pageOffset = Math.max(0, parseInt(offset as string, 10) || 0);

    const where: any = { userId };
    if (status) {
      where.status = status;
    }
    if (title && typeof title === 'string') {
      where.title = title;
    }

    const [hiringRequests, total] = await Promise.all([
      prisma.hiringRequest.findMany({
        where,
        include: {
          _count: {
            select: { candidates: true, resumeJobFits: true, interviews: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: pageOffset,
      }),
      prisma.hiringRequest.count({ where }),
    ]);

    // Trim heavy fields not needed in list view
    const trimmed = hiringRequests.map(({ jobDescription, intelligenceData, webhookUrl, ...rest }) => rest);

    res.json({
      success: true,
      data: trimmed,
      pagination: {
        total,
        limit: pageSize,
        offset: pageOffset,
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
 * GET /api/v1/hiring-requests/stats
 * Aggregated hiring statistics for the current user (DB-backed).
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user!.id;

    const [
      totalRequests,
      requestStatusGroups,
      totalCandidates,
      candidateStatusGroups,
      avgMatchScoreAgg,
      totalMatches,
      recentRequests,
    ] = await Promise.all([
      prisma.hiringRequest.count({
        where: { userId },
      }),
      prisma.hiringRequest.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      prisma.candidate.count({
        where: {
          hiringRequest: { userId },
        },
      }),
      prisma.candidate.groupBy({
        by: ['status'],
        where: {
          hiringRequest: { userId },
        },
        _count: { _all: true },
      }),
      prisma.candidate.aggregate({
        where: {
          hiringRequest: { userId },
          matchScore: { not: null },
        },
        _avg: { matchScore: true },
      }),
      prisma.resumeJobFit.count({
        where: {
          hiringRequest: { userId },
        },
      }),
      prisma.hiringRequest.findMany({
        where: { userId },
        include: {
          _count: {
            select: { candidates: true, resumeJobFits: true, interviews: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const requestStatusCounts = requestStatusGroups.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      { active: 0, paused: 0, closed: 0 } as Record<string, number>
    );

    const candidateStatusCounts = candidateStatusGroups.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>
    );

    const avgMatchScoreRaw = avgMatchScoreAgg._avg.matchScore;
    const avgMatchScore = avgMatchScoreRaw === null
      ? null
      : Math.round(avgMatchScoreRaw * 10) / 10;

    return res.json({
      success: true,
      data: {
        totalRequests,
        activeRequests: requestStatusCounts.active || 0,
        pausedRequests: requestStatusCounts.paused || 0,
        closedRequests: requestStatusCounts.closed || 0,
        totalCandidates,
        totalMatches,
        invitationsSent: candidateStatusCounts.screening || 0,
        interviewsCompleted: candidateStatusCounts.interviewed || 0,
        avgMatchScore,
        candidateStatusCounts,
        recentRequests,
      },
    });
  } catch (error) {
    console.error('Hiring stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch hiring stats',
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
        _count: {
          select: {
            resumeJobFits: true,
            interviews: { where: { status: 'completed' } },
          },
        },
      },
    });

    // Compute accurate stats from resumeJobFits
    let invitedCount = 0;
    if (hiringRequest) {
      invitedCount = await prisma.resumeJobFit.count({
        where: { hiringRequestId: id, pipelineStatus: 'invited' },
      });
    }

    if (!hiringRequest) {
      return res.status(404).json({
        success: false,
        error: 'Hiring request not found',
      });
    }

    res.json({
      success: true,
      data: {
        ...hiringRequest,
        stats: {
          matches: hiringRequest!._count.resumeJobFits,
          invited: invitedCount,
          interviewsCompleted: hiringRequest!._count.interviews,
        },
      },
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
    const { title, clientName, requirements, jobDescription, webhookUrl, status } = req.body;

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

    // Invalidate intelligence cache when requirements or JD change
    const invalidateIntelligence = requirements !== undefined || jobDescription !== undefined;

    const hiringRequest = await prisma.hiringRequest.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(clientName !== undefined && { clientName: clientName || null }),
        ...(requirements !== undefined && { requirements }),
        ...(jobDescription !== undefined && { jobDescription }),
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(status !== undefined && { status }),
        ...(invalidateIntelligence && { intelligenceData: Prisma.DbNull, intelligenceUpdatedAt: null }),
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

/**
 * GET /api/v1/hiring-requests/:id/resume-fits
 * Fetch all ResumeJobFit records for a hiring request with resume metadata
 */
router.get('/:id/resume-fits', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { sort = 'fitScore', order = 'desc', pipelineStatus, minScore, search } = req.query;

    // Verify ownership
    const hiringRequest = await prisma.hiringRequest.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!hiringRequest) {
      return res.status(404).json({ success: false, error: 'Hiring request not found' });
    }

    const where: any = { hiringRequestId: id };

    if (pipelineStatus) {
      const statuses = String(pipelineStatus).split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where.pipelineStatus = statuses[0];
      } else if (statuses.length > 1) {
        where.pipelineStatus = { in: statuses };
      }
    }

    if (minScore) {
      where.fitScore = { gte: Number(minScore) };
    }

    if (search) {
      where.resume = {
        OR: [
          { name: { contains: String(search), mode: 'insensitive' } },
          { currentRole: { contains: String(search), mode: 'insensitive' } },
        ],
      };
    }

    const orderBy: any = {};
    const sortField = String(sort);
    if (['fitScore', 'createdAt', 'updatedAt'].includes(sortField)) {
      orderBy[sortField] = order === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.fitScore = 'desc';
    }

    const fits = await prisma.resumeJobFit.findMany({
      where,
      orderBy,
      include: {
        resume: {
          select: {
            id: true,
            name: true,
            email: true,
            currentRole: true,
            experienceYears: true,
            tags: true,
          },
        },
      },
    });

    return res.json({ success: true, data: fits });
  } catch (error) {
    console.error('Fetch resume fits error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch resume fits' });
  }
});

/**
 * POST /api/v1/hiring-requests/:id/auto-match
 * Screen all user's resumes against this hiring request using ScreeningAgent.
 * Uses Server-Sent Events (SSE) to stream real-time progress to the frontend.
 */
router.post('/:id/auto-match', async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  const matchStartTime = Date.now();
  logger.startRequest(requestId, `/api/v1/hiring-requests/${req.params.id}/auto-match`, 'POST');

  // Helper to send SSE events
  const sendSSE = (event: string, data: any) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { force = false, resumeIds } = req.body || {};

    // Fetch hiring request with ownership check
    const hiringRequest = await prisma.hiringRequest.findFirst({
      where: { id, userId },
      select: { id: true, title: true, requirements: true, jobDescription: true, status: true },
    });

    if (!hiringRequest) {
      logger.endRequest(requestId, 'error', 404);
      return res.status(404).json({ success: false, error: 'Hiring request not found' });
    }

    logger.info('AUTO_MATCH', `Starting auto-match for "${hiringRequest.title}"`, {
      hiringRequestId: id,
      force,
      resumeIdsProvided: Array.isArray(resumeIds) ? resumeIds.length : 0,
    }, requestId);

    // Fetch user's active resumes (or subset)
    const resumeWhere: any = { userId, status: 'active' };
    if (Array.isArray(resumeIds) && resumeIds.length > 0) {
      resumeWhere.id = { in: resumeIds };
    }

    const resumes = await prisma.resume.findMany({
      where: resumeWhere,
      select: {
        id: true,
        name: true,
        resumeText: true,
        parsedData: true,
        currentRole: true,
        experienceYears: true,
      },
    });

    logger.info('AUTO_MATCH', `Found ${resumes.length} resumes in library`, {
      hiringRequestId: id,
      resumeCount: resumes.length,
    }, requestId);

    if (resumes.length === 0) {
      logger.endRequest(requestId, 'success', 200);
      return res.json({
        success: true,
        data: { total: 0, matched: 0, skipped: 0, failed: 0, results: [] },
      });
    }

    // Check existing fits to skip already-matched resumes
    let existingFitResumeIds = new Set<string>();
    if (!force) {
      const existingFits = await prisma.resumeJobFit.findMany({
        where: { hiringRequestId: id, resumeId: { in: resumes.map(r => r.id) } },
        select: { resumeId: true },
      });
      existingFitResumeIds = new Set(existingFits.map(f => f.resumeId));
    }

    const resumesToScreen = resumes.filter(r => !existingFitResumeIds.has(r.id));
    const skipped = resumes.length - resumesToScreen.length;

    logger.info('AUTO_MATCH', `Screening plan: ${resumesToScreen.length} to screen, ${skipped} skipped (already matched)`, {
      hiringRequestId: id,
      toScreen: resumesToScreen.length,
      skipped,
      force,
    }, requestId);

    if (resumesToScreen.length === 0) {
      logger.endRequest(requestId, 'success', 200);
      return res.json({
        success: true,
        data: {
          total: resumes.length,
          matched: 0,
          skipped,
          failed: 0,
          results: [],
        },
      });
    }

    // Check and deduct usage for the batch
    const usageDeductStart = Date.now();
    const usageCheck = await checkBatchUsage(userId, 'match', resumesToScreen.length);
    const usageDeductTime = Date.now() - usageDeductStart;

    if (!usageCheck.ok) {
      logger.error('AUTO_MATCH', `Usage check failed: ${usageCheck.error}`, {
        hiringRequestId: id,
        requestedCount: resumesToScreen.length,
        code: usageCheck.code,
        usageCheckDuration: `${usageDeductTime}ms`,
      }, requestId);
      logger.endRequest(requestId, 'error', 402);
      return res.status(402).json({ success: false, error: usageCheck.error, code: usageCheck.code, details: usageCheck.details });
    }

    logger.info('AUTO_MATCH', `Usage deducted: ${resumesToScreen.length} match credits`, {
      hiringRequestId: id,
      creditsDeducted: resumesToScreen.length,
      usageCheckDuration: `${usageDeductTime}ms`,
    }, requestId);

    // --- Switch to SSE mode ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial progress event
    sendSSE('progress', {
      phase: 'started',
      jobTitle: hiringRequest.title,
      total: resumesToScreen.length,
      completed: 0,
      failed: 0,
      skipped,
      currentCandidates: [],
    });

    // Build condensed parsed summaries for each resume
    const screeningResumes = resumesToScreen.map(r => {
      const parsed = r.parsedData as Record<string, any> | null;
      const summaryParts: string[] = [];
      if (r.currentRole) summaryParts.push(`**Current Role:** ${r.currentRole}`);
      if (r.experienceYears) summaryParts.push(`**Experience:** ${r.experienceYears}`);
      if (parsed) {
        if (parsed.summary) summaryParts.push(`**Summary:** ${String(parsed.summary).substring(0, 500)}`);
        if (parsed.skills) {
          const skills = parsed.skills as Record<string, unknown>;
          const allSkills: string[] = [];
          for (const category of ['technical', 'soft', 'tools', 'frameworks', 'languages', 'other']) {
            if (Array.isArray(skills[category])) {
              allSkills.push(...(skills[category] as string[]));
            }
          }
          if (Array.isArray(parsed.skills)) allSkills.push(...(parsed.skills as string[]));
          if (allSkills.length > 0) summaryParts.push(`**Skills:** ${allSkills.join(', ')}`);
        }
        if (Array.isArray(parsed.experience)) {
          summaryParts.push('**Experience:**');
          for (const exp of parsed.experience.slice(0, 5)) {
            const e = exp as Record<string, any>;
            const typeTag = e.employmentType ? ` [${e.employmentType}]` : '';
            summaryParts.push(`- ${e.role || 'Role'} at ${e.company || 'Company'} (${e.startDate || '?'} — ${e.endDate || '?'})${typeTag}`);
          }
        }
        if (Array.isArray(parsed.education)) {
          for (const edu of parsed.education.slice(0, 3)) {
            const e = edu as Record<string, any>;
            summaryParts.push(`- ${e.degree || ''} ${e.field || ''} at ${e.institution || ''}`);
          }
        }
      }
      return {
        resumeId: r.id,
        name: r.name,
        resumeText: r.resumeText,
        parsedSummary: summaryParts.join('\n'),
      };
    });

    // Batch resumes in groups of 5 for LLM efficiency
    const BATCH_SIZE = 5;
    const batches: typeof screeningResumes[] = [];
    for (let i = 0; i < screeningResumes.length; i += BATCH_SIZE) {
      batches.push(screeningResumes.slice(i, i + BATCH_SIZE));
    }

    const allResults: Array<{
      resumeId: string;
      resumeName: string;
      fitScore: number | null;
      fitGrade: string | null;
      verdict: string | null;
      cached: boolean;
      error?: string;
    }> = [];
    let matchedCount = 0;
    let failedCount = 0;

    const hrInput = {
      id: hiringRequest.id,
      title: hiringRequest.title,
      requirements: hiringRequest.requirements,
      jobDescription: hiringRequest.jobDescription || undefined,
    };

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const batchStartTime = Date.now();
      const batchNames = batch.map(r => r.name);

      logger.info('AUTO_MATCH', `Batch ${batchIdx + 1}/${batches.length}: screening ${batch.length} candidates`, {
        hiringRequestId: id,
        batchIndex: batchIdx + 1,
        totalBatches: batches.length,
        candidates: batchNames,
      }, requestId);

      // Send progress: which candidates are being matched now
      sendSSE('progress', {
        phase: 'matching',
        jobTitle: hiringRequest.title,
        total: resumesToScreen.length,
        completed: matchedCount,
        failed: failedCount,
        skipped,
        batchIndex: batchIdx + 1,
        totalBatches: batches.length,
        currentCandidates: batchNames,
      });

      try {
        const result = await screeningAgent.screen(hrInput, batch, requestId);
        const batchDuration = Date.now() - batchStartTime;

        // Collect token/cost info from logger context
        const usageSnapshot = logger.getRequestContext(requestId);

        logger.info('AUTO_MATCH', `Batch ${batchIdx + 1}/${batches.length} LLM completed`, {
          hiringRequestId: id,
          batchIndex: batchIdx + 1,
          batchDuration: `${batchDuration}ms`,
          screeningsReturned: result.screenings.length,
          batchCandidates: batchNames,
          cumulativeTokens: usageSnapshot?.totalTokens ?? 0,
          cumulativeCost: usageSnapshot ? `$${usageSnapshot.totalCost.toFixed(6)}` : '$0',
        }, requestId);

        // Upsert ResumeJobFit records for each screening result
        for (const screening of result.screenings) {
          try {
            await prisma.resumeJobFit.upsert({
              where: {
                resumeId_hiringRequestId: {
                  resumeId: screening.resumeId,
                  hiringRequestId: id,
                },
              },
              create: {
                resumeId: screening.resumeId,
                hiringRequestId: id,
                fitScore: screening.fitScore,
                fitGrade: screening.fitGrade,
                fitData: {
                  verdict: screening.verdict,
                  matchedSkills: screening.matchedSkills,
                  missingCriticalSkills: screening.missingCriticalSkills,
                  experienceAlignment: screening.experienceAlignment,
                  topReasons: screening.topReasons,
                  recommendation: screening.recommendation,
                  hardRequirementGaps: screening.hardRequirementGaps || [],
                  transferableSkills: screening.transferableSkills || [],
                },
                pipelineStatus: 'matched',
              },
              update: {
                fitScore: screening.fitScore,
                fitGrade: screening.fitGrade,
                fitData: {
                  verdict: screening.verdict,
                  matchedSkills: screening.matchedSkills,
                  missingCriticalSkills: screening.missingCriticalSkills,
                  experienceAlignment: screening.experienceAlignment,
                  topReasons: screening.topReasons,
                  recommendation: screening.recommendation,
                  hardRequirementGaps: screening.hardRequirementGaps || [],
                  transferableSkills: screening.transferableSkills || [],
                },
                pipelineStatus: 'matched',
              },
            });

            const resumeName = batch.find(r => r.resumeId === screening.resumeId)?.name || '';
            allResults.push({
              resumeId: screening.resumeId,
              resumeName,
              fitScore: screening.fitScore,
              fitGrade: screening.fitGrade,
              verdict: screening.verdict,
              cached: false,
            });
            matchedCount++;

            logger.info('AUTO_MATCH', `Matched: ${resumeName} → score=${screening.fitScore}, grade=${screening.fitGrade}, verdict=${screening.verdict}`, {
              hiringRequestId: id,
              resumeId: screening.resumeId,
              resumeName,
              fitScore: screening.fitScore,
              fitGrade: screening.fitGrade,
              verdict: screening.verdict,
            }, requestId);
          } catch (dbError) {
            const resumeName = batch.find(r => r.resumeId === screening.resumeId)?.name || '';
            allResults.push({
              resumeId: screening.resumeId,
              resumeName,
              fitScore: null,
              fitGrade: null,
              verdict: null,
              cached: false,
              error: 'Failed to save result',
            });
            failedCount++;
            logger.error('AUTO_MATCH', `DB upsert failed for ${resumeName}`, {
              resumeId: screening.resumeId,
              error: dbError instanceof Error ? dbError.message : String(dbError),
            }, requestId);
          }
        }

        // Handle resumes that weren't in the LLM response
        for (const resume of batch) {
          const found = result.screenings.some(s => s.resumeId === resume.resumeId);
          if (!found) {
            allResults.push({
              resumeId: resume.resumeId,
              resumeName: resume.name,
              fitScore: null,
              fitGrade: null,
              verdict: null,
              cached: false,
              error: 'Not included in screening result',
            });
            failedCount++;
            logger.warn('AUTO_MATCH', `Resume "${resume.name}" not included in LLM response`, {
              resumeId: resume.resumeId,
            }, requestId);
          }
        }

        // Send batch-complete event with per-candidate results
        sendSSE('progress', {
          phase: 'batch_complete',
          jobTitle: hiringRequest.title,
          total: resumesToScreen.length,
          completed: matchedCount,
          failed: failedCount,
          skipped,
          batchIndex: batchIdx + 1,
          totalBatches: batches.length,
          batchDuration,
          batchResults: result.screenings.map(s => ({
            resumeName: batch.find(r => r.resumeId === s.resumeId)?.name || '',
            fitScore: s.fitScore,
            fitGrade: s.fitGrade,
            verdict: s.verdict,
          })),
          currentCandidates: [],
        });
      } catch (batchError) {
        const batchDuration = Date.now() - batchStartTime;
        // Entire batch failed
        for (const resume of batch) {
          allResults.push({
            resumeId: resume.resumeId,
            resumeName: resume.name,
            fitScore: null,
            fitGrade: null,
            verdict: null,
            cached: false,
            error: batchError instanceof Error ? batchError.message : 'Batch screening failed',
          });
          failedCount++;
        }
        logger.error('AUTO_MATCH', `Batch ${batchIdx + 1}/${batches.length} failed entirely`, {
          hiringRequestId: id,
          batchDuration: `${batchDuration}ms`,
          candidates: batchNames,
          error: batchError instanceof Error ? batchError.message : String(batchError),
        }, requestId);

        sendSSE('progress', {
          phase: 'batch_error',
          jobTitle: hiringRequest.title,
          total: resumesToScreen.length,
          completed: matchedCount,
          failed: failedCount,
          skipped,
          batchIndex: batchIdx + 1,
          totalBatches: batches.length,
          batchDuration,
          errorCandidates: batchNames,
          currentCandidates: [],
        });
      }
    }

    const totalDuration = Date.now() - matchStartTime;
    const finalUsage = logger.getRequestContext(requestId);

    logger.info('AUTO_MATCH', 'Auto-match completed', {
      hiringRequestId: id,
      jobTitle: hiringRequest.title,
      total: resumes.length,
      matched: matchedCount,
      skipped,
      failed: failedCount,
      totalDuration: `${totalDuration}ms`,
      totalTokens: finalUsage?.totalTokens ?? 0,
      totalCost: finalUsage ? `$${finalUsage.totalCost.toFixed(6)}` : '$0',
      llmCalls: finalUsage?.completionTokens !== undefined ? `${finalUsage.promptTokens}in/${finalUsage.completionTokens}out` : 'N/A',
      creditsDeducted: resumesToScreen.length,
    }, requestId);

    logger.endRequest(requestId, 'success', 200);

    // Create per-resume audit log entries so usage stats count each match individually
    const snapshot = logger.getRequestSnapshot(requestId);
    const successResults = allResults.filter(r => r.fitScore !== null && !r.error);
    if (successResults.length > 0 && snapshot) {
      req.skipAudit = true; // Prevent the middleware from creating a duplicate aggregate entry
      const perUnit = {
        promptTokens: Math.round(snapshot.promptTokens / successResults.length),
        completionTokens: Math.round(snapshot.completionTokens / successResults.length),
        totalTokens: Math.round(snapshot.totalTokens / successResults.length),
        cost: snapshot.totalCost / successResults.length,
        durationMs: Math.round(totalDuration / successResults.length),
      };
      try {
        await prisma.apiRequestLog.createMany({
          data: successResults.map((result) => ({
            requestId: `${requestId}_${result.resumeId}`,
            userId,
            apiKeyId: req.apiKeyId ?? null,
            endpoint: `/api/v1/hiring-requests/${id}/auto-match`,
            method: 'POST',
            module: 'smart_matching',
            apiName: `smart_matching_${result.resumeId}`,
            statusCode: 200,
            durationMs: perUnit.durationMs,
            promptTokens: perUnit.promptTokens,
            completionTokens: perUnit.completionTokens,
            totalTokens: perUnit.totalTokens,
            llmCalls: 1,
            cost: perUnit.cost,
            provider: snapshot.lastProvider,
            model: snapshot.lastModel,
            ipAddress: null,
            userAgent: req.get('user-agent') || null,
          })),
        });
      } catch (auditError) {
        logger.error('AUTO_MATCH', 'Failed to create per-resume audit logs', {
          error: auditError instanceof Error ? auditError.message : String(auditError),
        }, requestId);
      }
    }

    // Send final completion event
    sendSSE('complete', {
      success: true,
      data: {
        total: resumes.length,
        matched: matchedCount,
        skipped,
        failed: failedCount,
        totalDuration,
        results: allResults,
      },
    });

    res.end();
  } catch (error) {
    const totalDuration = Date.now() - matchStartTime;
    logger.error('AUTO_MATCH', 'Auto-match failed with unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      totalDuration: `${totalDuration}ms`,
    }, requestId);
    logger.endRequest(requestId, 'error', 500);

    // If we already started SSE, send error event
    if (res.headersSent) {
      sendSSE('error', { error: 'Failed to auto-match resumes' });
      res.end();
    } else {
      return res.status(500).json({ success: false, error: 'Failed to auto-match resumes' });
    }
  }
});

/**
 * PATCH /api/v1/hiring-requests/:id/resume-fits/:fitId
 * Update the pipeline status of a ResumeJobFit record
 */
router.patch('/:id/resume-fits/:fitId', async (req, res) => {
  try {
    const { id, fitId } = req.params;
    const userId = req.user!.id;
    const { pipelineStatus } = req.body;

    // Verify hiring request ownership
    const hiringRequest = await prisma.hiringRequest.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!hiringRequest) {
      return res.status(404).json({ success: false, error: 'Hiring request not found' });
    }

    if (!['matched', 'shortlisted', 'rejected', 'invited'].includes(pipelineStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pipelineStatus. Must be one of: matched, shortlisted, rejected, invited',
      });
    }

    const fit = await prisma.resumeJobFit.update({
      where: { id: fitId },
      data: { pipelineStatus },
      include: {
        resume: {
          select: { id: true, name: true, email: true, currentRole: true },
        },
      },
    });

    // Fire webhook asynchronously
    fireHiringRequestWebhook(id, 'candidate.status_changed', {
      resumeFitId: fitId,
      hiringRequestId: id,
      pipelineStatus,
      candidate: fit.resume,
    }).catch(() => {});

    return res.json({ success: true, data: fit });
  } catch (error) {
    console.error('Update resume fit error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update resume fit' });
  }
});

/**
 * POST /api/v1/hiring-requests/:id/batch-invite-from-library
 * Invite selected resumes from the library to interview
 */
router.post('/:id/batch-invite-from-library', async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  logger.startRequest(requestId, `/api/v1/hiring-requests/${req.params.id}/batch-invite-from-library`, 'POST');

  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { resumeIds, recruiter_email, interviewer_requirement } = req.body || {};

    if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({ success: false, error: 'resumeIds array is required' });
    }

    if (resumeIds.length > 50) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({ success: false, error: 'Maximum 50 resumes per batch' });
    }

    // Fetch hiring request with JD
    const hiringRequest = await prisma.hiringRequest.findFirst({
      where: { id, userId },
      select: { id: true, title: true, requirements: true, jobDescription: true },
    });

    if (!hiringRequest) {
      logger.endRequest(requestId, 'error', 404);
      return res.status(404).json({ success: false, error: 'Hiring request not found' });
    }

    const jd = hiringRequest.jobDescription || hiringRequest.requirements;

    // Fetch resumes
    const resumes = await prisma.resume.findMany({
      where: { id: { in: resumeIds }, userId },
      select: { id: true, name: true, resumeText: true, email: true },
    });

    if (resumes.length === 0) {
      logger.endRequest(requestId, 'error', 404);
      return res.status(404).json({ success: false, error: 'No matching resumes found' });
    }

    const results: Array<{
      resumeId: string;
      resumeName: string;
      success: boolean;
      data?: any;
      accessToken?: string;
      error?: string;
    }> = [];

    let sent = 0;
    let failed = 0;

    for (const resume of resumes) {
      try {
        const inviteResult = await inviteAgent.generateInvitation(
          resume.resumeText,
          jd,
          requestId,
          recruiter_email,
          interviewer_requirement
        );

        // Update pipeline status to invited
        await prisma.resumeJobFit.updateMany({
          where: {
            resumeId: resume.id,
            hiringRequestId: id,
          },
          data: {
            pipelineStatus: 'invited',
            invitedAt: new Date(),
            inviteData: JSON.parse(JSON.stringify(inviteResult)),
          },
        });

        const accessToken = crypto.randomBytes(32).toString('hex');

        // Create Interview record
        await prisma.interview.create({
          data: {
            userId,
            hiringRequestId: id,
            resumeId: resume.id,
            candidateName: resume.name || 'Unknown',
            candidateEmail: resume.email || null,
            jobTitle: inviteResult.job_title || hiringRequest.title || 'Interview',
            status: 'scheduled',
            type: 'ai_video',
            accessToken,
            metadata: {
              inviteData: JSON.parse(JSON.stringify(inviteResult)),
              loginUrl: inviteResult.login_url,
              qrcodeUrl: inviteResult.qrcode_url,
            },
          },
        });

        results.push({
          resumeId: resume.id,
          resumeName: resume.name,
          success: true,
          data: inviteResult,
          accessToken,
        });
        sent++;
      } catch (inviteError) {
        results.push({
          resumeId: resume.id,
          resumeName: resume.name,
          success: false,
          error: inviteError instanceof Error ? inviteError.message : 'Invitation failed',
        });
        failed++;
      }
    }

    logger.info('BATCH_INVITE_LIBRARY', 'Batch invite from library completed', {
      hiringRequestId: id,
      total: resumes.length,
      sent,
      failed,
    }, requestId);

    logger.endRequest(requestId, 'success', 200);

    return res.json({
      success: true,
      data: { total: resumes.length, sent, failed, results },
    });
  } catch (error) {
    console.error('Batch invite from library error:', error);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({ success: false, error: 'Failed to batch invite from library' });
  }
});

/**
 * GET /api/v1/hiring-requests/:id/invitations
 * List all invited candidates for a hiring request with interview status
 */
router.get('/:id/invitations', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const hiringRequest = await prisma.hiringRequest.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!hiringRequest) {
      return res.status(404).json({ success: false, error: 'Hiring request not found' });
    }

    const fits = await prisma.resumeJobFit.findMany({
      where: { hiringRequestId: id, pipelineStatus: 'invited' },
      include: {
        resume: { select: { id: true, name: true, email: true, currentRole: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });

    // Fetch linked interviews for these resumes
    const resumeIds = fits.map(f => f.resumeId);
    const interviews = await prisma.interview.findMany({
      where: { hiringRequestId: id, resumeId: { in: resumeIds } },
      select: { id: true, resumeId: true, status: true, scheduledAt: true, completedAt: true, type: true },
      orderBy: { createdAt: 'desc' },
    });
    const interviewByResume = new Map<string, typeof interviews[0]>();
    for (const iv of interviews) {
      if (iv.resumeId && !interviewByResume.has(iv.resumeId)) {
        interviewByResume.set(iv.resumeId, iv);
      }
    }

    const data = fits.map(f => ({
      id: f.id,
      resumeId: f.resumeId,
      candidateName: f.resume.name,
      candidateEmail: f.resume.email,
      candidateRole: f.resume.currentRole,
      invitedAt: f.invitedAt,
      fitScore: f.fitScore,
      fitGrade: f.fitGrade,
      interview: interviewByResume.get(f.resumeId) || null,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('List invitations error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list invitations' });
  }
});

/**
 * POST /api/v1/hiring-requests/:id/intelligence
 * Generate (or retrieve cached) recruitment intelligence report
 */
router.post('/:id/intelligence', async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  logger.startRequest(requestId, `/api/v1/hiring-requests/${req.params.id}/intelligence`, 'POST');

  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { force = false } = req.body || {};

    const report = await recruitmentIntelligenceService.generate(
      id, userId, { force }, requestId
    );

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('INTEL', 'Intelligence report generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate intelligence report',
    });
  }
});

/**
 * GET /api/v1/hiring-requests/:id/intelligence
 * Fetch cached recruitment intelligence report
 */
router.get('/:id/intelligence', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const hr = await prisma.hiringRequest.findFirst({
      where: { id, userId },
      select: { intelligenceData: true, intelligenceUpdatedAt: true },
    });

    if (!hr) {
      return res.status(404).json({ success: false, error: 'Hiring request not found' });
    }

    return res.json({
      success: true,
      data: hr.intelligenceData || null,
      generatedAt: hr.intelligenceUpdatedAt || null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch intelligence report',
    });
  }
});

export default router;
