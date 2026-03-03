import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { llmService } from '../services/llm/LLMService.js';
import { languageService } from '../services/LanguageService.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { createJDAgent } from '../agents/CreateJDAgent.js';
import { screeningAgent } from '../agents/ScreeningAgent.js';
import { inviteAgent } from '../agents/InviteAgent.js';
import { recruitmentIntelligenceService } from '../services/RecruitmentIntelligenceService.js';
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
      prisma.hiringRequest.findMany({
        where: { userId },
        include: {
          _count: {
            select: { candidates: true },
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

    // Invalidate intelligence cache when requirements or JD change
    const invalidateIntelligence = requirements !== undefined || jobDescription !== undefined;

    const hiringRequest = await prisma.hiringRequest.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
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
 * Screen all user's resumes against this hiring request using ScreeningAgent
 */
router.post('/:id/auto-match', async (req, res) => {
  const requestId = generateRequestId();
  logger.startRequest(requestId, `/api/v1/hiring-requests/${req.params.id}/auto-match`, 'POST');

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

    for (const batch of batches) {
      try {
        const result = await screeningAgent.screen(hrInput, batch, requestId);

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
          }
        }
      } catch (batchError) {
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
      }
    }

    logger.info('AUTO_MATCH', 'Auto-match completed', {
      hiringRequestId: id,
      total: resumes.length,
      matched: matchedCount,
      skipped,
      failed: failedCount,
    }, requestId);

    logger.endRequest(requestId, 'success', 200);

    return res.json({
      success: true,
      data: {
        total: resumes.length,
        matched: matchedCount,
        skipped,
        failed: failedCount,
        results: allResults,
      },
    });
  } catch (error) {
    console.error('Auto-match error:', error);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({ success: false, error: 'Failed to auto-match resumes' });
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
  const requestId = generateRequestId();
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
          data: { pipelineStatus: 'invited' },
        });

        results.push({
          resumeId: resume.id,
          resumeName: resume.name,
          success: true,
          data: inviteResult,
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
 * POST /api/v1/hiring-requests/:id/intelligence
 * Generate (or retrieve cached) recruitment intelligence report
 */
router.post('/:id/intelligence', async (req, res) => {
  const requestId = generateRequestId();
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
