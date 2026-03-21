import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';
import { useAuth } from '../../context/AuthContext';
import ResumeUploadModal from '../../components/ResumeUploadModal';
import RecruiterTeamFilter, { type RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';
import CandidatePreferencesModal, { type CandidatePreferences } from '../../components/CandidatePreferencesModal';
import ApplyToJobModal from '../../components/ApplyToJobModal';
import {
  IconBriefcase,
  IconAdjustments,
  IconX,
  IconBookmark,
  IconFiles,
  IconChevronLeft,
  IconChevronRight,
  IconUpload,
  IconSearch,
  IconChevronDown,
  IconLayoutGrid,
  IconList,
  IconUsers,
  IconMailForward,
  IconCircleCheck,
  IconExternalLink,
  IconEye,
  IconCopy,
  IconRefresh,
  IconCheck,
  IconSend,
} from '@tabler/icons-react';

// Country/region list for filter dropdown — covers major hiring markets
const COUNTRY_LIST = [
  { value: 'China', label: '🇨🇳 中国 / China' },
  { value: 'United States', label: '🇺🇸 美国 / United States' },
  { value: 'United Kingdom', label: '🇬🇧 英国 / United Kingdom' },
  { value: 'Japan', label: '🇯🇵 日本 / Japan' },
  { value: 'South Korea', label: '🇰🇷 韩国 / South Korea' },
  { value: 'Singapore', label: '🇸🇬 新加坡 / Singapore' },
  { value: 'India', label: '🇮🇳 印度 / India' },
  { value: 'Germany', label: '🇩🇪 德国 / Germany' },
  { value: 'France', label: '🇫🇷 法国 / France' },
  { value: 'Canada', label: '🇨🇦 加拿大 / Canada' },
  { value: 'Australia', label: '🇦🇺 澳大利亚 / Australia' },
  { value: 'Brazil', label: '🇧🇷 巴西 / Brazil' },
  { value: 'Hong Kong', label: '🇭🇰 香港 / Hong Kong' },
  { value: 'Taiwan', label: '🇹🇼 台湾 / Taiwan' },
  { value: 'Indonesia', label: '🇮🇩 印度尼西亚 / Indonesia' },
  { value: 'Thailand', label: '🇹🇭 泰国 / Thailand' },
  { value: 'Vietnam', label: '🇻🇳 越南 / Vietnam' },
  { value: 'Philippines', label: '🇵🇭 菲律宾 / Philippines' },
  { value: 'Malaysia', label: '🇲🇾 马来西亚 / Malaysia' },
  { value: 'Netherlands', label: '🇳🇱 荷兰 / Netherlands' },
  { value: 'Spain', label: '🇪🇸 西班牙 / Spain' },
  { value: 'Italy', label: '🇮🇹 意大利 / Italy' },
  { value: 'Sweden', label: '🇸🇪 瑞典 / Sweden' },
  { value: 'Switzerland', label: '🇨🇭 瑞士 / Switzerland' },
  { value: 'UAE', label: '🇦🇪 阿联酋 / UAE' },
  { value: 'Saudi Arabia', label: '🇸🇦 沙特阿拉伯 / Saudi Arabia' },
  { value: 'Mexico', label: '🇲🇽 墨西哥 / Mexico' },
  { value: 'Argentina', label: '🇦🇷 阿根廷 / Argentina' },
  { value: 'Nigeria', label: '🇳🇬 尼日利亚 / Nigeria' },
  { value: 'South Africa', label: '🇿🇦 南非 / South Africa' },
  { value: 'Israel', label: '🇮🇱 以色列 / Israel' },
  { value: 'Poland', label: '🇵🇱 波兰 / Poland' },
  { value: 'Portugal', label: '🇵🇹 葡萄牙 / Portugal' },
  { value: 'Ireland', label: '🇮🇪 爱尔兰 / Ireland' },
  { value: 'New Zealand', label: '🇳🇿 新西兰 / New Zealand' },
  { value: 'Russia', label: '🇷🇺 俄罗斯 / Russia' },
  { value: 'Turkey', label: '🇹🇷 土耳其 / Turkey' },
  { value: 'Egypt', label: '🇪🇬 埃及 / Egypt' },
  { value: 'Pakistan', label: '🇵🇰 巴基斯坦 / Pakistan' },
  { value: 'Bangladesh', label: '🇧🇩 孟加拉国 / Bangladesh' },
  { value: 'Colombia', label: '🇨🇴 哥伦比亚 / Colombia' },
  { value: 'Chile', label: '🇨🇱 智利 / Chile' },
  { value: 'Peru', label: '🇵🇪 秘鲁 / Peru' },
  { value: 'Czech Republic', label: '🇨🇿 捷克 / Czech Republic' },
  { value: 'Romania', label: '🇷🇴 罗马尼亚 / Romania' },
  { value: 'Ukraine', label: '🇺🇦 乌克兰 / Ukraine' },
  { value: 'Austria', label: '🇦🇹 奥地利 / Austria' },
  { value: 'Belgium', label: '🇧🇪 比利时 / Belgium' },
  { value: 'Denmark', label: '🇩🇰 丹麦 / Denmark' },
  { value: 'Finland', label: '🇫🇮 芬兰 / Finland' },
  { value: 'Norway', label: '🇳🇴 挪威 / Norway' },
  { value: 'Kenya', label: '🇰🇪 肯尼亚 / Kenya' },
];

interface ExperienceEntry {
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  duration: string;
  description?: string;
  technologies?: string[];
  employmentType?: string;
}

interface LanguageEntry {
  language: string;
  proficiency?: string;
}

interface ResumeJobFit {
  fitScore: number | null;
  fitGrade: string | null;
  pipelineStatus?: string | null;
  hiringRequest?: { title?: string | null } | null;
}

interface InterviewStatus {
  invited: boolean;
  invitedAt: string | null;
  completed: boolean;
  completedAt: string | null;
  durationSeconds: number | null;
}

interface Resume {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  summary: string | null;
  highlight: string | null;
  fileName: string | null;
  status: string;
  tags: string[];
  preferences: CandidatePreferences | null;
  hasInvitations: boolean;
  interviewStatus?: InterviewStatus;
  resumeJobFits?: ResumeJobFit[];
  notes: string | null;
  _versionCount?: number;
  createdAt: string;
  updatedAt: string;
  parsedData: {
    summary?: string;
    address?: string;
    location?: string;
    languages?: LanguageEntry[];
    skills?: string[] | {
      technical?: string[];
      soft?: string[];
      tools?: string[];
      frameworks?: string[];
      languages?: string[];
      other?: string[];
    };
    experience?: ExperienceEntry[];
    education?: Array<{ institution: string; degree?: string; field?: string; location?: string }>;
  } | null;
}

type EnrichedResume = Resume & {
  _topSkills: string[];
  _highlight: string | null;
  _workExp: { fullTimeYears: number; internshipMonths: number } | null;
  _notableCompanies: string[];
  _industryTags: string[];
  _jobCategory: string | null;
  _parseWarning: boolean;
  _location: string | null;
  _languages: LanguageEntry[];
  _matchScore: number | null;
  _matchLabel: string;
  _matchSummary: string | null;
  _bestFitTitle: string | null;
  _experienceValue: number | null;
};

// ── Notable companies for "Ex-XXX" tags ──
const NOTABLE_COMPANIES: Array<{ display: string; keywords: string[] }> = [
  // US / Global
  { display: 'Google', keywords: ['google', 'alphabet'] },
  { display: 'Microsoft', keywords: ['microsoft'] },
  { display: 'Apple', keywords: ['apple inc'] },
  { display: 'Amazon', keywords: ['amazon'] },
  { display: 'Meta', keywords: ['meta', 'facebook'] },
  { display: 'Netflix', keywords: ['netflix'] },
  { display: 'Tesla', keywords: ['tesla'] },
  { display: 'OpenAI', keywords: ['openai'] },
  { display: 'Nvidia', keywords: ['nvidia'] },
  { display: 'Stripe', keywords: ['stripe'] },
  { display: 'Uber', keywords: ['uber'] },
  { display: 'Airbnb', keywords: ['airbnb'] },
  { display: 'Oracle', keywords: ['oracle'] },
  { display: 'IBM', keywords: ['ibm'] },
  { display: 'Intel', keywords: ['intel'] },
  { display: 'Adobe', keywords: ['adobe'] },
  { display: 'Salesforce', keywords: ['salesforce'] },
  { display: 'LinkedIn', keywords: ['linkedin'] },
  { display: 'Twitter', keywords: ['twitter'] },
  { display: 'Snap', keywords: ['snap inc', 'snapchat'] },
  { display: 'Spotify', keywords: ['spotify'] },
  { display: 'PayPal', keywords: ['paypal'] },
  { display: 'Goldman Sachs', keywords: ['goldman sachs', 'goldman'] },
  { display: 'JPMorgan', keywords: ['jpmorgan', 'jp morgan', 'j.p. morgan'] },
  { display: 'McKinsey', keywords: ['mckinsey'] },
  // China
  { display: '腾讯', keywords: ['腾讯', 'tencent'] },
  { display: '阿里巴巴', keywords: ['阿里巴巴', '阿里', 'alibaba'] },
  { display: '百度', keywords: ['百度', 'baidu'] },
  { display: '字节跳动', keywords: ['字节跳动', '字节', 'bytedance', 'tiktok'] },
  { display: '华为', keywords: ['华为', 'huawei'] },
  { display: '美团', keywords: ['美团', 'meituan'] },
  { display: '京东', keywords: ['京东', 'jd.com'] },
  { display: '小红书', keywords: ['小红书', 'xiaohongshu', 'red'] },
  { display: '蚂蚁集团', keywords: ['蚂蚁', '蚂蚁集团', 'ant group', 'ant financial'] },
  { display: '网易', keywords: ['网易', 'netease'] },
  { display: '拼多多', keywords: ['拼多多', 'pinduoduo'] },
  { display: '滴滴', keywords: ['滴滴', 'didi'] },
  { display: '快手', keywords: ['快手', 'kuaishou'] },
  { display: '商汤', keywords: ['商汤', 'sensetime'] },
  { display: 'OPPO', keywords: ['oppo'] },
  { display: '小米', keywords: ['小米', 'xiaomi'] },
  { display: '比亚迪', keywords: ['比亚迪', 'byd'] },
  // Japan / Korea
  { display: 'Sony', keywords: ['sony'] },
  { display: 'Samsung', keywords: ['samsung'] },
  { display: 'Toyota', keywords: ['toyota'] },
  // Europe
  { display: 'SAP', keywords: ['sap'] },
  { display: 'Siemens', keywords: ['siemens'] },
];

// ── Industry classification keywords ──
const INDUSTRY_KEYWORDS: Array<{ tag: string; keywords: string[] }> = [
  { tag: 'AI/ML', keywords: ['ai', 'machine learning', 'deep learning', 'nlp', 'computer vision', '人工智能', '机器学习', '深度学习', 'llm', 'generative'] },
  { tag: 'Fintech', keywords: ['fintech', 'finance', 'banking', 'payment', '金融', '银行', '支付', 'trading', 'quantitative', '量化'] },
  { tag: 'E-commerce', keywords: ['e-commerce', 'ecommerce', '电商', 'retail', '零售', 'marketplace'] },
  { tag: 'SaaS', keywords: ['saas', 'b2b', 'enterprise software', 'cloud platform'] },
  { tag: 'Gaming', keywords: ['game', 'gaming', '游戏', 'unity', 'unreal'] },
  { tag: 'Healthcare', keywords: ['health', 'medical', 'biotech', '医疗', '生物', 'pharma'] },
  { tag: 'Education', keywords: ['education', 'edtech', '教育', 'learning platform'] },
  { tag: 'Automotive', keywords: ['automotive', 'autonomous', '汽车', '自动驾驶', 'ev', 'vehicle'] },
  { tag: 'Social', keywords: ['social media', 'social network', '社交', 'community'] },
  { tag: 'Security', keywords: ['security', 'cybersecurity', '安全', 'infosec'] },
  { tag: 'Blockchain', keywords: ['blockchain', 'web3', 'crypto', 'defi', '区块链'] },
  { tag: 'IoT', keywords: ['iot', 'embedded', '物联网', '嵌入式'] },
];

// ── Job category classification ──
const JOB_CATEGORIES: Array<{ category: string; keywords: string[] }> = [
  { category: 'Engineering', keywords: ['engineer', 'developer', 'programmer', '工程师', '开发', 'sde', 'swe', 'backend', 'frontend', 'fullstack', 'full-stack', 'full stack', 'devops', '架构师', 'architect'] },
  { category: 'AI/ML', keywords: ['ai', 'ml', 'machine learning', 'data scientist', 'nlp', '算法', 'algorithm', 'research', '研究员', 'deep learning'] },
  { category: 'Product', keywords: ['product manager', 'product owner', '产品经理', '产品', 'pm'] },
  { category: 'Design', keywords: ['designer', 'ux', 'ui', '设计师', '设计', 'visual', 'graphic'] },
  { category: 'Data', keywords: ['data analyst', 'data engineer', '数据分析', '数据工程', 'analytics', 'bi'] },
  { category: 'Marketing', keywords: ['marketing', '市场', '营销', 'growth', 'seo', 'content'] },
  { category: 'Operations', keywords: ['operations', '运营', '运维', 'sre', 'infrastructure'] },
  { category: 'Sales', keywords: ['sales', 'account', 'bd', 'business develop', '销售', '客户经理'] },
  { category: 'Management', keywords: ['manager', 'director', 'vp', 'cto', 'ceo', '总监', '经理', 'lead', 'head of', '负责人', '主管'] },
  { category: 'QA', keywords: ['qa', 'test', 'quality', '测试', '质量'] },
  { category: 'HR', keywords: ['hr', 'human resource', '人力', '招聘', 'recruiter', 'talent'] },
  { category: 'Finance', keywords: ['finance', 'accounting', '财务', '会计', 'cfo'] },
];

const CATEGORY_COLORS: Record<string, string> = {
  Engineering: 'bg-blue-100 text-blue-700',
  'AI/ML': 'bg-purple-100 text-purple-700',
  Product: 'bg-emerald-100 text-emerald-700',
  Design: 'bg-pink-100 text-pink-700',
  Data: 'bg-cyan-100 text-cyan-700',
  Marketing: 'bg-orange-100 text-orange-700',
  Operations: 'bg-slate-100 text-slate-700',
  Management: 'bg-amber-100 text-amber-700',
  QA: 'bg-teal-100 text-teal-700',
  Sales: 'bg-rose-100 text-rose-700',
  HR: 'bg-violet-100 text-violet-700',
  Finance: 'bg-lime-100 text-lime-700',
};

// ── Pre-compiled regex patterns ──
const INTERN_RE = /intern|实习|インターン|praktik/i;
const SENTENCE_END_RE = /[.。！!？?]\s|[.。！!？?]$/;
const YEARS_RE = /(\d+(?:\.\d+)?)\s*(?:year|年|yr)/i;
const MONTHS_RE = /(\d+)\s*(?:month|月|mo)/i;
const PRESENT_RE = /present|current|至今|现在/i;
const RANGE_EXPERIENCE_MIN = 0;
const RANGE_EXPERIENCE_MAX = 20;
const RANGE_MATCH_MIN = 0;
const RANGE_MATCH_MAX = 100;
const LANGUAGE_FILTER_OPTIONS = [
  { value: 'English', tKey: 'product.talent.filterLanguageEnglish', fallback: 'English' },
  { value: 'Spanish', tKey: 'product.talent.filterLanguageSpanish', fallback: 'Spanish' },
  { value: 'Chinese', tKey: 'product.talent.filterLanguageChinese', fallback: 'Chinese' },
] as const;

// ── Helper functions ──

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function shortenText(text: string, limit = 170): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trim()}…`;
}

function hasResumeParseWarning(parsedData: Resume['parsedData']): boolean {
  const summary = parsedData?.summary?.trim().toLowerCase() || '';
  return summary.startsWith('unable to parse resume');
}

function getTopSkills(parsedData: Resume['parsedData'], count = 5): string[] {
  if (!parsedData?.skills) return [];
  if (Array.isArray(parsedData.skills)) return parsedData.skills.slice(0, count);
  const s = parsedData.skills;
  const all: string[] = [
    ...(s.technical || []),
    ...(s.frameworks || []),
    ...(s.tools || []),
    ...(s.languages || []),
    ...(s.other || []),
    ...(s.soft || []),
  ];
  return [...new Set(all)].slice(0, count);
}

function getHighlight(parsedData: Resume['parsedData']): string | null {
  if (hasResumeParseWarning(parsedData)) return null;

  // Try summary first
  if (parsedData?.summary) {
    const text = parsedData.summary.trim();
    if (text) {
      const sentenceEnd = text.search(SENTENCE_END_RE);
      if (sentenceEnd > 0 && sentenceEnd <= 100) {
        return text.substring(0, sentenceEnd + 1);
      }
      if (text.length <= 80) return text;
      return text.substring(0, 80) + '...';
    }
  }

  // Fallback: construct from experience + skills
  if (!parsedData) return null;
  const parts: string[] = [];

  if (parsedData.experience?.[0]) {
    const latest = parsedData.experience[0];
    if (latest.role && latest.company) {
      parts.push(`${latest.role} at ${latest.company}`);
    } else if (latest.role) {
      parts.push(latest.role);
    }
  }

  const skills = getTopSkills(parsedData, 3);
  if (skills.length > 0 && parts.length === 0) {
    parts.push(skills.join(', '));
  }

  if (parts.length === 0) return null;
  const result = parts.join(' · ');
  return result.length <= 80 ? result : result.substring(0, 77) + '...';
}

function getResumeLocation(parsedData: Resume['parsedData']): string | null {
  const directLocation = parsedData?.location?.trim() || parsedData?.address?.trim();
  if (directLocation) return directLocation;

  const latestExperienceLocation = parsedData?.experience?.find((item) => item.location?.trim())?.location?.trim();
  if (latestExperienceLocation) return latestExperienceLocation;

  const educationLocation = parsedData?.education?.find((item) => item.location?.trim())?.location?.trim();
  return educationLocation || null;
}

function getResumeLanguages(parsedData: Resume['parsedData']): LanguageEntry[] {
  const normalized = new Map<string, LanguageEntry>();

  for (const entry of parsedData?.languages || []) {
    const label = entry.language?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!normalized.has(key)) {
      normalized.set(key, { language: label, proficiency: entry.proficiency?.trim() || undefined });
    }
  }

  if (normalized.size === 0 && parsedData?.skills && !Array.isArray(parsedData.skills)) {
    for (const label of parsedData.skills.languages || []) {
      const value = label.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!normalized.has(key)) normalized.set(key, { language: value });
    }
  }

  return [...normalized.values()].slice(0, 4);
}

function getPrimaryFit(resume: Resume): ResumeJobFit | null {
  if (!Array.isArray(resume.resumeJobFits) || resume.resumeJobFits.length === 0) return null;
  return resume.resumeJobFits.find((fit) => typeof fit.fitScore === 'number') || resume.resumeJobFits[0] || null;
}

function getMatchLabel(score: number | null): string {
  if (score === null) return 'Manual review';
  if (score >= 90) return 'Excellent fit';
  if (score >= 75) return 'Strong fit';
  if (score >= 60) return 'Qualified';
  return 'Needs review';
}

function getMatchSummary(resume: Resume, highlight: string | null): string | null {
  if (hasResumeParseWarning(resume.parsedData)) {
    return 'Parsing confidence is low for this resume. Review the original file before relying on AI matching.';
  }

  const primaryFit = getPrimaryFit(resume);
  const score = typeof primaryFit?.fitScore === 'number' ? Math.round(primaryFit.fitScore) : null;
  const hiringTitle = primaryFit?.hiringRequest?.title?.trim();
  const sourceText = resume.summary?.trim() || highlight?.trim() || resume.parsedData?.summary?.trim() || '';
  const compactSource = sourceText ? shortenText(sourceText, 180) : '';

  if (score !== null && hiringTitle) {
    const lead = score >= 90
      ? `High-confidence alignment for ${hiringTitle}.`
      : score >= 75
        ? `Strong alignment for ${hiringTitle}.`
        : score >= 60
          ? `Relevant profile for ${hiringTitle}, with some recruiter review recommended.`
          : `Match signals are mixed for ${hiringTitle}.`;
    return compactSource ? `${lead} ${compactSource}` : lead;
  }

  if (score !== null) {
    const lead = score >= 90
      ? 'High-confidence fit based on the current job-fit signals.'
      : score >= 75
        ? 'Promising fit based on the current job-fit signals.'
        : score >= 60
          ? 'Candidate shows partial alignment based on the current job-fit signals.'
          : 'AI fit signals are limited, so this profile should be reviewed manually.';
    return compactSource ? `${lead} ${compactSource}` : lead;
  }

  return compactSource || 'AI summary will improve after this candidate is matched against an active hiring request.';
}

function getWorkExperience(parsedData: Resume['parsedData']): { fullTimeYears: number; internshipMonths: number } | null {
  if (!parsedData?.experience || parsedData.experience.length === 0) return null;

  let fullTimeMonths = 0;
  let internshipMonths = 0;

  for (const exp of parsedData.experience) {
    const isIntern = exp.employmentType === 'internship' ||
      INTERN_RE.test(exp.role || '') ||
      INTERN_RE.test(exp.company || '');

    const durationStr = exp.duration || '';
    let months = 0;
    const yearMatch = durationStr.match(YEARS_RE);
    const monthMatch = durationStr.match(MONTHS_RE);
    if (yearMatch) months += parseFloat(yearMatch[1]) * 12;
    if (monthMatch) months += parseInt(monthMatch[1]);

    if (months === 0 && exp.startDate) {
      const start = new Date(exp.startDate);
      const end = exp.endDate && !PRESENT_RE.test(exp.endDate)
        ? new Date(exp.endDate)
        : new Date();
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        months = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
      }
    }

    if (isIntern) {
      internshipMonths += months;
    } else {
      fullTimeMonths += months;
    }
  }

  if (fullTimeMonths === 0 && internshipMonths === 0) return null;
  return {
    fullTimeYears: Math.round(fullTimeMonths / 12 * 10) / 10,
    internshipMonths: Math.round(internshipMonths),
  };
}

function getNotableCompanies(parsedData: Resume['parsedData']): string[] {
  if (!parsedData?.experience) return [];
  const found = new Set<string>();
  for (const exp of parsedData.experience) {
    const companyLower = (exp.company || '').toLowerCase();
    for (const nc of NOTABLE_COMPANIES) {
      if (nc.keywords.some(kw => companyLower.includes(kw))) {
        found.add(nc.display);
      }
    }
  }
  return [...found].slice(0, 3);
}

function getIndustryTags(parsedData: Resume['parsedData']): string[] {
  if (!parsedData?.experience) return [];
  const text = parsedData.experience
    .map(e => `${e.role || ''} ${(e.technologies || []).join(' ')}`)
    .join(' ')
    .toLowerCase();

  const matches: Array<{ tag: string; count: number }> = [];
  for (const ind of INDUSTRY_KEYWORDS) {
    const count = ind.keywords.filter(kw => text.includes(kw)).length;
    if (count > 0) matches.push({ tag: ind.tag, count });
  }
  matches.sort((a, b) => b.count - a.count);
  return matches.slice(0, 2).map(m => m.tag);
}

function getJobCategory(currentRole: string | null, parsedData: Resume['parsedData']): string | null {
  const roleText = (currentRole || '').toLowerCase();
  const latestRole = parsedData?.experience?.[0]?.role?.toLowerCase() || '';
  const combined = `${roleText} ${latestRole}`;

  for (const cat of JOB_CATEGORIES) {
    if (cat.keywords.some(kw => combined.includes(kw))) {
      return cat.category;
    }
  }
  return null;
}

function getExperienceValue(resume: Pick<Resume, 'experienceYears'> & { parsedData: Resume['parsedData'] }, workExp: EnrichedResume['_workExp']): number | null {
  if (workExp) {
    return Math.round((workExp.fullTimeYears + (workExp.internshipMonths / 12)) * 10) / 10;
  }

  const match = resume.experienceYears?.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function formatDateTimeShort(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Memoized Card Component ──
const ResumeCard = memo(function ResumeCard({ resume, onDelete, onPreferences, onApply, onInvite, onViewSummary, t }: { resume: EnrichedResume; onDelete: (id: string) => void; onPreferences: (resume: EnrichedResume) => void; onApply: (resume: EnrichedResume) => void; onInvite: (resume: EnrichedResume) => void; onViewSummary: (resumeId: string, name: string, summary: string) => void; t: (k: string, f: string) => string }) {
  const [cardCopied, setCardCopied] = useState(false);
  const hasPrefs = resume.preferences && Object.values(resume.preferences).some(v => v && (Array.isArray(v) ? v.length > 0 : String(v).trim()));
  const ivStatus = resume.interviewStatus;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex gap-5">
        {/* Avatar */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base font-bold text-slate-500">
          {getInitials(resume.name)}
        </div>

        {/* Info column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{resume.name}</h3>
                {resume._parseWarning && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    {t('product.talent.parseWarning', 'Needs review')}
                  </span>
                )}
                {resume._jobCategory && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_COLORS[resume._jobCategory] || 'bg-slate-100 text-slate-700'}`}>
                    {resume._jobCategory}
                  </span>
                )}
                {ivStatus?.completed && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <IconCircleCheck size={11} stroke={2.5} className="mr-0.5 inline -mt-0.5" />
                    {t('product.talent.interviewCompleted', 'Interviewed')}
                  </span>
                )}
                {ivStatus?.invited && !ivStatus?.completed && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    {t('product.talent.invited', 'Invited')}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {resume.currentRole || t('product.talent.roleUnknown', 'Role not specified')}
              </p>

              {resume._topSkills.length > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">{t('product.talent.topSkills', 'Top Skills')}: </span>
                  {resume._topSkills.join(', ')}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                {resume._experienceValue !== null && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {resume._experienceValue} {t('product.talent.yearsWork', 'yrs')}
                  </span>
                )}
                {resume._location && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {resume._location}
                  </span>
                )}
                {resume._notableCompanies.map((company) => (
                  <span key={company} className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                    Ex-{company}
                  </span>
                ))}
                {resume._languages.slice(0, 2).map((entry) => (
                  <span key={`${entry.language}-${entry.proficiency || ''}`} className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                    {entry.language}
                  </span>
                ))}
                {resume._versionCount != null && resume._versionCount > 0 && (
                  <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    <IconFiles size={12} stroke={1.8} className="mr-1" />
                    {resume._versionCount}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => onInvite(resume)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title={t('product.talent.inviteToInterview', 'Invite')}>
                <IconSend size={16} stroke={1.5} />
              </button>
              <button onClick={() => onApply(resume)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title={t('product.talent.applyToJob', 'Apply to Job')}>
                <IconBriefcase size={16} stroke={1.5} />
              </button>
              <button onClick={() => onPreferences(resume)} className={`p-1.5 rounded-lg transition-colors ${hasPrefs ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`} title={t('product.talent.preferences.title', 'Preferences')}>
                <IconAdjustments size={16} stroke={1.5} />
              </button>
              {!resume.hasInvitations && (
                <button onClick={() => onDelete(resume.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title={t('common.delete', 'Delete')}>
                  <IconX size={16} stroke={1.5} />
                </button>
              )}
            </div>
          </div>

          {/* AI Summary box */}
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="relative flex-1 rounded-xl bg-blue-50 border border-blue-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-blue-500">
                  {t('product.talent.aiSummary', 'AI Summary')}:
                </p>
                <div className="flex items-center gap-0.5 shrink-0">
                  {resume._matchSummary && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(resume._matchSummary || '');
                        setCardCopied(true);
                        setTimeout(() => setCardCopied(false), 2000);
                      }}
                      className="rounded-md p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors"
                      title={t('product.talent.copySummary', 'Copy summary')}
                    >
                      {cardCopied ? <IconCheck size={14} stroke={2} /> : <IconCopy size={14} stroke={1.8} />}
                    </button>
                  )}
                  {resume._matchSummary && resume._matchSummary.length > 120 && (
                    <button
                      onClick={() => onViewSummary(resume.id, resume.name, resume._matchSummary || '')}
                      className="rounded-md p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors"
                      title={t('product.talent.viewFullSummary', 'View full summary')}
                    >
                      <IconEye size={15} stroke={1.8} />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-1 text-sm leading-relaxed text-slate-800 line-clamp-3 prose prose-sm prose-slate max-w-none [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:my-1 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:my-1 [&>p]:my-0.5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{resume._matchSummary || ''}</ReactMarkdown>
              </div>
              {resume._matchScore !== null && (
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {resume._matchScore}% {t('product.talent.aiMatchScore', 'AI Match Score')}.
                </p>
              )}
              {resume._bestFitTitle && (
                <p className="mt-1 text-xs text-blue-500">
                  {t('product.talent.bestMatch', 'Best match')}: {resume._bestFitTitle}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 lg:w-[180px] shrink-0 justify-center">
              <Link
                to={`/product/talent/${resume.id}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                {t('product.talent.viewProfile', 'View Full Profile')}
              </Link>
            </div>
          </div>

          {resume.notes && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <IconBookmark className="mr-1.5 inline-block -translate-y-px" size={13} stroke={2} />
              {resume.notes}
            </p>
          )}
        </div>
      </div>
    </article>
  );
});

// ── Memoized List Row Component ──
const ResumeListRow = memo(function ResumeListRow({ resume, onDelete, onPreferences, onApply, onInvite, t }: { resume: EnrichedResume; onDelete: (id: string) => void; onPreferences: (resume: EnrichedResume) => void; onApply: (resume: EnrichedResume) => void; onInvite: (resume: EnrichedResume) => void; t: (k: string, f: string) => string }) {
  const hasPrefs = resume.preferences && Object.values(resume.preferences).some(v => v && (Array.isArray(v) ? v.length > 0 : String(v).trim()));
  const ivStatus = resume.interviewStatus;
  return (
    <Link
      to={`/product/talent/${resume.id}`}
      className="group px-4 sm:px-5 py-4 hover:bg-slate-50/50 transition-colors flex items-center gap-3 sm:gap-4 block"
    >
      <div className="min-w-0 w-32 sm:w-48 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
            {resume.name}
          </span>
          {resume._parseWarning && (
            <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              {t('product.talent.parseWarning', 'Needs review')}
            </span>
          )}
          {resume._jobCategory && (
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${CATEGORY_COLORS[resume._jobCategory] || 'bg-slate-100 text-slate-700'}`}>
              {resume._jobCategory}
            </span>
          )}
        </div>
        {resume.currentRole && (
          <p className="text-sm text-slate-600 truncate">{resume.currentRole}</p>
        )}
      </div>

      <div className="hidden xl:block min-w-0 flex-1">
        {resume._parseWarning ? (
          <p className="text-sm text-amber-700 truncate">
            {t('product.talent.parseWarningDesc', 'This resume was not parsed reliably. Review the original file before matching or inviting.')}
          </p>
        ) : resume.summary ? (
          <p className="text-sm text-slate-600 truncate">{resume.summary}</p>
        ) : resume._highlight ? (
          <p className="text-sm text-slate-500 truncate">{resume._highlight}</p>
        ) : null}
        {resume.notes && (
          <p className="text-xs text-amber-600 truncate mt-0.5">
            <IconBookmark className="w-3 h-3 inline-block mr-0.5 -mt-0.5" size={12} stroke={2} />
            {resume.notes.slice(0, 60)}{resume.notes.length > 60 ? '...' : ''}
          </p>
        )}
      </div>

      <div className="hidden lg:flex gap-1.5 shrink-0 max-w-[220px] flex-wrap">
        {resume._topSkills.slice(0, 3).map((skill) => (
          <span key={skill} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {skill}
          </span>
        ))}
        {resume._topSkills.length > 3 && (
          <span className="text-xs text-slate-500">+{resume._topSkills.length - 3}</span>
        )}
      </div>

      <div className="hidden md:block shrink-0 w-28 text-sm text-slate-600">
        {resume._workExp ? (
          <div>
            {resume._workExp.fullTimeYears > 0 && (
              <span>{resume._workExp.fullTimeYears} {t('product.talent.yearsWork', 'yrs')}</span>
            )}
            {resume._workExp.internshipMonths > 0 && (
              <span className="text-slate-500 block text-xs">+ {resume._workExp.internshipMonths} {t('product.talent.monthsIntern', 'mo intern')}</span>
            )}
          </div>
        ) : resume.experienceYears ? (
          <span>{resume.experienceYears}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>

      <div className="hidden lg:flex gap-1.5 shrink-0 max-w-[200px] flex-wrap">
        {resume._notableCompanies.map((company) => (
          <span key={company} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            Ex-{company}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {ivStatus?.completed ? (
          <span
            className="p-1 rounded text-emerald-600 bg-emerald-50"
            title={`${t('product.talent.interviewCompleted', 'Interview completed')}: ${formatDateTimeShort(ivStatus.completedAt)}${ivStatus.durationSeconds ? ` (${Math.round(ivStatus.durationSeconds / 60)} min)` : ''}`}
          >
            <IconCircleCheck size={16} stroke={2} />
          </span>
        ) : ivStatus?.invited ? (
          <span
            className="p-1 rounded text-blue-600 bg-blue-50"
            title={t('product.talent.interviewInvitedTooltip', 'Interview invitation has been sent. Awaiting candidate response.')}
          >
            <IconMailForward size={16} stroke={2} />
          </span>
        ) : (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onInvite(resume); }}
            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title={t('product.talent.inviteToInterviewTooltip', 'Invite this candidate to an AI interview. Navigate to arrange and send the invitation.')}
          >
            <IconSend size={16} stroke={1.5} />
          </button>
        )}
        {resume._versionCount != null && resume._versionCount > 0 && (
          <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-0.5 mr-1">
            <IconFiles size={14} stroke={1.5} />
            {resume._versionCount}
          </span>
        )}
        <span className="p-1 rounded-lg text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" title={t('product.talent.viewProfile', 'View Profile')}>
          <IconExternalLink size={16} stroke={2} />
        </span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApply(resume); }}
          className="p-1.5 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title={t('product.talent.applyToJob', 'Apply to Job')}
        >
          <IconBriefcase size={16} stroke={1.5} />
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreferences(resume); }}
          className={`p-1.5 rounded transition-colors ${hasPrefs ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
          title={t('product.talent.preferences.title', 'Candidate Preferences')}
        >
          <IconAdjustments size={16} stroke={1.5} />
        </button>
        {!resume.hasInvitations && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(resume.id); }}
            className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <IconX size={16} stroke={1.5} />
          </button>
        )}
      </div>
    </Link>
  );
});

// ── Pagination Component ──
function Pagination({ page, totalPages, total, onPageChange, t }: {
  page: number; totalPages: number; total: number;
  onPageChange: (p: number) => void;
  t: (k: string, f: string, opts?: Record<string, unknown>) => string;
}) {
  if (totalPages <= 1) return null;

  // Show up to 5 page numbers centered around current page
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-col items-center gap-2 pt-4 sm:flex-row sm:justify-between">
      <span className="text-sm text-slate-600">
        {t('product.talent.totalCandidates', '{{count}} candidates', { count: total })}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <IconChevronLeft size={16} stroke={2} />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[36px] h-9 rounded-lg text-sm font-semibold transition-colors ${
              p === page ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <IconChevronRight size={16} stroke={2} />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──

const PAGE_SIZE = 20;

export default function TalentHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [resumes, setResumes] = usePageState<Resume[]>('talent.resumes', []);
  const [loading, setLoading] = useState(resumes.length > 0 ? false : true);
  const [search, setSearch] = usePageState<string>('talent.search', '');
  const [viewMode, setViewMode] = usePageState<'card' | 'list'>('talent.viewMode', 'card');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [prefsResume, setPrefsResume] = useState<EnrichedResume | null>(null);
  const [applyResume, setApplyResume] = useState<EnrichedResume | null>(null);
  const [summaryModal, setSummaryModal] = useState<{ resumeId: string; name: string; summary: string } | null>(null);
  const [summaryRegenInstructions, setSummaryRegenInstructions] = useState('');
  const [summaryRegenJobId, setSummaryRegenJobId] = useState('');
  const [summaryRegenerating, setSummaryRegenerating] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const [expYearsMin, setExpYearsMin] = useState('');
  const [expYearsMax, setExpYearsMax] = useState('');
  const [filterJobId, setFilterJobId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterLanguages, setFilterLanguages] = useState<string[]>([]);
  const [filterEducation, setFilterEducation] = useState('');
  const [matchScoreMin, setMatchScoreMin] = useState('');
  const [matchScoreMax, setMatchScoreMax] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState<RecruiterTeamFilterValue>({});
  const [jobs, setJobs] = useState<Array<{ id: string; title: string }>>([]);
  const [filterSkills, setFilterSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [stats, setStats] = useState<{ total: number; thisWeek: number; analyzed: number } | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [interviewedCount, setInterviewedCount] = useState(0);

  useEffect(() => {
    axios.get('/api/v1/jobs', { params: { limit: 200 } })
      .then((res) => setJobs(res.data.data || []))
      .catch(() => {});
    axios.get('/api/v1/resumes/stats')
      .then((res) => setStats(res.data.data))
      .catch(() => {});
    Promise.all([
      axios.get('/api/v1/resumes', { params: { limit: 1, pipelineStatus: 'matched' } }),
      axios.get('/api/v1/resumes', { params: { limit: 1, pipelineStatus: 'invited' } }),
    ]).then(([matchedRes, invitedRes]) => {
      setMatchedCount(matchedRes.data.pagination?.total || 0);
      setInterviewedCount(invitedRes.data.pagination?.total || 0);
    }).catch(() => {});
  }, []);

  const filtersRef = useRef({
    expYearsMin: '',
    expYearsMax: '',
    filterJobId: '',
    filterStatus: '',
    filterLocation: '',
    filterCompany: '',
    filterLanguages: [] as string[],
    filterEducation: '',
    matchScoreMin: '',
    matchScoreMax: '',
    recruiterFilter: {} as RecruiterTeamFilterValue,
    filterSkills: [] as string[],
  });
  filtersRef.current = {
    expYearsMin,
    expYearsMax,
    filterJobId,
    filterStatus,
    filterLocation,
    filterCompany,
    filterLanguages,
    filterEducation,
    matchScoreMin,
    matchScoreMax,
    recruiterFilter,
    filterSkills,
  };

  const fetchResumes = useCallback(async (query?: string, pageNum = 1) => {
    try {
      setLoading(true);
      const f = filtersRef.current;
      const params: Record<string, string | number> = { limit: PAGE_SIZE, page: pageNum };
      if (query) params.search = query;
      if (f.expYearsMin) params.expYearsMin = f.expYearsMin;
      if (f.expYearsMax) params.expYearsMax = f.expYearsMax;
      if (f.filterJobId) params.jobId = f.filterJobId;
      if (f.filterStatus) params.pipelineStatus = f.filterStatus;
      if (f.filterLocation) params.location = f.filterLocation;
      if (f.filterCompany) params.company = f.filterCompany;
      if (f.filterLanguages.length > 0) params.language = f.filterLanguages.join(',');
      if (f.filterEducation) params.educationLevel = f.filterEducation;
      if (f.matchScoreMin) params.fitScoreMin = f.matchScoreMin;
      if (f.matchScoreMax) params.fitScoreMax = f.matchScoreMax;
      if (f.recruiterFilter.filterUserId) params.filterUserId = f.recruiterFilter.filterUserId;
      if (f.recruiterFilter.filterTeamId) params.filterTeamId = f.recruiterFilter.filterTeamId;
      if (f.filterSkills.length > 0) params.skills = f.filterSkills.join(',');
      const res = await axios.get('/api/v1/resumes', { params });
      setResumes(res.data.data || []);
      const pag = res.data.pagination;
      if (pag) {
        setTotalPages(pag.totalPages || 1);
        setTotalCount(pag.total || 0);
      }
      setPage(pageNum);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (resumes.length === 0) fetchResumes();
  }, [fetchResumes, resumes.length]);

  const backfillTriggered = useRef(false);
  useEffect(() => {
    if (backfillTriggered.current || resumes.length === 0) return;
    const missing = resumes.some((resume) => !resume.highlight && !resume.summary);
    if (!missing) return;

    backfillTriggered.current = true;
    axios.post('/api/v1/resumes/backfill-highlights')
      .then(() => fetchResumes(search || undefined, page))
      .catch(() => {});
  }, [fetchResumes, page, resumes, search]);

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchResumes(value || undefined, 1);
    }, 300);
  };

  const executeSearch = useCallback(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    fetchResumes(search || undefined, 1);
  }, [fetchResumes, search]);

  const applyFilters = useCallback(() => {
    fetchResumes(search || undefined, 1);
  }, [fetchResumes, search]);

  const clearAllFilters = useCallback(() => {
    setExpYearsMin('');
    setExpYearsMax('');
    setFilterJobId('');
    setFilterStatus('');
    setFilterLocation('');
    setFilterCompany('');
    setFilterLanguages([]);
    setFilterEducation('');
    setMatchScoreMin('');
    setMatchScoreMax('');
    setFilterSkills([]);
    setSkillInput('');
    setRecruiterFilter({});
    // Reset ref immediately so fetchResumes reads cleared values
    filtersRef.current = {
      expYearsMin: '',
      expYearsMax: '',
      filterJobId: '',
      filterStatus: '',
      filterLocation: '',
      filterCompany: '',
      filterLanguages: [],
      filterEducation: '',
      matchScoreMin: '',
      matchScoreMax: '',
      recruiterFilter: {} as RecruiterTeamFilterValue,
      filterSkills: [],
    };
    fetchResumes(search || undefined, 1);
  }, [fetchResumes, search]);

  const handlePageChange = useCallback((newPage: number) => {
    fetchResumes(search || undefined, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fetchResumes, search]);

  const handleDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const handlePreferences = useCallback((resume: EnrichedResume) => {
    setPrefsResume(resume);
  }, []);

  const handleApply = useCallback((resume: EnrichedResume) => {
    setApplyResume(resume);
  }, []);

  const handleInvite = useCallback((resume: EnrichedResume) => {
    navigate('/product/interview', { state: { inviteResumeId: resume.id, inviteResumeName: resume.name } });
  }, [navigate]);

  const handleViewSummary = useCallback((resumeId: string, name: string, summary: string) => {
    setSummaryModal({ resumeId, name, summary });
    setSummaryRegenInstructions('');
    setSummaryRegenJobId('');
    setSummaryCopied(false);
  }, []);

  const handleRegenerateSummary = useCallback(async () => {
    if (!summaryModal) return;
    setSummaryRegenerating(true);
    try {
      const res = await axios.post(`/api/v1/resumes/${summaryModal.resumeId}/regenerate-summary`, {
        instructions: summaryRegenInstructions.trim() || undefined,
        jobId: summaryRegenJobId || undefined,
      });
      const newSummary = res.data.data?.summary || summaryModal.summary;
      setSummaryModal((prev) => prev ? { ...prev, summary: newSummary } : null);
      // Update the resume in local state
      setResumes((prev) => prev.map((r) =>
        r.id === summaryModal.resumeId ? { ...r, summary: newSummary } : r
      ));
      setSummaryRegenInstructions('');
      setSummaryRegenJobId('');
    } catch {
      // silently fail — user can retry
    } finally {
      setSummaryRegenerating(false);
    }
  }, [summaryModal, summaryRegenInstructions, summaryRegenJobId, setResumes]);

  const confirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`/api/v1/resumes/${confirmDeleteId}`);
      setResumes((prev) => prev.filter((resume) => resume.id !== confirmDeleteId));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silently fail
    } finally {
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId]);

  const enrichedResumes = useMemo(() => {
    return resumes.map((resume) => {
      const highlight = resume.highlight || getHighlight(resume.parsedData);
      const workExp = getWorkExperience(resume.parsedData);
      const primaryFit = getPrimaryFit(resume);
      const matchScore = typeof primaryFit?.fitScore === 'number' ? Math.round(primaryFit.fitScore) : null;

      return {
        ...resume,
        _topSkills: getTopSkills(resume.parsedData),
        _highlight: highlight,
        _workExp: workExp,
        _notableCompanies: getNotableCompanies(resume.parsedData),
        _industryTags: getIndustryTags(resume.parsedData),
        _jobCategory: getJobCategory(resume.currentRole, resume.parsedData),
        _parseWarning: hasResumeParseWarning(resume.parsedData),
        _location: getResumeLocation(resume.parsedData),
        _languages: getResumeLanguages(resume.parsedData),
        _matchScore: matchScore,
        _matchLabel: getMatchLabel(matchScore),
        _matchSummary: getMatchSummary(resume, highlight),
        _bestFitTitle: primaryFit?.hiringRequest?.title?.trim() || null,
        _experienceValue: getExperienceValue(resume, workExp),
      };
    });
  }, [resumes]);

  const activeFilterCount = [
    expYearsMin,
    expYearsMax,
    filterJobId,
    filterStatus,
    filterLocation,
    filterCompany,
    filterEducation,
    matchScoreMin,
    matchScoreMax,
    recruiterFilter.filterUserId,
    recruiterFilter.filterTeamId,
  ].filter(Boolean).length + (filterSkills.length > 0 ? 1 : 0) + (filterLanguages.length > 0 ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0 || !!search;

  const topPoolSkills = useMemo(() => [
    'A.I.', 'LLM', 'Agent', 'Prompt Engineering', 'Machine Learning',
    'Python', 'TypeScript', 'JavaScript', 'Java', 'React', 'Vue', 'SQL',
  ], []);

  const languageOptions = useMemo(
    () => LANGUAGE_FILTER_OPTIONS.map((option) => ({
      value: option.value,
      label: t(option.tKey, option.fallback),
    })),
    [t],
  );

  const selectedLanguageLabels = useMemo(
    () => languageOptions
      .filter((option) => filterLanguages.includes(option.value))
      .map((option) => option.label),
    [filterLanguages, languageOptions],
  );

  const currentJobLabel = useMemo(
    () => jobs.find((job) => job.id === filterJobId)?.title || '',
    [filterJobId, jobs],
  );

  const skillSuggestions = useMemo(
    () => topPoolSkills.filter((skill) => !filterSkills.includes(skill)),
    [filterSkills, topPoolSkills],
  );

  const experienceMinValue = clampNumber(
    expYearsMin ? parseFloat(expYearsMin) : RANGE_EXPERIENCE_MIN,
    RANGE_EXPERIENCE_MIN,
    RANGE_EXPERIENCE_MAX,
  );
  const experienceMaxValue = clampNumber(
    expYearsMax ? parseFloat(expYearsMax) : RANGE_EXPERIENCE_MAX,
    experienceMinValue,
    RANGE_EXPERIENCE_MAX,
  );
  const matchMinValue = clampNumber(
    matchScoreMin ? parseFloat(matchScoreMin) : RANGE_MATCH_MIN,
    RANGE_MATCH_MIN,
    RANGE_MATCH_MAX,
  );
  const matchMaxValue = clampNumber(
    matchScoreMax ? parseFloat(matchScoreMax) : RANGE_MATCH_MAX,
    matchMinValue,
    RANGE_MATCH_MAX,
  );

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (filterSkills.length > 0) labels.push(`Skills: ${filterSkills.join(', ')}`);
    if (expYearsMin || expYearsMax) labels.push(`Experience: ${experienceMinValue}-${experienceMaxValue} yrs`);
    if (filterLocation) labels.push(`Location: ${filterLocation}`);
    if (filterCompany) labels.push(`Company: ${filterCompany}`);
    if (matchScoreMin || matchScoreMax) labels.push(`AI score: ${matchMinValue}-${matchMaxValue}%`);
    if (selectedLanguageLabels.length > 0) {
      labels.push(`${t('product.talent.languageProficiency', 'Language')}: ${selectedLanguageLabels.join(', ')}`);
    }
    if (filterEducation) labels.push(`Education: ${filterEducation}`);
    if (filterStatus) labels.push(`Status: ${filterStatus}`);
    if (currentJobLabel) labels.push(`Job: ${currentJobLabel}`);
    if (recruiterFilter.filterUserId || recruiterFilter.filterTeamId) labels.push('Scoped to recruiter/team');
    return labels;
  }, [
    currentJobLabel,
    expYearsMax,
    expYearsMin,
    experienceMaxValue,
    experienceMinValue,
    filterCompany,
    filterEducation,
    filterLanguages,
    filterLocation,
    filterSkills,
    filterStatus,
    matchMaxValue,
    matchMinValue,
    matchScoreMax,
    matchScoreMin,
    recruiterFilter.filterTeamId,
    recruiterFilter.filterUserId,
    selectedLanguageLabels,
    t,
  ]);

  return (
    <div className="mx-auto max-w-[1460px] space-y-5">
      {/* Search + Stats header */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900">
              {t('product.talent.title', 'Talent Hub')}
            </h2>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
            >
              <IconUpload size={15} stroke={2} />
              {t('product.talent.upload', 'Upload Resumes')}
            </button>
          </div>

          {user?.role === 'admin' && (
            <div className="min-w-[240px]">
              <RecruiterTeamFilter
                value={recruiterFilter}
                onChange={(next) => setRecruiterFilter(next)}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  executeSearch();
                }
              }}
              placeholder={t('product.talent.searchPlaceholder', 'Search for Candidates')}
              className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={executeSearch}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
          >
            {t('common.search', 'Search')}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
          {[
            { label: t('product.talent.statTotal', 'Total'), value: hasActiveFilters ? totalCount : (stats?.total ?? totalCount) },
            { label: t('product.talent.statThisWeek', 'New This Week'), value: stats?.thisWeek ?? 0 },
            { label: t('product.talent.statMatched', 'Matched'), value: matchedCount },
            { label: t('product.talent.statInterviewed', 'Interviewed'), value: interviewedCount },
            { label: t('product.talent.statAnalyzed', 'AI Analyzed'), value: stats?.analyzed ?? 0 },
          ].map((item) => (
            <div key={item.label} className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900">{item.value}</span>
              <span className="text-xs text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {t('product.talent.filters', 'Filters')}
              </h3>
            </div>

            <div className="mt-5 space-y-5">
              {/* Skills */}
              <section className="space-y-2.5">
                <p className="text-sm font-semibold text-slate-900">{t('product.talent.filterSkills', 'Skills')}</p>
                <div className="relative">
                  <IconSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" size={14} stroke={2} />
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
                        e.preventDefault();
                        const next = skillInput.trim().replace(/,$/, '');
                        if (next && !filterSkills.includes(next)) setFilterSkills((prev) => [...prev, next]);
                        setSkillInput('');
                      }
                    }}
                    placeholder={t('product.talent.filterSkillsPlaceholder', 'Search')}
                    className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {filterSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {filterSkills.map((skill) => (
                      <span key={skill} className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 text-xs font-medium text-white">
                        {skill}
                        <button type="button" onClick={() => setFilterSkills((prev) => prev.filter((item) => item !== skill))} className="rounded-full p-0.5 hover:bg-blue-600">
                          <IconX size={10} stroke={2.5} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {skillSuggestions.length > 0 && (
                  <div className="space-y-1">
                    {skillSuggestions.slice(0, 6).map((skill) => (
                      <label key={skill} className="flex cursor-pointer items-center gap-2 rounded py-1 text-sm text-slate-700 hover:text-blue-600">
                        <input
                          type="checkbox"
                          checked={filterSkills.includes(skill)}
                          onChange={() => setFilterSkills((prev) => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill])}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        {skill}
                      </label>
                    ))}
                  </div>
                )}
              </section>

              {/* Experience */}
              <section className="space-y-2.5 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{t('product.talent.filterWorkYears', 'Experience')}</p>
                  <span className="text-xs text-slate-500">
                    {experienceMinValue}-{experienceMaxValue}+ {t('product.talent.years', 'Years')}
                  </span>
                </div>
                <div className="space-y-2">
                  <input
                    type="range"
                    min={RANGE_EXPERIENCE_MIN}
                    max={RANGE_EXPERIENCE_MAX}
                    value={experienceMinValue}
                    onChange={(e) => {
                      const next = clampNumber(Number(e.target.value), RANGE_EXPERIENCE_MIN, experienceMaxValue);
                      setExpYearsMin(next === RANGE_EXPERIENCE_MIN ? '' : String(next));
                    }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
                  />
                  <input
                    type="range"
                    min={experienceMinValue}
                    max={RANGE_EXPERIENCE_MAX}
                    value={experienceMaxValue}
                    onChange={(e) => {
                      const next = clampNumber(Number(e.target.value), experienceMinValue, RANGE_EXPERIENCE_MAX);
                      setExpYearsMax(next === RANGE_EXPERIENCE_MAX ? '' : String(next));
                    }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
                  />
                </div>
              </section>

              {/* Location */}
              <section className="space-y-2.5 border-t border-slate-100 pt-5">
                <p className="text-sm font-semibold text-slate-900">{t('product.talent.location', 'Location')}</p>
                <div className="relative">
                  <IconSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" size={14} stroke={2} />
                  <input
                    type="text"
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    placeholder={t('product.talent.locationPlaceholder', 'City, Country')}
                    list="talent-location-suggestions"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <datalist id="talent-location-suggestions">
                  {COUNTRY_LIST.map((country) => (
                    <option key={country.value} value={country.value} />
                  ))}
                </datalist>
                <div className="space-y-1">
                  {['Remote', 'Hybrid', 'On-site'].map((opt) => (
                    <label key={opt} className="flex cursor-pointer items-center gap-2 rounded py-1 text-sm text-slate-700 hover:text-blue-600">
                      <input
                        type="checkbox"
                        checked={filterLocation === opt}
                        onChange={() => setFilterLocation(filterLocation === opt ? '' : opt)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </section>

              {/* AI Match Score */}
              <section className="space-y-2.5 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{t('product.talent.aiMatchScore', 'AI Match Score')}</p>
                  <span className="text-xs text-slate-500">
                    {matchMinValue}-{matchMaxValue}%
                  </span>
                </div>
                <div className="space-y-2">
                  <input
                    type="range"
                    min={RANGE_MATCH_MIN}
                    max={RANGE_MATCH_MAX}
                    value={matchMinValue}
                    onChange={(e) => {
                      const next = clampNumber(Number(e.target.value), RANGE_MATCH_MIN, matchMaxValue);
                      setMatchScoreMin(next === RANGE_MATCH_MIN ? '' : String(next));
                    }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
                  />
                  <input
                    type="range"
                    min={matchMinValue}
                    max={RANGE_MATCH_MAX}
                    value={matchMaxValue}
                    onChange={(e) => {
                      const next = clampNumber(Number(e.target.value), matchMinValue, RANGE_MATCH_MAX);
                      setMatchScoreMax(next === RANGE_MATCH_MAX ? '' : String(next));
                    }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
                  />
                </div>
              </section>

              {/* Language */}
              <section className="space-y-2.5 border-t border-slate-100 pt-5">
                <p className="text-sm font-semibold text-slate-900">{t('product.talent.languageProficiency', 'Language')}</p>
                <div className="space-y-1">
                  {languageOptions.map((option) => {
                    const checked = filterLanguages.includes(option.value);
                    return (
                      <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded py-1 text-sm text-slate-700 hover:text-blue-600">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setFilterLanguages((prev) => (
                              prev.includes(option.value)
                                ? prev.filter((item) => item !== option.value)
                                : [...prev, option.value]
                            ));
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* Education Level */}
              <section className="space-y-2.5 border-t border-slate-100 pt-5">
                <p className="text-sm font-semibold text-slate-900">{t('product.talent.filterEducation', 'Education')}</p>
                <div className="space-y-1">
                  {[
                    { value: 'junior_high', label: t('product.talent.eduJuniorHigh', 'Junior High / 初中') },
                    { value: 'vocational', label: t('product.talent.eduVocational', 'Vocational / 中专') },
                    { value: 'high_school', label: t('product.talent.eduHighSchool', 'High School / 高中') },
                    { value: 'associate', label: t('product.talent.eduAssociate', 'Associate / 大专') },
                    { value: 'bachelor', label: t('product.talent.eduBachelor', 'Bachelor / 本科') },
                    { value: 'master', label: t('product.talent.eduMaster', 'Master / 硕士') },
                    { value: 'doctorate', label: t('product.talent.eduDoctorate', 'Doctorate / 博士') },
                  ].map((edu) => (
                    <label key={edu.value} className="flex cursor-pointer items-center gap-2 rounded py-1 text-sm text-slate-700 hover:text-blue-600">
                      <input
                        type="radio"
                        name="educationLevel"
                        checked={filterEducation === edu.value}
                        onChange={() => setFilterEducation(filterEducation === edu.value ? '' : edu.value)}
                        className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {edu.label}
                    </label>
                  ))}
                </div>
              </section>

              {/* Additional signals - company, status, job */}
              <section className="space-y-3 border-t border-slate-100 pt-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">{t('product.talent.filterCompany', 'Past company')}</label>
                  <input
                    type="text"
                    value={filterCompany}
                    onChange={(e) => setFilterCompany(e.target.value)}
                    placeholder={t('product.talent.filterCompanyPlaceholder', 'Company name')}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">{t('product.talent.filterStatus', 'Pipeline status')}</label>
                  <div className="relative">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">{t('product.talent.filterAllStatus', 'All Status')}</option>
                      <option value="matched">{t('product.talent.filterMatched', 'Matched')}</option>
                      <option value="shortlisted">{t('product.talent.filterShortlisted', 'Shortlisted')}</option>
                      <option value="invited">{t('product.talent.filterInvited', 'Invited')}</option>
                      <option value="rejected">{t('product.talent.filterRejected', 'Rejected')}</option>
                    </select>
                    <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">{t('product.talent.filterJob', 'Linked job')}</label>
                  <div className="relative">
                    <select
                      value={filterJobId}
                      onChange={(e) => setFilterJobId(e.target.value)}
                      className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">{t('product.talent.filterAllJobs', 'All Jobs')}</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>{job.title}</option>
                      ))}
                    </select>
                    <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
                  </div>
                </div>
              </section>

              {/* Clear All Filters */}
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-2 w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                {t('product.talent.clearFilters', 'Clear All Filters')}
              </button>

              <button
                type="button"
                onClick={applyFilters}
                className="w-full rounded-lg bg-blue-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                {t('product.talent.applyFilters', 'Apply Filters')}
              </button>
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          {/* Sort bar + view toggle */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                {loading
                  ? t('product.talent.loadingResults', 'Refreshing…')
                  : t('product.talent.filteredResults', 'Showing {{count}} Candidates', { count: totalCount })}
              </span>
              {activeFilterLabels.length > 0 && (
                <div className="hidden lg:flex flex-wrap gap-1.5">
                  {activeFilterLabels.map((label) => (
                    <span key={label} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-slate-200 p-0.5">
                <button
                  onClick={() => setViewMode('card')}
                  className={`inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium transition-colors ${
                    viewMode === 'card' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <IconLayoutGrid size={15} stroke={1.8} className="mr-1.5" />
                  {t('product.talent.viewCard', 'Cards')}
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium transition-colors ${
                    viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <IconList size={15} stroke={1.8} className="mr-1.5" />
                  {t('product.talent.viewList', 'List')}
                </button>
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700"
                >
                  <IconX size={13} stroke={2} />
                  {t('product.talent.reset', 'Reset')}
                </button>
              )}
            </div>
          </div>

          <ResumeUploadModal
            open={showUpload}
            onClose={() => setShowUpload(false)}
            onUploaded={() => {
              fetchResumes(search || undefined, 1);
            }}
            batch
          />

          {loading ? (
            <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
            </div>
          ) : enrichedResumes.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
              <IconUsers className="mx-auto mb-3 text-slate-300" size={48} stroke={1.2} />
              <h3 className="text-lg font-semibold text-slate-900">{t('product.talent.empty', 'No candidates yet')}</h3>
              <p className="mt-1.5 text-sm text-slate-500">
                {hasActiveFilters
                  ? t('product.talent.emptyFiltered', 'No candidates matched the current filters. Try resetting them.')
                  : t('product.talent.emptyDesc', 'Upload resumes to build your talent pool.')}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300"
                  >
                    <IconX size={14} stroke={2} />
                    {t('product.talent.clearFilters', 'Clear all filters')}
                  </button>
                )}
                <button
                  onClick={() => setShowUpload(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                >
                  <IconUpload size={15} stroke={2} />
                  {t('product.talent.upload', 'Upload Resumes')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {viewMode === 'card' ? (
                <div className="space-y-4">
                  {enrichedResumes.map((resume) => (
                    <ResumeCard
                      key={resume.id}
                      resume={resume}
                      onDelete={handleDelete}
                      onPreferences={handlePreferences}
                      onApply={handleApply}
                      onInvite={handleInvite}
                      onViewSummary={handleViewSummary}
                      t={t}
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {enrichedResumes.map((resume) => (
                    <ResumeListRow
                      key={resume.id}
                      resume={resume}
                      onDelete={handleDelete}
                      onPreferences={handlePreferences}
                      onApply={handleApply}
                      onInvite={handleInvite}
                      t={t}
                    />
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
                <Pagination page={page} totalPages={totalPages} total={totalCount} onPageChange={handlePageChange} t={t} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* Candidate Preferences Modal */}
      {prefsResume && (
        <CandidatePreferencesModal
          open={!!prefsResume}
          onClose={() => setPrefsResume(null)}
          resumeId={prefsResume.id}
          candidateName={prefsResume.name}
          initialPreferences={prefsResume.preferences as CandidatePreferences | null}
          initialEmail={prefsResume.email}
          initialPhone={prefsResume.phone}
          onSaved={(prefs) => {
            setResumes(prev => prev.map(r => r.id === prefsResume.id ? { ...r, preferences: prefs } : r));
          }}
        />
      )}

      {/* Apply to Job Modal */}
      {applyResume && (
        <ApplyToJobModal
          open={!!applyResume}
          onClose={() => setApplyResume(null)}
          resumeId={applyResume.id}
          resumeName={applyResume.name}
          onApplied={() => setApplyResume(null)}
        />
      )}

      {/* AI Summary Modal */}
      {summaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSummaryModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t('product.talent.aiSummary', 'AI Summary')}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{summaryModal.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(summaryModal.summary);
                    setSummaryCopied(true);
                    setTimeout(() => setSummaryCopied(false), 2000);
                  }}
                  className="rounded-lg p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title={t('product.talent.copySummary', 'Copy summary')}
                >
                  {summaryCopied ? <IconCheck size={18} stroke={2} className="text-emerald-500" /> : <IconCopy size={18} stroke={1.8} />}
                </button>
                <button onClick={() => setSummaryModal(null)} className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <IconX size={18} stroke={2} />
                </button>
              </div>
            </div>

            {/* Summary content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="prose prose-lg prose-slate max-w-none [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:my-2 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:my-2 [&>p]:my-2 [&>p]:leading-8 [&>p]:text-base [&>li]:text-base [&>h1]:text-xl [&>h2]:text-lg [&>h3]:text-base">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryModal.summary}</ReactMarkdown>
              </div>
            </div>

            {/* Regenerate section */}
            <div className="px-6 py-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <IconChevronDown size={14} stroke={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={summaryRegenJobId}
                    onChange={(e) => setSummaryRegenJobId(e.target.value)}
                    disabled={summaryRegenerating}
                    className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">{t('product.talent.regenNoJob', 'No job context (general summary)')}</option>
                    {jobs.map((job) => (
                      <option key={job.id} value={job.id}>{job.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-end gap-3">
                <textarea
                  value={summaryRegenInstructions}
                  onChange={(e) => setSummaryRegenInstructions(e.target.value)}
                  placeholder={t('product.talent.regenPlaceholder', 'Instructions (e.g. "Focus on technical skills", "Make it shorter")...')}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none placeholder:text-slate-400 disabled:opacity-50"
                  rows={2}
                  disabled={summaryRegenerating}
                />
                <button
                  onClick={handleRegenerateSummary}
                  disabled={summaryRegenerating}
                  className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {summaryRegenerating ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <IconRefresh size={14} stroke={2} />
                  )}
                  {t('product.talent.regenerate', 'Regenerate')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{t('common.confirmDelete', 'Confirm Delete')}</h3>
            <p className="mt-2 text-sm text-slate-500">{t('common.confirmDeleteMessage', 'Are you sure you want to delete this item? This action cannot be undone.')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                {t('common.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
