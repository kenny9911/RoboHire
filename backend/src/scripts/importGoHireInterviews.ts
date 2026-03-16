/**
 * Import GoHire interviews from CSV into the GoHireInterview Prisma table.
 *
 * Usage:
 *   npx tsx src/scripts/importGoHireInterviews.ts [path-to-csv] [--dry-run]
 *
 * If no CSV path is provided, defaults to the repo-root CSV file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import dotenv from 'dotenv';

// Load env from repo root, then backend-local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'backend', '.env') });

import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function emptyToNull(val: string | undefined): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = val.trim();
  return trimmed === '' ? null : trimmed;
}

function parseDate(val: string | undefined): Date | null {
  const s = emptyToNull(val);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseIntVal(val: string | undefined): number | null {
  const s = emptyToNull(val);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

interface CsvRow {
  [key: string]: string;
}

/**
 * Find a value in a CSV row by trying multiple possible column names.
 * Handles leading/trailing spaces in column headers.
 */
function getCol(row: CsvRow, ...names: string[]): string | undefined {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
    // Try with leading/trailing space variants
    if (row[` ${name}`] !== undefined) return row[` ${name}`];
    if (row[`${name} `] !== undefined) return row[`${name} `];
  }
  return undefined;
}

function rowToRecord(row: CsvRow) {
  const gohireUserId = emptyToNull(row['gohire_user_id']);
  if (!gohireUserId) return null;

  // Interview start time — try new column name, then fall back
  const interviewDatetime = parseDate(getCol(row, '面试开始时间'));
  if (!interviewDatetime) return null; // required field

  return {
    gohireUserId,
    candidateName: emptyToNull(row['gohire_user_name']) ?? 'Unknown',
    candidateEmail: emptyToNull(getCol(row, '用户邮箱（登录名称）')),
    interviewDatetime,
    interviewEndDatetime: parseDate(getCol(row, '面试结束时间')),
    duration: parseIntVal(row['gohire_interview_datetime']), // Column reused for duration (minutes)
    videoUrl: emptyToNull(row['gohire_interview_video_filepath']),
    recruiterName: emptyToNull(row['gohire_recruiter_name']),
    recruiterEmail: emptyToNull(row['gohire_recruiter_email']),
    recruiterId: emptyToNull(getCol(row, 'hrid')),
    jobTitle: emptyToNull(getCol(row, '职位名称')),
    jobDescription: emptyToNull(getCol(row, '职位描述')),
    jobRequirements: emptyToNull(getCol(row, '任职要求')),
    interviewRequirements: emptyToNull(getCol(row, '面试要求')),
    resumeUrl: emptyToNull(getCol(row, '简历下载地址')),
    transcriptUrl: emptyToNull(getCol(row, '面试记录下载地址')),
    lastLoginAt: parseDate(getCol(row, '最近登录时间')),
    invitedAt: parseDate(getCol(row, '邀约时间')),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const csvPath =
    args.find((a) => !a.startsWith('--')) ??
    path.join(repoRoot, 'gohire_interview_list_all_20260316_2026.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`CSV file: ${csvPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE IMPORT'}`);
  console.log();

  // Parse CSV
  const records: ReturnType<typeof rowToRecord>[] = [];
  let skipped = 0;

  const parser = fs.createReadStream(csvPath, 'utf-8').pipe(
    parse({
      columns: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      bom: true,
    })
  );

  for await (const row of parser) {
    const record = rowToRecord(row as CsvRow);
    if (record) {
      records.push(record);
    } else {
      skipped++;
    }
  }

  console.log(`Parsed ${records.length} valid records (${skipped} skipped)`);

  if (dryRun) {
    // Show sample
    if (records.length > 0) {
      const sample = records[0]!;
      console.log('\nSample record:');
      console.log(`  name: ${sample.candidateName}`);
      console.log(`  email: ${sample.candidateEmail}`);
      console.log(`  datetime: ${sample.interviewDatetime}`);
      console.log(`  duration: ${sample.duration}`);
      console.log(`  videoUrl: ${sample.videoUrl?.substring(0, 80)}`);
      console.log(`  resumeUrl: ${sample.resumeUrl?.substring(0, 80)}`);
      console.log(`  transcriptUrl: ${sample.transcriptUrl?.substring(0, 80)}`);
      console.log(`  jobTitle: ${sample.jobTitle}`);
    }
    console.log('\nDry run complete. No database changes made.');
    await prisma.$disconnect();
    return;
  }

  // Check for --resume flag to skip delete and continue from where we left off
  const resumeMode = args.includes('--resume');

  if (!resumeMode) {
    // Clear existing records (full overwrite)
    const existingCount = await prisma.goHireInterview.count();
    if (existingCount > 0) {
      console.log(`Deleting ${existingCount} existing GoHireInterview records...`);
      await prisma.goHireInterview.deleteMany();
      console.log('Existing records cleared.');
    }
  } else {
    const existingCount = await prisma.goHireInterview.count();
    console.log(`Resume mode: ${existingCount} records already in DB`);
  }

  // Import in batches — small batch + delay to avoid Neon connection pool exhaustion
  const BATCH_SIZE = 20;
  let imported = 0;
  let skippedDuplicates = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE) as Exclude<
      ReturnType<typeof rowToRecord>,
      null
    >[];

    let retries = 5;
    while (retries > 0) {
      try {
        const result = await prisma.goHireInterview.createMany({
          data: batch,
          skipDuplicates: true,
        });
        skippedDuplicates += batch.length - result.count;
        imported += result.count;
        break;
      } catch (err: any) {
        retries--;
        if (retries === 0) throw err;
        const delay = retries <= 2 ? 5000 : 3000;
        console.warn(`  Batch failed (${err.code}), retrying in ${delay / 1000}s... (${retries} left)`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Small delay between batches to avoid overwhelming Neon
    if (i + BATCH_SIZE < records.length) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const total = imported + skippedDuplicates;
    if (total % 500 < BATCH_SIZE || i + BATCH_SIZE >= records.length) {
      console.log(`Progress: ${imported} inserted, ${skippedDuplicates} skipped / ${records.length} total`);
    }
  }

  console.log();
  console.log(`Import complete. ${imported} records inserted.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Import failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
