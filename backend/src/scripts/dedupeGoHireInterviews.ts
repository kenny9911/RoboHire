/**
 * Remove duplicate GoHireInterview records.
 * Duplicates = same candidateName + videoUrl.
 * Keeps the record with the most data (evaluation, transcript, etc.), or the newest.
 *
 * Usage: npx tsx src/scripts/dedupeGoHireInterviews.ts [--dry-run]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'backend', '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

function richness(row: {
  evaluationData: unknown;
  transcript: string | null;
  parsedResumeText: string | null;
  updatedAt: Date;
}): number {
  let score = 0;
  if (row.evaluationData) score += 10;
  if (row.transcript) score += 5;
  if (row.parsedResumeText) score += 2;
  return score;
}

async function main() {
  const totalBefore = await prisma.goHireInterview.count();
  console.log(`Total records before: ${totalBefore}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Find all duplicate groups
  const dupeGroups = await prisma.$queryRaw<
    Array<{ candidateName: string; videoUrl: string | null; cnt: bigint }>
  >`
    SELECT "candidateName", "videoUrl", COUNT(*) as cnt
    FROM "GoHireInterview"
    GROUP BY "candidateName", "videoUrl"
    HAVING COUNT(*) > 1
  `;

  console.log(`\nDuplicate groups: ${dupeGroups.length}`);

  let totalDeleted = 0;
  const batchSize = 100;

  for (let i = 0; i < dupeGroups.length; i += batchSize) {
    const batch = dupeGroups.slice(i, i + batchSize);
    const idsToDelete: string[] = [];

    for (const group of batch) {
      // Fetch all records in this group
      const records = await prisma.goHireInterview.findMany({
        where: {
          candidateName: group.candidateName,
          videoUrl: group.videoUrl,
        },
        select: {
          id: true,
          evaluationData: true,
          transcript: true,
          parsedResumeText: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      // Sort: richest data first, then newest
      records.sort((a, b) => {
        const diff = richness(b) - richness(a);
        if (diff !== 0) return diff;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      // Keep the first (best), delete the rest
      for (let j = 1; j < records.length; j++) {
        idsToDelete.push(records[j].id);
      }
    }

    if (idsToDelete.length > 0) {
      if (!dryRun) {
        await prisma.goHireInterview.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }
      totalDeleted += idsToDelete.length;
    }

    if ((i + batchSize) % 500 === 0 || i + batchSize >= dupeGroups.length) {
      console.log(`  Processed ${Math.min(i + batchSize, dupeGroups.length)}/${dupeGroups.length} groups, deleted ${totalDeleted} so far`);
    }
  }

  console.log(`\nTotal deleted: ${totalDeleted}`);

  if (!dryRun) {
    const totalAfter = await prisma.goHireInterview.count();
    console.log(`Total records after: ${totalAfter}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
