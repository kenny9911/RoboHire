import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { documentParsingService, DocumentParsingService } from '../services/DocumentParsingService.js';
import { pdfService } from '../services/PDFService.js';
import { getOrParseResume } from '../services/ResumeParsingCache.js';
import { isParsedResumeLikelyIncomplete } from '../services/ResumeParseValidation.js';
import { resumeInsightAgent } from '../agents/ResumeInsightAgent.js';
import { jobFitAgent } from '../agents/JobFitAgent.js';
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { logger } from '../services/LoggerService.js';
import type { ParsedResume, WorkExperience } from '../types/index.js';

const router = Router();

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (DocumentParsingService.isAcceptedUpload(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Accepted: PDF, DOCX, XLSX, TXT, MD, JSON'));
    }
  },
});

function getProcessingMetrics(requestId?: string) {
  if (!requestId) return undefined;
  const snapshot = logger.getRequestSnapshot(requestId);
  if (!snapshot) return undefined;
  return {
    durationMs: snapshot.durationMs,
    promptTokens: snapshot.promptTokens,
    completionTokens: snapshot.completionTokens,
    totalTokens: snapshot.totalTokens,
    totalCost: snapshot.totalCost,
    model: snapshot.lastModel,
    provider: snapshot.lastProvider,
    llmCalls: snapshot.llmCallsCount,
  };
}

function computeHash(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

function decodeFilename(raw: string): string {
  try {
    // Multer decodes Content-Disposition filenames as Latin-1 by default.
    // Re-encode to Latin-1 bytes then decode as UTF-8 to recover CJK characters.
    const bytes = Buffer.from(raw, 'latin1');
    const decoded = bytes.toString('utf-8');
    // If decoding produced replacement chars, the original was already correct
    if (decoded.includes('\uFFFD')) return raw;
    return decoded;
  } catch {
    return raw;
  }
}

async function extractText(buffer: Buffer, mimetype: string, filename: string, requestId?: string): Promise<string> {
  if (mimetype === 'application/pdf') {
    return pdfService.extractText(buffer, requestId);
  }
  return documentParsingService.extractText(buffer, mimetype, filename, requestId);
}

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const s = dateStr.trim().toLowerCase();
  if (s === 'present' || s === '至今' || s === '现在' || s === '現在' || s === 'current' || s === 'now') {
    return new Date();
  }
  // Try ISO: 2020-01, 2020-01-15
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1);
  // Try "Month Year": Jan 2020, January 2020, 01/2020
  const monthYear = s.match(/^([a-z]+)\s*(\d{4})$/);
  if (monthYear) {
    const d = new Date(`${monthYear[1]} 1, ${monthYear[2]}`);
    if (!isNaN(d.getTime())) return d;
  }
  const slashMonthYear = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMonthYear) return new Date(parseInt(slashMonthYear[2]), parseInt(slashMonthYear[1]) - 1);
  // Try just year: 2020
  const yearOnly = s.match(/^(\d{4})$/);
  if (yearOnly) return new Date(parseInt(yearOnly[1]), 0);
  // Fallback: try native parsing
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function estimateMonths(startDate?: string, endDate?: string, duration?: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start && end) {
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return Math.max(1, months);
  }
  // Try to parse duration string like "2 years 3 months", "1.5 years", "6 months"
  if (duration) {
    const d = duration.toLowerCase();
    let total = 0;
    const yearMatch = d.match(/(\d+(?:\.\d+)?)\s*(?:year|yr|年)/);
    if (yearMatch) total += parseFloat(yearMatch[1]) * 12;
    const monthMatch = d.match(/(\d+)\s*(?:month|mo|个月|ヶ月)/);
    if (monthMatch) total += parseInt(monthMatch[1]);
    if (total > 0) return Math.round(total);
  }
  return 6; // Default estimate if no dates
}

function computeExperienceYears(experience: WorkExperience[]): string {
  let fullTimeMonths = 0;
  let internMonths = 0;
  for (const exp of experience) {
    const months = estimateMonths(exp.startDate, exp.endDate, exp.duration);
    if (exp.employmentType === 'internship') {
      internMonths += months;
    } else {
      fullTimeMonths += months;
    }
  }
  const ftYears = Math.round(fullTimeMonths / 12 * 10) / 10;
  const intMonths = Math.round(internMonths);
  const parts: string[] = [];
  if (ftYears > 0) parts.push(`${ftYears} years`);
  if (intMonths > 0) {
    parts.push(intMonths >= 12
      ? `${Math.round(intMonths / 12 * 10) / 10} years internship`
      : `${intMonths} months internship`);
  }
  return parts.join(' + ') || '0 years';
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
    const decodedName = decodeFilename(originalname);

    // Extract text (with vision fallback for garbled PDFs)
    const resumeText = await extractText(buffer, mimetype, decodedName, req.requestId);
    if (!resumeText || resumeText.trim().length < 20) {
      return res.status(400).json({ success: false, error: 'Could not extract meaningful text from the file' });
    }

    // Check for duplicate
    const contentHash = computeHash(resumeText);
    const existing = await prisma.resume.findUnique({
      where: { userId_contentHash: { userId, contentHash } },
    });
    if (existing && !isParsedResumeLikelyIncomplete(existing.parsedData, resumeText)) {
      return res.json({ success: true, data: existing, duplicate: true });
    }

    // Parse resume with AI (DB cache first, then LLM)
    const { parsedData: parsed } = await getOrParseResume(resumeText, userId, req.requestId);

    // Extract metadata from parsed data
    const name = parsed.name || decodedName.replace(/\.[^.]+$/, '');
    const email = parsed.email || null;
    const phone = parsed.phone || null;
    const currentRole = parsed.experience?.[0]?.role as string || null;
    const experienceYears = parsed.experience && parsed.experience.length > 0
      ? computeExperienceYears(parsed.experience)
      : null;

    // Person-duplicate check: same (name+phone) or (name+email)
    if (!existing && req.query.skipPersonCheck !== 'true' && name) {
      const orConds: Array<{ name: string; phone?: string; email?: string; userId: string; status: string }> = [];
      if (phone) orConds.push({ name, phone, userId, status: 'active' });
      if (email) orConds.push({ name, email, userId, status: 'active' });
      if (orConds.length > 0) {
        const personMatch = await prisma.resume.findFirst({
          where: { OR: orConds },
          orderBy: { updatedAt: 'desc' },
        });
        if (personMatch) {
          return res.json({
            success: true,
            personDuplicate: true,
            existingResume: {
              id: personMatch.id,
              name: personMatch.name,
              email: personMatch.email,
              phone: personMatch.phone,
              currentRole: personMatch.currentRole,
              experienceYears: personMatch.experienceYears,
              fileName: personMatch.fileName,
              updatedAt: personMatch.updatedAt,
              parsedData: personMatch.parsedData,
            },
            newParsed: { name, email, phone, currentRole, experienceYears, parsedData: parsed, fileName: decodedName },
            metrics: getProcessingMetrics(req.requestId),
          });
        }
      }
    }

    const resumeData = {
      userId,
      name,
      email,
      phone,
      currentRole,
      experienceYears,
      resumeText,
      parsedData: JSON.parse(JSON.stringify(parsed)),
      fileName: decodedName,
      fileSize: size,
      fileType: mimetype,
      contentHash,
      source: existing?.source || 'upload',
    };

    const resume = existing
      ? await prisma.resume.update({
          where: { id: existing.id },
          data: resumeData,
        })
      : await prisma.resume.create({
          data: resumeData,
        });

    return res.json({
      success: true,
      data: resume,
      duplicate: Boolean(existing),
      refreshed: Boolean(existing),
      metrics: getProcessingMetrics(req.requestId),
    });
  } catch (error) {
    console.error('Resume upload error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload resume',
    });
  }
});

// ─── Batch upload (concurrent processing) ───────────────────────────────
const BATCH_CONCURRENCY = 5;

router.post('/upload-batch', requireAuth, uploadDoc.array('files', 20), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const files = req.files as Array<{ buffer: Buffer; mimetype: string; originalname: string; size: number }>;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const userId = req.user.id;
    const requestId = req.requestId;

    // Process a single file
    async function processFile(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
      const decodedName = decodeFilename(file.originalname);
      try {
        const resumeText = await extractText(file.buffer, file.mimetype, decodedName, requestId);
        if (!resumeText || resumeText.trim().length < 20) {
          return { fileName: decodedName, success: false as const, error: 'Could not extract text' };
        }

        const contentHash = computeHash(resumeText);
        const existing = await prisma.resume.findUnique({
          where: { userId_contentHash: { userId, contentHash } },
        });
        if (existing && !isParsedResumeLikelyIncomplete(existing.parsedData, resumeText)) {
          return { fileName: decodedName, success: true as const, data: existing, duplicate: true };
        }

        const { parsedData: parsed } = await getOrParseResume(resumeText, userId, requestId);
        const name = parsed.name || decodedName.replace(/\.[^.]+$/, '');
        const email = parsed.email || null;
        const phone = parsed.phone || null;
        const currentRole = parsed.experience?.[0]?.role as string || null;
        const experienceYears = parsed.experience?.length ? computeExperienceYears(parsed.experience) : null;

        // Person-duplicate check
        if (!existing && name) {
          const orConds: Array<{ name: string; phone?: string; email?: string; userId: string; status: string }> = [];
          if (phone) orConds.push({ name, phone, userId, status: 'active' });
          if (email) orConds.push({ name, email, userId, status: 'active' });
          if (orConds.length > 0) {
            const personMatch = await prisma.resume.findFirst({
              where: { OR: orConds },
              orderBy: { updatedAt: 'desc' },
            });
            if (personMatch) {
              return {
                fileName: decodedName,
                success: true as const,
                personDuplicate: true as const,
                existingResume: {
                  id: personMatch.id, name: personMatch.name,
                  email: personMatch.email, phone: personMatch.phone,
                  currentRole: personMatch.currentRole, experienceYears: personMatch.experienceYears,
                  fileName: personMatch.fileName, updatedAt: personMatch.updatedAt,
                  parsedData: personMatch.parsedData,
                },
                newParsed: { name, email, phone, currentRole, experienceYears, parsedData: parsed, fileName: decodedName },
              };
            }
          }
        }

        const resumeData = {
          userId,
          name,
          email,
          phone,
          currentRole,
          experienceYears,
          resumeText,
          parsedData: JSON.parse(JSON.stringify(parsed)),
          fileName: decodedName,
          fileSize: file.size,
          fileType: file.mimetype,
          contentHash,
          source: existing?.source || 'upload',
        };

        const resume = existing
          ? await prisma.resume.update({
              where: { id: existing.id },
              data: resumeData,
            })
          : await prisma.resume.create({
              data: resumeData,
            });

        return { fileName: decodedName, success: true as const, data: resume, duplicate: Boolean(existing) };
      } catch (err) {
        return {
          fileName: decodedName,
          success: false as const,
          error: err instanceof Error ? err.message : 'Processing failed',
        };
      }
    }

    // Process files concurrently with a concurrency limit
    const results: Array<{ fileName: string; success: boolean; data?: unknown; error?: string; duplicate?: boolean }> = [];
    for (let i = 0; i < files.length; i += BATCH_CONCURRENCY) {
      const batch = files.slice(i, i + BATCH_CONCURRENCY);
      const batchResults = await Promise.all(batch.map(processFile));
      results.push(...batchResults);
    }

    return res.json({ success: true, data: results, metrics: getProcessingMetrics(requestId) });
  } catch (error) {
    console.error('Batch upload error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process batch upload',
    });
  }
});

// ─── Re-upload and overwrite existing resume ─────────────────────────────
router.post('/:id/reupload', requireAuth, uploadDoc.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userId = req.user.id;
    const resumeId = req.params.id;
    const existingResume = await prisma.resume.findFirst({
      where: { id: resumeId, userId },
      select: { id: true, source: true, status: true },
    });

    if (!existingResume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const { buffer, mimetype, originalname, size } = req.file;
    const decodedName = decodeFilename(originalname);

    const resumeText = await extractText(buffer, mimetype, decodedName, req.requestId);
    if (!resumeText || resumeText.trim().length < 20) {
      return res.status(400).json({ success: false, error: 'Could not extract meaningful text from the file' });
    }

    const contentHash = computeHash(resumeText);
    const duplicate = await prisma.resume.findFirst({
      where: {
        userId,
        contentHash,
        NOT: { id: resumeId },
      },
      select: { id: true, name: true },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'Another resume with identical content already exists',
        duplicateResumeId: duplicate.id,
      });
    }

    // For reupload, always re-parse (user explicitly wants new parsing)
    const { parsedData: parsed } = await getOrParseResume(resumeText, userId, req.requestId);
    const name = parsed.name || decodedName.replace(/\.[^.]+$/, '');
    const email = parsed.email || null;
    const phone = parsed.phone || null;
    const currentRole = parsed.experience?.[0]?.role as string || null;
    const experienceYears = parsed.experience && parsed.experience.length > 0
      ? computeExperienceYears(parsed.experience)
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.resumeJobFit.deleteMany({
        where: { resumeId },
      });

      return tx.resume.update({
        where: { id: resumeId },
        data: {
          name,
          email,
          phone,
          currentRole,
          experienceYears,
          resumeText,
          parsedData: JSON.parse(JSON.stringify(parsed)),
          insightData: Prisma.DbNull,
          jobFitData: Prisma.DbNull,
          fileName: decodedName,
          fileSize: size,
          fileType: mimetype,
          contentHash,
          source: existingResume.source || 'upload',
          status: 'active',
        },
      });
    });

    return res.json({ success: true, data: updated, metrics: getProcessingMetrics(req.requestId) });
  } catch (error) {
    console.error('Resume re-upload error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to overwrite resume',
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
          phone: true,
          currentRole: true,
          experienceYears: true,
          fileName: true,
          fileType: true,
          status: true,
          source: true,
          tags: true,
          contentHash: true,
          preferences: true,
          createdAt: true,
          updatedAt: true,
          // Include parsedData for skills display (will be trimmed on the frontend)
          parsedData: true,
          // Include top job fit score
          resumeJobFits: {
            orderBy: { fitScore: 'desc' },
            take: 1,
            select: { fitScore: true, fitGrade: true, pipelineStatus: true, hiringRequest: { select: { title: true } } },
          },
          _count: { select: { resumeVersions: true } },
        },
      }),
      prisma.resume.count({ where }),
    ]);

    // Trim parsedData to only fields needed by the list view
    const trimmedResumes = resumes.map((r: any) => ({
      ...r,
      _versionCount: r._count?.resumeVersions || 0,
      _count: undefined,
      hasInvitations: r.resumeJobFits?.some((f: any) => f.pipelineStatus === 'invited') || false,
      parsedData: r.parsedData ? {
        skills: r.parsedData.skills,
        summary: r.parsedData.summary,
        experience: Array.isArray(r.parsedData.experience)
          ? r.parsedData.experience.map((e: any) => ({
              company: e.company, title: e.title, employmentType: e.employmentType,
              startDate: e.startDate, endDate: e.endDate, duration: e.duration,
            }))
          : [],
      } : null,
    }));

    return res.json({
      success: true,
      data: trimmedResumes,
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

    const { tags, notes, status, preferences } = req.body;
    const data: Record<string, unknown> = {};
    if (tags !== undefined) data.tags = tags;
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined && ['active', 'archived'].includes(status)) data.status = status;
    if (preferences !== undefined) data.preferences = preferences;

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

    // Prevent deletion if candidate has been invited for interviews
    const invitationCount = await prisma.resumeJobFit.count({
      where: { resumeId: req.params.id, pipelineStatus: 'invited' },
    });
    if (invitationCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete a candidate who has been invited for interviews' });
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

    const force = String(req.query.force || '').toLowerCase();
    const forceRegenerate = force === 'true' || force === '1';

    // Check cache (7 day TTL)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (!forceRegenerate && resume.insightData && resume.updatedAt > sevenDaysAgo) {
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

// ─── List invitations for a resume ──────────────────────────────────────
router.get('/:id/invitations', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const fits = await prisma.resumeJobFit.findMany({
      where: { resumeId: resume.id, pipelineStatus: 'invited' },
      include: {
        hiringRequest: { select: { id: true, title: true, status: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });

    // Fetch linked interviews
    const hrIds = fits.map(f => f.hiringRequestId);
    const interviews = await prisma.interview.findMany({
      where: { resumeId: resume.id, hiringRequestId: { in: hrIds } },
      select: { id: true, hiringRequestId: true, status: true, scheduledAt: true, completedAt: true, type: true },
      orderBy: { createdAt: 'desc' },
    });
    const interviewByHR = new Map<string, typeof interviews[0]>();
    for (const iv of interviews) {
      if (iv.hiringRequestId && !interviewByHR.has(iv.hiringRequestId)) {
        interviewByHR.set(iv.hiringRequestId, iv);
      }
    }

    const data = fits.map(f => ({
      id: f.id,
      hiringRequestId: f.hiringRequestId,
      hiringRequestTitle: f.hiringRequest.title,
      hiringRequestStatus: f.hiringRequest.status,
      invitedAt: f.invitedAt,
      fitScore: f.fitScore,
      fitGrade: f.fitGrade,
      inviteData: f.inviteData || null,
      interview: interviewByHR.get(f.hiringRequestId) || null,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('List resume invitations error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list invitations' });
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

// ─── Full resume edit (with auto-versioning) ─────────────────────────
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
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

    const { name, email, phone, currentRole, experienceYears, resumeText, parsedData, versionName } = req.body;

    // Auto-snapshot current state before editing
    await prisma.resumeVersion.create({
      data: {
        resumeId: existing.id,
        userId: req.user.id,
        versionName: versionName || null,
        resumeText: existing.resumeText,
        parsedData: existing.parsedData ?? Prisma.JsonNull,
        name: existing.name,
        email: existing.email,
        phone: existing.phone,
        currentRole: existing.currentRole,
        experienceYears: existing.experienceYears,
        changeNote: 'Before edit',
      },
    });

    // Build update payload
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (currentRole !== undefined) data.currentRole = currentRole;
    if (experienceYears !== undefined) data.experienceYears = experienceYears;
    if (resumeText !== undefined) {
      data.resumeText = resumeText;
      data.contentHash = computeHash(resumeText);
    }
    if (parsedData !== undefined) data.parsedData = parsedData;

    // Clear stale caches
    data.insightData = Prisma.JsonNull;
    data.jobFitData = Prisma.JsonNull;

    const updated = await prisma.resume.update({
      where: { id: existing.id },
      data,
    });

    logger.info('RESUMES', `Resume edited with auto-version`, { resumeId: existing.id });

    return res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('RESUMES', 'Failed to edit resume', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to edit resume' });
  }
});

// ─── List resume versions ─────────────────────────────────────────────
router.get('/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Verify ownership
    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const versions = await prisma.resumeVersion.findMany({
      where: { resumeId: req.params.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        versionName: true,
        name: true,
        currentRole: true,
        changeNote: true,
        createdAt: true,
      },
    });

    return res.json({ success: true, data: versions });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to list versions' });
  }
});

// ─── Get a specific version's full data ───────────────────────────────
router.get('/:id/versions/:versionId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const version = await prisma.resumeVersion.findFirst({
      where: { id: req.params.versionId, resumeId: req.params.id, userId: req.user.id },
    });
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }

    return res.json({ success: true, data: version });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to get version' });
  }
});

// ─── Restore a version (rollback) ────────────────────────────────────
router.post('/:id/versions/:versionId/restore', requireAuth, async (req: Request, res: Response) => {
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

    const version = await prisma.resumeVersion.findFirst({
      where: { id: req.params.versionId, resumeId: req.params.id, userId: req.user.id },
    });
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }

    // Snapshot current state before restoring
    await prisma.resumeVersion.create({
      data: {
        resumeId: existing.id,
        userId: req.user.id,
        resumeText: existing.resumeText,
        parsedData: existing.parsedData ?? Prisma.JsonNull,
        name: existing.name,
        email: existing.email,
        phone: existing.phone,
        currentRole: existing.currentRole,
        experienceYears: existing.experienceYears,
        changeNote: 'Before rollback',
      },
    });

    // Restore from target version
    const updated = await prisma.resume.update({
      where: { id: existing.id },
      data: {
        name: version.name,
        email: version.email,
        phone: version.phone,
        currentRole: version.currentRole,
        experienceYears: version.experienceYears,
        resumeText: version.resumeText,
        parsedData: version.parsedData ?? Prisma.JsonNull,
        contentHash: computeHash(version.resumeText),
        insightData: Prisma.JsonNull,
        jobFitData: Prisma.JsonNull,
      },
    });

    logger.info('RESUMES', `Resume restored to version ${version.id}`, { resumeId: existing.id, versionId: version.id });

    return res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('RESUMES', 'Failed to restore version', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to restore version' });
  }
});

// ─── Delete a specific version ────────────────────────────────────────
router.delete('/:id/versions/:versionId', requireAuth, async (req: Request, res: Response) => {
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

    const version = await prisma.resumeVersion.findFirst({
      where: { id: req.params.versionId, resumeId: resume.id },
    });
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }

    await prisma.resumeVersion.delete({ where: { id: version.id } });

    logger.info('RESUMES', `Deleted version ${version.id}`, { resumeId: resume.id });
    return res.json({ success: true });
  } catch (error) {
    logger.error('RESUMES', 'Failed to delete version', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to delete version' });
  }
});

// ─── Refine resume for a job (AI agent) ───────────────────────────────
router.post('/:id/refine', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { jobId, language: reqLanguage } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'jobId is required' });
    }

    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: req.user.id },
      select: {
        title: true,
        description: true,
        requirements: true,
        qualifications: true,
        hardRequirements: true,
        interviewLanguage: true,
      },
    });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Determine language: explicit request param → job's interviewLanguage → Accept-Language → 'en'
    const acceptLang = (req.headers['accept-language'] || '').split(',')[0]?.split('-')[0] || '';
    const language = reqLanguage || job.interviewLanguage || acceptLang || 'en';

    const { refineResumeAgent } = await import('../agents/RefineResumeAgent.js');

    const result = await refineResumeAgent.execute(
      {
        resumeText: resume.resumeText,
        parsedData: resume.parsedData,
        jobTitle: job.title,
        jobDescription: job.description || '',
        requirements: job.requirements as any || undefined,
        qualifications: job.qualifications || undefined,
        hardRequirements: job.hardRequirements || undefined,
        language,
      },
      job.description || undefined,
      req.requestId,
      language,
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error('RESUMES', 'Failed to refine resume', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refine resume',
    });
  }
});

export default router;
