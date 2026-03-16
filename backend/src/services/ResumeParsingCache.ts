import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { normalizeExtractedText } from './ResumeParserService.js';
import { logger } from './LoggerService.js';
import { isParsedResumeLikelyIncomplete } from './ResumeParseValidation.js';
import { resumeParseAgent } from '../agents/ResumeParseAgent.js';

export function computeResumeHash(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * DB-first resume parsing: checks the database for an existing parsed resume
 * by content hash before calling the LLM. Returns cached data when available.
 */
export async function getOrParseResume(
  resumeText: string,
  userId: string | null,
  requestId?: string,
): Promise<{ parsedData: any; cached: boolean }> {
  const contentHash = computeResumeHash(resumeText);

  // Check DB for existing parsed resume
  if (userId) {
    const existing = await prisma.resume.findUnique({
      where: { userId_contentHash: { userId, contentHash } },
      select: { parsedData: true },
    });
    if (existing?.parsedData && !isParsedResumeLikelyIncomplete(existing.parsedData, resumeText)) {
      return { parsedData: existing.parsedData, cached: true };
    }
    if (existing?.parsedData) {
      logger.warn('RESUME_PARSE_CACHE', 'Ignoring sparse user-scoped cached resume parse', {
        userId,
        contentHash,
      }, requestId);
    }
  }

  // Global fallback: check any user's resume with same content hash
  const globalMatch = await prisma.resume.findFirst({
    where: { contentHash, parsedData: { not: Prisma.DbNull } },
    select: { parsedData: true },
  });
  if (globalMatch?.parsedData && !isParsedResumeLikelyIncomplete(globalMatch.parsedData, resumeText)) {
    return { parsedData: globalMatch.parsedData, cached: true };
  }
  if (globalMatch?.parsedData) {
    logger.warn('RESUME_PARSE_CACHE', 'Ignoring sparse global cached resume parse', {
      contentHash,
    }, requestId);
  }

  // No cache hit — parse via ResumeParseAgent (detailed prompt + validation + retry)
  const normalizedText = normalizeExtractedText(resumeText);
  const parsedData = await resumeParseAgent.parse(normalizedText, requestId);
  return { parsedData, cached: false };
}
