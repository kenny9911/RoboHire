import { parseSalaryFromText, type ParsedSalary } from './salaryParser.js';

export interface CandidatePreferences {
  expectedSalary?: {
    min?: number;
    max?: number;
    currency: string;
    period: 'monthly' | 'yearly';
  };
  preferredLocation?: string;
  workType?: string;
  industry?: string;
  jobTitle?: string;
  source: string;
}

/**
 * Extract candidate preferences from job description fields available during Phase 1.
 * Since the CSV has no explicit preference columns, we derive from job context.
 */
export function extractPreferencesFromJob(opts: {
  jobTitle?: string;
  jobDescription?: string;
}): CandidatePreferences {
  const prefs: CandidatePreferences = { source: 'gohire_import' };

  if (opts.jobTitle) {
    prefs.jobTitle = opts.jobTitle;
    // Infer industry/domain from job title keywords
    prefs.industry = inferIndustry(opts.jobTitle) || undefined;
  }

  if (opts.jobDescription) {
    // Extract salary
    const salary = parseSalaryFromText(opts.jobDescription);
    if (salary) {
      prefs.expectedSalary = {
        min: salary.salaryMin,
        max: salary.salaryMax,
        currency: salary.salaryCurrency,
        period: salary.salaryPeriod,
      };
    }

    // Extract location from description
    const location = extractLocation(opts.jobDescription);
    if (location) prefs.preferredLocation = location;

    // Extract work type
    const workType = extractWorkType(opts.jobDescription);
    if (workType) prefs.workType = workType;
  }

  return prefs;
}

/**
 * Enrich preferences with data from parsed resume (Phase 2).
 * Looks for 求职意向/期望薪资/期望城市 sections in the parsed resume data.
 */
export function enrichPreferencesFromResume(
  existing: CandidatePreferences,
  parsedData: any,
): CandidatePreferences {
  if (!parsedData) return existing;

  const prefs = { ...existing };

  // Check otherSections for preference-related content
  const otherSections = parsedData.otherSections as Record<string, string> | undefined;
  if (otherSections) {
    for (const [key, value] of Object.entries(otherSections)) {
      if (/求职意向|期望职位|职业目标/.test(key)) {
        if (!prefs.jobTitle && value) prefs.jobTitle = value.trim().slice(0, 100);
      }
      if (/期望薪[资酬]|薪资期望/.test(key) && !prefs.expectedSalary) {
        const salary = parseSalaryFromText(value);
        if (salary) {
          prefs.expectedSalary = {
            min: salary.salaryMin,
            max: salary.salaryMax,
            currency: salary.salaryCurrency,
            period: salary.salaryPeriod,
          };
        }
      }
      if (/期望[城地]|工作地[点区]|期望工作/.test(key) && !prefs.preferredLocation) {
        prefs.preferredLocation = value.trim().slice(0, 100);
      }
    }
  }

  // Check summary for preference keywords
  if (parsedData.summary && typeof parsedData.summary === 'string') {
    if (!prefs.preferredLocation) {
      const loc = extractLocation(parsedData.summary);
      if (loc) prefs.preferredLocation = loc;
    }
  }

  return prefs;
}

// --- Internal helpers ---

const LOCATION_PATTERNS = [
  /位于(.{2,10}?)[，,。.；;]/,
  /工作地[点区][：:]\s*(.{2,15})/,
  /办公地[点区][：:]\s*(.{2,15})/,
  /(北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|重庆|苏州|天津|长沙|郑州|青岛|大连|厦门|宁波|无锡|佛山|东莞|合肥|昆明|福州|济南|哈尔滨|沈阳|长春)/,
];

function extractLocation(text: string): string | null {
  for (const pattern of LOCATION_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[1].trim();
  }
  return null;
}

function extractWorkType(text: string): string | null {
  if (/远程|remote|居家办公|在家办公/.test(text)) return 'remote';
  if (/混合办公|hybrid|灵活办公/.test(text)) return 'hybrid';
  if (/现场办公|on-?site|坐班|驻场/.test(text)) return 'onsite';
  return null;
}

function inferIndustry(title: string): string | null {
  const mapping: Array<[RegExp, string]> = [
    [/大数据|数据[工开]/, '大数据'],
    [/AI|人工智能|机器学习|深度学习/, 'AI/人工智能'],
    [/ERP|SAP/, 'ERP'],
    [/Java|后端|backend/, '后端开发'],
    [/前端|frontend|React|Vue/, '前端开发'],
    [/测试|QA|quality/, '软件测试'],
    [/运维|DevOps|SRE/, '运维'],
    [/产品|product/, '产品'],
    [/设计|UI|UX/, '设计'],
    [/财务|会计|finance/, '财务'],
  ];
  for (const [pattern, label] of mapping) {
    if (pattern.test(title)) return label;
  }
  return null;
}
