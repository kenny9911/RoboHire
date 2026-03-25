/**
 * PDF Extraction Test Script
 *
 * Tests the PDFService extraction pipeline against local PDF files and
 * validates that key expected content (names, companies, schools, etc.)
 * appears in the extracted text.
 *
 * Usage:
 *   # Test a single PDF with expected keywords:
 *   npx tsx src/scripts/testPdfExtraction.ts <pdf-path> [keyword1] [keyword2] ...
 *
 *   # Test all resume PDFs in storage (no keywords check, just quality):
 *   npx tsx src/scripts/testPdfExtraction.ts --all
 *
 *   # Show full extracted text for a single PDF:
 *   npx tsx src/scripts/testPdfExtraction.ts <pdf-path> --verbose
 *
 * Examples:
 *   npx tsx src/scripts/testPdfExtraction.ts ./resume.pdf 蔚来汽车 武汉大学 崔晋闻
 *   npx tsx src/scripts/testPdfExtraction.ts --all
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'backend', '.env') });

import { pdfService } from '../services/PDFService.js';

// ── Helpers ──────────────────────────────────────────────────────────

function colorize(text: string, code: number): string {
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = (t: string) => colorize(t, 32);
const red = (t: string) => colorize(t, 31);
const yellow = (t: string) => colorize(t, 33);
const dim = (t: string) => colorize(t, 2);
const bold = (t: string) => colorize(t, 1);

interface TestResult {
  file: string;
  chars: number;
  qualityOk: boolean;
  keywordResults: { keyword: string; found: boolean }[];
  error?: string;
}

async function testSinglePdf(
  pdfPath: string,
  keywords: string[],
  verbose: boolean,
): Promise<TestResult> {
  const basename = path.basename(pdfPath);
  const buffer = fs.readFileSync(pdfPath);

  const result: TestResult = {
    file: basename,
    chars: 0,
    qualityOk: false,
    keywordResults: [],
  };

  try {
    const text = await pdfService.extractText(buffer, `test-${basename}`);
    result.chars = text.length;
    result.qualityOk = pdfService.isExtractionQualityGood(text);

    for (const kw of keywords) {
      result.keywordResults.push({
        keyword: kw,
        found: text.includes(kw),
      });
    }

    if (verbose) {
      console.log(`\n${dim('─'.repeat(60))}`);
      console.log(bold(`Extracted text (${text.length} chars):`));
      console.log(dim('─'.repeat(60)));
      console.log(text);
      console.log(dim('─'.repeat(60)));
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

function printResult(r: TestResult): void {
  const status = r.error
    ? red('ERROR')
    : r.qualityOk
      ? green('PASS')
      : yellow('WARN');

  console.log(`\n${status}  ${bold(r.file)}  (${r.chars} chars)`);

  if (r.error) {
    console.log(`  ${red('Error:')} ${r.error}`);
    return;
  }

  if (!r.qualityOk) {
    console.log(`  ${yellow('Quality check failed — text may be garbled or incomplete')}`);
  }

  if (r.keywordResults.length > 0) {
    const passed = r.keywordResults.filter((k) => k.found).length;
    const total = r.keywordResults.length;
    const allOk = passed === total;
    console.log(
      `  Keywords: ${allOk ? green(`${passed}/${total}`) : red(`${passed}/${total}`)}`,
    );
    for (const kr of r.keywordResults) {
      const icon = kr.found ? green('✓') : red('✗');
      console.log(`    ${icon} ${kr.keyword}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const runAll = args.includes('--all');
  const filteredArgs = args.filter((a) => a !== '--verbose' && a !== '--all');

  if (!runAll && filteredArgs.length === 0) {
    console.log('Usage:');
    console.log('  npx tsx src/scripts/testPdfExtraction.ts <pdf-path> [keyword1] [keyword2] ...');
    console.log('  npx tsx src/scripts/testPdfExtraction.ts --all');
    console.log('  npx tsx src/scripts/testPdfExtraction.ts <pdf-path> --verbose');
    process.exit(1);
  }

  const results: TestResult[] = [];

  if (runAll) {
    // Find all PDFs in resume storage
    const storageDir = path.join(repoRoot, 'backend', 'storage', 'resume-originals');
    const pattern = path.join(storageDir, '**', '*.pdf');
    const pdfFiles = await glob(pattern);

    if (pdfFiles.length === 0) {
      console.log(yellow('No PDFs found in storage. Upload some resumes first.'));
      process.exit(0);
    }

    console.log(bold(`Testing ${pdfFiles.length} PDF(s) from storage...\n`));

    for (const pdfPath of pdfFiles) {
      const r = await testSinglePdf(pdfPath, [], verbose);
      results.push(r);
      printResult(r);
    }
  } else {
    // Single PDF with optional keywords
    const pdfPath = path.resolve(filteredArgs[0]);
    if (!fs.existsSync(pdfPath)) {
      console.error(red(`File not found: ${pdfPath}`));
      process.exit(1);
    }

    const keywords = filteredArgs.slice(1);
    const r = await testSinglePdf(pdfPath, keywords, verbose);
    results.push(r);
    printResult(r);
  }

  // Summary
  console.log(`\n${dim('─'.repeat(60))}`);
  const total = results.length;
  const errors = results.filter((r) => r.error).length;
  const qualityFails = results.filter((r) => !r.qualityOk && !r.error).length;
  const keywordFails = results.filter(
    (r) => r.keywordResults.some((k) => !k.found),
  ).length;
  const allGood = errors === 0 && qualityFails === 0 && keywordFails === 0;

  console.log(
    `${bold('Summary:')} ${total} PDF(s) tested — ` +
      `${errors > 0 ? red(`${errors} error(s)`) : green('0 errors')}, ` +
      `${qualityFails > 0 ? yellow(`${qualityFails} quality warn(s)`) : green('0 quality warns')}, ` +
      `${keywordFails > 0 ? red(`${keywordFails} keyword fail(s)`) : green('0 keyword fails')}`,
  );

  process.exit(allGood ? 0 : 1);
}

main().catch((err) => {
  console.error(red(`Fatal: ${err.message}`));
  process.exit(1);
});
