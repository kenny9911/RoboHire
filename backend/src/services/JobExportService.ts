import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(__dirname, '..', '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'NotoSansSC-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'NotoSansSC-Bold.ttf');

type ExportableJob = {
  title: string;
  companyName?: string | null;
  department?: string | null;
  location?: string | null;
  workType?: string | null;
  employmentType?: string | null;
  experienceLevel?: string | null;
  education?: string | null;
  headcount?: number;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  salaryText?: string | null;
  description?: string | null;
  qualifications?: string | null;
  hardRequirements?: string | null;
  niceToHave?: string | null;
  benefits?: string | null;
  interviewRequirements?: string | null;
  evaluationRules?: string | null;
  notes?: string | null;
  locations?: Array<{ country?: string; city?: string }> | null;
  status?: string;
  createdAt?: Date | string;
};

function salaryString(job: ExportableJob): string {
  if (job.salaryText) return job.salaryText;
  if (job.salaryMin === 0 && job.salaryMax === 0) return 'Negotiable';
  if (job.salaryMin || job.salaryMax) {
    const currency = job.salaryCurrency || 'USD';
    const period = job.salaryPeriod === 'yearly' ? '/year' : '/month';
    const min = job.salaryMin?.toLocaleString() || '—';
    const max = job.salaryMax?.toLocaleString() || '—';
    return `${currency} ${min} – ${max}${period}`;
  }
  return '';
}

function locationString(job: ExportableJob): string {
  if (job.locations && Array.isArray(job.locations) && job.locations.length > 0) {
    return job.locations.map((l) => [l.city, l.country].filter(Boolean).join(', ')).join(' | ');
  }
  return job.location || '';
}

function metaTags(job: ExportableJob): string[] {
  const tags: string[] = [];
  const loc = locationString(job);
  if (loc) tags.push(loc);
  if (job.workType) tags.push(job.workType);
  if (job.employmentType) tags.push(job.employmentType);
  if (job.experienceLevel) tags.push(job.experienceLevel);
  if (job.education) tags.push(job.education.replace(/_/g, ' '));
  const salary = salaryString(job);
  if (salary) tags.push(salary);
  if (job.headcount && job.headcount > 1) tags.push(`Headcount: ${job.headcount}`);
  return tags;
}

// ─── Plain text ────────────────────────────────────────
export function jobToText(job: ExportableJob): string {
  const lines: string[] = [];
  lines.push(job.title);
  if (job.companyName) lines.push(job.companyName);
  lines.push('');

  const tags = metaTags(job);
  if (tags.length) lines.push(tags.join('  |  '));
  lines.push('');

  if (job.description) {
    lines.push('Description');
    lines.push('-'.repeat(40));
    lines.push(job.description);
    lines.push('');
  }
  if (job.qualifications) {
    lines.push('Qualifications');
    lines.push('-'.repeat(40));
    lines.push(job.qualifications);
    lines.push('');
  }
  if (job.hardRequirements) {
    lines.push('Hard Requirements');
    lines.push('-'.repeat(40));
    lines.push(job.hardRequirements);
    lines.push('');
  }
  if (job.niceToHave) {
    lines.push('Nice to Have');
    lines.push('-'.repeat(40));
    lines.push(job.niceToHave);
    lines.push('');
  }
  if (job.benefits) {
    lines.push('Benefits');
    lines.push('-'.repeat(40));
    lines.push(job.benefits);
    lines.push('');
  }
  if (job.interviewRequirements) {
    lines.push('Interview Requirements');
    lines.push('-'.repeat(40));
    lines.push(job.interviewRequirements);
    lines.push('');
  }
  if (job.notes) {
    lines.push('Notes');
    lines.push('-'.repeat(40));
    lines.push(job.notes);
    lines.push('');
  }
  return lines.join('\n').trim();
}

// ─── Markdown ──────────────────────────────────────────
export function jobToMarkdown(job: ExportableJob): string {
  const lines: string[] = [];
  lines.push(`# ${job.title}`);
  if (job.companyName) lines.push(`**${job.companyName}**`);
  lines.push('');

  const tags = metaTags(job);
  if (tags.length) lines.push(tags.join(' · '));
  lines.push('');

  if (job.description) {
    lines.push('## Description');
    lines.push(job.description);
    lines.push('');
  }
  if (job.qualifications) {
    lines.push('## Qualifications');
    lines.push(job.qualifications);
    lines.push('');
  }
  if (job.hardRequirements) {
    lines.push('## Hard Requirements');
    lines.push(job.hardRequirements);
    lines.push('');
  }
  if (job.niceToHave) {
    lines.push('## Nice to Have');
    lines.push(job.niceToHave);
    lines.push('');
  }
  if (job.benefits) {
    lines.push('## Benefits');
    lines.push(job.benefits);
    lines.push('');
  }
  if (job.interviewRequirements) {
    lines.push('## Interview Requirements');
    lines.push(job.interviewRequirements);
    lines.push('');
  }
  if (job.notes) {
    lines.push('## Notes');
    lines.push(job.notes);
    lines.push('');
  }
  return lines.join('\n').trim();
}

// ─── PDF ───────────────────────────────────────────────
export function jobToPdf(job: ExportableJob): PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

  doc.registerFont('NotoSans', FONT_REGULAR);
  doc.registerFont('NotoSansBold', FONT_BOLD);

  const PAGE_WIDTH = doc.page.width - 100; // 50 margin each side

  // Title
  doc.font('NotoSansBold').fontSize(20).text(job.title, { width: PAGE_WIDTH });
  if (job.companyName) {
    doc.moveDown(0.3);
    doc.font('NotoSans').fontSize(12).fillColor('#666666').text(job.companyName, { width: PAGE_WIDTH });
  }

  // Meta tags
  const tags = metaTags(job);
  if (tags.length) {
    doc.moveDown(0.5);
    doc.font('NotoSans').fontSize(9).fillColor('#888888').text(tags.join('  |  '), { width: PAGE_WIDTH });
  }

  doc.moveDown(1);
  doc.fillColor('#000000');

  const addSection = (title: string, content: string) => {
    if (!content) return;
    // Check if we need a new page (less than 80pt remaining)
    if (doc.y > doc.page.height - 130) {
      doc.addPage();
    }
    doc.font('NotoSansBold').fontSize(13).text(title, { width: PAGE_WIDTH });
    doc.moveDown(0.3);
    doc.font('NotoSans').fontSize(10).text(content, { width: PAGE_WIDTH, lineGap: 3 });
    doc.moveDown(0.8);
  };

  if (job.description) addSection('Description', job.description);
  if (job.qualifications) addSection('Qualifications', job.qualifications);
  if (job.hardRequirements) addSection('Hard Requirements', job.hardRequirements);
  if (job.niceToHave) addSection('Nice to Have', job.niceToHave);
  if (job.benefits) addSection('Benefits', job.benefits);
  if (job.interviewRequirements) addSection('Interview Requirements', job.interviewRequirements);
  if (job.notes) addSection('Notes', job.notes);

  return doc;
}
