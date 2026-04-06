import { Router } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { createJDAgent } from '../agents/CreateJDAgent.js';
import { jobContentAgent } from '../agents/JobContentAgent.js';
import { marketIntelligenceAgent } from '../agents/MarketIntelligenceAgent.js';
import { documentParsingService, DocumentParsingService } from '../services/DocumentParsingService.js';
import { jdParseAgent } from '../agents/JDParseAgent.js';
import { jdParserService } from '../services/JDParserService.js';
import { languageService } from '../services/LanguageService.js';
import type { ParsedJD, RequirementsDetailed, QualificationsDetailed } from '../types/index.js';
import { getVisibilityScope, buildUserIdFilter, buildAdminOverrideFilter } from '../lib/teamVisibility.js';
import { buildHiringRequestAccessWhere } from '../lib/hiringRequestVisibility.js';
import '../types/auth.js';

/**
 * Build a formatted job description from parsed JD structured data.
 * Falls back to rawText if structured data is insufficient.
 */
function buildFormattedDescription(parsed: ParsedJD, rawText: string): string {
  const parts: string[] = [];

  if (parsed.jobOverview) {
    parts.push(parsed.jobOverview);
  }

  if (parsed.responsibilities && parsed.responsibilities.length > 0) {
    parts.push('\n## Responsibilities\n');
    for (const r of parsed.responsibilities) {
      parts.push(`- ${r}`);
    }
  }

  if (parsed.benefits && parsed.benefits.length > 0) {
    parts.push('\n## Benefits\n');
    for (const b of parsed.benefits) {
      parts.push(`- ${b}`);
    }
  }

  if (parsed.compensation) {
    const comp = parsed.compensation;
    const compParts: string[] = [];
    if (comp.salary) compParts.push(`Salary: ${comp.salary}`);
    if (comp.bonus) compParts.push(`Bonus: ${comp.bonus}`);
    if (comp.equity) compParts.push(`Equity: ${comp.equity}`);
    if (comp.other) compParts.push(`Other: ${comp.other}`);
    if (compParts.length > 0) {
      parts.push('\n## Compensation\n');
      for (const c of compParts) {
        parts.push(`- ${c}`);
      }
    }
  }

  if (parsed.additionalInfo && Object.keys(parsed.additionalInfo).length > 0) {
    for (const [key, value] of Object.entries(parsed.additionalInfo)) {
      parts.push(`\n## ${key}\n`);
      parts.push(value);
    }
  }

  // If we got meaningful structured content, use it; otherwise fall back to raw text
  if (parts.length > 0 && parts.join('\n').trim().length > 50) {
    return parts.join('\n').trim();
  }
  return rawText;
}

/**
 * Build qualifications text from parsed JD qualifications data.
 */
function buildQualificationsText(parsed: ParsedJD): string {
  const quals = parsed.qualifications;
  if (!quals) return '';

  // Simple string array
  if (Array.isArray(quals)) {
    if (quals.length === 0) return '';
    return quals.map((q) => `- ${q}`).join('\n');
  }

  // Detailed qualifications object
  const detailed = quals as QualificationsDetailed;
  const parts: string[] = [];

  if (detailed.education && detailed.education.length > 0) {
    parts.push('## Education');
    for (const e of detailed.education) parts.push(`- ${e}`);
  }
  if (detailed.experience && detailed.experience.length > 0) {
    parts.push('\n## Experience');
    for (const e of detailed.experience) parts.push(`- ${e}`);
  }
  if (detailed.certifications && detailed.certifications.length > 0) {
    parts.push('\n## Certifications');
    for (const c of detailed.certifications) parts.push(`- ${c}`);
  }
  if (detailed.skills) {
    const { technical, soft, tools, languages } = detailed.skills;
    if (technical && technical.length > 0) {
      parts.push('\n## Technical Skills');
      for (const s of technical) parts.push(`- ${s}`);
    }
    if (soft && soft.length > 0) {
      parts.push('\n## Soft Skills');
      for (const s of soft) parts.push(`- ${s}`);
    }
    if (tools && tools.length > 0) {
      parts.push('\n## Tools');
      for (const t of tools) parts.push(`- ${t}`);
    }
    if (languages && languages.length > 0) {
      parts.push('\n## Languages');
      for (const l of languages) parts.push(`- ${l}`);
    }
  }

  return parts.join('\n').trim();
}

/**
 * Build hard requirements text from parsed JD requirements data.
 */
function buildHardRequirementsText(parsed: ParsedJD): string {
  const reqs = parsed.requirements;
  if (!reqs) return '';

  // Simple string array
  if (Array.isArray(reqs)) {
    if (reqs.length === 0) return '';
    return reqs.map((r, i) => `${i + 1}. ${r}`).join('\n');
  }

  // Detailed requirements object
  const detailed = reqs as RequirementsDetailed;
  const parts: string[] = [];

  if (detailed.mustHave && detailed.mustHave.length > 0) {
    parts.push('## Must Have');
    detailed.mustHave.forEach((r, i) => parts.push(`${i + 1}. ${r}`));
  }
  if (detailed.niceToHave && detailed.niceToHave.length > 0) {
    parts.push('\n## Nice to Have');
    detailed.niceToHave.forEach((r, i) => parts.push(`${i + 1}. ${r}`));
  }

  return parts.join('\n').trim();
}

const router = Router();

const SUPPORTED_JOB_LANGUAGE_CODES = new Set(['en', 'zh', 'zh-TW', 'ja', 'es', 'fr', 'pt', 'de']);
/** Map interview-language code → default salary currency */
const LANG_CURRENCY_DEFAULT: Record<string, string> = {
  zh: 'CNY',
  'zh-TW': 'NTD',
  ja: 'JPY',
  ko: 'KRW',
  en: 'USD',
  es: 'USD',
  fr: 'USD',
  pt: 'USD',
  de: 'USD',
};

const LANGUAGE_NAME_TO_JOB_CODE: Record<string, string> = {
  English: 'en',
  Chinese: 'zh',
  Japanese: 'ja',
  German: 'de',
  French: 'fr',
  Spanish: 'es',
  Portuguese: 'pt',
};

function normalizeJobLanguageCode(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (SUPPORTED_JOB_LANGUAGE_CODES.has(trimmed)) return trimmed;

  const localeLanguage = languageService.getLanguageFromLocale(trimmed);
  if (localeLanguage && LANGUAGE_NAME_TO_JOB_CODE[localeLanguage]) {
    return LANGUAGE_NAME_TO_JOB_CODE[localeLanguage];
  }

  return LANGUAGE_NAME_TO_JOB_CODE[trimmed] || null;
}

function resolveInterviewLanguage(preferred?: string | null, ...textSources: Array<string | null | undefined>): string {
  const normalizedPreferred = normalizeJobLanguageCode(preferred);
  if (normalizedPreferred) return normalizedPreferred;

  const combinedText = textSources
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
  const detectedLanguage = languageService.detectLanguage(combinedText);
  return LANGUAGE_NAME_TO_JOB_CODE[detectedLanguage] || 'en';
}

function normalizeWorkType(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/(remote|远程|remoto|distanc|teletrab|home office)/i.test(normalized)) return 'remote';
  if (/(hybrid|混合|弹性办公|flexible)/i.test(normalized)) return 'hybrid';
  if (/(on-site|onsite|office|现场|坐班)/i.test(normalized)) return 'onsite';
  return null;
}

function normalizeEmploymentType(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/(intern|实习)/i.test(normalized)) return 'internship';
  if (/(part[- ]?time|兼职)/i.test(normalized)) return 'part-time';
  if (/(contract|contractor|合同|外包|freelance)/i.test(normalized)) return 'contract';
  if (/(full[- ]?time|全职)/i.test(normalized)) return 'full-time';
  return null;
}

function normalizeExperienceLevel(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/(director|head|vp|chief|executive|总监|负责人|高管)/i.test(normalized)) return 'executive';
  if (/(lead|staff|principal|manager|主管|负责人|leadership)/i.test(normalized)) return 'lead';
  if (/(senior|sr\.?|高级|资深)/i.test(normalized)) return 'senior';
  if (/(mid|intermediate|中级)/i.test(normalized)) return 'mid';
  if (/(junior|entry|associate|初级|应届)/i.test(normalized)) return 'entry';
  return null;
}

function buildLocationEntries(location?: string | null): Array<{ country: string; city: string }> | null {
  if (!location || !location.trim()) return null;
  const normalized = location.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const parts = normalized
    .split(/[;；|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const uniqueParts = [...new Set(parts.length > 0 ? parts : [normalized])].slice(0, 5);

  return uniqueParts.map((city) => ({ country: '', city }));
}

function parseSalaryAmount(raw: string): number {
  const normalized = raw.replace(/,/g, '').trim();
  if (!normalized) return 0;
  if (/万/i.test(normalized)) {
    const numeric = parseFloat(normalized.replace(/万/gi, ''));
    return Number.isFinite(numeric) ? Math.round(numeric * 10000) : 0;
  }
  if (/k/i.test(normalized)) {
    const numeric = parseFloat(normalized.replace(/k/gi, ''));
    return Number.isFinite(numeric) ? Math.round(numeric * 1000) : 0;
  }

  const numeric = parseFloat(normalized);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function parseSalaryDetails(text?: string | null): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
} {
  if (!text || !text.trim()) {
    return { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();

  const salaryCurrency =
    /\b(ntd|twd|nt\$)\b|新台币|新臺幣/i.test(normalized) ? 'NTD' :
    /\b(krw)\b|₩|원|만원/i.test(normalized) ? 'KRW' :
    /\b(jpy)\b|日元|円/i.test(normalized) ? 'JPY' :
    /\b(eur)\b|€/i.test(normalized) ? 'EUR' :
    /\b(gbp)\b|£/i.test(normalized) ? 'GBP' :
    /\b(cad)\b|ca\$/i.test(normalized) ? 'CAD' :
    /\b(aud)\b|a\$/i.test(normalized) ? 'AUD' :
    /\b(cny|rmb)\b|人民币|人民幣|元\/|元每|￥|¥/i.test(normalized) ? 'CNY' :
    /\b(usd)\b|us\$|\$/i.test(normalized) ? 'USD' :
    null;

  const salaryPeriod =
    /(per month|monthly|\/mo\b|\/month\b|每月|\/月|月薪)/i.test(lower) ? 'monthly' :
    /(per year|yearly|annual|annually|\/yr\b|\/year\b|每年|\/年|年薪)/i.test(lower) ? 'yearly' :
    salaryCurrency === 'CNY' ? 'monthly' :
    salaryCurrency ? 'yearly' :
    null;

  if (/(negotiable|面议|面議)/i.test(normalized)) {
    return {
      salaryMin: 0,
      salaryMax: 0,
      salaryCurrency,
      salaryPeriod,
    };
  }

  // "不高于35K" / "up to 35K" / "最高35K" — max only
  const maxOnlyMatch = normalized.match(/(?:不高于|不超过|最高|up\s*to|at\s*most|under)\s*(\d+(?:\.\d+)?)\s*(?:万|k)?/i);
  if (maxOnlyMatch) {
    const amount = parseSalaryAmount(maxOnlyMatch[0].replace(/^.*?(\d)/, '$1'));
    if (amount > 0) {
      return { salaryMin: null, salaryMax: amount, salaryCurrency, salaryPeriod };
    }
  }

  // "不低于20K" / "at least 20K" / "最低20K" — min only
  const minOnlyMatch = normalized.match(/(?:不低于|不少于|最低|至少|at\s*least|from|starting)\s*(\d+(?:\.\d+)?)\s*(?:万|k)?/i);
  if (minOnlyMatch) {
    const amount = parseSalaryAmount(minOnlyMatch[0].replace(/^.*?(\d)/, '$1'));
    if (amount > 0) {
      return { salaryMin: amount, salaryMax: null, salaryCurrency, salaryPeriod };
    }
  }

  const rangePatterns = [
    /(\d+(?:\.\d+)?)\s*万\s*(?:-|–|—|~|到|to)\s*(\d+(?:\.\d+)?)\s*万/i,
    /(\d+(?:\.\d+)?)\s*k\s*(?:-|–|—|~|到|to)\s*(\d+(?:\.\d+)?)\s*k/i,
    /(\d[\d,]*(?:\.\d+)?)\s*(?:-|–|—|~|到|to)\s*(\d[\d,]*(?:\.\d+)?)/i,
  ];

  for (const pattern of rangePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const salaryMin = parseSalaryAmount(match[1]);
      const salaryMax = parseSalaryAmount(match[2]);
      if (salaryMin > 0 || salaryMax > 0) {
        return {
          salaryMin: salaryMin || null,
          salaryMax: salaryMax || null,
          salaryCurrency,
          salaryPeriod,
        };
      }
    }
  }

  const singlePatterns = [
    /(\d+(?:\.\d+)?)\s*万/i,
    /(\d+(?:\.\d+)?)\s*k/i,
    /(\d[\d,]*(?:\.\d+)?)/,
  ];

  for (const pattern of singlePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const amount = parseSalaryAmount(match[1]);
      if (amount > 0) {
        return {
          salaryMin: amount,
          salaryMax: null,
          salaryCurrency,
          salaryPeriod,
        };
      }
    }
  }

  return { salaryMin: null, salaryMax: null, salaryCurrency, salaryPeriod };
}

type JobStatsSnapshot = {
  matches: number;
  interviews: number;
  completedInterviews: number;
};

async function buildJobStatsMap(jobs: Array<{ id: string; hiringRequestId: string | null }>) {
  const statsByJobId = new Map<string, JobStatsSnapshot>();
  if (jobs.length === 0) {
    return statsByJobId;
  }

  const jobIds = jobs.map((job) => job.id);
  const hiringRequestIds = [...new Set(
    jobs
      .map((job) => job.hiringRequestId)
      .filter((hiringRequestId): hiringRequestId is string => Boolean(hiringRequestId)),
  )];

  const [
    jobMatchCounts,
    interviewCounts,
    completedInterviewCounts,
    resumeFitCounts,
    hiringInterviewCounts,
    completedHiringInterviewCounts,
  ] = await Promise.all([
    prisma.jobMatch.groupBy({
      by: ['jobId'],
      where: { jobId: { in: jobIds } },
      _count: { _all: true },
    }),
    prisma.interview.groupBy({
      by: ['jobId'],
      where: { jobId: { in: jobIds } },
      _count: { _all: true },
    }),
    prisma.interview.groupBy({
      by: ['jobId'],
      where: {
        jobId: { in: jobIds },
        status: 'completed',
      },
      _count: { _all: true },
    }),
    hiringRequestIds.length > 0
      ? prisma.resumeJobFit.groupBy({
          by: ['hiringRequestId'],
          where: { hiringRequestId: { in: hiringRequestIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    hiringRequestIds.length > 0
      ? prisma.interview.groupBy({
          by: ['hiringRequestId'],
          where: { hiringRequestId: { in: hiringRequestIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    hiringRequestIds.length > 0
      ? prisma.interview.groupBy({
          by: ['hiringRequestId'],
          where: {
            hiringRequestId: { in: hiringRequestIds },
            status: 'completed',
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const jobMatchCountById = new Map<string, number>();
  for (const row of jobMatchCounts) {
    jobMatchCountById.set(row.jobId, row._count._all);
  }

  const interviewCountById = new Map<string, number>();
  for (const row of interviewCounts) {
    if (!row.jobId) continue;
    interviewCountById.set(row.jobId, row._count._all);
  }

  const completedInterviewCountById = new Map<string, number>();
  for (const row of completedInterviewCounts) {
    if (!row.jobId) continue;
    completedInterviewCountById.set(row.jobId, row._count._all);
  }

  const resumeFitCountByHiringRequestId = new Map<string, number>();
  for (const row of resumeFitCounts) {
    resumeFitCountByHiringRequestId.set(row.hiringRequestId, row._count._all);
  }

  const hiringInterviewCountById = new Map<string, number>();
  for (const row of hiringInterviewCounts) {
    if (!row.hiringRequestId) continue;
    hiringInterviewCountById.set(row.hiringRequestId, row._count._all);
  }

  const completedHiringInterviewCountById = new Map<string, number>();
  for (const row of completedHiringInterviewCounts) {
    if (!row.hiringRequestId) continue;
    completedHiringInterviewCountById.set(row.hiringRequestId, row._count._all);
  }

  for (const job of jobs) {
    const directMatches = jobMatchCountById.get(job.id) ?? 0;
    const directInterviews = interviewCountById.get(job.id) ?? 0;
    const directCompletedInterviews = completedInterviewCountById.get(job.id) ?? 0;
    const linkedMatches = job.hiringRequestId
      ? resumeFitCountByHiringRequestId.get(job.hiringRequestId) ?? 0
      : 0;
    const linkedInterviews = job.hiringRequestId
      ? hiringInterviewCountById.get(job.hiringRequestId) ?? 0
      : 0;
    const linkedCompletedInterviews = job.hiringRequestId
      ? completedHiringInterviewCountById.get(job.hiringRequestId) ?? 0
      : 0;

    statsByJobId.set(job.id, {
      matches: job.hiringRequestId ? Math.max(directMatches, linkedMatches) : directMatches,
      interviews: job.hiringRequestId ? Math.max(directInterviews, linkedInterviews) : directInterviews,
      completedInterviews: job.hiringRequestId
        ? Math.max(directCompletedInterviews, linkedCompletedInterviews)
        : directCompletedInterviews,
    });
  }

  return statsByJobId;
}

async function buildJobDraftFromHiringRequest(
  hiringRequest: { title: string; clientName?: string | null; requirements: string; jobDescription?: string | null },
  preferredLanguage?: string | null,
  requestId?: string,
) {
  const rawRequirements = DocumentParsingService.cleanTextContent(hiringRequest.requirements || '').trim();
  const rawDescription = DocumentParsingService.cleanTextContent(hiringRequest.jobDescription || '').trim();
  const sourceText = [rawDescription, rawRequirements].filter(Boolean).join('\n\n').trim();

  let parsed: import('../services/JDParserService.js').ParsedJDResult | null = null;
  if (sourceText.length >= 20) {
    try {
      parsed = await jdParserService.parseJD(sourceText, requestId);
    } catch (error) {
      logger.warn('JOBS', 'Failed to parse hiring request content for job inheritance', {
        error: error instanceof Error ? error.message : String(error),
      }, requestId);
    }
  }

  const comp = parsed?.compensation;
  const compensationText = comp
    ? [comp.salary, comp.bonus, comp.equity, comp.other]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join('\n')
    : '';
  const salary = parseSalaryDetails(compensationText);
  const location = parsed?.location?.trim() || null;
  const description = rawDescription || parsed?.description || null;
  const qualifications = parsed?.requirements?.length
    ? parsed.requirements.map(r => `- ${r}`).join('\n')
    : '';
  const hardRequirements = parsed?.mustHave?.length
    ? parsed.mustHave.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : '';
  const niceToHave = parsed?.niceToHave?.length
    ? parsed.niceToHave.map(r => `- ${r}`).join('\n')
    : '';
  const benefits = parsed?.benefits?.length
    ? parsed.benefits.map(r => `- ${r}`).join('\n')
    : '';

  const interviewLanguage = resolveInterviewLanguage(
    preferredLanguage,
    rawDescription,
    rawRequirements,
    parsed?.location,
    parsed?.description,
    compensationText,
  );

  return {
    companyName: hiringRequest.clientName?.trim() || parsed?.company?.trim() || null,
    department: parsed?.department?.trim() || null,
    location,
    workType: parsed?.workType || normalizeWorkType(undefined),
    employmentType: parsed?.employmentType || normalizeEmploymentType(undefined),
    experienceLevel: parsed?.experienceLevel || normalizeExperienceLevel(undefined),
    education: parsed?.education?.trim() || null,
    headcount: parsed?.headcount && parsed.headcount >= 1 ? parsed.headcount : 1,
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryCurrency: salary.salaryCurrency || LANG_CURRENCY_DEFAULT[interviewLanguage] || 'USD',
    salaryPeriod: salary.salaryPeriod,
    salaryText: comp?.salaryText?.trim() || compensationText.trim() || null,
    description,
    qualifications: qualifications || null,
    hardRequirements: hardRequirements || null,
    niceToHave: niceToHave || null,
    benefits: benefits || null,
    interviewRequirements: null as string | null,
    evaluationRules: null as string | null,
    requirements: parsed?.requirements ? JSON.parse(JSON.stringify(parsed.requirements)) : null,
    parsedData: parsed ? JSON.parse(JSON.stringify(parsed)) : null,
    locations: buildLocationEntries(location),
    sourceText: sourceText || null,
    interviewLanguage,
  };
}

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (DocumentParsingService.isAcceptedUpload(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

/** Helper to extract new job fields from request body */
function extractJobFields(body: any) {
  const {
    title, companyName, department, location, workType, employmentType,
    experienceLevel, education, headcount, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
    salaryText, description, qualifications, hardRequirements, niceToHave, benefits, requirements,
    locations, interviewMode, passingScore, interviewLanguage,
    interviewDuration, interviewRequirements, evaluationRules,
    notes, hiringRequestId, status,
  } = body;

  return {
    title, companyName, department, location, workType, employmentType,
    experienceLevel, education, headcount, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
    salaryText, description, qualifications, hardRequirements, niceToHave, benefits, requirements,
    locations, interviewMode, passingScore, interviewLanguage,
    interviewDuration, interviewRequirements, evaluationRules,
    notes, hiringRequestId, status,
  };
}

/**
 * GET /api/v1/jobs
 * List user's jobs with optional filters
 */
router.get('/', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const {
      status,
      search,
      title,
      hiringRequestId,
      filterUserId,
      filterTeamId,
      teamView,
      page = '1',
      limit = '20',
      fields,
      includeTotal,
      sortBy,
      sortDir,
      companyName,
      dateRange,
      includeAggregates,
    } = req.query;

    const scope = await getVisibilityScope(req.user!, teamView === 'true');
    const where: any = {
      ...await buildAdminOverrideFilter(
        scope,
        filterUserId as string | undefined,
        filterTeamId as string | undefined,
      ),
    };
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (hiringRequestId && typeof hiringRequestId === 'string') {
      where.hiringRequestId = hiringRequestId;
    }
    if (companyName && typeof companyName === 'string') {
      where.companyName = companyName;
    }
    if (dateRange && typeof dateRange === 'string' && dateRange !== 'all') {
      const now = new Date();
      let dateFrom: Date | null = null;
      if (dateRange === 'today') {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateRange === 'week') {
        const day = now.getDay();
        const diffToMonday = (day + 6) % 7;
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
      } else if (dateRange === 'month') {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      if (dateFrom) {
        where.createdAt = { gte: dateFrom };
      }
    }
    if (title && typeof title === 'string') {
      where.title = title;
    } else if (search && typeof search === 'string') {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Sorting
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'title') {
      orderBy = { title: sortDir === 'desc' ? 'desc' : 'asc' };
    } else if (sortBy === 'created') {
      orderBy = { createdAt: sortDir === 'asc' ? 'asc' : 'desc' };
    }

    const isMinimal = fields === 'minimal';
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const maxPageSize = isMinimal ? 500 : 50;
    const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(limit as string, 10) || 20));
    const shouldIncludeTotal = includeTotal !== 'false';
    const queryTake = shouldIncludeTotal ? pageSize : pageSize + 1;

    const jobsPromise = isMinimal
      ? prisma.job.findMany({
          where,
          orderBy,
          skip: (pageNum - 1) * pageSize,
          take: queryTake,
          select: {
            id: true,
            title: true,
            status: true,
            department: true,
            location: true,
            passingScore: true,
          },
        })
      : prisma.job.findMany({
          where,
          orderBy,
          skip: (pageNum - 1) * pageSize,
          take: queryTake,
          include: {
            hiringRequest: { select: { id: true, title: true } },
          },
        });

    const totalPromise = shouldIncludeTotal
      ? prisma.job.count({ where })
      : Promise.resolve<number | null>(null);

    // Build a base visibility filter (without client/dateRange/search/status) for the company name dropdown
    const baseWhere: any = {
      ...await buildAdminOverrideFilter(
        scope,
        filterUserId as string | undefined,
        filterTeamId as string | undefined,
      ),
    };

    // Aggregate stats query (lightweight: runs on the same `where` filter, no joins)
    const aggregatesPromise = includeAggregates === 'true'
      ? (async () => {
          const [agg, openCount, allJobIds, companyNames] = await Promise.all([
            prisma.job.aggregate({ where, _count: { _all: true }, _sum: { headcount: true } }),
            prisma.job.count({ where: { ...where, status: 'open' } }),
            prisma.job.findMany({ where, select: { id: true, hiringRequestId: true } }),
            // Distinct company names from ALL user's jobs (not filtered) for dropdown
            prisma.job.findMany({
              where: { ...baseWhere, companyName: { not: null } },
              select: { companyName: true },
              distinct: ['companyName'],
              orderBy: { companyName: 'asc' },
            }),
          ]);
          const ids = allJobIds.map((j) => j.id);
          const hrIds = [...new Set(allJobIds.map((j) => j.hiringRequestId).filter((id): id is string => Boolean(id)))];
          const [matchCount, interviewCount, completedCount, fitCount, hrInterviewCount, hrCompletedCount] = await Promise.all([
            ids.length > 0 ? prisma.jobMatch.count({ where: { jobId: { in: ids } } }) : 0,
            ids.length > 0 ? prisma.interview.count({ where: { jobId: { in: ids } } }) : 0,
            ids.length > 0 ? prisma.interview.count({ where: { jobId: { in: ids }, status: 'completed' } }) : 0,
            hrIds.length > 0 ? prisma.resumeJobFit.count({ where: { hiringRequestId: { in: hrIds } } }) : 0,
            hrIds.length > 0 ? prisma.interview.count({ where: { hiringRequestId: { in: hrIds } } }) : 0,
            hrIds.length > 0 ? prisma.interview.count({ where: { hiringRequestId: { in: hrIds }, status: 'completed' } }) : 0,
          ]);
          return {
            openCount,
            totalHeadcount: agg._sum.headcount ?? 0,
            totalMatches: Math.max(matchCount, fitCount),
            totalInterviews: Math.max(interviewCount, hrInterviewCount),
            totalCompleted: Math.max(completedCount, hrCompletedCount),
            companyNames: companyNames.map((c) => c.companyName).filter(Boolean) as string[],
          };
        })()
      : Promise.resolve(null);

    const [jobs, total, aggregates] = await Promise.all([jobsPromise, totalPromise, aggregatesPromise]);
    const hasMore = !shouldIncludeTotal && jobs.length > pageSize;
    const pageItems = hasMore ? jobs.slice(0, pageSize) : jobs;

    if (isMinimal) {
      return res.json({
        success: true,
        data: pageItems,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          totalPages: typeof total === 'number' ? Math.ceil(total / pageSize) : null,
          hasMore,
        },
      });
    }

    const detailedPageItems = pageItems as Array<(typeof pageItems)[number] & { hiringRequestId: string | null }>;
    const jobStats = await buildJobStatsMap(
      detailedPageItems.map((job) => ({ id: job.id, hiringRequestId: job.hiringRequestId ?? null })),
    );

    const jobsWithStats = detailedPageItems.map((job) => ({
      ...job,
      stats: jobStats.get(job.id) ?? { matches: 0, interviews: 0, completedInterviews: 0 },
    }));

    res.json({
      success: true,
      data: jobsWithStats,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: typeof total === 'number' ? Math.ceil(total / pageSize) : null,
        hasMore,
      },
      ...(aggregates ? { aggregates } : {}),
    });
  } catch (error) {
    logger.error('JOBS', 'Failed to list jobs', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to list jobs' });
  }
});

/**
 * GET /api/v1/jobs/:id
 * Get job detail
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const scope = await getVisibilityScope(req.user!);
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, ...buildUserIdFilter(scope) },
      include: {
        hiringRequest: { select: { id: true, title: true, requirements: true } },
        alexSession: { select: { id: true, title: true, requirements: true, updatedAt: true } },
      },
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const stats = await buildJobStatsMap([{ id: job.id, hiringRequestId: job.hiringRequestId ?? null }]);

    res.json({
      success: true,
      data: {
        ...job,
        stats: stats.get(job.id) ?? { matches: 0, interviews: 0, completedInterviews: 0 },
      },
    });
  } catch (error) {
    console.error('GET /jobs/:id error:', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get job' });
  }
});

/**
 * POST /api/v1/jobs
 * Create a new job
 */
router.post('/', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const userId = req.user!.id;
    const fields = extractJobFields(req.body);

    if (!fields.title || typeof fields.title !== 'string' || !fields.title.trim()) {
      return res.status(400).json({ success: false, error: 'Job title is required' });
    }

    if (fields.hiringRequestId) {
      const accessWhere = await buildHiringRequestAccessWhere(req.user!, fields.hiringRequestId);
      const hr = await prisma.hiringRequest.findFirst({
        where: accessWhere,
      });
      if (!hr) {
        return res.status(404).json({ success: false, error: 'Hiring request not found' });
      }
    }

    const job = await prisma.job.create({
      data: {
        userId,
        title: fields.title.trim(),
        companyName: fields.companyName?.trim() || null,
        department: fields.department?.trim() || null,
        location: fields.location?.trim() || null,
        workType: fields.workType?.trim() || null,
        employmentType: fields.employmentType?.trim() || null,
        experienceLevel: fields.experienceLevel?.trim() || null,
        education: fields.education?.trim() || null,
        headcount: fields.headcount ? Math.max(1, parseInt(fields.headcount, 10) || 1) : 1,
        salaryMin: fields.salaryMin ? parseInt(fields.salaryMin, 10) : null,
        salaryMax: fields.salaryMax ? parseInt(fields.salaryMax, 10) : null,
        salaryPeriod: fields.salaryPeriod?.trim() || 'monthly',
        salaryText: fields.salaryText?.trim() || null,
        description: fields.description?.trim() || null,
        qualifications: fields.qualifications?.trim() || null,
        hardRequirements: fields.hardRequirements?.trim() || null,
        requirements: fields.requirements || null,
        locations: fields.locations || null,
        interviewMode: fields.interviewMode?.trim() || 'standard',
        passingScore: fields.passingScore ? parseInt(fields.passingScore, 10) : 60,
        interviewLanguage: resolveInterviewLanguage(
          fields.interviewLanguage,
          fields.title,
          fields.description,
          fields.qualifications,
          fields.hardRequirements,
        ),
        salaryCurrency: fields.salaryCurrency?.trim()
          || LANG_CURRENCY_DEFAULT[resolveInterviewLanguage(
              fields.interviewLanguage, fields.title, fields.description,
              fields.qualifications, fields.hardRequirements)]
          || 'USD',
        interviewDuration: fields.interviewDuration ? parseInt(fields.interviewDuration, 10) : 30,
        interviewRequirements: fields.interviewRequirements?.trim() || null,
        evaluationRules: fields.evaluationRules?.trim() || null,
        hiringRequestId: fields.hiringRequestId || null,
        status: fields.status === 'open' ? 'open' : 'draft',
      },
    });

    logger.info('JOBS', 'Job created', { jobId: job.id, title: job.title }, requestId);
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    logger.error('JOBS', 'Failed to create job', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to create job' });
  }
});

/**
 * PATCH /api/v1/jobs/:id
 * Update a job
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const scope = await getVisibilityScope(req.user!);
    const existing = await prisma.job.findFirst({ where: { id: req.params.id, ...buildUserIdFilter(scope) } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const fields = extractJobFields(req.body);
    const data: any = {};

    if (fields.title !== undefined) data.title = fields.title.trim();
    if (fields.companyName !== undefined) data.companyName = fields.companyName?.trim() || null;
    if (fields.department !== undefined) data.department = fields.department?.trim() || null;
    if (fields.location !== undefined) data.location = fields.location?.trim() || null;
    if (fields.workType !== undefined) data.workType = fields.workType?.trim() || null;
    if (fields.employmentType !== undefined) data.employmentType = fields.employmentType?.trim() || null;
    if (fields.experienceLevel !== undefined) data.experienceLevel = fields.experienceLevel?.trim() || null;
    if (fields.education !== undefined) data.education = fields.education?.trim() || null;
    if (fields.headcount !== undefined) data.headcount = Math.max(1, parseInt(fields.headcount, 10) || 1);
    if (fields.salaryMin !== undefined) data.salaryMin = fields.salaryMin ? parseInt(fields.salaryMin, 10) : null;
    if (fields.salaryMax !== undefined) data.salaryMax = fields.salaryMax ? parseInt(fields.salaryMax, 10) : null;
    if (fields.salaryCurrency !== undefined) data.salaryCurrency = fields.salaryCurrency?.trim() || 'USD';
    if (fields.salaryPeriod !== undefined) data.salaryPeriod = fields.salaryPeriod?.trim() || 'monthly';
    if (fields.salaryText !== undefined) data.salaryText = fields.salaryText?.trim() || null;
    if (fields.description !== undefined) data.description = fields.description?.trim() || null;
    if (fields.qualifications !== undefined) data.qualifications = fields.qualifications?.trim() || null;
    if (fields.hardRequirements !== undefined) data.hardRequirements = fields.hardRequirements?.trim() || null;
    if (fields.requirements !== undefined) data.requirements = fields.requirements;
    if (fields.locations !== undefined) data.locations = fields.locations;
    if (fields.interviewMode !== undefined) data.interviewMode = fields.interviewMode?.trim() || 'standard';
    if (fields.passingScore !== undefined) data.passingScore = fields.passingScore ? parseInt(fields.passingScore, 10) : 60;
    if (fields.interviewLanguage !== undefined) {
      data.interviewLanguage = resolveInterviewLanguage(
        fields.interviewLanguage,
        fields.title !== undefined ? fields.title : existing.title,
        fields.description !== undefined ? fields.description : existing.description,
        fields.qualifications !== undefined ? fields.qualifications : existing.qualifications,
        fields.hardRequirements !== undefined ? fields.hardRequirements : existing.hardRequirements,
      );
    }
    if (fields.interviewDuration !== undefined) data.interviewDuration = fields.interviewDuration ? parseInt(fields.interviewDuration, 10) : 30;
    if (fields.interviewRequirements !== undefined) data.interviewRequirements = fields.interviewRequirements?.trim() || null;
    if (fields.evaluationRules !== undefined) data.evaluationRules = fields.evaluationRules?.trim() || null;
    if (fields.status !== undefined) {
      data.status = fields.status;
      if (fields.status === 'open' && !existing.publishedAt) data.publishedAt = new Date();
      if (fields.status === 'closed' || fields.status === 'filled') data.closedAt = new Date();
    }

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update job' });
  }
});

/**
 * DELETE /api/v1/jobs/:id
 * Delete a job
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const scope = await getVisibilityScope(req.user!);
    const existing = await prisma.job.findFirst({ where: { id: req.params.id, ...buildUserIdFilter(scope) } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    await prisma.job.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Job deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete job' });
  }
});

/**
 * POST /api/v1/jobs/:id/generate-jd
 * AI-generate a job description (legacy endpoint)
 */
router.post('/:id/generate-jd', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const userId = req.user!.id;
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId },
      include: { hiringRequest: true },
    });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const { language } = req.body || {};

    const jd = await createJDAgent.generate({
      title: job.title,
      requirements: job.hiringRequest?.requirements || '',
      jobDescription: job.description || '',
      language,
      requestId,
    });

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: { description: jd },
    });

    logger.info('JOBS', 'JD generated', { jobId: job.id }, requestId);
    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('JOBS', 'Failed to generate JD', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to generate job description' });
  }
});

/**
 * POST /api/v1/jobs/generate-content
 * AI-generate content from form data (no saved job required)
 */
router.post('/generate-content', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const { action = 'generate_section', section, language, jobTitle, companyName, department, locations, experienceLevel, existingContent } = req.body;
    if (!jobTitle) {
      return res.status(400).json({ success: false, error: 'jobTitle is required' });
    }

    const result = await jobContentAgent.generateContent({
      action,
      section,
      jobTitle,
      companyName: companyName || undefined,
      department: department || undefined,
      locations: locations || undefined,
      experienceLevel: experienceLevel || undefined,
      existingContent: existingContent || {},
      language,
    }, requestId);

    logger.info('JOBS', 'Content generated (no job)', { action, section }, requestId);
    res.json({ success: true, generated: result });
  } catch (error) {
    logger.error('JOBS', 'Failed to generate content', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to generate content' });
  }
});

/**
 * POST /api/v1/jobs/:id/generate-content
 * AI-generate content for one or all job sections
 */
router.post('/:id/generate-content', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const scope = await getVisibilityScope(req.user!);
    const job = await prisma.job.findFirst({ where: { id: req.params.id, ...buildUserIdFilter(scope) } });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const { action = 'generate_section', section, language, instructions } = req.body;

    const result = await jobContentAgent.generateContent({
      action,
      section,
      jobTitle: job.title,
      companyName: job.companyName || undefined,
      department: job.department || undefined,
      locations: (job.locations as any[]) || undefined,
      experienceLevel: job.experienceLevel || undefined,
      existingContent: {
        description: job.description || '',
        qualifications: job.qualifications || '',
        hardRequirements: job.hardRequirements || '',
        niceToHave: job.niceToHave || '',
        benefits: job.benefits || '',
        interviewRequirements: job.interviewRequirements || '',
        evaluationRules: job.evaluationRules || '',
      },
      language,
      instructions: instructions || undefined,
    }, requestId);

    // Update job with generated sections
    const updateData: any = {};
    for (const [key, value] of Object.entries(result.sections)) {
      if (value && ['description', 'qualifications', 'hardRequirements', 'niceToHave', 'benefits', 'interviewRequirements', 'evaluationRules'].includes(key)) {
        updateData[key] = value;
      }
    }

    let updated = job;
    if (Object.keys(updateData).length > 0) {
      updated = await prisma.job.update({
        where: { id: job.id },
        data: updateData,
      });
    }

    logger.info('JOBS', 'Content generated', { jobId: job.id, action, section }, requestId);
    res.json({ success: true, data: updated, generated: result });
  } catch (error) {
    logger.error('JOBS', 'Failed to generate content', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to generate content' });
  }
});

/**
 * GET /api/v1/jobs/:id/export?format=json|text|markdown|pdf
 * Export job in the requested format
 */
router.get('/:id/export', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const format = (req.query.format as string || 'json').toLowerCase();
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, userId },
      include: {
        hiringRequest: { select: { id: true, title: true } },
      },
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const safeTitle = job.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-').replace(/-+/g, '-').substring(0, 50);
    const slug = `${safeTitle}-${job.id.slice(0, 8)}`;

    const encodedSlug = encodeURIComponent(slug);
    const asciiFallback = slug.replace(/[^\x20-\x7E]/g, '').replace(/^-+|-+$/g, '') || 'job-export';

    if (format === 'pdf') {
      const { jobToPdf } = await import('../services/JobExportService.js');
      const doc = jobToPdf(job as any);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}.pdf"; filename*=UTF-8''${encodedSlug}.pdf`);
      doc.on('error', (err: Error) => {
        console.error('PDF generation error:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'PDF generation failed' });
        }
      });
      doc.pipe(res);
      doc.end();
    } else if (format === 'text' || format === 'txt') {
      const { jobToText } = await import('../services/JobExportService.js');
      const text = jobToText(job as any);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}.txt"; filename*=UTF-8''${encodedSlug}.txt`);
      res.send(text);
    } else if (format === 'markdown' || format === 'md') {
      const { jobToMarkdown } = await import('../services/JobExportService.js');
      const md = jobToMarkdown(job as any);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}.md"; filename*=UTF-8''${encodedSlug}.md`);
      res.send(md);
    } else {
      // Default: JSON
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}.json"; filename*=UTF-8''${encodedSlug}.json`);
      res.json(job);
    }
  } catch (error) {
    const errStr = error instanceof Error ? (error.stack || error.message) : String(error);
    console.error("DEBUG EXPORT ERROR:", errStr);
    logger.error('JOBS', 'Export failed', { error: errStr });
    res.status(500).json({ success: false, error: 'Failed to export job', details: errStr });
  }
});

/**
 * POST /api/v1/jobs/import
 * Import JD from file upload, parse and return structured data
 */
router.post('/import', requireAuth, uploadDoc.single('file'), async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const text = await documentParsingService.extractText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      requestId,
    );

    if (!text || text.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Could not extract text from file' });
    }

    logger.info('JOBS', 'Extracted text from file for JD import', {
      filename: req.file.originalname,
      textLength: text.length,
      textPreview: text.substring(0, 200),
    }, requestId);

    const parsed = await jdParserService.parseJD(text, requestId, req.file.originalname);

    logger.info('JOBS', 'JD parse result', {
      parsedTitle: parsed.title,
      parsedCompany: parsed.company,
      parsedLocation: parsed.location,
    }, requestId);

    // Extract salary min/max from compensation
    let salaryMin = '';
    let salaryMax = '';
    const comp = parsed.compensation;
    const salaryCurrency = comp.currency || '';
    const salaryPeriod = comp.period ? (comp.period.toLowerCase().includes('year') ? 'yearly' : 'monthly') : '';
    const salaryText = comp.salaryText || '';
    if (comp.salary) {
      const salaryStr = String(comp.salary);
      const normalized = salaryStr.replace(/(\d+)\s*[Kk]/g, (_, n: string) => String(parseInt(n) * 1000));
      const nums = normalized.replace(/[^0-9.,-]/g, '').split(/[-–~,]/);
      if (nums[0]) salaryMin = nums[0].trim();
      if (nums[1]) salaryMax = nums[1].trim();
    }

    // Build text fields for form from arrays
    const requirementsText = parsed.requirements.length > 0
      ? parsed.requirements.map(r => `- ${r}`).join('\n') : '';
    const mustHaveText = parsed.mustHave.length > 0
      ? parsed.mustHave.map((r, i) => `${i + 1}. ${r}`).join('\n') : '';
    const niceToHaveText = parsed.niceToHave.length > 0
      ? parsed.niceToHave.map(r => `- ${r}`).join('\n') : '';
    const responsibilitiesText = parsed.responsibilities.length > 0
      ? parsed.responsibilities.map(r => `- ${r}`).join('\n') : '';
    const benefitsText = (() => {
      const parts: string[] = [];
      if (salaryText) parts.push(`## 薪酬待遇\n${salaryText}`);
      if (parsed.benefits.length > 0) parts.push(parsed.benefits.map(b => `- ${b}`).join('\n'));
      return parts.join('\n\n');
    })();

    logger.info('JOBS', 'JD imported from file', { filename: req.file.originalname }, requestId);
    res.json({
      success: true,
      data: {
        rawText: text,
        parsed,
        suggestedFields: {
          title: parsed.title || '',
          companyName: parsed.company || '',
          department: parsed.department || '',
          location: parsed.location || '',
          workType: parsed.workType || '',
          employmentType: parsed.employmentType || '',
          experienceLevel: parsed.experienceLevel || '',
          education: parsed.education || '',
          headcount: parsed.headcount || 1,
          description: parsed.description || text,
          qualifications: requirementsText,
          hardRequirements: mustHaveText,
          niceToHave: niceToHaveText,
          benefits: benefitsText,
          responsibilities: responsibilitiesText,
          salaryMin,
          salaryMax,
          salaryCurrency,
          salaryPeriod,
          salaryText,
        },
      },
    });
  } catch (error) {
    logger.error('JOBS', 'Failed to import JD', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to import job description' });
  }
});

/**
 * POST /api/v1/jobs/:id/analyze
 * Run demand analysis using MarketIntelligenceAgent
 */
router.post('/:id/analyze', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const userId = req.user!.id;
    const job = await prisma.job.findFirst({ where: { id: req.params.id, userId } });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const result = await marketIntelligenceAgent.analyze({
      title: job.title,
      requirements: job.qualifications || job.hardRequirements || '',
      jobDescription: job.description || '',
      candidateProfile: {
        candidatePersonaSummary: `Ideal candidate for ${job.title} at ${job.companyName || 'the company'}`,
        idealBackground: {
          typicalDegrees: [],
          typicalCareerPath: [],
          yearsOfExperience: job.experienceLevel || '',
          industryBackground: [],
        },
        skillMapping: {
          mustHave: [],
          niceToHave: [],
        },
        personalityTraits: {
          traits: [],
          cultureFitIndicators: [],
        },
        dayInTheLife: '',
      },
    }, requestId);

    logger.info('JOBS', 'Demand analysis completed', { jobId: job.id }, requestId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('JOBS', 'Failed to run demand analysis', { error: error instanceof Error ? error.message : String(error) }, requestId);
    res.status(500).json({ success: false, error: 'Failed to run demand analysis' });
  }
});

/**
 * POST /api/v1/jobs/from-request/:requestId
 * Create a job from an existing hiring request
 */
router.post('/from-request/:requestId', requireAuth, async (req, res) => {
  const logRequestId = req.requestId || generateRequestId();
  try {
    const userId = req.user!.id;
    const accessWhere = await buildHiringRequestAccessWhere(req.user!, req.params.requestId);
    const hr = await prisma.hiringRequest.findFirst({
      where: accessWhere,
    });
    if (!hr) {
      return res.status(404).json({ success: false, error: 'Hiring request not found' });
    }

    const customTitle = typeof req.body?.title === 'string' ? req.body.title : null;
    const preferredLanguage = typeof req.body?.preferredLanguage === 'string'
      ? req.body.preferredLanguage
      : null;
    const overwriteJobId = typeof req.body?.overwriteJobId === 'string'
      ? req.body.overwriteJobId
      : null;
    const resolvedTitle = customTitle?.trim() || hr.title;

    const draft = await buildJobDraftFromHiringRequest(hr, preferredLanguage, logRequestId);

    // Auto-generate missing content sections via LLM
    const fieldsToGenerate = (['hardRequirements', 'niceToHave', 'interviewRequirements', 'evaluationRules'] as const)
      .filter(f => !draft[f]);

    if (fieldsToGenerate.length > 0) {
      try {
        const existingContent: Record<string, string> = {};
        for (const key of ['description', 'qualifications', 'hardRequirements', 'niceToHave', 'benefits'] as const) {
          if (draft[key]) existingContent[key] = draft[key]!;
        }

        const agentResult = await jobContentAgent.generateContent({
          action: 'generate_all',
          jobTitle: resolvedTitle,
          companyName: draft.companyName || undefined,
          department: draft.department || undefined,
          locations: (draft.locations as any[]) || undefined,
          experienceLevel: draft.experienceLevel || undefined,
          existingContent,
          language: draft.interviewLanguage || undefined,
          instructions: draft.sourceText || undefined,
        }, logRequestId);

        // Only fill in sections that were empty — never overwrite parser results
        for (const section of fieldsToGenerate) {
          if (agentResult.sections[section]) {
            (draft as any)[section] = agentResult.sections[section];
          }
        }
        // Also fill description if it was empty
        if (!draft.description && agentResult.sections.description) {
          draft.description = agentResult.sections.description;
        }
        if (!draft.qualifications && agentResult.sections.qualifications) {
          draft.qualifications = agentResult.sections.qualifications;
        }
        if (!draft.benefits && agentResult.sections.benefits) {
          draft.benefits = agentResult.sections.benefits;
        }

        logger.info('JOBS', 'AI-generated missing job sections from hiring request', {
          hiringRequestId: hr.id,
          generated: fieldsToGenerate.filter(s => agentResult.sections[s]),
        }, logRequestId);
      } catch (error) {
        // Non-fatal: job still gets created with parser-only data
        logger.warn('JOBS', 'Failed to AI-generate missing job sections', {
          error: error instanceof Error ? error.message : String(error),
        }, logRequestId);
      }
    }

    if (overwriteJobId) {
      const targetJob = await prisma.job.findFirst({
        where: { id: overwriteJobId, userId },
      });
      if (!targetJob) {
        return res.status(404).json({ success: false, error: 'Target job not found' });
      }

      const updatedJob = await prisma.job.update({
        where: { id: targetJob.id },
        data: {
          title: resolvedTitle,
          hiringRequestId: hr.id,
          companyName: draft.companyName,
          department: draft.department,
          location: draft.location,
          workType: draft.workType,
          employmentType: draft.employmentType,
          experienceLevel: draft.experienceLevel,
          education: draft.education,
          headcount: draft.headcount,
          salaryMin: draft.salaryMin,
          salaryMax: draft.salaryMax,
          salaryCurrency: draft.salaryCurrency,
          salaryPeriod: draft.salaryPeriod,
          salaryText: draft.salaryText,
          description: draft.description,
          qualifications: draft.qualifications,
          hardRequirements: draft.hardRequirements,
          niceToHave: draft.niceToHave,
          benefits: draft.benefits,
          requirements: draft.requirements,
          parsedData: draft.parsedData,
          ...(draft.locations ? { locations: draft.locations } : {}),
          interviewLanguage: draft.interviewLanguage,
          interviewRequirements: draft.interviewRequirements,
          evaluationRules: draft.evaluationRules,
          status: 'draft',
          publishedAt: null,
          closedAt: null,
        },
      });

      logger.info('JOBS', 'Job overwritten from hiring request', {
        jobId: updatedJob.id,
        hiringRequestId: hr.id,
        overwriteJobId,
      }, logRequestId);
      return res.json({ success: true, data: updatedJob, overwritten: true });
    }

    const job = await prisma.job.create({
      data: {
        userId,
        hiringRequestId: hr.id,
        title: resolvedTitle,
        companyName: draft.companyName,
        department: draft.department,
        location: draft.location,
        workType: draft.workType,
        employmentType: draft.employmentType,
        experienceLevel: draft.experienceLevel,
        education: draft.education,
        headcount: draft.headcount,
        salaryMin: draft.salaryMin,
        salaryMax: draft.salaryMax,
        salaryCurrency: draft.salaryCurrency,
        salaryPeriod: draft.salaryPeriod,
        salaryText: draft.salaryText,
        description: draft.description,
        qualifications: draft.qualifications,
        hardRequirements: draft.hardRequirements,
        niceToHave: draft.niceToHave,
        benefits: draft.benefits,
        requirements: draft.requirements,
        parsedData: draft.parsedData,
        ...(draft.locations ? { locations: draft.locations } : {}),
        interviewLanguage: draft.interviewLanguage,
        interviewRequirements: draft.interviewRequirements,
        evaluationRules: draft.evaluationRules,
        status: 'draft',
      },
    });

    logger.info('JOBS', 'Job created from hiring request', { jobId: job.id, hiringRequestId: hr.id }, logRequestId);
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    logger.error('JOBS', 'Failed to create job from request', {
      error: error instanceof Error ? error.message : String(error),
      hiringRequestId: req.params.requestId,
    }, logRequestId);
    res.status(500).json({ success: false, error: 'Failed to create job from request' });
  }
});

export default router;
