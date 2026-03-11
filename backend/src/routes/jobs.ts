import { Router } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { createJDAgent } from '../agents/CreateJDAgent.js';
import { jobContentAgent } from '../agents/JobContentAgent.js';
import { marketIntelligenceAgent } from '../agents/MarketIntelligenceAgent.js';
import { documentParsingService, DocumentParsingService } from '../services/DocumentParsingService.js';
import { jdParseAgent } from '../agents/JDParseAgent.js';
import type { ParsedJD, RequirementsDetailed, QualificationsDetailed } from '../types/index.js';
import '../types/auth.js';

/**
 * Build a formatted job description from parsed JD structured data.
 * Falls back to rawText if structured data is insufficient.
 */
function buildFormattedDescription(parsed: ParsedJD, rawText: string): string {
  const parts: string[] = [];

  if (parsed.jobOverview) {
    parts.push(parsed.jobOverview);
  }

  if (parsed.responsibilities && parsed.responsibilities.length > 0) {
    parts.push('\n## Responsibilities\n');
    for (const r of parsed.responsibilities) {
      parts.push(`- ${r}`);
    }
  }

  if (parsed.benefits && parsed.benefits.length > 0) {
    parts.push('\n## Benefits\n');
    for (const b of parsed.benefits) {
      parts.push(`- ${b}`);
    }
  }

  if (parsed.compensation) {
    const comp = parsed.compensation;
    const compParts: string[] = [];
    if (comp.salary) compParts.push(`Salary: ${comp.salary}`);
    if (comp.bonus) compParts.push(`Bonus: ${comp.bonus}`);
    if (comp.equity) compParts.push(`Equity: ${comp.equity}`);
    if (comp.other) compParts.push(`Other: ${comp.other}`);
    if (compParts.length > 0) {
      parts.push('\n## Compensation\n');
      for (const c of compParts) {
        parts.push(`- ${c}`);
      }
    }
  }

  if (parsed.additionalInfo && Object.keys(parsed.additionalInfo).length > 0) {
    for (const [key, value] of Object.entries(parsed.additionalInfo)) {
      parts.push(`\n## ${key}\n`);
      parts.push(value);
    }
  }

  // If we got meaningful structured content, use it; otherwise fall back to raw text
  if (parts.length > 0 && parts.join('\n').trim().length > 50) {
    return parts.join('\n').trim();
  }
  return rawText;
}

/**
 * Build qualifications text from parsed JD qualifications data.
 */
function buildQualificationsText(parsed: ParsedJD): string {
  const quals = parsed.qualifications;
  if (!quals) return '';

  // Simple string array
  if (Array.isArray(quals)) {
    if (quals.length === 0) return '';
    return quals.map((q) => `- ${q}`).join('\n');
  }

  // Detailed qualifications object
  const detailed = quals as QualificationsDetailed;
  const parts: string[] = [];

  if (detailed.education && detailed.education.length > 0) {
    parts.push('## Education');
    for (const e of detailed.education) parts.push(`- ${e}`);
  }
  if (detailed.experience && detailed.experience.length > 0) {
    parts.push('\n## Experience');
    for (const e of detailed.experience) parts.push(`- ${e}`);
  }
  if (detailed.certifications && detailed.certifications.length > 0) {
    parts.push('\n## Certifications');
    for (const c of detailed.certifications) parts.push(`- ${c}`);
  }
  if (detailed.skills) {
    const { technical, soft, tools, languages } = detailed.skills;
    if (technical && technical.length > 0) {
      parts.push('\n## Technical Skills');
      for (const s of technical) parts.push(`- ${s}`);
    }
    if (soft && soft.length > 0) {
      parts.push('\n## Soft Skills');
      for (const s of soft) parts.push(`- ${s}`);
    }
    if (tools && tools.length > 0) {
      parts.push('\n## Tools');
      for (const t of tools) parts.push(`- ${t}`);
    }
    if (languages && languages.length > 0) {
      parts.push('\n## Languages');
      for (const l of languages) parts.push(`- ${l}`);
    }
  }

  return parts.join('\n').trim();
}

/**
 * Build hard requirements text from parsed JD requirements data.
 */
function buildHardRequirementsText(parsed: ParsedJD): string {
  const reqs = parsed.requirements;
  if (!reqs) return '';

  // Simple string array
  if (Array.isArray(reqs)) {
    if (reqs.length === 0) return '';
    return reqs.map((r, i) => `${i + 1}. ${r}`).join('\n');
  }

  // Detailed requirements object
  const detailed = reqs as RequirementsDetailed;
  const parts: string[] = [];

  if (detailed.mustHave && detailed.mustHave.length > 0) {
    parts.push('## Must Have');
    detailed.mustHave.forEach((r, i) => parts.push(`${i + 1}. ${r}`));
  }
  if (detailed.niceToHave && detailed.niceToHave.length > 0) {
    parts.push('\n## Nice to Have');
    detailed.niceToHave.forEach((r, i) => parts.push(`${i + 1}. ${r}`));
  }

  return parts.join('\n').trim();
}

const router = Router();

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (DocumentParsingService.ACCEPTED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

/** Helper to extract new job fields from request body */
function extractJobFields(body: any) {
  const {
    title, companyName, department, location, workType, employmentType,
    experienceLevel, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
    description, qualifications, hardRequirements, requirements,
    locations, interviewMode, passingScore, interviewLanguage,
    interviewDuration, interviewRequirements, evaluationRules,
    hiringRequestId, status,
  } = body;

  return {
    title, companyName, department, location, workType, employmentType,
    experienceLevel, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
    description, qualifications, hardRequirements, requirements,
    locations, interviewMode, passingScore, interviewLanguage,
    interviewDuration, interviewRequirements, evaluationRules,
    hiringRequestId, status,
  };
}

/**
 * GET /api/v1/jobs
 * List user's jobs with optional filters
 */
router.get('/', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const { status, search, title, page = '1', limit = '20' } = req.query;

    const where: any = { userId };
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (title && typeof title === 'string') {
      where.title = title;
    } else if (search && typeof search === 'string') {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        include: {
          hiringRequest: { select: { id: true, title: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({
      success: true,
      data: jobs,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error('JOBS', 'Failed to list jobs', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to list jobs' });
  }
});

/**
 * GET /api/v1/jobs/:id
 * Get job detail
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId },
      include: {
        hiringRequest: { select: { id: true, title: true, requirements: true } },
      },
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get job' });
  }
});

/**
 * POST /api/v1/jobs
 * Create a new job
 */
router.post('/', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const fields = extractJobFields(req.body);

    if (!fields.title || typeof fields.title !== 'string' || !fields.title.trim()) {
      return res.status(400).json({ success: false, error: 'Job title is required' });
    }

    if (fields.hiringRequestId) {
      const hr = await prisma.hiringRequest.findFirst({
        where: { id: fields.hiringRequestId, userId },
      });
      if (!hr) {
        return res.status(404).json({ success: false, error: 'Hiring request not found' });
      }
    }

    const job = await prisma.job.create({
      data: {
        userId,
        title: fields.title.trim(),
        companyName: fields.companyName?.trim() || null,
        department: fields.department?.trim() || null,
        location: fields.location?.trim() || null,
        workType: fields.workType?.trim() || null,
        employmentType: fields.employmentType?.trim() || null,
        experienceLevel: fields.experienceLevel?.trim() || null,
        salaryMin: fields.salaryMin ? parseInt(fields.salaryMin, 10) : null,
        salaryMax: fields.salaryMax ? parseInt(fields.salaryMax, 10) : null,
        salaryCurrency: fields.salaryCurrency?.trim() || 'USD',
        salaryPeriod: fields.salaryPeriod?.trim() || 'monthly',
        description: fields.description?.trim() || null,
        qualifications: fields.qualifications?.trim() || null,
        hardRequirements: fields.hardRequirements?.trim() || null,
        requirements: fields.requirements || null,
        locations: fields.locations || null,
        interviewMode: fields.interviewMode?.trim() || 'standard',
        passingScore: fields.passingScore ? parseInt(fields.passingScore, 10) : 60,
        interviewLanguage: fields.interviewLanguage?.trim() || 'en',
        interviewDuration: fields.interviewDuration ? parseInt(fields.interviewDuration, 10) : 30,
        interviewRequirements: fields.interviewRequirements?.trim() || null,
        evaluationRules: fields.evaluationRules?.trim() || null,
        hiringRequestId: fields.hiringRequestId || null,
        status: fields.status === 'open' ? 'open' : 'draft',
      },
    });

    logger.info('JOBS', 'Job created', { jobId: job.id, title: job.title }, requestId);
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    logger.error('JOBS', 'Failed to create job', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to create job' });
  }
});

/**
 * PATCH /api/v1/jobs/:id
 * Update a job
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const existing = await prisma.job.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const fields = extractJobFields(req.body);
    const data: any = {};

    if (fields.title !== undefined) data.title = fields.title.trim();
    if (fields.companyName !== undefined) data.companyName = fields.companyName?.trim() || null;
    if (fields.department !== undefined) data.department = fields.department?.trim() || null;
    if (fields.location !== undefined) data.location = fields.location?.trim() || null;
    if (fields.workType !== undefined) data.workType = fields.workType?.trim() || null;
    if (fields.employmentType !== undefined) data.employmentType = fields.employmentType?.trim() || null;
    if (fields.experienceLevel !== undefined) data.experienceLevel = fields.experienceLevel?.trim() || null;
    if (fields.salaryMin !== undefined) data.salaryMin = fields.salaryMin ? parseInt(fields.salaryMin, 10) : null;
    if (fields.salaryMax !== undefined) data.salaryMax = fields.salaryMax ? parseInt(fields.salaryMax, 10) : null;
    if (fields.salaryCurrency !== undefined) data.salaryCurrency = fields.salaryCurrency?.trim() || 'USD';
    if (fields.salaryPeriod !== undefined) data.salaryPeriod = fields.salaryPeriod?.trim() || 'monthly';
    if (fields.description !== undefined) data.description = fields.description?.trim() || null;
    if (fields.qualifications !== undefined) data.qualifications = fields.qualifications?.trim() || null;
    if (fields.hardRequirements !== undefined) data.hardRequirements = fields.hardRequirements?.trim() || null;
    if (fields.requirements !== undefined) data.requirements = fields.requirements;
    if (fields.locations !== undefined) data.locations = fields.locations;
    if (fields.interviewMode !== undefined) data.interviewMode = fields.interviewMode?.trim() || 'standard';
    if (fields.passingScore !== undefined) data.passingScore = fields.passingScore ? parseInt(fields.passingScore, 10) : 60;
    if (fields.interviewLanguage !== undefined) data.interviewLanguage = fields.interviewLanguage?.trim() || 'en';
    if (fields.interviewDuration !== undefined) data.interviewDuration = fields.interviewDuration ? parseInt(fields.interviewDuration, 10) : 30;
    if (fields.interviewRequirements !== undefined) data.interviewRequirements = fields.interviewRequirements?.trim() || null;
    if (fields.evaluationRules !== undefined) data.evaluationRules = fields.evaluationRules?.trim() || null;
    if (fields.status !== undefined) {
      data.status = fields.status;
      if (fields.status === 'open' && !existing.publishedAt) data.publishedAt = new Date();
      if (fields.status === 'closed' || fields.status === 'filled') data.closedAt = new Date();
    }

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update job' });
  }
});

/**
 * DELETE /api/v1/jobs/:id
 * Delete a job
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const existing = await prisma.job.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    await prisma.job.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Job deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete job' });
  }
});

/**
 * POST /api/v1/jobs/:id/generate-jd
 * AI-generate a job description (legacy endpoint)
 */
router.post('/:id/generate-jd', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId },
      include: { hiringRequest: true },
    });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const { language } = req.body || {};

    const jd = await createJDAgent.generate({
      title: job.title,
      requirements: job.hiringRequest?.requirements || '',
      jobDescription: job.description || '',
      language,
      requestId,
    });

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: { description: jd },
    });

    logger.info('JOBS', 'JD generated', { jobId: job.id }, requestId);
    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('JOBS', 'Failed to generate JD', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to generate job description' });
  }
});

/**
 * POST /api/v1/jobs/generate-content
 * AI-generate content from form data (no saved job required)
 */
router.post('/generate-content', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { action = 'generate_section', section, language, jobTitle, companyName, department, locations, experienceLevel, existingContent } = req.body;
    if (!jobTitle) {
      return res.status(400).json({ success: false, error: 'jobTitle is required' });
    }

    const result = await jobContentAgent.generateContent({
      action,
      section,
      jobTitle,
      companyName: companyName || undefined,
      department: department || undefined,
      locations: locations || undefined,
      experienceLevel: experienceLevel || undefined,
      existingContent: existingContent || {},
      language,
    }, requestId);

    logger.info('JOBS', 'Content generated (no job)', { action, section }, requestId);
    res.json({ success: true, generated: result });
  } catch (error) {
    logger.error('JOBS', 'Failed to generate content', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to generate content' });
  }
});

/**
 * POST /api/v1/jobs/:id/generate-content
 * AI-generate content for one or all job sections
 */
router.post('/:id/generate-content', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const job = await prisma.job.findFirst({ where: { id: req.params.id, userId } });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const { action = 'generate_section', section, language } = req.body;

    const result = await jobContentAgent.generateContent({
      action,
      section,
      jobTitle: job.title,
      companyName: job.companyName || undefined,
      department: job.department || undefined,
      locations: (job.locations as any[]) || undefined,
      experienceLevel: job.experienceLevel || undefined,
      existingContent: {
        description: job.description || '',
        qualifications: job.qualifications || '',
        hardRequirements: job.hardRequirements || '',
        interviewRequirements: job.interviewRequirements || '',
        evaluationRules: job.evaluationRules || '',
      },
      language,
    }, requestId);

    // Update job with generated sections
    const updateData: any = {};
    for (const [key, value] of Object.entries(result.sections)) {
      if (value && ['description', 'qualifications', 'hardRequirements', 'interviewRequirements', 'evaluationRules'].includes(key)) {
        updateData[key] = value;
      }
    }

    let updated = job;
    if (Object.keys(updateData).length > 0) {
      updated = await prisma.job.update({
        where: { id: job.id },
        data: updateData,
      });
    }

    logger.info('JOBS', 'Content generated', { jobId: job.id, action, section }, requestId);
    res.json({ success: true, data: updated, generated: result });
  } catch (error) {
    logger.error('JOBS', 'Failed to generate content', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to generate content' });
  }
});

/**
 * GET /api/v1/jobs/:id/export
 * Export job as JSON
 */
router.get('/:id/export', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId },
      include: {
        hiringRequest: { select: { id: true, title: true } },
      },
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const filename = `job-${job.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${job.id.slice(0, 8)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(job);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to export job' });
  }
});

/**
 * POST /api/v1/jobs/import
 * Import JD from file upload, parse and return structured data
 */
router.post('/import', requireAuth, uploadDoc.single('file'), async (req, res) => {
  const requestId = generateRequestId();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const text = await documentParsingService.extractText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    );

    if (!text || text.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Could not extract text from file' });
    }

    const parsed = await jdParseAgent.parse(text, requestId);

    logger.info('JOBS', 'JD imported from file', { filename: req.file.originalname }, requestId);
    res.json({
      success: true,
      data: {
        rawText: text,
        parsed,
        suggestedFields: {
          title: parsed.title || '',
          companyName: parsed.company || '',
          department: parsed.team || '',
          location: parsed.location || '',
          workType: parsed.workType || '',
          employmentType: parsed.employmentType || '',
          experienceLevel: parsed.experienceLevel || '',
          description: buildFormattedDescription(parsed, text),
          qualifications: buildQualificationsText(parsed),
          hardRequirements: buildHardRequirementsText(parsed),
        },
      },
    });
  } catch (error) {
    logger.error('JOBS', 'Failed to import JD', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to import job description' });
  }
});

/**
 * POST /api/v1/jobs/:id/analyze
 * Run demand analysis using MarketIntelligenceAgent
 */
router.post('/:id/analyze', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const job = await prisma.job.findFirst({ where: { id: req.params.id, userId } });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const result = await marketIntelligenceAgent.analyze({
      title: job.title,
      requirements: job.qualifications || job.hardRequirements || '',
      jobDescription: job.description || '',
      candidateProfile: {
        candidatePersonaSummary: `Ideal candidate for ${job.title} at ${job.companyName || 'the company'}`,
        idealBackground: {
          typicalDegrees: [],
          typicalCareerPath: [],
          yearsOfExperience: job.experienceLevel || '',
          industryBackground: [],
        },
        skillMapping: {
          mustHave: [],
          niceToHave: [],
        },
        personalityTraits: {
          traits: [],
          cultureFitIndicators: [],
        },
        dayInTheLife: '',
      },
    }, requestId);

    logger.info('JOBS', 'Demand analysis completed', { jobId: job.id }, requestId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('JOBS', 'Failed to run demand analysis', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to run demand analysis' });
  }
});

/**
 * POST /api/v1/jobs/from-request/:requestId
 * Create a job from an existing hiring request
 */
router.post('/from-request/:requestId', requireAuth, async (req, res) => {
  const logRequestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const hr = await prisma.hiringRequest.findFirst({
      where: { id: req.params.requestId, userId },
    });
    if (!hr) {
      return res.status(404).json({ success: false, error: 'Hiring request not found' });
    }

    const customTitle = req.body?.title;
    const job = await prisma.job.create({
      data: {
        userId,
        hiringRequestId: hr.id,
        title: (customTitle && typeof customTitle === 'string' && customTitle.trim()) ? customTitle.trim() : hr.title,
        description: hr.jobDescription || '',
        status: 'draft',
      },
    });

    logger.info('JOBS', 'Job created from hiring request', { jobId: job.id, hiringRequestId: hr.id }, logRequestId);
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create job from request' });
  }
});

export default router;
