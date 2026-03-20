import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  IconCopy,
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
  startDate?: string;
  endDate?: string;
  duration: string;
  description?: string;
  technologies?: string[];
  employmentType?: string;
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
  notes: string | null;
  _versionCount?: number;
  createdAt: string;
  updatedAt: string;
  parsedData: {
    summary?: string;
    skills?: string[] | {
      technical?: string[];
      soft?: string[];
      tools?: string[];
      frameworks?: string[];
      languages?: string[];
      other?: string[];
    };
    experience?: ExperienceEntry[];
    education?: Array<{ institution: string; degree?: string; field?: string }>;
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

// ── Helper functions ──

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

function formatDateTimeShort(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Memoized Card Component ──
const ResumeCard = memo(function ResumeCard({ resume, onDelete, onPreferences, onApply, onInvite, t }: { resume: EnrichedResume; onDelete: (id: string) => void; onPreferences: (resume: EnrichedResume) => void; onApply: (resume: EnrichedResume) => void; onInvite: (resume: EnrichedResume) => void; t: (k: string, f: string) => string }) {
  const hasPrefs = resume.preferences && Object.values(resume.preferences).some(v => v && (Array.isArray(v) ? v.length > 0 : String(v).trim()));
  const ivStatus = resume.interviewStatus;
  return (
    <Link
      to={`/product/talent/${resume.id}`}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all duration-200"
    >
      {/* Header bar */}
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
              {resume.name}
            </h3>
            {resume._parseWarning && (
              <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {t('product.talent.parseWarning', 'Needs review')}
              </span>
            )}
          </div>
          {resume.currentRole && (
            <p className="mt-0.5 text-sm text-slate-600 truncate">{resume.currentRole}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApply(resume); }}
            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title={t('product.talent.applyToJob', 'Apply to Job')}
          >
            <IconBriefcase size={16} stroke={1.5} />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreferences(resume); }}
            className={`p-1 rounded transition-colors ${hasPrefs ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            title={t('product.talent.preferences.title', 'Candidate Preferences')}
          >
            <IconAdjustments size={16} stroke={1.5} />
          </button>
          {!resume.hasInvitations && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(resume.id); }}
              className="p-1 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <IconX size={16} stroke={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Meta row: category + experience */}
      <div className="px-4 sm:px-5 pb-3 flex items-center gap-2 text-sm text-slate-600">
        {resume._jobCategory && (
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${CATEGORY_COLORS[resume._jobCategory] || 'bg-slate-100 text-slate-700'}`}>
            {resume._jobCategory}
          </span>
        )}
        {resume._workExp ? (
          <span>
            {resume._workExp.fullTimeYears > 0 && `${resume._workExp.fullTimeYears} ${t('product.talent.yearsWork', 'yrs')}`}
            {resume._workExp.fullTimeYears > 0 && resume._workExp.internshipMonths > 0 && ' · '}
            {resume._workExp.internshipMonths > 0 && `${resume._workExp.internshipMonths} ${t('product.talent.monthsIntern', 'mo intern')}`}
          </span>
        ) : resume.experienceYears ? (
          <span>{resume.experienceYears}</span>
        ) : null}
        {resume._notableCompanies.length > 0 && (
          <span className="text-slate-500">
            {resume._notableCompanies.map(c => `Ex-${c}`).join(', ')}
          </span>
        )}
      </div>

      {/* Summary & Highlight */}
      {resume._parseWarning ? (
        <div className="px-4 sm:px-5 pb-3">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
            {t('product.talent.parseWarningDesc', 'This resume was not parsed reliably. Review the original file before matching or inviting.')}
          </p>
        </div>
      ) : (resume.summary || resume._highlight) ? (
        <div className="px-4 sm:px-5 pb-3 space-y-1.5">
          {resume.summary && (
            <p className="text-[13px] text-slate-600 line-clamp-3 leading-relaxed">{resume.summary}</p>
          )}
          {resume._highlight && !resume.summary && (
            <p className="text-[13px] text-slate-500 line-clamp-2 leading-relaxed">{resume._highlight}</p>
          )}
        </div>
      ) : null}

      {/* Skills + Industry tags */}
      {(resume._topSkills.length > 0 || resume._industryTags.length > 0) && (
        <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-1.5">
          {resume._industryTags.map((tag) => (
            <span key={tag} className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              {tag}
            </span>
          ))}
          {resume._topSkills.map((skill) => (
            <span key={skill} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Notes preview */}
      {resume.notes && (
        <div className="px-4 sm:px-5 pb-3">
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 line-clamp-2 leading-relaxed">
            <IconBookmark className="w-3 h-3 inline-block mr-1 -mt-0.5 shrink-0" size={12} stroke={2} />
            {resume.notes}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {new Date(resume.createdAt).toLocaleDateString()}
          </span>
          {resume._versionCount != null && resume._versionCount > 0 && (
            <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <IconCopy size={12} stroke={1.5} />
              {resume._versionCount}
            </span>
          )}
        </div>
        <span className="p-1.5 rounded-lg text-blue-600 group-hover:text-blue-700 group-hover:bg-blue-50 transition-colors" title={t('product.talent.viewProfile', 'View Profile')}>
          <IconExternalLink size={16} stroke={2} />
        </span>
      </div>
    </Link>
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
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Filters
  const [expYearsMin, setExpYearsMin] = useState('');
  const [expYearsMax, setExpYearsMax] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [filterJobId, setFilterJobId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [recruiterFilter, setRecruiterFilter] = useState<RecruiterTeamFilterValue>({});
  const [jobs, setJobs] = useState<Array<{ id: string; title: string }>>([]);
  // Advanced filters
  const [filterSkills, setFilterSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [filterEducation, setFilterEducation] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterCountry, setFilterCountry] = useState('');

  // Stats for executive summary
  const [stats, setStats] = useState<{ total: number; thisWeek: number; analyzed: number } | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [interviewedCount, setInterviewedCount] = useState(0);

  // Fetch jobs and stats for the filter dropdown and summary
  useEffect(() => {
    axios.get('/api/v1/jobs', { params: { limit: 200 } })
      .then((res) => setJobs(res.data.data || []))
      .catch(() => {});
    axios.get('/api/v1/resumes/stats')
      .then((res) => setStats(res.data.data))
      .catch(() => {});
    // Get matched & interviewed counts for summary
    Promise.all([
      axios.get('/api/v1/resumes', { params: { limit: 1, pipelineStatus: 'matched' } }),
      axios.get('/api/v1/resumes', { params: { limit: 1, pipelineStatus: 'invited' } }),
    ]).then(([matchedRes, invitedRes]) => {
      setMatchedCount(matchedRes.data.pagination?.total || 0);
      setInterviewedCount(invitedRes.data.pagination?.total || 0);
    }).catch(() => {});
  }, []);

  const filtersRef = useRef({
    expYearsMin: '', expYearsMax: '', salaryMin: '', salaryMax: '',
    filterJobId: '', filterStatus: '', recruiterFilter: {} as RecruiterTeamFilterValue,
    filterSkills: [] as string[], filterEducation: '', filterSchool: '', filterCompany: '', filterCountry: '',
  });
  filtersRef.current = {
    expYearsMin, expYearsMax, salaryMin, salaryMax, filterJobId, filterStatus, recruiterFilter,
    filterSkills, filterEducation, filterSchool, filterCompany, filterCountry,
  };

  const fetchResumes = useCallback(async (query?: string, pageNum = 1) => {
    try {
      setLoading(true);
      const f = filtersRef.current;
      const params: any = { limit: PAGE_SIZE, page: pageNum };
      if (query) params.search = query;
      if (f.expYearsMin) params.expYearsMin = f.expYearsMin;
      if (f.expYearsMax) params.expYearsMax = f.expYearsMax;
      if (f.salaryMin) params.salaryMin = f.salaryMin;
      if (f.salaryMax) params.salaryMax = f.salaryMax;
      if (f.filterJobId) params.jobId = f.filterJobId;
      if (f.filterStatus) params.pipelineStatus = f.filterStatus;
      if (f.recruiterFilter.filterUserId) params.filterUserId = f.recruiterFilter.filterUserId;
      if (f.recruiterFilter.filterTeamId) params.filterTeamId = f.recruiterFilter.filterTeamId;
      if (f.filterSkills.length > 0) params.skills = f.filterSkills.join(',');
      if (f.filterEducation) params.educationLevel = f.filterEducation;
      if (f.filterSchool) params.school = f.filterSchool;
      if (f.filterCompany) params.company = f.filterCompany;
      if (f.filterCountry) params.country = f.filterCountry;
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
  }, [fetchResumes]);

  // Auto-backfill highlights for resumes missing them (runs once per session)
  const backfillTriggered = useRef(false);
  useEffect(() => {
    if (backfillTriggered.current || resumes.length === 0) return;
    const missing = resumes.some(r => !r.highlight && !r.summary);
    if (missing) {
      backfillTriggered.current = true;
      axios.post('/api/v1/resumes/backfill-highlights').then(() => {
        fetchResumes(search || undefined, page);
      }).catch(() => {});
    }
  }, [resumes, fetchResumes, search, page]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchResumes(value, 1);
    }, 300);
  };

  const applyFilters = useCallback(() => {
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

  const confirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`/api/v1/resumes/${confirmDeleteId}`);
      setResumes((prev) => prev.filter((r) => r.id !== confirmDeleteId));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch {
      // handle error
    } finally {
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId]);

  // Pre-compute enriched data for each resume
  const enrichedResumes = useMemo(() => {
    return resumes.map(resume => ({
      ...resume,
      _topSkills: getTopSkills(resume.parsedData),
      _highlight: resume.highlight || getHighlight(resume.parsedData),
      _workExp: getWorkExperience(resume.parsedData),
      _notableCompanies: getNotableCompanies(resume.parsedData),
      _industryTags: getIndustryTags(resume.parsedData),
      _jobCategory: getJobCategory(resume.currentRole, resume.parsedData),
      _parseWarning: hasResumeParseWarning(resume.parsedData),
    }));
  }, [resumes]);

  const activeFilterCount = [expYearsMin, expYearsMax, salaryMin, salaryMax, filterJobId, filterStatus, filterEducation, filterSchool, filterCompany, filterCountry].filter(Boolean).length + (filterSkills.length > 0 ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0 || !!search;

  // Compute top skills across current page for the summary
  const topPoolSkills = useMemo(() => {
    const skillMap = new Map<string, number>();
    for (const r of resumes) {
      const pd = r.parsedData;
      if (!pd?.skills) continue;
      const allSkills: string[] = Array.isArray(pd.skills)
        ? pd.skills
        : Object.values(pd.skills).flat().filter((s: any) => typeof s === 'string');
      for (const s of allSkills) {
        skillMap.set(s, (skillMap.get(s) || 0) + 1);
      }
    }
    return [...skillMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s]) => s);
  }, [resumes]);

  return (
    <div className="mx-auto max-w-[1380px] space-y-4">
      {/* Header row: title + upload */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t('product.talent.title', 'Talent Hub')}</h2>
          <p className="text-sm text-slate-500">{t('product.talent.subtitle', 'Your candidate repository with AI-powered insights.')}</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shrink-0"
        >
          <IconUpload size={16} stroke={2} />
          {t('product.talent.upload', 'Upload Resumes')}
        </button>
      </div>

      {/* Executive Summary */}
      {stats && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-6">
            {[
              { label: t('product.talent.statTotal', 'Total Candidates'), value: stats.total, color: 'text-slate-900' },
              { label: t('product.talent.statThisWeek', 'New This Week'), value: stats.thisWeek, color: 'text-blue-600' },
              { label: t('product.talent.statMatched', 'Matched'), value: matchedCount, color: 'text-cyan-600' },
              { label: t('product.talent.statInterviewed', 'Interview Invited'), value: interviewedCount, color: 'text-violet-600' },
              { label: t('product.talent.statAnalyzed', 'AI Analyzed'), value: stats.analyzed, color: 'text-emerald-600' },
            ].map((s) => (
              <div key={s.label} className="text-center min-w-[80px]">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-slate-500 font-medium">{s.label}</p>
              </div>
            ))}
            {topPoolSkills.length > 0 && (
              <div className="flex-1 min-w-[200px] border-l border-slate-200 pl-6 ml-2">
                <p className="text-[11px] text-slate-500 font-medium mb-1.5">{t('product.talent.statTopSkills', 'Top Skills')}</p>
                <div className="flex flex-wrap gap-1">
                  {topPoolSkills.map((skill) => (
                    <span key={skill} className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{skill}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toolbar: search + filters + view toggle — single row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t('product.talent.searchPlaceholder', 'Search by name, company, etc.')}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Recruiter / Team filter (admin only) */}
        {user?.role === 'admin' && (
          <RecruiterTeamFilter
            value={recruiterFilter}
            onChange={(f) => { setRecruiterFilter(f); setTimeout(() => applyFilters(), 0); }}
          />
        )}

        {/* Status */}
        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setTimeout(() => applyFilters(), 0); }}
            className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{t('product.talent.filterAllStatus', 'All Status')}</option>
            <option value="matched">{t('product.talent.filterMatched', 'Matched')}</option>
            <option value="shortlisted">{t('product.talent.filterShortlisted', 'Shortlisted')}</option>
            <option value="invited">{t('product.talent.filterInvited', 'Invited')}</option>
            <option value="rejected">{t('product.talent.filterRejected', 'Rejected')}</option>
          </select>
          <IconChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
        </div>

        {/* Add Filter toggle */}
        <button
          onClick={() => setShowMoreFilters(!showMoreFilters)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${showMoreFilters || activeFilterCount > 0 ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
        >
          <IconAdjustments size={16} stroke={1.5} />
          {t('product.talent.addFilter', 'Add Filter')}
          {activeFilterCount > 0 && (
            <span className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{activeFilterCount}</span>
          )}
        </button>

        {/* View toggle */}
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            onClick={() => setViewMode('card')}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${viewMode === 'card' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
            title={t('product.talent.viewCard', 'Card View')}
          >
            <IconLayoutGrid size={16} stroke={1.5} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
            title={t('product.talent.viewList', 'List View')}
          >
            <IconList size={16} stroke={1.5} />
          </button>
        </div>
      </div>

      {/* Filtered result count */}
      {hasActiveFilters && !loading && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-700">
            {t('product.talent.filteredResults', '{{count}} candidates found', { count: totalCount })}
          </span>
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setExpYearsMin(''); setExpYearsMax(''); setSalaryMin(''); setSalaryMax('');
                setFilterJobId(''); setFilterStatus(''); setFilterSkills([]); setSkillInput('');
                setFilterEducation(''); setFilterSchool(''); setFilterCompany(''); setFilterCountry('');
                setTimeout(() => fetchResumes(search || undefined, 1), 0);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {t('product.talent.clearFilters', 'Clear all filters')}
            </button>
          )}
        </div>
      )}

      {/* Collapsible filter panel */}
      {showMoreFilters && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          {/* Row 1: Skills, Education, School, Company */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Skills (multi-tag input) */}
            <div className="space-y-1.5 lg:col-span-2">
              <label className="text-xs font-medium text-slate-500">{t('product.talent.filterSkills', 'Skills')}</label>
              <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-lg border border-slate-200 bg-white px-2 py-1 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                {filterSkills.map((skill) => (
                  <span key={skill} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {skill}
                    <button
                      type="button"
                      onClick={() => setFilterSkills(filterSkills.filter(s => s !== skill))}
                      className="text-blue-400 hover:text-blue-600"
                    >
                      <IconX size={12} stroke={2} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
                      e.preventDefault();
                      const val = skillInput.trim().replace(/,$/, '');
                      if (val && !filterSkills.includes(val)) setFilterSkills([...filterSkills, val]);
                      setSkillInput('');
                    }
                    if (e.key === 'Backspace' && !skillInput && filterSkills.length > 0) {
                      setFilterSkills(filterSkills.slice(0, -1));
                    }
                  }}
                  placeholder={filterSkills.length === 0 ? t('product.talent.filterSkillsPlaceholder', 'Type skill and press Enter') : ''}
                  className="flex-1 min-w-[80px] h-7 border-0 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Education Level */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">{t('product.talent.filterEducation', 'Education')}</label>
              <div className="relative">
                <select
                  value={filterEducation}
                  onChange={(e) => setFilterEducation(e.target.value)}
                  className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">{t('product.talent.filterAllEducation', 'All Education')}</option>
                  <option value="junior_high">{t('product.talent.eduJuniorHigh', 'Junior High & Below')}</option>
                  <option value="vocational">{t('product.talent.eduVocational', 'Vocational / Technical')}</option>
                  <option value="high_school">{t('product.talent.eduHighSchool', 'High School')}</option>
                  <option value="associate">{t('product.talent.eduAssociate', 'Associate Degree')}</option>
                  <option value="bachelor">{t('product.talent.eduBachelor', 'Bachelor\'s Degree')}</option>
                  <option value="master">{t('product.talent.eduMaster', 'Master\'s Degree')}</option>
                  <option value="doctorate">{t('product.talent.eduDoctorate', 'Doctorate / PhD')}</option>
                </select>
                <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
              </div>
            </div>

            {/* School */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">{t('product.talent.filterSchool', 'School')}</label>
              <input
                type="text"
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                placeholder={t('product.talent.filterSchoolPlaceholder', 'University name')}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Row 2: Company, Country, Work Years, Salary, Job, Apply */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {/* Company */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">{t('product.talent.filterCompany', 'Company')}</label>
              <input
                type="text"
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                placeholder={t('product.talent.filterCompanyPlaceholder', 'Company name')}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Country/Region */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">{t('product.talent.filterCountry', 'Country / Region')}</label>
              <div className="relative">
                <select
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">{t('product.talent.filterAllCountries', 'All Countries')}</option>
                  {COUNTRY_LIST.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
              </div>
            </div>

            {/* Work Years */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">{t('product.talent.filterWorkYears', 'Work Years')}</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  value={expYearsMin}
                  onChange={(e) => setExpYearsMin(e.target.value)}
                  placeholder={t('product.talent.filterMin', 'Min')}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700 text-center placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-slate-300 shrink-0">—</span>
                <input
                  type="number"
                  min="0"
                  value={expYearsMax}
                  onChange={(e) => setExpYearsMax(e.target.value)}
                  placeholder={t('product.talent.filterMax', 'Max')}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700 text-center placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Expected Salary */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">{t('product.talent.filterSalary', 'Expected Salary')}</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder={t('product.talent.filterMin', 'Min')}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700 text-center placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-slate-300 shrink-0">—</span>
                <input
                  type="number"
                  min="0"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder={t('product.talent.filterMax', 'Max')}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700 text-center placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Job */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">{t('product.talent.filterJob', 'Job')}</label>
              <div className="relative">
                <select
                  value={filterJobId}
                  onChange={(e) => setFilterJobId(e.target.value)}
                  className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">{t('product.talent.filterAllJobs', 'All Jobs')}</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
                <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
              </div>
            </div>

            {/* Apply */}
            <div className="flex items-end">
              <button
                onClick={applyFilters}
                className="h-9 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                {t('product.talent.applyFilters', 'Apply Filters')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume Upload Modal */}
      <ResumeUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={() => {
          fetchResumes(search || undefined, 1);
        }}
        batch
      />

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : enrichedResumes.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
          <IconUsers className="w-16 h-16 mx-auto text-slate-300 mb-4" size={64} stroke={1} />
          <h3 className="text-lg font-semibold text-slate-900">{t('product.talent.empty', 'No candidates yet')}</h3>
          <p className="mt-1 text-sm text-slate-600">{t('product.talent.emptyDesc', 'Upload resumes to build your talent pool.')}</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('product.talent.upload', 'Upload Resumes')}
          </button>
        </div>
      ) : viewMode === 'card' ? (
        /* ── Card View ── */
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrichedResumes.map((resume) => (
              <ResumeCard key={resume.id} resume={resume} onDelete={handleDelete} onPreferences={handlePreferences} onApply={handleApply} onInvite={handleInvite} t={t} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={totalCount} onPageChange={handlePageChange} t={t} />
        </>
      ) : (
        /* ── List View ── */
        <>
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {enrichedResumes.map((resume) => (
              <ResumeListRow key={resume.id} resume={resume} onDelete={handleDelete} onPreferences={handlePreferences} onApply={handleApply} onInvite={handleInvite} t={t} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={totalCount} onPageChange={handlePageChange} t={t} />
        </>
      )}

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
