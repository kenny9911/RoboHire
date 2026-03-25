/**
 * Backfill missing or low-signal resume summaries/highlights.
 *
 * Usage:
 *   npx tsx src/scripts/backfillResumeSummaries.ts --dry-run
 *   npx tsx src/scripts/backfillResumeSummaries.ts --apply --limit=50
 *   npx tsx src/scripts/backfillResumeSummaries.ts --dry-run --user-id=<userId>
 *   npx tsx src/scripts/backfillResumeSummaries.ts --dry-run --resume-id=<resumeId>
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'backend', '.env') });

import { prisma } from '../lib/prisma.js';
import { getOrParseResume } from '../services/ResumeParsingCache.js';
import {
  generateResumeSummaryHighlight,
  isResumeSummaryLowSignal,
} from '../services/ResumeSummaryService.js';
import type { ParsedResume } from '../types/index.js';

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type ResumeRow = {
  id: string;
  userId: string;
  name: string;
  summary: string | null;
  highlight: string | null;
  parsedData: unknown;
  resumeText: string;
  updatedAt: Date;
};

async function main() {
  const apply = hasFlag('apply');
  const dryRun = !apply || hasFlag('dry-run');
  const limit = parsePositiveInt('limit', 50);
  const scanLimit = parsePositiveInt('scan-limit', Math.max(limit * 4, 200));
  const userId = readArg('user-id');
  const resumeId = readArg('resume-id');

  const where: Record<string, unknown> = {
    status: 'active',
  };
  if (userId) where.userId = userId;
  if (resumeId) where.id = resumeId;

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Scan limit: ${scanLimit}`);
  console.log(`Update limit: ${limit}`);
  if (userId) console.log(`User scope: ${userId}`);
  if (resumeId) console.log(`Resume scope: ${resumeId}`);
  console.log();

  const resumes = await prisma.resume.findMany({
    where,
    select: {
      id: true,
      userId: true,
      name: true,
      summary: true,
      highlight: true,
      parsedData: true,
      resumeText: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: scanLimit,
  });

  const candidates: ResumeRow[] = [];
  for (const resume of resumes) {
    const parsed = (resume.parsedData ?? {}) as unknown as ParsedResume;
    const missingSummary = !resume.summary || !resume.summary.trim();
    const missingHighlight = !resume.highlight || !resume.highlight.trim();
    const lowSignalSummary = isResumeSummaryLowSignal(resume.summary, parsed);
    if (missingSummary || missingHighlight || lowSignalSummary) {
      candidates.push(resume);
    }
    if (candidates.length >= limit) break;
  }

  console.log(`Scanned: ${resumes.length}`);
  console.log(`Candidates needing repair: ${candidates.length}`);

  if (candidates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  console.log('\nSample candidates:');
  for (const resume of candidates.slice(0, 10)) {
    const preview = (resume.summary || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    console.log(`- ${resume.name} (${resume.id}) :: ${preview || '<missing summary>'}`);
  }

  if (dryRun) {
    console.log('\nDry run complete. No database changes made.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const resume of candidates) {
    const parsed = resume.parsedData
      ? (resume.parsedData as unknown as ParsedResume)
      : (await getOrParseResume(resume.resumeText, resume.userId, 'resume-summary-backfill-script')).parsedData;
    const { summary, highlight } = await generateResumeSummaryHighlight(parsed, 'resume-summary-backfill-script');

    if (!summary && !highlight) {
      continue;
    }

    await prisma.resume.update({
      where: { id: resume.id },
      data: {
        summary: summary || null,
        highlight: highlight || null,
      },
    });
    updated += 1;
    console.log(`Updated ${resume.name} (${resume.id})`);
  }

  console.log(`\nBackfill complete. Updated ${updated} resumes.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
