import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { documentParsingService, DocumentParsingService } from '../services/DocumentParsingService.js';
import { pdfService } from '../services/PDFService.js';
import { resumeParseAgent } from '../agents/ResumeParseAgent.js';
import { resumeInsightAgent } from '../agents/ResumeInsightAgent.js';
import { jobFitAgent } from '../agents/JobFitAgent.js';
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import type { ParsedResume } from '../types/index.js';

const router = Router();

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (DocumentParsingService.ACCEPTED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Accepted: PDF, DOCX, XLSX, TXT'));
    }
  },
});

function computeHash(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

async function extractText(buffer: Buffer, mimetype: string, filename: string): Promise<string> {
  if (mimetype === 'application/pdf') {
    return pdfService.extractText(buffer);
  }
  return documentParsingService.extractText(buffer, mimetype, filename);
}

// ─── Upload single resume ──────────────────────────────────────────────
router.post('/upload', requireAuth, uploadDoc.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { buffer, mimetype, originalname, size } = req.file;

    // Extract text
    const resumeText = await extractText(buffer, mimetype, originalname);
    if (!resumeText || resumeText.trim().length < 20) {
      return res.status(400).json({ success: false, error: 'Could not extract meaningful text from the file' });
    }

    // Check for duplicate
    const contentHash = computeHash(resumeText);
    const existing = await prisma.resume.findUnique({
      where: { userId_contentHash: { userId, contentHash } },
    });
    if (existing) {
      return res.json({ success: true, data: existing, duplicate: true });
    }

    // Parse resume with AI
    const parsed = await resumeParseAgent.parse(resumeText, req.requestId);

    // Extract metadata from parsed data
    const name = parsed.name || originalname.replace(/\.[^.]+$/, '');
    const email = parsed.email || null;
    const phone = parsed.phone || null;
    const currentRole = parsed.experience?.[0]?.role as string || null;
    const experienceYears = parsed.experience
      ? `${parsed.experience.length} positions`
      : null;

    const resume = await prisma.resume.create({
      data: {
        userId,
        name,
        email,
        phone,
        currentRole,
        experienceYears,
        resumeText,
        parsedData: JSON.parse(JSON.stringify(parsed)),
        fileName: originalname,
        fileSize: size,
        fileType: mimetype,
        contentHash,
        source: 'upload',
      },
    });

    return res.json({ success: true, data: resume });
  } catch (error) {
    console.error('Resume upload error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload resume',
    });
  }
});

// ─── Batch upload ───────────────────────────────────────────────────────
router.post('/upload-batch', requireAuth, uploadDoc.array('files', 10), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const userId = req.user.id;
    const results: Array<{ fileName: string; success: boolean; data?: unknown; error?: string; duplicate?: boolean }> = [];

    for (const file of files) {
      try {
        const resumeText = await extractText(file.buffer, file.mimetype, file.originalname);
        if (!resumeText || resumeText.trim().length < 20) {
          results.push({ fileName: file.originalname, success: false, error: 'Could not extract text' });
          continue;
        }

        const contentHash = computeHash(resumeText);
        const existing = await prisma.resume.findUnique({
          where: { userId_contentHash: { userId, contentHash } },
        });
        if (existing) {
          results.push({ fileName: file.originalname, success: true, data: existing, duplicate: true });
          continue;
        }

        const parsed = await resumeParseAgent.parse(resumeText, req.requestId);
        const name = parsed.name || file.originalname.replace(/\.[^.]+$/, '');

        const resume = await prisma.resume.create({
          data: {
            userId,
            name,
            email: parsed.email || null,
            phone: parsed.phone || null,
            currentRole: parsed.experience?.[0]?.role as string || null,
            experienceYears: parsed.experience ? `${parsed.experience.length} positions` : null,
            resumeText,
            parsedData: JSON.parse(JSON.stringify(parsed)),
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
            contentHash,
            source: 'upload',
          },
        });

        results.push({ fileName: file.originalname, success: true, data: resume });
      } catch (err) {
        results.push({
          fileName: file.originalname,
          success: false,
          error: err instanceof Error ? err.message : 'Processing failed',
        });
      }
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    console.error('Batch upload error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process batch upload',
    });
  }
});

// ─── List resumes ───────────────────────────────────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userId = req.user.id;
    const {
      search,
      status = 'active',
      tags,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = { userId };
    if (status && status !== 'all') {
      where.status = status;
    }
    if (tags) {
      where.tags = { hasSome: tags.split(',').map(t => t.trim()) };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { currentRole: { contains: search, mode: 'insensitive' } },
        { resumeText: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Record<string, string> = {};
    if (sortBy === 'name') {
      orderBy.name = sortOrder === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.createdAt = sortOrder === 'asc' ? 'asc' : 'desc';
    }

    const [resumes, total] = await Promise.all([
      prisma.resume.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        select: {
          id: true,
          name: true,
          email: true,
          currentRole: true,
          experienceYears: true,
          fileName: true,
          fileType: true,
          status: true,
          source: true,
          tags: true,
          contentHash: true,
          createdAt: true,
          updatedAt: true,
          // Include parsedData for skills display (will be trimmed on the frontend)
          parsedData: true,
          // Include top job fit score
          resumeJobFits: {
            orderBy: { fitScore: 'desc' },
            take: 1,
            select: { fitScore: true, fitGrade: true, hiringRequest: { select: { title: true } } },
          },
        },
      }),
      prisma.resume.count({ where }),
    ]);

    return res.json({
      success: true,
      data: resumes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List resumes error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list resumes' });
  }
});

// ─── Resume stats ───────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.id;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [total, thisWeek, analyzed] = await Promise.all([
      prisma.resume.count({ where: { userId, status: 'active' } }),
      prisma.resume.count({ where: { userId, status: 'active', createdAt: { gte: oneWeekAgo } } }),
      prisma.resume.count({ where: { userId, status: 'active', NOT: { insightData: { equals: Prisma.DbNull } } } }),
    ]);

    return res.json({ success: true, data: { total, thisWeek, analyzed } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// ─── Get single resume ──────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        resumeJobFits: {
          include: { hiringRequest: { select: { id: true, title: true, status: true } } },
          orderBy: { fitScore: 'desc' },
        },
      },
    });

    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    return res.json({ success: true, data: resume });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to get resume' });
  }
});

// ─── Update resume (tags, notes, status) ────────────────────────────────
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const existing = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const { tags, notes, status } = req.body;
    const data: Record<string, unknown> = {};
    if (tags !== undefined) data.tags = tags;
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined && ['active', 'archived'].includes(status)) data.status = status;

    const updated = await prisma.resume.update({
      where: { id: req.params.id },
      data,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to update resume' });
  }
});

// ─── Delete (soft) ──────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const existing = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    await prisma.resume.update({
      where: { id: req.params.id },
      data: { status: 'archived' },
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to delete resume' });
  }
});

// ─── Generate AI insights ──────────────────────────────────────────────
router.post('/:id/insights', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    // Check cache (7 day TTL)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (resume.insightData && resume.updatedAt > sevenDaysAgo) {
      return res.json({ success: true, data: resume.insightData, cached: true });
    }

    // Generate insights
    const parsedResume = (resume.parsedData || {}) as unknown as ParsedResume;
    const insights = await resumeInsightAgent.analyze(parsedResume, resume.resumeText, req.requestId);

    // Save
    await prisma.resume.update({
      where: { id: resume.id },
      data: { insightData: JSON.parse(JSON.stringify(insights)) },
    });

    return res.json({ success: true, data: insights });
  } catch (error) {
    console.error('Insight generation error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate insights',
    });
  }
});

// ─── Generate job fit analysis ──────────────────────────────────────────
router.post('/:id/job-fit', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    // Get user's active hiring requests (max 10)
    const hiringRequests = await prisma.hiringRequest.findMany({
      where: { userId: req.user.id, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, requirements: true, jobDescription: true },
    });

    if (hiringRequests.length === 0) {
      return res.json({ success: true, data: { fits: [], bestFit: null, candidateSummary: 'No active hiring requests to match against.' } });
    }

    // Generate fit analysis
    const parsedResume = (resume.parsedData || {}) as unknown as ParsedResume;
    const fitResult = await jobFitAgent.analyze(
      parsedResume,
      resume.resumeText,
      hiringRequests.map(hr => ({
        id: hr.id,
        title: hr.title,
        requirements: hr.requirements,
        jobDescription: hr.jobDescription || undefined,
      })),
      req.requestId,
    );

    // Upsert ResumeJobFit records
    for (const fit of fitResult.fits) {
      const matchingHr = hiringRequests.find(hr => hr.id === fit.hiringRequestId);
      if (!matchingHr) continue;

      await prisma.resumeJobFit.upsert({
        where: {
          resumeId_hiringRequestId: { resumeId: resume.id, hiringRequestId: fit.hiringRequestId },
        },
        update: {
          fitScore: fit.fitScore,
          fitGrade: fit.fitGrade,
          fitData: JSON.parse(JSON.stringify(fit)),
        },
        create: {
          resumeId: resume.id,
          hiringRequestId: fit.hiringRequestId,
          fitScore: fit.fitScore,
          fitGrade: fit.fitGrade,
          fitData: JSON.parse(JSON.stringify(fit)),
        },
      });
    }

    // Cache on resume
    await prisma.resume.update({
      where: { id: resume.id },
      data: { jobFitData: JSON.parse(JSON.stringify(fitResult)) },
    });

    return res.json({ success: true, data: fitResult });
  } catch (error) {
    console.error('Job fit error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze job fit',
    });
  }
});

export default router;
