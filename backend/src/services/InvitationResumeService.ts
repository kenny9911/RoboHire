import prisma from '../lib/prisma.js';
import type {
  ParsedResume,
  SkillsDetailed,
  WorkExperience,
  Project,
  Education,
  Certification,
  Award,
  LanguageSkill,
  VolunteerWork,
} from '../types/index.js';
import { computeResumeHash } from './ResumeParsingCache.js';
import { isParsedResumeLikelyIncomplete, summarizeParsedResumeCoverage } from './ResumeParseValidation.js';
import { logger } from './LoggerService.js';

export type InvitationResumeSource = 'provided_parsedData' | 'stored_parsedData' | 'raw_resume';

export interface ResolvedInvitationResume {
  resumeText: string;
  source: InvitationResumeSource;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function addField(lines: string[], label: string, value?: string | null) {
  if (hasText(value)) {
    lines.push(`${label}: ${normalizeText(value)}`);
  }
}

function addList(lines: string[], values: Array<string | undefined | null>, prefix = '- ') {
  values
    .filter(hasText)
    .map((value) => normalizeText(value))
    .forEach((value) => lines.push(`${prefix}${value}`));
}

function addSection(target: string[], title: string, lines: string[]) {
  if (lines.length === 0) return;
  if (target.length > 0 && target[target.length - 1] !== '') {
    target.push('');
  }
  target.push(title);
  target.push(...lines);
}

function formatSkills(skills: ParsedResume['skills'] | undefined): string[] {
  if (!skills) return [];
  if (Array.isArray(skills)) {
    const values = skills.filter(hasText).map((item) => normalizeText(item));
    return values.length > 0 ? [`- ${values.join(', ')}`] : [];
  }

  const skillGroups: Array<[string, string[] | undefined]> = [
    ['Technical', (skills as SkillsDetailed).technical],
    ['Soft', (skills as SkillsDetailed).soft],
    ['Languages', (skills as SkillsDetailed).languages],
    ['Tools', (skills as SkillsDetailed).tools],
    ['Frameworks', (skills as SkillsDetailed).frameworks],
    ['Other', (skills as SkillsDetailed).other],
  ];

  return skillGroups
    .map(([label, entries]) => {
      const values = (entries || []).filter(hasText).map((item) => normalizeText(item));
      return values.length > 0 ? `${label}: ${values.join(', ')}` : '';
    })
    .filter(hasText);
}

function buildDateRange(start?: string, end?: string, duration?: string): string {
  const normalizedStart = hasText(start) ? normalizeText(start) : '';
  const normalizedEnd = hasText(end) ? normalizeText(end) : '';
  if (normalizedStart && normalizedEnd) return `${normalizedStart} - ${normalizedEnd}`;
  if (normalizedStart) return normalizedStart;
  if (normalizedEnd) return normalizedEnd;
  return hasText(duration) ? normalizeText(duration) : '';
}

function formatExperience(experience: WorkExperience[] | undefined): string[] {
  if (!Array.isArray(experience) || experience.length === 0) return [];

  return experience.flatMap((entry, index) => {
    const lines: string[] = [`${index + 1}.`];
    addField(lines, 'Company', entry.company);
    addField(lines, 'Role', entry.role);
    addField(lines, 'Location', entry.location);
    addField(lines, 'Period', buildDateRange(entry.startDate, entry.endDate, entry.duration));
    addField(lines, 'Employment Type', entry.employmentType || '');
    addField(lines, 'Description', entry.description);
    if (Array.isArray(entry.achievements) && entry.achievements.some(hasText)) {
      lines.push('Achievements:');
      addList(lines, entry.achievements);
    }
    if (Array.isArray(entry.technologies) && entry.technologies.some(hasText)) {
      lines.push(`Technologies: ${entry.technologies.filter(hasText).map((item) => normalizeText(item)).join(', ')}`);
    }
    lines.push('');
    return lines;
  }).filter((line, index, arr) => !(line === '' && arr[index - 1] === ''));
}

function formatProjects(projects: Project[] | undefined): string[] {
  if (!Array.isArray(projects) || projects.length === 0) return [];

  return projects.flatMap((entry, index) => {
    const lines: string[] = [`${index + 1}.`];
    addField(lines, 'Project', entry.name);
    addField(lines, 'Role', entry.role);
    addField(lines, 'Date', entry.date);
    addField(lines, 'Description', entry.description);
    if (Array.isArray(entry.technologies) && entry.technologies.some(hasText)) {
      lines.push(`Technologies: ${entry.technologies.filter(hasText).map((item) => normalizeText(item)).join(', ')}`);
    }
    addField(lines, 'Link', entry.link);
    lines.push('');
    return lines;
  }).filter((line, index, arr) => !(line === '' && arr[index - 1] === ''));
}

function formatEducation(education: Education[] | undefined): string[] {
  if (!Array.isArray(education) || education.length === 0) return [];

  return education.flatMap((entry, index) => {
    const lines: string[] = [`${index + 1}.`];
    addField(lines, 'Institution', entry.institution);
    addField(lines, 'Degree', entry.degree);
    addField(lines, 'Field', entry.field);
    addField(lines, 'Period', buildDateRange(entry.startDate, entry.endDate, entry.year));
    addField(lines, 'GPA', entry.gpa);
    if (Array.isArray(entry.coursework) && entry.coursework.some(hasText)) {
      lines.push(`Coursework: ${entry.coursework.filter(hasText).map((item) => normalizeText(item)).join(', ')}`);
    }
    if (Array.isArray(entry.achievements) && entry.achievements.some(hasText)) {
      lines.push('Achievements:');
      addList(lines, entry.achievements);
    }
    lines.push('');
    return lines;
  }).filter((line, index, arr) => !(line === '' && arr[index - 1] === ''));
}

function formatCertifications(certifications: Certification[] | undefined): string[] {
  if (!Array.isArray(certifications) || certifications.length === 0) return [];

  return certifications.map((entry) => {
    const parts = [entry.name];
    if (hasText(entry.issuer)) parts.push(`issuer=${normalizeText(entry.issuer)}`);
    if (hasText(entry.date)) parts.push(`date=${normalizeText(entry.date)}`);
    if (hasText(entry.expiryDate)) parts.push(`expiry=${normalizeText(entry.expiryDate)}`);
    if (hasText(entry.credentialId)) parts.push(`credentialId=${normalizeText(entry.credentialId)}`);
    return `- ${parts.join(' | ')}`;
  });
}

function formatAwards(awards: Award[] | undefined): string[] {
  if (!Array.isArray(awards) || awards.length === 0) return [];

  return awards.flatMap((entry) => {
    const parts = [entry.name];
    if (hasText(entry.issuer)) parts.push(`issuer=${normalizeText(entry.issuer)}`);
    if (hasText(entry.date)) parts.push(`date=${normalizeText(entry.date)}`);
    const lines = [`- ${parts.join(' | ')}`];
    if (hasText(entry.description)) {
      lines.push(`  description: ${normalizeText(entry.description)}`);
    }
    return lines;
  });
}

function formatLanguages(languages: LanguageSkill[] | undefined): string[] {
  if (!Array.isArray(languages) || languages.length === 0) return [];
  return languages
    .filter((entry) => hasText(entry.language))
    .map((entry) => `- ${normalizeText(entry.language)}${hasText(entry.proficiency) ? ` (${normalizeText(entry.proficiency)})` : ''}`);
}

function formatVolunteerWork(volunteerWork: VolunteerWork[] | undefined): string[] {
  if (!Array.isArray(volunteerWork) || volunteerWork.length === 0) return [];

  return volunteerWork.flatMap((entry) => {
    const lines: string[] = [];
    const header = [entry.organization, hasText(entry.role) ? normalizeText(entry.role) : ''].filter(Boolean).join(' | ');
    if (header) {
      lines.push(`- ${header}`);
    }
    if (hasText(entry.duration)) {
      lines.push(`  duration: ${normalizeText(entry.duration)}`);
    }
    if (hasText(entry.description)) {
      lines.push(`  description: ${normalizeText(entry.description)}`);
    }
    return lines;
  });
}

function formatOtherSections(otherSections: ParsedResume['otherSections'] | undefined): string[] {
  if (!otherSections || typeof otherSections !== 'object') return [];

  const lines: string[] = [];
  for (const [sectionTitle, content] of Object.entries(otherSections)) {
    if (!hasText(sectionTitle) || !hasText(content)) continue;
    if (lines.length > 0) lines.push('');
    lines.push(`${sectionTitle}:`);
    lines.push(normalizeText(content));
  }
  return lines;
}

export function formatParsedResumeForInvitation(parsedResume: ParsedResume): string {
  const lines: string[] = [];
  const header: string[] = [];

  addField(header, 'Name', parsedResume.name);
  addField(header, 'Email', parsedResume.email);
  addField(header, 'Phone', parsedResume.phone);
  addField(header, 'Address', parsedResume.address);
  addField(header, 'LinkedIn', parsedResume.linkedin);
  addField(header, 'GitHub', parsedResume.github);
  addField(header, 'Portfolio', parsedResume.portfolio);
  addSection(lines, 'Candidate Profile', header);

  if (hasText(parsedResume.summary)) {
    addSection(lines, 'Summary', [normalizeText(parsedResume.summary)]);
  }

  addSection(lines, 'Skills', formatSkills(parsedResume.skills));
  addSection(lines, 'Work Experience', formatExperience(parsedResume.experience));
  addSection(lines, 'Projects', formatProjects(parsedResume.projects));
  addSection(lines, 'Education', formatEducation(parsedResume.education));
  addSection(lines, 'Certifications', formatCertifications(parsedResume.certifications));
  addSection(lines, 'Awards', formatAwards(parsedResume.awards));
  addSection(lines, 'Languages', formatLanguages(parsedResume.languages));
  addSection(lines, 'Volunteer Work', formatVolunteerWork(parsedResume.volunteerWork));

  if (Array.isArray(parsedResume.publications) && parsedResume.publications.some(hasText)) {
    addSection(lines, 'Publications', parsedResume.publications.filter(hasText).map((item) => `- ${normalizeText(item)}`));
  }
  if (Array.isArray(parsedResume.patents) && parsedResume.patents.some(hasText)) {
    addSection(lines, 'Patents', parsedResume.patents.filter(hasText).map((item) => `- ${normalizeText(item)}`));
  }

  addSection(lines, 'Other Sections', formatOtherSections(parsedResume.otherSections));

  return lines.join('\n').trim();
}

async function loadStoredParsedResume(userId: string | null | undefined, rawResumeText: string) {
  if (!userId || !hasText(rawResumeText)) return null;

  const contentHash = computeResumeHash(rawResumeText);
  const existing = await prisma.resume.findUnique({
    where: { userId_contentHash: { userId, contentHash } },
    select: { parsedData: true },
  });

  return existing?.parsedData ?? null;
}

export async function resolveResumeTextForInvitation({
  rawResumeText,
  userId,
  requestId,
  preferredParsedResume,
}: {
  rawResumeText: string;
  userId?: string | null;
  requestId?: string;
  preferredParsedResume?: unknown;
}): Promise<ResolvedInvitationResume> {
  const parsedResume = preferredParsedResume ?? await loadStoredParsedResume(userId, rawResumeText);
  const source: InvitationResumeSource = preferredParsedResume ? 'provided_parsedData' : 'stored_parsedData';

  if (parsedResume && !isParsedResumeLikelyIncomplete(parsedResume, rawResumeText)) {
    const structuredResume = formatParsedResumeForInvitation(parsedResume as ParsedResume);
    if (hasText(structuredResume)) {
      logger.info('INVITE_RESUME', 'Using locally parsed resume for invitation payload', {
        source,
        structuredLength: structuredResume.length,
        coverage: summarizeParsedResumeCoverage(parsedResume),
      }, requestId);

      return {
        resumeText: structuredResume,
        source,
      };
    }
  }

  if (parsedResume) {
    logger.warn('INVITE_RESUME', 'Local parsed resume was too sparse for invitation payload; falling back to raw resume text', {
      source,
      coverage: summarizeParsedResumeCoverage(parsedResume),
    }, requestId);
  }

  return {
    resumeText: rawResumeText,
    source: 'raw_resume',
  };
}
