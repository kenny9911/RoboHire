/**
 * Force re-parse a resume by ID.
 * Usage: npx tsx src/scripts/forceReparse.ts <resumeId>
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'backend', '.env') });

import { prisma } from '../lib/prisma.js';
import { normalizeExtractedText } from '../services/ResumeParserService.js';
import { resumeParseAgent } from '../agents/ResumeParseAgent.js';

async function main() {
  const resumeId = process.argv[2];
  if (!resumeId) {
    console.error('Usage: npx tsx src/scripts/forceReparse.ts <resumeId>');
    process.exit(1);
  }

  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
    select: { id: true, resumeText: true, name: true },
  });

  if (!resume || !resume.resumeText) {
    console.error('Resume not found or no text:', resumeId);
    process.exit(1);
  }

  console.log(`Re-parsing resume: ${resume.name} (${resumeId})`);
  console.log(`Text length: ${resume.resumeText.length}`);

  const normalized = normalizeExtractedText(resume.resumeText);
  const parsed = await resumeParseAgent.parse(normalized, 'force-reparse');

  console.log('\n=== Parsed education ===');
  console.log(JSON.stringify(parsed.education, null, 2));
  console.log('\n=== Parsed experience (first 2) ===');
  for (const exp of (parsed.experience || []).slice(0, 2)) {
    console.log(`  company: ${exp.company}, role: ${exp.role}`);
  }

  const name = parsed.name || resume.name || 'Unknown';
  const email = parsed.email || null;
  const phone = parsed.phone || null;
  const currentRole = parsed.experience?.[0]?.role || null;

  await prisma.resume.update({
    where: { id: resumeId },
    data: {
      parsedData: JSON.parse(JSON.stringify(parsed)),
      name,
      email,
      phone,
      currentRole,
    },
  });

  console.log('\nDB updated successfully.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
