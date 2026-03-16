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
import { llmService } from '../services/llm/LLMService.js';
import type { ParsedResume, WorkExperience } from '../types/index.js';
import { getVisibilityScope, buildUserIdFilter } from '../lib/teamVisibility.js';

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

// ─── Generate summary & highlight for a resume ────────────────────────

async function generateResumeSummaryHighlight(
  parsed: ParsedResume,
  requestId?: string,
): Promise<{ summary: string; highlight: string }> {
  // If parsed data already has a good summary, use it
  const existingSummary = parsed.summary?.trim();
  if (existingSummary && existingSummary.length > 30) {
    // Still generate a short highlight from the existing summary
    const highlight = existingSummary.length <= 80
      ? existingSummary
      : existingSummary.replace(/[。.!！？?]\s*$/, '').substring(0, 80) + '...';
    return { summary: existingSummary, highlight };
  }

  // Build context from parsed resume for LLM
  const parts: string[] = [];
  parts.push(`Name: ${parsed.name || 'Unknown'}`);
  if (parsed.experience && Array.isArray(parsed.experience) && parsed.experience.length > 0) {
    parts.push('Experience:');
    for (const exp of parsed.experience.slice(0, 5)) {
      parts.push(`- ${exp.role || ''} at ${exp.company || ''} (${exp.duration || exp.startDate || ''})`);
    }
  }
  if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
    parts.push('Education:');
    for (const edu of parsed.education.slice(0, 3)) {
      parts.push(`- ${edu.degree || ''} ${edu.field || ''} at ${edu.institution || ''}`);
    }
  }
  const skills = Array.isArray(parsed.skills)
    ? parsed.skills
    : parsed.skills
      ? Object.values(parsed.skills).flat().filter(Boolean)
      : [];
  if (skills.length > 0) {
    parts.push(`Skills: ${skills.slice(0, 15).join(', ')}`);
  }

  const prompt = `Based on this resume data, generate TWO things:
1. A professional summary (2-3 sentences, ~50-100 words) highlighting the candidate's key strengths, experience, and expertise areas. Write in the SAME LANGUAGE as the candidate's name and experience (if Chinese name/companies, write in Chinese; if English, write in English).
2. A one-line highlight (under 60 characters) — the most impressive or distinctive aspect of this candidate. This will be shown on a card view.

Resume data:
${parts.join('\n')}

Respond ONLY with JSON (no markdown):
{"summary": "...", "highlight": "..."}`;

  try {
    const response = await llmService.chat(
      [{ role: 'user', content: prompt }],
      { requestId },
    );

    const text = response.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        summary: result.summary || '',
        highlight: result.highlight || '',
      };
    }
  } catch (err) {
    logger.error('RESUME', 'Failed to generate summary/highlight', {
      error: err instanceof Error ? err.message : String(err),
    }, requestId);
  }

  // Local fallback: construct from parsed data so we never return empty
  return buildFallbackSummaryHighlight(parsed);
}

/**
 * Build summary & highlight from parsed data without LLM.
 * Used as fallback when LLM call fails or is unavailable.
 */
function buildFallbackSummaryHighlight(parsed: ParsedResume): { summary: string; highlight: string } {
  const parts: string[] = [];

  if (parsed.experience && Array.isArray(parsed.experience) && parsed.experience.length > 0) {
    const latest = parsed.experience[0];
    const role = (latest.role as string) || '';
    const company = (latest.company as string) || '';
    if (role && company) {
      parts.push(`${role} at ${company}`);
    } else if (role) {
      parts.push(role);
    }
  }

  const skills = Array.isArray(parsed.skills)
    ? parsed.skills
    : parsed.skills
      ? Object.values(parsed.skills).flat().filter(Boolean) as string[]
      : [];
  if (skills.length > 0) {
    parts.push(`Skilled in ${skills.slice(0, 5).join(', ')}`);
  }

  if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
    const edu = parsed.education[0];
    const eduParts = [edu.degree, edu.field, edu.institution].filter(Boolean);
    if (eduParts.length > 0) {
      parts.push(eduParts.join(' — '));
    }
  }

  const summary = parts.join('. ').trim() || '';
  const highlight = (parts[0] || '').substring(0, 60) || '';

  return { summary, highlight };
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

    // Check for identical text hash (we no longer early return so personDuplicate can trigger and updatedAt can bump)
    const contentHash = computeHash(resumeText);
    const existing = await prisma.resume.findUnique({
      where: { userId_contentHash: { userId, contentHash } },
    });

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

    // Person-duplicate check: same file or same (name+email)
    if (req.query.skipPersonCheck !== 'true') {
      let personMatch: any = null;
      
      if (name && email) {
        personMatch = await prisma.resume.findFirst({
          where: { name: { equals: name, mode: 'insensitive' }, email: { equals: email, mode: 'insensitive' }, userId, status: 'active' },
          orderBy: { updatedAt: 'desc' },
        });
      }
      
      if (!personMatch && existing) {
        personMatch = existing;
      }

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

    // Generate summary & highlight if not already in parsed data
    const { summary, highlight } = await generateResumeSummaryHighlight(parsed, req.requestId);

    const resumeData = {
      userId,
      recruiterUserId: userId,
      name,
      email,
      phone,
      currentRole,
      experienceYears,
      summary: summary || null,
      highlight: highlight || null,
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

    // If a jobId was provided, create a JobMatch to apply the resume to that job
    const jobId = req.body?.jobId as string | undefined;
    if (jobId) {
      await prisma.jobMatch.upsert({
        where: { jobId_resumeId: { jobId, resumeId: resume.id } },
        create: { jobId, resumeId: resume.id, status: 'applied', appliedAt: new Date(), appliedBy: userId },
        update: { status: 'applied', appliedAt: new Date(), appliedBy: userId },
      });
    }

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
    const batchJobId = req.body?.jobId as string | undefined;

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

        const { parsedData: parsed } = await getOrParseResume(resumeText, userId, requestId);
        const name = parsed.name || decodedName.replace(/\.[^.]+$/, '');
        const email = parsed.email || null;
        const phone = parsed.phone || null;
        const currentRole = parsed.experience?.[0]?.role as string || null;
        const experienceYears = parsed.experience?.length ? computeExperienceYears(parsed.experience) : null;

        // Person-duplicate check: same file or same (name+email)
        if (req.query.skipPersonCheck !== 'true') {
          let personMatch: any = null;
          
          if (name && email) {
            personMatch = await prisma.resume.findFirst({
              where: { name: { equals: name, mode: 'insensitive' }, email: { equals: email, mode: 'insensitive' }, userId, status: 'active' },
              orderBy: { updatedAt: 'desc' },
            });
          }

          if (!personMatch && existing) {
            personMatch = existing;
          }

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

        const { summary, highlight } = await generateResumeSummaryHighlight(parsed, requestId);

        const resumeData = {
          userId,
          recruiterUserId: userId,
          name,
          email,
          phone,
          currentRole,
          experienceYears,
          summary: summary || null,
          highlight: highlight || null,
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

        // If a jobId was provided, create a JobMatch to apply the resume to that job
        if (batchJobId) {
          await prisma.jobMatch.upsert({
            where: { jobId_resumeId: { jobId: batchJobId, resumeId: resume.id } },
            create: { jobId: batchJobId, resumeId: resume.id, status: 'applied', appliedAt: new Date(), appliedBy: userId },
            update: { status: 'applied', appliedAt: new Date(), appliedBy: userId },
          });
        }

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

    const { summary: newSummary, highlight: newHighlight } = await generateResumeSummaryHighlight(parsed, req.requestId);

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
          summary: newSummary || null,
          highlight: newHighlight || null,
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

    const {
      search,
      status = 'active',
      tags,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = '1',
      limit = '20',
      expYearsMin,
      expYearsMax,
      salaryMin,
      salaryMax,
      jobId,
      pipelineStatus,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause with team visibility
    const scope = await getVisibilityScope(req.user!);
    const where: Record<string, unknown> = { ...buildUserIdFilter(scope) };
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
    // Filter by associated job (via JobMatch)
    if (jobId) {
      where.jobMatches = { some: { jobId } };
    }
    // Filter by pipeline status (via ResumeJobFit)
    if (pipelineStatus) {
      where.resumeJobFits = { some: { pipelineStatus } };
    }

    // Post-query filters for experience years and salary (parsed from stored strings/JSON)
    const needsPostFilter = !!(expYearsMin || expYearsMax || salaryMin || salaryMax);

    const orderBy: Record<string, string> = {};
    if (sortBy === 'name') {
      orderBy.name = sortOrder === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.createdAt = sortOrder === 'asc' ? 'asc' : 'desc';
    }

    const selectFields = {
      id: true,
      name: true,
      email: true,
      phone: true,
      currentRole: true,
      experienceYears: true,
      summary: true,
      highlight: true,
      fileName: true,
      fileType: true,
      status: true,
      source: true,
      tags: true,
      contentHash: true,
      preferences: true,
      createdAt: true,
      updatedAt: true,
      parsedData: true,
      resumeJobFits: {
        orderBy: { fitScore: 'desc' as const },
        take: 1,
        select: { fitScore: true, fitGrade: true, pipelineStatus: true, hiringRequest: { select: { title: true } } },
      },
      _count: { select: { resumeVersions: true } },
    };

    let resumes: any[];
    let total: number;

    if (needsPostFilter) {
      // Fetch all matching resumes then apply post-filters for experience/salary
      const allResumes = await prisma.resume.findMany({
        where,
        orderBy,
        select: selectFields,
      });

      const expMin = expYearsMin ? parseFloat(expYearsMin) : null;
      const expMax = expYearsMax ? parseFloat(expYearsMax) : null;
      const salMin = salaryMin ? parseFloat(salaryMin) : null;
      const salMax = salaryMax ? parseFloat(salaryMax) : null;

      const filtered = allResumes.filter((r: any) => {
        // Experience years filter
        if (expMin !== null || expMax !== null) {
          const expStr = r.experienceYears || '';
          const yearMatch = expStr.match(/(\d+(?:\.\d+)?)\s*(?:year|yr)/i);
          const years = yearMatch ? parseFloat(yearMatch[1]) : 0;
          if (expMin !== null && years < expMin) return false;
          if (expMax !== null && years > expMax) return false;
        }
        // Salary filter (from preferences JSON)
        if (salMin !== null || salMax !== null) {
          const prefs = r.preferences as any;
          if (!prefs) return false;
          const prefMin = prefs.salaryMin ? parseFloat(prefs.salaryMin) : null;
          const prefMax = prefs.salaryMax ? parseFloat(prefs.salaryMax) : null;
          const salary = prefMax || prefMin || 0;
          if (!salary) return false;
          if (salMin !== null && salary < salMin) return false;
          if (salMax !== null && salary > salMax) return false;
        }
        return true;
      });

      total = filtered.length;
      resumes = filtered.slice(skip, skip + limitNum);
    } else {
      [resumes, total] = await Promise.all([
        prisma.resume.findMany({
          where,
          orderBy,
          skip,
          take: limitNum,
          select: selectFields,
        }),
        prisma.resume.count({ where }),
      ]);
    }

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
              company: e.company,
              role: e.role || e.title,
              title: e.title || e.role,
              location: e.location,
              description: e.description,
              technologies: Array.isArray(e.technologies) ? e.technologies : [],
              employmentType: e.employmentType,
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

// ─── Re-parse resume with latest agent ───────────────────────────────────
router.post('/:id/reparse', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const resume = await prisma.resume.findUnique({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true, resumeText: true, name: true },
    });

    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    if (!resume.resumeText) {
      return res.status(400).json({ success: false, error: 'No resume text available for re-parsing' });
    }

    // Force fresh parse (bypass cache)
    const { parsedData: parsed } = await getOrParseResume(resume.resumeText, req.user.id, req.requestId);

    // Extract metadata
    const name = parsed.name || resume.name || 'Unknown';
    const email = parsed.email || null;
    const phone = parsed.phone || null;
    const currentRole = parsed.experience?.[0]?.role || parsed.experience?.[0]?.title || null;

    // Update resume record
    await prisma.resume.update({
      where: { id: resume.id },
      data: {
        parsedData: JSON.parse(JSON.stringify(parsed)),
        name,
        email,
        phone,
        currentRole,
      },
    });

    logger.info('RESUMES', 'Resume re-parsed', { id: resume.id, name }, req.requestId);

    res.json({ success: true, data: { parsedData: parsed, name, email, phone, currentRole } });
  } catch (error) {
    logger.error('RESUMES', 'Failed to re-parse resume', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    }, req.requestId);
    res.status(500).json({ success: false, error: 'Failed to re-parse resume' });
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

// ─── Applied jobs for a resume ──────────────────────────────────────────
router.get('/:id/applied-jobs', requireAuth, async (req: Request, res: Response) => {
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

    // Fetch all JobMatch records for this resume
    const jobMatches = await prisma.jobMatch.findMany({
      where: { resumeId: resume.id },
      include: {
        job: {
          select: {
            id: true, title: true, department: true, location: true,
            workType: true, employmentType: true, status: true,
            salaryMin: true, salaryMax: true, salaryCurrency: true, salaryText: true, salaryPeriod: true,
            companyName: true, locations: true, createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Also fetch ResumeJobFit records (hiring request matches + invitations)
    const resumeJobFits = await prisma.resumeJobFit.findMany({
      where: { resumeId: resume.id },
      include: {
        hiringRequest: { select: { id: true, title: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Fetch interviews linked to this resume
    const interviews = await prisma.interview.findMany({
      where: { resumeId: resume.id },
      select: {
        id: true, hiringRequestId: true, status: true,
        scheduledAt: true, completedAt: true, type: true,
        jobId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const interviewByJob = new Map<string, typeof interviews[0]>();
    const interviewByHR = new Map<string, typeof interviews[0]>();
    for (const iv of interviews) {
      if (iv.jobId && !interviewByJob.has(iv.jobId)) interviewByJob.set(iv.jobId, iv);
      if (iv.hiringRequestId && !interviewByHR.has(iv.hiringRequestId)) interviewByHR.set(iv.hiringRequestId, iv);
    }

    const data = {
      jobMatches: jobMatches.map(m => ({
        id: m.id,
        jobId: m.jobId,
        jobTitle: m.job.title,
        department: m.job.department,
        location: m.job.location,
        workType: m.job.workType,
        employmentType: m.job.employmentType,
        companyName: m.job.companyName,
        jobStatus: m.job.status,
        salaryMin: m.job.salaryMin,
        salaryMax: m.job.salaryMax,
        salaryCurrency: m.job.salaryCurrency,
        salaryText: m.job.salaryText,
        salaryPeriod: m.job.salaryPeriod,
        score: m.score,
        grade: m.grade,
        status: m.status,
        appliedAt: m.appliedAt,
        reviewedAt: m.reviewedAt,
        createdAt: m.createdAt,
        interview: interviewByJob.get(m.jobId) || null,
      })),
      hiringRequestFits: resumeJobFits.map(f => ({
        id: f.id,
        hiringRequestId: f.hiringRequestId,
        hiringRequestTitle: f.hiringRequest.title,
        hiringRequestStatus: f.hiringRequest.status,
        fitScore: f.fitScore,
        fitGrade: f.fitGrade,
        pipelineStatus: f.pipelineStatus,
        invitedAt: f.invitedAt,
        createdAt: f.createdAt,
        interview: interviewByHR.get(f.hiringRequestId) || null,
      })),
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('List applied jobs error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list applied jobs' });
  }
});

// ─── Update job match status ────────────────────────────────────────────
router.patch('/:id/job-matches/:matchId', requireAuth, async (req: Request, res: Response) => {
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

    const { status } = req.body;
    const validStatuses = ['new', 'reviewed', 'shortlisted', 'applied', 'rejected', 'invited'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const updated = await prisma.jobMatch.update({
      where: { id: req.params.matchId },
      data: {
        status,
        ...(status === 'reviewed' ? { reviewedAt: new Date(), reviewedBy: req.user.id } : {}),
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update job match error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update job match' });
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

    // Regenerate summary/highlight when parsedData or resumeText changes
    if (parsedData !== undefined || resumeText !== undefined) {
      const newParsed = (parsedData ?? existing.parsedData ?? {}) as unknown as ParsedResume;
      const { summary: editSummary, highlight: editHighlight } = await generateResumeSummaryHighlight(newParsed, req.requestId);
      data.summary = editSummary || null;
      data.highlight = editHighlight || null;
    }

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
    const versionParsed = (version.parsedData ?? {}) as unknown as ParsedResume;
    const { summary: restoredSummary, highlight: restoredHighlight } = await generateResumeSummaryHighlight(versionParsed, req.requestId);

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
        summary: restoredSummary || null,
        highlight: restoredHighlight || null,
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

// ─── Backfill highlights for resumes that are missing them ─────────────
router.post('/backfill-highlights', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userId = req.user.id;
    const resumes = await prisma.resume.findMany({
      where: {
        userId,
        status: 'active',
        OR: [
          { highlight: null },
          { highlight: '' },
          { summary: null },
          { summary: '' },
        ],
      },
      select: { id: true, parsedData: true },
      take: 50,
    });

    if (resumes.length === 0) {
      return res.json({ success: true, updated: 0 });
    }

    let updated = 0;
    for (const resume of resumes) {
      const parsed = (resume.parsedData ?? {}) as unknown as ParsedResume;
      const { summary, highlight } = await generateResumeSummaryHighlight(parsed, req.requestId);
      if (summary || highlight) {
        await prisma.resume.update({
          where: { id: resume.id },
          data: {
            summary: summary || null,
            highlight: highlight || null,
          },
        });
        updated++;
      }
    }

    return res.json({ success: true, updated, total: resumes.length });
  } catch (error) {
    logger.error('RESUMES', 'Failed to backfill highlights', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to backfill highlights' });
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
