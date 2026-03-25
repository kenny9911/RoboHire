/**
 * Test the ResumeParseAgent heuristic fallback against extracted text.
 * Verifies name, company, and role extraction without calling the LLM.
 *
 * Usage:
 *   npx tsx src/scripts/testResumeParse.ts <pdf-path>
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'backend', '.env') });

import { pdfService } from '../services/PDFService.js';
import { ResumeParseAgent } from '../agents/ResumeParseAgent.js';

const green = (t: string) => `\x1b[32m${t}\x1b[0m`;
const red = (t: string) => `\x1b[31m${t}\x1b[0m`;
const bold = (t: string) => `\x1b[1m${t}\x1b[0m`;
const dim = (t: string) => `\x1b[2m${t}\x1b[0m`;

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.log('Usage: npx tsx src/scripts/testResumeParse.ts <pdf-path>');
    process.exit(1);
  }

  const resolved = path.resolve(pdfPath);
  if (!fs.existsSync(resolved)) {
    console.error(red(`File not found: ${resolved}`));
    process.exit(1);
  }

  // Extract text
  const buffer = fs.readFileSync(resolved);
  console.log(bold('Extracting text...'));
  const text = await pdfService.extractText(buffer, 'test');

  // Use the heuristic fallback to test name/experience extraction
  // We pass an empty parsed result to trigger the heuristic path
  const agent = new ResumeParseAgent();
  const emptyParsed = {
    name: '', email: '', phone: '',
    skills: [], experience: [], education: [],
    summary: '',
  };
  // Access the private method via type assertion for testing
  const heuristic = (agent as any).buildHeuristicFallback(text, emptyParsed);

  console.log(`\n${bold('Heuristic parsing results:')}`);
  console.log(dim('─'.repeat(50)));

  // Name
  console.log(`${bold('Name:')} ${heuristic.name || red('(empty)')}`);
  console.log(`${bold('Email:')} ${heuristic.email || dim('(empty)')}`);
  console.log(`${bold('Phone:')} ${heuristic.phone || dim('(empty)')}`);

  // Experience
  if (heuristic.experience?.length > 0) {
    console.log(`\n${bold('Experience:')} ${heuristic.experience.length} entries`);
    for (const exp of heuristic.experience) {
      console.log(`  ${bold('Company:')} ${exp.company || red('(empty)')}`);
      console.log(`  ${bold('Role:')} ${exp.role || dim('(empty)')}`);
      console.log(`  ${bold('Dates:')} ${exp.startDate} - ${exp.endDate}`);
      console.log(`  ${bold('Type:')} ${exp.employmentType || 'full-time'}`);
      console.log(`  ${dim('Description:')} ${(exp.description || '').substring(0, 80)}...`);
      console.log();
    }
  } else {
    console.log(`\n${red('No experience entries extracted')}`);
  }

  // Summary check
  if (heuristic.summary) {
    console.log(`${bold('Summary:')} ${heuristic.summary.substring(0, 100)}...`);
  }
}

main().catch((err) => {
  console.error(red(`Fatal: ${err.message}`));
  process.exit(1);
});
