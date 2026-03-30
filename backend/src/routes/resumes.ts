import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { requireAuth } from '../middleware/auth.js';
import { documentParsingService, DocumentParsingService } from '../services/DocumentParsingService.js';
import { pdfService } from '../services/PDFService.js';
import { getOrParseResume } from '../services/ResumeParsingCache.js';
import { resumeParseAgent } from '../agents/ResumeParseAgent.js';
import { normalizeExtractedText } from '../services/ResumeParserService.js';
import { isParsedResumeLikelyIncomplete } from '../services/ResumeParseValidation.js';
import { resumeInsightAgent } from '../agents/ResumeInsightAgent.js';
import { jobFitAgent } from '../agents/JobFitAgent.js';
import {
  generateResumeSummaryHighlight,
  isResumeSummaryLowSignal,
} from '../services/ResumeSummaryService.js';
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { logger } from '../services/LoggerService.js';
import { llmService } from '../services/llm/LLMService.js';
import {
  resumeOriginalFileStorageService,
  type ResumeOriginalFileRef,
  type StoredResumeOriginalFile,
} from '../services/ResumeOriginalFileStorageService.js';
import type { ParsedResume, WorkExperience } from '../types/index.js';
import { getVisibilityScope, buildUserIdFilter, buildAdminOverrideFilter } from '../lib/teamVisibility.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(__dirname, '..', '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'NotoSansSC-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'NotoSansSC-Bold.ttf');
const HAS_PDF_FONTS = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
const LANGUAGE_FILTER_ALIASES: Record<string, string[]> = {
  english: ['english', '英语', '英文'],
  spanish: ['spanish', 'espanol', 'español', '西班牙语', '西班牙文'],
  chinese: ['chinese', 'mandarin', 'mandarin chinese', '中文', '汉语', '漢語', '普通话', '普通話', '国语', '國語'],
  mandarin: ['chinese', 'mandarin', 'mandarin chinese', '中文', '汉语', '漢語', '普通话', '普通話', '国语', '國語'],
};

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

function getLanguageFilterTerms(value: string): string[] {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return [];
  const aliases = LANGUAGE_FILTER_ALIASES[normalized] || [normalized];
  return [...new Set(aliases.map((term) => term.trim().toLowerCase()).filter(Boolean))];
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

/**
 * Extract a candidate name from a filename by stripping common recruitment prefixes/suffixes.
 * e.g. "【GR1008_Java开发工程师_上海 15-30K】黄沈杰 10年.pdf" → "黄沈杰"
 */
function cleanCandidateNameFromFilename(filename: string): string {
  let name = filename.replace(/\.[^.]+$/, ''); // strip extension
  // Strip 【...】 or [...] prefix (Chinese recruitment convention: 【jobCode_title_location salary】)
  name = name.replace(/^[\[【][^\]】]*[\]】]\s*/, '');
  // Strip trailing experience years like " 10年", " 3年以上", " 10年以上"
  name = name.replace(/\s+\d+年[以上]*\s*$/, '');
  return name.trim() || filename.replace(/\.[^.]+$/, '');
}

function buildInlineContentDisposition(filename: string): string {
  const cleaned = filename.replace(/[\r\n"]/g, '').trim() || 'resume';
  const encoded = encodeURIComponent(cleaned);
  const asciiFallback = cleaned
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[;\\]/g, '-')
    .trim() || 'resume';

  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function mapStoredOriginalFileFields(storedOriginalFile: StoredResumeOriginalFile | null) {
  return {
    originalFileProvider: storedOriginalFile?.provider || null,
    originalFileKey: storedOriginalFile?.key || null,
    originalFileName: storedOriginalFile?.fileName || null,
    originalFileMimeType: storedOriginalFile?.mimeType || null,
    originalFileSize: storedOriginalFile?.size || null,
    originalFileChecksum: storedOriginalFile?.checksum || null,
    originalFileStoredAt: storedOriginalFile?.storedAt || null,
  };
}

function extractStoredOriginalFileRef(record: {
  originalFileProvider?: string | null;
  originalFileKey?: string | null;
  originalFileName?: string | null;
  originalFileMimeType?: string | null;
}): ResumeOriginalFileRef | null {
  if (!record.originalFileProvider || !record.originalFileKey) {
    return null;
  }

  return {
    provider: record.originalFileProvider,
    key: record.originalFileKey,
    fileName: record.originalFileName,
    mimeType: record.originalFileMimeType,
  };
}

async function removeStoredOriginalFile(ref: ResumeOriginalFileRef | null, requestId?: string): Promise<void> {
  if (!ref?.provider || !ref?.key) {
    return;
  }

  await resumeOriginalFileStorageService.deleteFile(ref, requestId);
}

async function extractText(buffer: Buffer, mimetype: string, filename: string, requestId?: string): Promise<string> {
  if (mimetype === 'application/pdf') {
    return pdfService.extractText(buffer, requestId);
  }
  return documentParsingService.extractText(buffer, mimetype, filename, requestId);
}

async function renderResumeTextAsPdf(title: string, resumeText: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    const pageWidth = doc.page.width - 100;

    const fontRegular = HAS_PDF_FONTS ? 'ResumeSans' : 'Helvetica';
    const fontBold = HAS_PDF_FONTS ? 'ResumeSansBold' : 'Helvetica-Bold';

    if (HAS_PDF_FONTS) {
      doc.registerFont('ResumeSans', FONT_REGULAR);
      doc.registerFont('ResumeSansBold', FONT_BOLD);
    }

    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font(fontBold).fontSize(18).fillColor('#0f172a').text(title, { width: pageWidth });
    doc.moveDown(0.75);
    doc.font(fontRegular).fontSize(10.5).fillColor('#334155').text(resumeText.replace(/\r\n/g, '\n'), {
      width: pageWidth,
      lineGap: 4,
      paragraphGap: 8,
    });

    doc.end();
  });
}

async function buildVisibleResumeWhere(user: {
  id: string;
  role?: string;
  teamId?: string | null;
}, resumeId: string): Promise<Record<string, unknown>> {
  const scope = await getVisibilityScope(user);
  return { id: resumeId, ...buildUserIdFilter(scope) };
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

    // Check for identical text hash (we no longer early return so personDuplicate can trigger and updatedAt can bump)
    const contentHash = computeHash(resumeText);
    const existing = await prisma.resume.findUnique({
      where: { userId_contentHash: { userId, contentHash } },
    });

    // Parse resume with AI (DB cache first, then LLM)
    const { parsedData: parsed } = await getOrParseResume(resumeText, userId, req.requestId);

    // Extract metadata from parsed data
    const name = parsed.name || cleanCandidateNameFromFilename(decodedName);
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
    const previousStoredOriginal = existing ? extractStoredOriginalFileRef(existing) : null;
    const storedOriginalFile = await resumeOriginalFileStorageService.saveFile({
      buffer,
      fileName: decodedName,
      mimeType: mimetype,
      size,
      userId,
      requestId: req.requestId,
    });

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
      ...mapStoredOriginalFileFields(storedOriginalFile),
      contentHash,
      source: existing?.source || 'upload',
    };

    let resume;
    try {
      resume = existing
        ? await prisma.resume.update({
            where: { id: existing.id },
            data: resumeData,
          })
        : await prisma.resume.create({
            data: resumeData,
          });
    } catch (error) {
      await removeStoredOriginalFile(extractStoredOriginalFileRef(mapStoredOriginalFileFields(storedOriginalFile)), req.requestId);
      throw error;
    }

    if (previousStoredOriginal && previousStoredOriginal.key !== storedOriginalFile?.key) {
      await removeStoredOriginalFile(previousStoredOriginal, req.requestId);
    }

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
        const name = parsed.name || cleanCandidateNameFromFilename(decodedName);
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
        const previousStoredOriginal = existing ? extractStoredOriginalFileRef(existing) : null;
        const storedOriginalFile = await resumeOriginalFileStorageService.saveFile({
          buffer: file.buffer,
          fileName: decodedName,
          mimeType: file.mimetype,
          size: file.size,
          userId,
          requestId,
        });

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
          ...mapStoredOriginalFileFields(storedOriginalFile),
          contentHash,
          source: existing?.source || 'upload',
        };

        let resume;
        try {
          resume = existing
            ? await prisma.resume.update({
                where: { id: existing.id },
                data: resumeData,
              })
            : await prisma.resume.create({
                data: resumeData,
              });
        } catch (error) {
          await removeStoredOriginalFile(extractStoredOriginalFileRef(mapStoredOriginalFileFields(storedOriginalFile)), requestId);
          throw error;
        }

        if (previousStoredOriginal && previousStoredOriginal.key !== storedOriginalFile?.key) {
          await removeStoredOriginalFile(previousStoredOriginal, requestId);
        }

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
      select: {
        id: true,
        source: true,
        status: true,
        originalFileProvider: true,
        originalFileKey: true,
        originalFileName: true,
        originalFileMimeType: true,
      },
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
    const name = parsed.name || cleanCandidateNameFromFilename(decodedName);
    const email = parsed.email || null;
    const phone = parsed.phone || null;
    const currentRole = parsed.experience?.[0]?.role as string || null;
    const experienceYears = parsed.experience && parsed.experience.length > 0
      ? computeExperienceYears(parsed.experience)
      : null;

    const { summary: newSummary, highlight: newHighlight } = await generateResumeSummaryHighlight(parsed, req.requestId);
    const previousStoredOriginal = extractStoredOriginalFileRef(existingResume);
    const storedOriginalFile = await resumeOriginalFileStorageService.saveFile({
      buffer,
      fileName: decodedName,
      mimeType: mimetype,
      size,
      userId,
      requestId: req.requestId,
    });

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
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
            ...mapStoredOriginalFileFields(storedOriginalFile),
            contentHash,
            source: existingResume.source || 'upload',
            status: 'active',
          },
        });
      });
    } catch (error) {
      await removeStoredOriginalFile(extractStoredOriginalFileRef(mapStoredOriginalFileFields(storedOriginalFile)), req.requestId);
      throw error;
    }

    if (previousStoredOriginal && previousStoredOriginal.key !== storedOriginalFile?.key) {
      await removeStoredOriginalFile(previousStoredOriginal, req.requestId);
    }

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
      filterUserId,
      filterTeamId,
      teamView,
      skills,
      educationLevel,
      school,
      company,
      country,
      location,
      language,
      fitScoreMin,
      fitScoreMax,
      fields,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause with team visibility (admin can narrow by user/team)
    const scope = await getVisibilityScope(req.user!, teamView === 'true');
    const where: Record<string, unknown> = {
      ...await buildAdminOverrideFilter(scope, filterUserId, filterTeamId),
    };
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
    const resumeJobFitSome: Record<string, unknown> = {};
    if (pipelineStatus) {
      resumeJobFitSome.pipelineStatus = pipelineStatus;
    }
    if (fitScoreMin || fitScoreMax) {
      const fitScoreFilter: Record<string, number> = {};
      if (fitScoreMin && !Number.isNaN(parseFloat(fitScoreMin))) {
        fitScoreFilter.gte = parseFloat(fitScoreMin);
      }
      if (fitScoreMax && !Number.isNaN(parseFloat(fitScoreMax))) {
        fitScoreFilter.lte = parseFloat(fitScoreMax);
      }
      if (Object.keys(fitScoreFilter).length > 0) {
        resumeJobFitSome.fitScore = fitScoreFilter;
      }
    }
    if (Object.keys(resumeJobFitSome).length > 0) {
      where.resumeJobFits = { some: resumeJobFitSome };
    }

    // ── JSON-based filters via raw SQL pre-filter (uses GIN indexes on parsedData) ──
    const hasJsonFilters = !!(skills || educationLevel || school || company || country || location || language);
    if (hasJsonFilters) {
      const conditions: string[] = [`"parsedData" IS NOT NULL`];
      const params: any[] = [];
      // Helper to push a param and return its $N placeholder
      const p = (val: string) => { params.push(val); return `$${params.length}`; };

      if (skills) {
        // Support comma-separated skill list — ALL must match (AND)
        const skillList = skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        for (const skill of skillList) {
          const ph = p(`%${skill}%`);
          // Handle both array and object (categorized) skill formats
          conditions.push(`(
            (jsonb_typeof("parsedData"->'skills') = 'array' AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text("parsedData"->'skills') AS s WHERE LOWER(s) LIKE ${ph}
            ))
            OR
            (jsonb_typeof("parsedData"->'skills') = 'object' AND EXISTS (
              SELECT 1 FROM jsonb_each("parsedData"->'skills') AS cat(k,v)
              WHERE jsonb_typeof(cat.v) = 'array' AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(cat.v) AS s WHERE LOWER(s) LIKE ${ph}
              )
            ))
          )`);
        }
      }

      if (educationLevel) {
        // Map education level to degree keywords for fuzzy matching
        const eduMap: Record<string, string[]> = {
          'junior_high': ['初中', 'junior high', 'middle school', 'junior middle'],
          'vocational': ['中专', '中技', 'vocational', 'technical school', 'technical secondary'],
          'high_school': ['高中', 'high school', 'senior high', 'senior middle'],
          'associate': ['大专', 'associate', 'diploma', 'junior college', 'college diploma'],
          'bachelor': ['本科', 'bachelor', 'undergraduate', 'b.s.', 'b.a.', 'b.eng', 'bsc', 'ba'],
          'master': ['硕士', 'master', 'graduate', 'm.s.', 'm.a.', 'm.eng', 'msc', 'mba', 'ma'],
          'doctorate': ['博士', 'phd', 'ph.d', 'doctorate', 'doctoral', 'doctor of'],
        };
        const keywords = eduMap[educationLevel] || [educationLevel];
        const orClauses = keywords.map((kw) => {
          const ph = p(`%${kw.toLowerCase()}%`);
          return `LOWER(edu->>'degree') LIKE ${ph} OR LOWER(edu->>'field') LIKE ${ph}`;
        });
        conditions.push(`EXISTS (
          SELECT 1 FROM jsonb_array_elements("parsedData"->'education') AS edu
          WHERE ${orClauses.join(' OR ')}
        )`);
      }

      if (school) {
        const schoolList = school.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        if (schoolList.length === 1) {
          const ph = p(`%${schoolList[0].toLowerCase()}%`);
          conditions.push(`EXISTS (
            SELECT 1 FROM jsonb_array_elements("parsedData"->'education') AS edu
            WHERE LOWER(edu->>'institution') LIKE ${ph}
          )`);
        } else if (schoolList.length > 1) {
          const orClauses = schoolList.map((s) => {
            const ph = p(`%${s.toLowerCase()}%`);
            return `LOWER(edu->>'institution') LIKE ${ph}`;
          });
          conditions.push(`EXISTS (
            SELECT 1 FROM jsonb_array_elements("parsedData"->'education') AS edu
            WHERE ${orClauses.join(' OR ')}
          )`);
        }
      }

      if (company) {
        const companyList = company.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        if (companyList.length === 1) {
          const ph = p(`%${companyList[0].toLowerCase()}%`);
          conditions.push(`EXISTS (
            SELECT 1 FROM jsonb_array_elements("parsedData"->'experience') AS exp
            WHERE LOWER(exp->>'company') LIKE ${ph}
          )`);
        } else if (companyList.length > 1) {
          const orClauses = companyList.map((c) => {
            const ph = p(`%${c.toLowerCase()}%`);
            return `LOWER(exp->>'company') LIKE ${ph}`;
          });
          conditions.push(`EXISTS (
            SELECT 1 FROM jsonb_array_elements("parsedData"->'experience') AS exp
            WHERE ${orClauses.join(' OR ')}
          )`);
        }
      }

      if (country) {
        const ph = p(`%${country.toLowerCase()}%`);
        // Search across address, location in experience, and education
        conditions.push(`(
          LOWER("parsedData"->>'address') LIKE ${ph}
          OR LOWER("parsedData"->>'location') LIKE ${ph}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements("parsedData"->'experience') AS exp
            WHERE LOWER(exp->>'location') LIKE ${ph}
          )
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements("parsedData"->'education') AS edu
            WHERE LOWER(edu->>'institution') LIKE ${ph} OR LOWER(edu->>'location') LIKE ${ph}
          )
        )`);
      }

      if (location) {
        const locationList = location.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        const locClauses = locationList.map((loc) => {
          const ph = p(`%${loc.toLowerCase()}%`);
          return `(
            LOWER("parsedData"->>'address') LIKE ${ph}
            OR LOWER("parsedData"->>'location') LIKE ${ph}
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements("parsedData"->'experience') AS exp
              WHERE LOWER(exp->>'location') LIKE ${ph}
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements("parsedData"->'education') AS edu
              WHERE LOWER(edu->>'location') LIKE ${ph}
            )
          )`;
        });
        conditions.push(`(${locClauses.join(' OR ')})`);
      }

      if (language) {
        const languageList = language.split(',').map((item) => item.trim()).filter(Boolean);
        if (languageList.length > 0) {
          const languageClauses = languageList.map((lang) => {
            const searchTerms = getLanguageFilterTerms(lang);
            return `(${searchTerms.map((term) => {
              const ph = p(`%${term}%`);
              return `(
                EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(COALESCE("parsedData"->'languages', '[]'::jsonb)) AS lang_entry
                  WHERE LOWER(lang_entry->>'language') LIKE ${ph}
                    OR LOWER(lang_entry->>'proficiency') LIKE ${ph}
                )
                OR (
                  jsonb_typeof("parsedData"->'skills') = 'object'
                  AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(COALESCE("parsedData"->'skills'->'languages', '[]'::jsonb)) AS lang_skill
                    WHERE LOWER(lang_skill) LIKE ${ph}
                  )
                )
              )`;
            }).join(' OR ')})`;
          });
          conditions.push(`(${languageClauses.join(' OR ')})`);
        }
      }

      // Run raw SQL to get matching resume IDs
      const sql = `SELECT "id" FROM "Resume" WHERE ${conditions.join(' AND ')}`;
      const matchingRows: Array<{ id: string }> = await prisma.$queryRawUnsafe(sql, ...params);
      const matchingIds = matchingRows.map(r => r.id);

      if (matchingIds.length === 0) {
        // No results — short-circuit
        return res.json({
          success: true,
          data: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
        });
      }
      where.id = { in: matchingIds };
    }

    // Post-query filters for experience years and salary (parsed from stored strings/JSON)
    const needsPostFilter = !!(expYearsMin || expYearsMax || salaryMin || salaryMax);

    const orderBy: Record<string, string> = {};
    if (sortBy === 'name') {
      orderBy.name = sortOrder === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.createdAt = sortOrder === 'asc' ? 'asc' : 'desc';
    }

    const isMinimal = fields === 'minimal';
    const selectFields = isMinimal
      ? {
          id: true,
          name: true,
          currentRole: true,
          experienceYears: true,
          tags: true,
        }
      : {
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
          originalFileKey: true,
          status: true,
          tags: true,
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

    // Minimal mode: return lightweight data immediately (for resume pickers)
    if (isMinimal) {
      return res.json({
        success: true,
        data: resumes,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      });
    }

    // Batch-fetch interview status for all listed resumes
    const resumeIds = resumes.map((r: any) => r.id);
    const interviews = resumeIds.length > 0
      ? await prisma.interview.findMany({
          where: { resumeId: { in: resumeIds } },
          select: { resumeId: true, status: true, scheduledAt: true, completedAt: true, duration: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    // Group interviews by resumeId
    const interviewsByResume = new Map<string, typeof interviews>();
    for (const iv of interviews) {
      if (!iv.resumeId) continue;
      if (!interviewsByResume.has(iv.resumeId)) interviewsByResume.set(iv.resumeId, []);
      interviewsByResume.get(iv.resumeId)!.push(iv);
    }

    // Trim parsedData to only fields needed by the list view
    const trimmedResumes = resumes.map((r: any) => {
      const ivs = interviewsByResume.get(r.id) || [];
      const hasInvited = ivs.some((iv) => iv.status === 'scheduled' || iv.status === 'in_progress');
      const completedIvs = ivs.filter((iv) => iv.status === 'completed');
      const latestCompleted = completedIvs.length > 0 ? completedIvs[0] : null; // already sorted desc

      // Find earliest invitation (scheduled) time
      const scheduledIvs = ivs.filter((iv) => iv.scheduledAt);
      const earliestInvited = scheduledIvs.length > 0 ? scheduledIvs[scheduledIvs.length - 1] : null;
      const { originalFileKey, ...rest } = r;

      return {
        ...rest,
        hasOriginalFile: Boolean(originalFileKey),
        _versionCount: r._count?.resumeVersions || 0,
        _count: undefined,
        hasInvitations: r.resumeJobFits?.some((f: any) => f.pipelineStatus === 'invited') || false,
        interviewStatus: {
          invited: hasInvited || r.resumeJobFits?.some((f: any) => f.pipelineStatus === 'invited') || false,
          invitedAt: earliestInvited?.scheduledAt || null,
          completed: completedIvs.length > 0,
          completedAt: latestCompleted?.completedAt || null,
          durationSeconds: latestCompleted?.duration || null,
        },
        parsedData: r.parsedData ? {
          skills: r.parsedData.skills,
          summary: r.parsedData.summary,
          address: r.parsedData.address,
          location: r.parsedData.location,
          languages: Array.isArray(r.parsedData.languages)
            ? r.parsedData.languages.map((lang: any) => ({
                language: lang.language,
                proficiency: lang.proficiency,
              }))
            : [],
          experience: Array.isArray(r.parsedData.experience)
            ? r.parsedData.experience.map((e: any) => ({
                company: e.company,
                role: e.role || e.title,
                title: e.title || e.role,
                location: e.location,
                employmentType: e.employmentType,
                startDate: e.startDate, endDate: e.endDate, duration: e.duration,
              }))
            : [],
          education: Array.isArray(r.parsedData.education)
            ? r.parsedData.education.map((e: any) => ({
                institution: e.institution,
                degree: e.degree,
                field: e.field,
                location: e.location,
                year: e.year,
                startDate: e.startDate,
                endDate: e.endDate,
              }))
            : [],
        } : null,
      };
    });

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

router.get('/count', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      status = 'active',
      filterUserId,
      filterTeamId,
      teamView,
    } = req.query as Record<string, string>;

    const scope = await getVisibilityScope(req.user!, teamView === 'true');
    const where: Record<string, unknown> = {
      ...await buildAdminOverrideFilter(scope, filterUserId, filterTeamId),
    };

    if (status && status !== 'all') {
      where.status = status;
    }

    const total = await prisma.resume.count({ where });
    return res.json({ success: true, meta: { total } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to count resumes' });
  }
});

// ─── Resume stats ───────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const scope = await getVisibilityScope(req.user!);
    const userFilter = buildUserIdFilter(scope);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [total, thisWeek, analyzed, matchedCount, interviewedCount] = await Promise.all([
      prisma.resume.count({ where: { ...userFilter, status: 'active' } }),
      prisma.resume.count({ where: { ...userFilter, status: 'active', createdAt: { gte: oneWeekAgo } } }),
      prisma.resume.count({ where: { ...userFilter, status: 'active', NOT: { insightData: { equals: Prisma.DbNull } } } }),
      prisma.resume.count({ where: { ...userFilter, status: 'active', resumeJobFits: { some: { pipelineStatus: 'matched' } } } }),
      prisma.resume.count({ where: { ...userFilter, status: 'active', resumeJobFits: { some: { pipelineStatus: 'invited' } } } }),
    ]);

    return res.json({ success: true, data: { total, thisWeek, analyzed, matchedCount, interviewedCount } });
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

    const scope = await getVisibilityScope(req.user!);
    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
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

    const {
      originalFileKey,
      originalFileProvider,
      originalFileChecksum,
      ...rest
    } = resume as typeof resume & {
      originalFileKey?: string | null;
      originalFileProvider?: string | null;
      originalFileChecksum?: string | null;
    };

    return res.json({ success: true, data: { ...rest, hasOriginalFile: Boolean(originalFileKey) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to get resume' });
  }
});

router.get('/:id/original-file', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const scope = await getVisibilityScope(req.user!);
    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
      select: {
        id: true,
        name: true,
        fileName: true,
        fileType: true,
        resumeText: true,
        originalFileProvider: true,
        originalFileKey: true,
        originalFileName: true,
        originalFileMimeType: true,
      },
    });

    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const baseName = (resume.fileName || resume.name || 'resume').replace(/\.[^.]+$/, '').replace(/"/g, '');
    const fileType = (resume.fileType || '').toLowerCase();
    const extension = resume.fileName?.split('.').pop()?.toLowerCase() || '';
    const isPdf = fileType === 'application/pdf' || extension === 'pdf';

    if (resume.originalFileProvider && resume.originalFileKey) {
      try {
        const storedFile = await resumeOriginalFileStorageService.readFile({
          provider: resume.originalFileProvider,
          key: resume.originalFileKey,
          fileName: resume.originalFileName || resume.fileName,
          mimeType: resume.originalFileMimeType || resume.fileType,
        }, req.requestId);

        res.setHeader('Content-Type', storedFile.mimeType || 'application/octet-stream');
        res.setHeader(
          'Content-Disposition',
          buildInlineContentDisposition(storedFile.fileName || resume.fileName || `${baseName || 'resume'}`),
        );
        return res.send(storedFile.buffer);
      } catch (error) {
        logger.warn('RESUMES', 'Stored original resume file unavailable, falling back to reconstructed content', {
          id: req.params.id,
          provider: resume.originalFileProvider,
          key: resume.originalFileKey,
          error: error instanceof Error ? error.message : String(error),
        }, req.requestId);
      }
    }

    if (!resume.resumeText?.trim()) {
      return res.status(400).json({ success: false, error: 'No original resume text available' });
    }

    if (isPdf) {
      const pdfBuffer = await renderResumeTextAsPdf(resume.fileName || resume.name || 'Resume', resume.resumeText);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', buildInlineContentDisposition(`${baseName || 'resume'}.pdf`));
      return res.send(pdfBuffer);
    }

    const contentType = extension === 'md' || extension === 'markdown'
      ? 'text/markdown; charset=utf-8'
      : 'text/plain; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', buildInlineContentDisposition(resume.fileName || `${baseName || 'resume'}.txt`));
    return res.send(resume.resumeText);
  } catch (error) {
    logger.error('RESUMES', 'Failed to stream original resume file', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    }, req.requestId);
    return res.status(500).json({ success: false, error: 'Failed to load original resume file' });
  }
});

// ─── Update resume (tags, notes, status) ────────────────────────────────
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const scope = await getVisibilityScope(req.user!);
    const existing = await prisma.resume.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
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

    const scope = await getVisibilityScope(req.user!);
    const existing = await prisma.resume.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
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

    const scope = await getVisibilityScope(req.user!);
    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
      select: {
        id: true, resumeText: true, name: true,
        originalFileProvider: true, originalFileKey: true,
        originalFileName: true, originalFileMimeType: true,
      },
    });

    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    if (!resume.resumeText) {
      return res.status(400).json({ success: false, error: 'No resume text available for re-parsing' });
    }

    // Re-extract text from original PDF if available (uses improved pdftotext pipeline)
    let resumeText = resume.resumeText;
    let reExtracted = false;
    if (resume.originalFileProvider && resume.originalFileKey) {
      try {
        const { buffer, mimeType } = await resumeOriginalFileStorageService.readFile({
          provider: resume.originalFileProvider,
          key: resume.originalFileKey,
          fileName: resume.originalFileName,
          mimeType: resume.originalFileMimeType,
        }, req.requestId);

        if (mimeType === 'application/pdf' || resume.originalFileName?.toLowerCase().endsWith('.pdf')) {
          const freshText = await pdfService.extractText(buffer, req.requestId);
          if (freshText && freshText.length > 20) {
            resumeText = freshText;
            reExtracted = true;
            logger.info('RESUMES', 'Re-extracted text from original PDF', {
              id: resume.id, oldChars: resume.resumeText.length, newChars: freshText.length,
            }, req.requestId);
          }
        }
      } catch (err) {
        logger.warn('RESUMES', 'Could not re-extract from original file, using stored text', {
          id: resume.id, error: err instanceof Error ? err.message : String(err),
        }, req.requestId);
      }
    }

    // Force fresh parse — call agent directly to bypass DB cache
    const normalizedText = normalizeExtractedText(resumeText);
    const parsed = await resumeParseAgent.parse(normalizedText, req.requestId);

    // Extract metadata
    const name = parsed.name || resume.name || 'Unknown';
    const email = parsed.email || null;
    const phone = parsed.phone || null;
    const currentRole = parsed.experience?.[0]?.role || null;

    // Regenerate summary & highlight from fresh parsed data
    const { summary, highlight } = await generateResumeSummaryHighlight(parsed, req.requestId);

    // Update resume record — also save fresh resumeText if re-extracted from PDF
    await prisma.resume.update({
      where: { id: resume.id },
      data: {
        ...(reExtracted ? { resumeText } : {}),
        parsedData: JSON.parse(JSON.stringify(parsed)),
        name,
        email,
        phone,
        currentRole,
        summary: summary || null,
        highlight: highlight || null,
      },
    });

    logger.info('RESUMES', 'Resume re-parsed (cache bypassed)', {
      id: resume.id, name, reExtracted,
    }, req.requestId);

    res.json({ success: true, data: { parsedData: parsed, name, email, phone, currentRole, summary, highlight } });
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
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

// ─── Delete job match (non-application only) ────────────────────────────
router.delete('/:id/job-matches/:matchId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
      select: { id: true },
    });
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const match = await prisma.jobMatch.findUnique({
      where: { id: req.params.matchId },
      select: { id: true, status: true, resumeId: true },
    });
    if (!match || match.resumeId !== resume.id) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    // Only allow deleting non-application records
    const nonDeletable = ['applied', 'shortlisted', 'invited'];
    if (nonDeletable.includes(match.status)) {
      return res.status(400).json({ success: false, error: 'Cannot delete an active application record' });
    }

    await prisma.jobMatch.delete({ where: { id: req.params.matchId } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete job match error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete job match' });
  }
});

// ─── Generate job fit analysis ──────────────────────────────────────────
router.post('/:id/job-fit', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const existing = await prisma.resume.findFirst({
      where: resumeWhere,
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const { name, email, phone, currentRole, experienceYears, resumeText, parsedData, versionName } = req.body;

    // Auto-snapshot current state before editing
    await prisma.resumeVersion.create({
      data: {
        resumeId: existing.id,
        userId: existing.userId,
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
    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
      select: { id: true },
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const existing = await prisma.resume.findFirst({
      where: resumeWhere,
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const version = await prisma.resumeVersion.findFirst({
      where: { id: req.params.versionId, resumeId: existing.id },
    });
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }

    // Snapshot current state before restoring
    await prisma.resumeVersion.create({
      data: {
        resumeId: existing.id,
        userId: existing.userId,
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
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

// ─── Regenerate AI summary for a resume with optional instructions ─────
router.post('/:id/regenerate-summary', requireAuth, async (req: Request, res: Response) => {
  const requestId = req.requestId;
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const scope = await getVisibilityScope(req.user);
    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
    });
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const parsed = (resume.parsedData || {}) as unknown as ParsedResume;
    const { instructions, jobId } = req.body || {};

    // Fetch job context if provided
    let jobContext = '';
    if (jobId && typeof jobId === 'string') {
      const job = await prisma.job.findFirst({
        where: { id: jobId, ...buildUserIdFilter(scope) },
      });
      if (job) {
        const jdParts: string[] = [`Job Title: ${job.title}`];
        if (job.department) jdParts.push(`Department: ${job.department}`);
        if (job.location) jdParts.push(`Location: ${job.location}`);
        const jdParsed = (job.parsedData || {}) as Record<string, unknown>;
        if (jdParsed.responsibilities) jdParts.push(`Key Responsibilities: ${JSON.stringify(jdParsed.responsibilities).substring(0, 300)}`);
        if (jdParsed.requirements) jdParts.push(`Requirements: ${JSON.stringify(jdParsed.requirements).substring(0, 300)}`);
        if (jdParsed.skills) jdParts.push(`Required Skills: ${JSON.stringify(jdParsed.skills).substring(0, 200)}`);
        if (job.description) jdParts.push(`Job Description:\n${job.description.substring(0, 500)}`);
        jobContext = `\n\nTarget Job:\n${jdParts.join('\n')}`;
      }
    }

    // Build context from parsed resume
    const parts: string[] = [];
    parts.push(`Name: ${parsed.name || resume.name || 'Unknown'}`);
    if (parsed.experience && Array.isArray(parsed.experience) && parsed.experience.length > 0) {
      parts.push('Experience:');
      for (const exp of parsed.experience.slice(0, 5)) {
        const desc = exp.description ? ` — ${String(exp.description).substring(0, 120)}` : '';
        parts.push(`- ${exp.role || ''} at ${exp.company || ''} (${exp.duration || exp.startDate || ''})${desc}`);
      }
    }
    if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
      parts.push('Education:');
      for (const edu of parsed.education.slice(0, 3)) {
        const eduParts = [edu.degree, edu.field, edu.institution].filter(Boolean).join(' ');
        parts.push(`- ${eduParts}`);
      }
    }
    const skills = Array.isArray(parsed.skills)
      ? parsed.skills
      : parsed.skills ? Object.values(parsed.skills).flat().filter(Boolean) : [];
    if (skills.length > 0) {
      parts.push(`Skills: ${skills.slice(0, 20).join(', ')}`);
    }

    const currentSummary = resume.summary || '';
    const userInstructions = instructions && typeof instructions === 'string' && instructions.trim()
      ? `\n\nAdditional instructions from the recruiter:\n${instructions.trim()}`
      : '';

    const jobOptimization = jobContext
      ? `\nIMPORTANT: Tailor the summary specifically for the target job below. Emphasize the candidate's experience, skills, and achievements that are most relevant to this role. Position them as a strong fit for this specific position.`
      : '';

    const prompt = `You are a senior recruiter writing an executive summary of a candidate for a client pitch. Based on this resume data, generate TWO things:
1. An executive summary (3-4 sentences, ~80-120 words) that a recruiter can use to pitch this candidate to a hiring manager. Highlight: notable skills and technical depth, relevant experience and achievements, education (only if prestigious or highly relevant), and what makes this candidate stand out. Write in the SAME LANGUAGE as the candidate's name and experience (if Chinese name/companies, write in Chinese; if English, write in English). Focus on what's impressive and sellable — skip generic filler.${jobOptimization}
2. A one-line highlight (under 60 characters) — the single most compelling selling point of this candidate.
${currentSummary ? `\nCurrent summary (for reference, regenerate a fresh one):\n${currentSummary}` : ''}${userInstructions}${jobContext}

Resume data:
${parts.join('\n')}

Respond ONLY with JSON (no markdown):
{"summary": "...", "highlight": "..."}`;

    const response = await llmService.chat(
      [{ role: 'user', content: prompt }],
      { requestId },
    );

    const text = response.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ success: false, error: 'Failed to parse LLM response' });
    }

    const result = JSON.parse(jsonMatch[0]);
    const newSummary = result.summary || '';
    const newHighlight = result.highlight || '';

    await prisma.resume.update({
      where: { id: resume.id },
      data: { summary: newSummary || null, highlight: newHighlight || null },
    });

    logger.info('RESUME', 'Summary regenerated', { resumeId: resume.id }, requestId);
    res.json({ success: true, data: { summary: newSummary, highlight: newHighlight } });
  } catch (error) {
    logger.error('RESUME', 'Failed to regenerate summary', {
      error: error instanceof Error ? error.message : String(error),
    }, requestId);
    res.status(500).json({ success: false, error: 'Failed to regenerate summary' });
  }
});

// ─── Backfill highlights and low-signal summaries ──────────────────────
router.post('/backfill-highlights', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userId = req.user.id;
    const batchSize = Math.min(200, Math.max(1, Number.parseInt(String(req.body?.limit ?? '50'), 10) || 50));
    const includeLowSignal = req.body?.includeLowSignal !== false;
    const resumes = await prisma.resume.findMany({
      where: {
        userId,
        status: 'active',
      },
      select: { id: true, userId: true, parsedData: true, resumeText: true, summary: true, highlight: true },
      orderBy: { updatedAt: 'desc' },
      take: batchSize,
    });

    const candidates = resumes.filter((resume) => {
      const parsed = (resume.parsedData ?? {}) as unknown as ParsedResume;
      const missingSummary = !resume.summary || !resume.summary.trim();
      const missingHighlight = !resume.highlight || !resume.highlight.trim();
      const lowSignalSummary = includeLowSignal && isResumeSummaryLowSignal(resume.summary, parsed);
      return missingSummary || missingHighlight || lowSignalSummary;
    });

    if (candidates.length === 0) {
      return res.json({ success: true, updated: 0 });
    }

    let updated = 0;
    for (const resume of candidates) {
      const parsed = resume.parsedData
        ? (resume.parsedData as unknown as ParsedResume)
        : (await getOrParseResume(resume.resumeText, resume.userId, req.requestId)).parsedData;
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

    return res.json({ success: true, updated, total: candidates.length, scanned: resumes.length });
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

    const resumeWhere = await buildVisibleResumeWhere(req.user, req.params.id);
    const resume = await prisma.resume.findFirst({
      where: resumeWhere,
    });
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found' });
    }

    const jobScope = await getVisibilityScope(req.user);
    const job = await prisma.job.findFirst({
      where: { id: jobId, ...buildUserIdFilter(jobScope) },
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
