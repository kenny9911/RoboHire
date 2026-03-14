import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';
import ResumeUploadModal from '../../components/ResumeUploadModal';
import CandidatePreferencesModal, { type CandidatePreferences } from '../../components/CandidatePreferencesModal';

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

interface Resume {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  fileName: string | null;
  status: string;
  tags: string[];
  preferences: CandidatePreferences | null;
  hasInvitations: boolean;
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
  { category: 'Management', keywords: ['manager', 'director', 'vp', 'cto', 'ceo', '总监', '经理', 'lead', 'head of', '负责人', '主管'] },
  { category: 'QA', keywords: ['qa', 'test', 'quality', '测试', '质量'] },
  { category: 'Sales', keywords: ['sales', 'account', 'bd', 'business develop', '销售'] },
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
  if (!parsedData?.summary) return null;
  const text = parsedData.summary.trim();
  const sentenceEnd = text.search(SENTENCE_END_RE);
  if (sentenceEnd > 0 && sentenceEnd <= 100) {
    return text.substring(0, sentenceEnd + 1);
  }
  if (text.length <= 80) return text;
  return text.substring(0, 80) + '...';
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

// ── Memoized Card Component ──
const ResumeCard = memo(function ResumeCard({ resume, onDelete, onPreferences, t }: { resume: EnrichedResume; onDelete: (id: string) => void; onPreferences: (resume: EnrichedResume) => void; t: (k: string, f: string) => string }) {
  const hasPrefs = resume.preferences && Object.values(resume.preferences).some(v => v && (Array.isArray(v) ? v.length > 0 : String(v).trim()));
  return (
    <Link
      to={`/product/talent/${resume.id}`}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all duration-200"
    >
      {/* Header bar */}
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
            {resume.name}
          </h3>
          {resume.currentRole && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">{resume.currentRole}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreferences(resume); }}
            className={`p-1 rounded transition-colors ${hasPrefs ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            title={t('product.talent.preferences.title', 'Candidate Preferences')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </button>
          {!resume.hasInvitations && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(resume.id); }}
              className="p-1 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Meta row: category + experience */}
      <div className="px-4 sm:px-5 pb-3 flex items-center gap-2 text-xs text-slate-500">
        {resume._jobCategory && (
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${CATEGORY_COLORS[resume._jobCategory] || 'bg-slate-100 text-slate-600'}`}>
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
          <span className="text-slate-400">
            {resume._notableCompanies.map(c => `Ex-${c}`).join(', ')}
          </span>
        )}
      </div>

      {/* Summary */}
      {resume._highlight && (
        <div className="px-4 sm:px-5 pb-3">
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{resume._highlight}</p>
        </div>
      )}

      {/* Skills + Industry tags */}
      {(resume._topSkills.length > 0 || resume._industryTags.length > 0) && (
        <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-1">
          {resume._industryTags.map((tag) => (
            <span key={tag} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {tag}
            </span>
          ))}
          {resume._topSkills.map((skill) => (
            <span key={skill} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 sm:px-5 py-2.5 border-t border-slate-100 flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">
            {new Date(resume.createdAt).toLocaleDateString()}
          </span>
          {resume._versionCount != null && resume._versionCount > 0 && (
            <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" /></svg>
              {resume._versionCount}
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium text-blue-600 group-hover:text-blue-700">
          {t('product.talent.viewProfile', 'View Profile')} →
        </span>
      </div>
    </Link>
  );
});

// ── Memoized List Row Component ──
const ResumeListRow = memo(function ResumeListRow({ resume, onDelete, onPreferences, t }: { resume: EnrichedResume; onDelete: (id: string) => void; onPreferences: (resume: EnrichedResume) => void; t: (k: string, f: string) => string }) {
  const hasPrefs = resume.preferences && Object.values(resume.preferences).some(v => v && (Array.isArray(v) ? v.length > 0 : String(v).trim()));
  return (
    <Link
      to={`/product/talent/${resume.id}`}
      className="group px-4 sm:px-5 py-3.5 hover:bg-slate-50/50 transition-colors flex items-center gap-3 sm:gap-4 block"
    >
      <div className="min-w-0 w-28 sm:w-44 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
            {resume.name}
          </span>
          {resume._jobCategory && (
            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ${CATEGORY_COLORS[resume._jobCategory] || 'bg-slate-100 text-slate-600'}`}>
              {resume._jobCategory}
            </span>
          )}
        </div>
        {resume.currentRole && (
          <p className="text-xs text-slate-500 truncate">{resume.currentRole}</p>
        )}
      </div>

      <div className="hidden xl:block min-w-0 flex-1">
        {resume._highlight ? (
          <p className="text-xs text-slate-400 truncate">{resume._highlight}</p>
        ) : null}
      </div>

      <div className="hidden lg:flex gap-1 shrink-0 max-w-[200px] flex-wrap">
        {resume._topSkills.slice(0, 3).map((skill) => (
          <span key={skill} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            {skill}
          </span>
        ))}
        {resume._topSkills.length > 3 && (
          <span className="text-[10px] text-slate-400">+{resume._topSkills.length - 3}</span>
        )}
      </div>

      <div className="hidden md:block shrink-0 w-24 text-xs text-slate-500">
        {resume._workExp ? (
          <div>
            {resume._workExp.fullTimeYears > 0 && (
              <span>{resume._workExp.fullTimeYears} {t('product.talent.yearsWork', 'yrs')}</span>
            )}
            {resume._workExp.internshipMonths > 0 && (
              <span className="text-slate-400 block text-[10px]">+ {resume._workExp.internshipMonths} {t('product.talent.monthsIntern', 'mo intern')}</span>
            )}
          </div>
        ) : resume.experienceYears ? (
          <span>{resume.experienceYears}</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>

      <div className="hidden lg:flex gap-1 shrink-0 max-w-[180px] flex-wrap">
        {resume._notableCompanies.map((company) => (
          <span key={company} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
            Ex-{company}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {resume._versionCount != null && resume._versionCount > 0 && (
          <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded flex items-center gap-0.5 mr-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
            {resume._versionCount}
          </span>
        )}
        <span className="text-xs font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity mr-1">
          {t('product.talent.viewProfile', 'View Profile')}
        </span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreferences(resume); }}
          className={`p-1.5 rounded transition-colors ${hasPrefs ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
          title={t('product.talent.preferences.title', 'Candidate Preferences')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
        </button>
        {!resume.hasInvitations && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(resume.id); }}
            className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
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
      <span className="text-xs text-slate-500">
        {t('product.talent.totalCandidates', '{{count}} candidates', { count: total })}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-colors ${
              p === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
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
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──

const PAGE_SIZE = 20;

export default function TalentHub() {
  const { t } = useTranslation();
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
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fetchResumes = useCallback(async (query?: string, pageNum = 1) => {
    try {
      setLoading(true);
      const params: any = { limit: PAGE_SIZE, page: pageNum };
      if (query) params.search = query;
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

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchResumes(value, 1);
    }, 300);
  };

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
      _highlight: getHighlight(resume.parsedData),
      _workExp: getWorkExperience(resume.parsedData),
      _notableCompanies: getNotableCompanies(resume.parsedData),
      _industryTags: getIndustryTags(resume.parsedData),
      _jobCategory: getJobCategory(resume.currentRole, resume.parsedData),
    }));
  }, [resumes]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.talent.title', 'Talent Hub')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.talent.subtitle', 'Your candidate repository with AI-powered insights.')}</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors self-start sm:self-auto shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {t('product.talent.upload', 'Upload Resumes')}
        </button>
      </div>

      {/* Search + View Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t('product.talent.searchPlaceholder', 'Search by name, role, skills...')}
            className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('card')}
            className={`p-2 rounded-md transition-all ${viewMode === 'card' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            title={t('product.talent.viewCard', 'Card View')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            title={t('product.talent.viewList', 'List View')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Resume Upload Modal */}
      <ResumeUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={() => {
          setShowUpload(false);
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
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900">{t('product.talent.empty', 'No candidates yet')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('product.talent.emptyDesc', 'Upload resumes to build your talent pool.')}</p>
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
              <ResumeCard key={resume.id} resume={resume} onDelete={handleDelete} onPreferences={handlePreferences} t={t} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={totalCount} onPageChange={handlePageChange} t={t} />
        </>
      ) : (
        /* ── List View ── */
        <>
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {enrichedResumes.map((resume) => (
              <ResumeListRow key={resume.id} resume={resume} onDelete={handleDelete} onPreferences={handlePreferences} t={t} />
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
