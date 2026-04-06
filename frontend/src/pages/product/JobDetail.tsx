import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from '../../lib/axios';
import { INTERVIEW_LANGUAGE_OPTIONS, getInterviewLanguageDisplay } from '../../utils/interviewLanguage';
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  Wifi,
  DollarSign,
  Users,
  GraduationCap,
  Timer,
  XCircle,
  Building2,
  BarChart3,
  Target,
  TrendingUp,
  Star,
  Loader2,
  Check,
  Sparkles,
  Pencil,
  Lightbulb,
} from 'lucide-react';
import IntelligenceReportPanel from '../../components/IntelligenceReportPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LocationEntry { country: string; city: string }

interface Job {
  id: string;
  title: string;
  companyName: string | null;
  department: string | null;
  location: string | null;
  workType: string | null;
  employmentType: string | null;
  experienceLevel: string | null;
  education: string | null;
  headcount: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  description: string | null;
  qualifications: string | null;
  hardRequirements: string | null;
  niceToHave: string | null;
  benefits: string | null;
  requirements: any;
  locations: LocationEntry[] | null;
  interviewMode: string | null;
  passingScore: number | null;
  interviewLanguage: string | null;
  interviewDuration: number | null;
  interviewRequirements: string | null;
  evaluationRules: string | null;
  notes: string | null;
  status: string;
  hiringRequestId: string | null;
  hiringRequest?: { id: string; title: string } | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MatchResult {
  id: string;
  resumeId: string;
  score: number | null;
  grade: string | null;
  status: string;
  matchData: any;
  createdAt: string;
  appliedAt?: string | null;
  resume: {
    id: string;
    name: string;
    email: string | null;
    currentRole: string | null;
    experienceYears: string | null;
    tags: string[];
  };
}

type ContentSection = 'description' | 'hardRequirements' | 'qualifications' | 'niceToHave' | 'benefits' | 'interviewRequirements' | 'evaluationRules';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const JOB_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  open: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-100 text-gray-600',
  filled: 'bg-blue-100 text-blue-700',
};

const MATCH_STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700 border-slate-300',
  reviewed: 'bg-blue-100 text-blue-700 border-blue-300',
  shortlisted: 'bg-green-100 text-green-700 border-green-300',
  applied: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  rejected: 'bg-red-100 text-red-700 border-red-300',
  invited: 'bg-purple-100 text-purple-700 border-purple-300',
};

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-600', A: 'text-emerald-600',
  'B+': 'text-blue-600', B: 'text-blue-600',
  C: 'text-amber-600', D: 'text-orange-600', F: 'text-red-600',
};

const STATUS_BAR_COLORS: Record<string, string> = {
  new: 'bg-slate-400', reviewed: 'bg-blue-500', shortlisted: 'bg-green-500',
  applied: 'bg-indigo-500', rejected: 'bg-red-500', invited: 'bg-purple-500',
};

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'internship'];
const WORK_TYPES = ['onsite', 'hybrid', 'remote'];
const EXPERIENCE_LEVELS = ['intern', 'entry', 'mid', 'senior', 'lead', 'executive'];
const EDUCATION_LEVELS = ['none', 'high_school', 'associate', 'bachelor', 'master', 'phd'];
const INTERVIEW_DURATIONS = ['15', '30', '45', '60'];
const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'HKD', 'TWD', 'SGD', 'CAD', 'AUD'];

// Maps data values → i18n keys
const EMP_TYPE_I18N: Record<string, string> = {
  'full-time': 'fullTime', 'part-time': 'partTime', contract: 'contract', internship: 'internship',
};
const WORK_TYPE_I18N: Record<string, string> = {
  onsite: 'Onsite', hybrid: 'Hybrid', remote: 'Remote',
};
const EDU_I18N: Record<string, string> = {
  none: 'None', high_school: 'HighSchool', associate: 'Associate',
  bachelor: 'Bachelor', master: 'Master', phd: 'Phd',
};
const EXP_I18N: Record<string, string> = {
  intern: 'Intern', entry: 'Entry', mid: 'Mid', senior: 'Senior', lead: 'Lead', executive: 'Executive',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</div>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function AnalyticItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">{icon}<span className="text-sm text-slate-600">{label}</span></div>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-700">{score}</span>
    </div>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  return <span className={`text-sm font-bold ${GRADE_COLORS[grade] || 'text-slate-600'}`}>{grade}</span>;
}

/** Inline editable text field */
function EditField({ label, value, onChange, type = 'text', ...rest }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
  [k: string]: any;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        {...rest}
      />
    </div>
  );
}

/** Inline editable select field */
function SelectField({ label, value, onChange, options, renderOption }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[];
  renderOption?: (v: string) => string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
      >
        <option value="">—</option>
        {options.map((v) => <option key={v} value={v}>{renderOption ? renderOption(v) : v}</option>)}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'details' | 'insights'>('details');
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);

  // Inline edit state
  const [editingBasicInfo, setEditingBasicInfo] = useState(false);
  const [editingSection, setEditingSection] = useState<ContentSection | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [closing, setClosing] = useState(false);
  const [aiLoading, setAiLoading] = useState<ContentSection | null>(null);

  // Basic info form draft
  const [basicDraft, setBasicDraft] = useState({
    title: '', companyName: '', department: '', location: '',
    employmentType: '', workType: '', experienceLevel: '', education: '',
    headcount: '1', salaryMin: '', salaryMax: '', salaryCurrency: ({ en: 'USD', zh: 'CNY', 'zh-TW': 'NTD', ja: 'JPY', ko: 'KRW' } as Record<string, string>)[i18n.language] || 'USD',
    salaryPeriod: 'monthly', salaryText: '', interviewDuration: '30',
    interviewMode: 'standard', passingScore: '60', interviewLanguage: '',
  });

  // ---- Data fetching ----
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    axios.get(`/api/v1/jobs/${id}`)
      .then((res) => { if (res.data.success) setJob(res.data.data); else setError(res.data.error || 'Failed to load job'); })
      .catch(() => setError('Failed to load job'))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchMatches = useCallback(async () => {
    if (!id || matchesLoaded) return;
    try {
      const res = await axios.get(`/api/v1/matching/results/${id}`);
      if (res.data.success) setMatches(res.data.data || []);
    } catch { /* silent */ } finally { setMatchesLoaded(true); }
  }, [id, matchesLoaded]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  // ---- Basic info edit ----
  const openBasicInfoEdit = useCallback(() => {
    if (!job) return;
    setBasicDraft({
      title: job.title || '', companyName: job.companyName || '', department: job.department || '',
      location: job.location || '', employmentType: job.employmentType || '', workType: job.workType || '',
      experienceLevel: job.experienceLevel || '', education: job.education || '',
      headcount: String(job.headcount || 1), salaryMin: job.salaryMin ? String(job.salaryMin) : '',
      salaryMax: job.salaryMax ? String(job.salaryMax) : '', salaryCurrency: job.salaryCurrency || 'USD',
      salaryPeriod: job.salaryPeriod || 'monthly', salaryText: job.salaryText || '',
      interviewDuration: job.interviewDuration ? String(job.interviewDuration) : '30',
      interviewMode: job.interviewMode || 'standard',
      passingScore: job.passingScore ? String(job.passingScore) : '60',
      interviewLanguage: job.interviewLanguage || '',
    });
    setSaveError('');
    setEditingBasicInfo(true);
  }, [job]);

  const saveBasicInfo = useCallback(async () => {
    if (!job) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await axios.patch(`/api/v1/jobs/${job.id}`, {
        title: basicDraft.title, companyName: basicDraft.companyName || null,
        department: basicDraft.department || null, location: basicDraft.location || null,
        employmentType: basicDraft.employmentType || null, workType: basicDraft.workType || null,
        experienceLevel: basicDraft.experienceLevel || null, education: basicDraft.education || null,
        headcount: basicDraft.headcount ? parseInt(basicDraft.headcount) : 1,
        salaryMin: basicDraft.salaryMin ? parseInt(basicDraft.salaryMin) : null,
        salaryMax: basicDraft.salaryMax ? parseInt(basicDraft.salaryMax) : null,
        salaryCurrency: basicDraft.salaryCurrency || 'USD', salaryPeriod: basicDraft.salaryPeriod || 'monthly',
        salaryText: basicDraft.salaryText || null,
        interviewDuration: basicDraft.interviewDuration ? parseInt(basicDraft.interviewDuration) : 30,
        interviewMode: basicDraft.interviewMode || 'standard',
        passingScore: basicDraft.passingScore ? parseInt(basicDraft.passingScore) : 60,
        interviewLanguage: basicDraft.interviewLanguage || null,
      });
      if (res.data.success) { setJob(res.data.data); setEditingBasicInfo(false); }
      else setSaveError(res.data.error || 'Failed to save');
    } catch { setSaveError('Failed to save'); } finally { setSaving(false); }
  }, [job, basicDraft]);

  // ---- Content section inline edit ----
  const openSectionEdit = useCallback((section: ContentSection) => {
    if (!job) return;
    setEditText(job[section] || '');
    setEditingSection(section);
    setSaveError('');
  }, [job]);

  const saveSection = useCallback(async () => {
    if (!job || !editingSection) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await axios.patch(`/api/v1/jobs/${job.id}`, { [editingSection]: editText || null });
      if (res.data.success) { setJob(res.data.data); setEditingSection(null); }
      else setSaveError(res.data.error || 'Failed to save');
    } catch { setSaveError('Failed to save'); } finally { setSaving(false); }
  }, [job, editingSection, editText]);

  // ---- AI enhance / generate ----
  const handleAI = useCallback(async (section: ContentSection) => {
    if (!job) return;
    setAiLoading(section);
    const hasContent = !!job[section];
    try {
      const res = await axios.post(`/api/v1/jobs/${job.id}/generate-content`, {
        action: hasContent ? 'enhance' : 'generate_section',
        section,
        language: i18n.language,
      });
      if (res.data.success && res.data.data) setJob(res.data.data);
    } catch { /* silent */ } finally { setAiLoading(null); }
  }, [job, i18n.language]);

  // ---- Close job ----
  const handleCloseJob = useCallback(async () => {
    if (!job || closing) return;
    setClosing(true);
    try {
      const res = await axios.patch(`/api/v1/jobs/${job.id}`, { status: 'closed' });
      if (res.data.success) setJob(res.data.data);
    } catch { /* silent */ } finally { setClosing(false); }
  }, [job, closing]);

  // ---- Derived data ----
  const locationText = useMemo(() => {
    if (!job) return '—';
    if (job.locations && Array.isArray(job.locations) && job.locations.length > 0)
      return (job.locations as LocationEntry[]).map((l) => `${l.city}${l.city && l.country ? ', ' : ''}${l.country}`).join(' | ');
    return job.location || '—';
  }, [job]);

  const salaryDisplay = useMemo(() => {
    if (!job) return '—';
    if (job.salaryText) return job.salaryText;
    if (job.salaryMin === 0 && job.salaryMax === 0) return t('product.jobs.salaryNegotiable', 'Negotiable');
    if (job.salaryMin || job.salaryMax) {
      const cur = t(`product.jobDetail.currency.${job.salaryCurrency || 'USD'}`, job.salaryCurrency || 'USD');
      const period = job.salaryPeriod ? ` / ${t(`product.jobDetail.${job.salaryPeriod}`, job.salaryPeriod)}` : '';
      return `${cur} ${job.salaryMin?.toLocaleString() || '—'} – ${job.salaryMax?.toLocaleString() || '—'}${period}`;
    }
    return '—';
  }, [job, t]);

  const analytics = useMemo(() => {
    const total = matches.length;
    const avgScore = total > 0 ? Math.round(matches.reduce((s, m) => s + (m.score || 0), 0) / total) : 0;
    const invitedCount = matches.filter((m) => m.status === 'invited').length;
    const shortlistedCount = matches.filter((m) => m.status === 'shortlisted').length;
    return { total, avgScore, invitedCount, shortlistedCount };
  }, [matches]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of matches) counts[m.status] = (counts[m.status] || 0) + 1;
    return Object.entries(counts).map(([status, count]) => ({ status, count, color: STATUS_BAR_COLORS[status] || 'bg-slate-400' })).sort((a, b) => b.count - a.count);
  }, [matches]);
  const maxStatusCount = Math.max(...statusBreakdown.map((s) => s.count), 1);

  const daysOpen = useMemo(() => {
    if (!job) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(job.publishedAt || job.createdAt).getTime()) / 86400000));
  }, [job]);

  // ---- Helper to render section action buttons ----
  const sectionActions = (section: ContentSection) => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleAI(section)}
        disabled={aiLoading === section}
        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
      >
        {aiLoading === section ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {job?.[section] ? t('product.jobDetail.aiRefine', 'AI Enhance') : t('product.jobDetail.aiGenerate', 'AI Generate')}
      </button>
      <button
        onClick={() => openSectionEdit(section)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
        {t('product.jobDetail.edit', 'Edit')}
      </button>
    </div>
  );

  // ---- Loading / Error ----
  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" /></div>;

  if (error || !job) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <p className="text-red-600 mb-4">{error || 'Job not found'}</p>
        <button onClick={() => navigate('/product/jobs')} className="text-blue-600 hover:underline text-sm">
          {t('product.jobDetail.backToJobs', 'Back to Jobs')}
        </button>
      </div>
    );
  }

  const bd = basicDraft; // shorthand
  const setBd = (field: string, value: string) => setBasicDraft((d) => ({ ...d, [field]: value }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back Link */}
      <Link to="/product/jobs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        {t('product.jobDetail.backToJobs', 'Back to Jobs')}
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Building2 className="h-4 w-4" />
              <span>{job.companyName || '—'}</span>
              {job.department && <><span className="text-slate-300">|</span><span>{job.department}</span></>}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{job.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize ${JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.draft}`}>
                {t(`product.jobs.status.${job.status}`, job.status)}
              </span>
              {job.employmentType && <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 capitalize">{t(`product.jobs.empTypes.${EMP_TYPE_I18N[job.employmentType] || job.employmentType}`, job.employmentType)}</span>}
              {job.experienceLevel && (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 capitalize">
                  {t(`product.jobDetail.exp${EXP_I18N[job.experienceLevel] || job.experienceLevel}`, job.experienceLevel)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCloseJob}
              disabled={closing || job.status === 'closed'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              {t('product.jobDetail.closeJob', 'Close Job')}
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50/50 p-1 shadow-sm">
        {([
          { key: 'details' as const, label: t('product.jobDetail.tabDetails', 'Job Details'), icon: <Briefcase className="h-4 w-4" /> },
          { key: 'insights' as const, label: t('product.jobDetail.tabInsights', 'AI Insights'), icon: <Lightbulb className="h-4 w-4" /> },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: AI Insights */}
      {activeTab === 'insights' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {job.hiringRequestId ? (
            <IntelligenceReportPanel hiringRequestId={job.hiringRequestId} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-50">
                <Lightbulb className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">{t('product.jobDetail.noInsights', 'No AI Insights Available')}</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">{t('product.jobDetail.noInsightsDesc', 'AI insights require a linked hiring request. Create this job from Agent Alex to enable intelligence reports.')}</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Job Details */}
      {activeTab === 'details' && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left content */}
        <div className="space-y-6 lg:col-span-2">

          {/* ===== Basic Info (view / inline edit) ===== */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.basicInfo', 'Job Details')}</h2>
              {!editingBasicInfo ? (
                <button onClick={openBasicInfoEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />{t('product.jobDetail.edit', 'Edit')}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {saveError && <span className="text-xs text-red-500">{saveError}</span>}
                  <button onClick={() => setEditingBasicInfo(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    {t('product.jobDetail.cancel', 'Cancel')}
                  </button>
                  <button onClick={saveBasicInfo} disabled={saving || !bd.title.trim()} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {t('product.jobDetail.saveSection', 'Save')}
                  </button>
                </div>
              )}
            </div>

            {!editingBasicInfo ? (
              /* View mode */
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <InfoItem icon={<MapPin className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.location', 'Location')} value={locationText} />
                <InfoItem icon={<Briefcase className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.employmentType', 'Type')} value={job.employmentType ? t(`product.jobs.empTypes.${EMP_TYPE_I18N[job.employmentType] || job.employmentType}`, job.employmentType) : '—'} />
                <InfoItem icon={<Wifi className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.workType', 'Work Mode')} value={job.workType ? t(`product.jobDetail.wt${WORK_TYPE_I18N[job.workType] || job.workType}`, job.workType) : '—'} />
                <InfoItem icon={<DollarSign className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.salary', 'Salary')} value={salaryDisplay} />
                <InfoItem icon={<Users className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.headcount', 'Headcount')} value={String(job.headcount)} />
                <InfoItem icon={<Star className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.experienceLevel', 'Experience')} value={job.experienceLevel ? t(`product.jobDetail.exp${EXP_I18N[job.experienceLevel] || job.experienceLevel}`, job.experienceLevel) : '—'} />
                <InfoItem icon={<GraduationCap className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.education', 'Education')} value={job.education ? t(`product.jobDetail.edu${EDU_I18N[job.education] || job.education}`, job.education) : '—'} />
                <InfoItem icon={<Timer className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.interviewDuration', 'Interview')} value={job.interviewDuration ? `${job.interviewDuration} ${t('product.jobDetail.minutes', 'min')}` : '—'} />
              </div>
            ) : (
              /* Edit mode */
              <div className="mt-4 space-y-4">
                <EditField label={t('product.jobDetail.title', 'Job Title')} value={bd.title} onChange={(v) => setBd('title', v)} />
                <div className="grid grid-cols-2 gap-4">
                  <EditField label={t('product.jobDetail.company', 'Company')} value={bd.companyName} onChange={(v) => setBd('companyName', v)} />
                  <EditField label={t('product.jobDetail.department', 'Department')} value={bd.department} onChange={(v) => setBd('department', v)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <EditField label={t('product.jobDetail.location', 'Location')} value={bd.location} onChange={(v) => setBd('location', v)} />
                  <EditField label={t('product.jobDetail.headcount', 'Headcount')} value={bd.headcount} onChange={(v) => setBd('headcount', v)} type="number" min={1} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <SelectField label={t('product.jobDetail.employmentType', 'Employment Type')} value={bd.employmentType} onChange={(v) => setBd('employmentType', v)} options={EMPLOYMENT_TYPES} renderOption={(v) => t(`product.jobs.empTypes.${EMP_TYPE_I18N[v] || v}`, v)} />
                  <SelectField label={t('product.jobDetail.workType', 'Work Mode')} value={bd.workType} onChange={(v) => setBd('workType', v)} options={WORK_TYPES} renderOption={(v) => t(`product.jobDetail.wt${WORK_TYPE_I18N[v] || v}`, v)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <SelectField
                    label={t('product.jobDetail.experienceLevel', 'Experience')} value={bd.experienceLevel}
                    onChange={(v) => setBd('experienceLevel', v)} options={EXPERIENCE_LEVELS}
                    renderOption={(v) => t(`product.jobDetail.exp${EXP_I18N[v] || v}`, v)}
                  />
                  <SelectField
                    label={t('product.jobDetail.education', 'Education')} value={bd.education}
                    onChange={(v) => setBd('education', v)} options={EDUCATION_LEVELS}
                    renderOption={(v) => t(`product.jobDetail.edu${EDU_I18N[v] || v}`, v)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <EditField label={t('product.jobDetail.salaryMin', 'Salary Min')} value={bd.salaryMin} onChange={(v) => setBd('salaryMin', v)} type="number" />
                  <EditField label={t('product.jobDetail.salaryMax', 'Salary Max')} value={bd.salaryMax} onChange={(v) => setBd('salaryMax', v)} type="number" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <SelectField label={t('product.jobDetail.salaryCurrency', 'Currency')} value={bd.salaryCurrency} onChange={(v) => setBd('salaryCurrency', v)} options={CURRENCIES} renderOption={(v) => t(`product.jobDetail.currency.${v}`, v)} />
                  <SelectField label={t('product.jobDetail.salaryPeriod', 'Period')} value={bd.salaryPeriod} onChange={(v) => setBd('salaryPeriod', v)} options={['monthly', 'yearly']} renderOption={(v) => t(`product.jobDetail.${v}`, v)} />
                </div>
                <EditField label={t('product.jobDetail.salaryText', 'Salary Text')} value={bd.salaryText} onChange={(v) => setBd('salaryText', v)} />
                <SelectField
                  label={t('product.jobDetail.interviewDuration', 'Interview Duration')} value={bd.interviewDuration}
                  onChange={(v) => setBd('interviewDuration', v)} options={INTERVIEW_DURATIONS}
                  renderOption={(v) => `${v} ${t('product.jobDetail.minutes', 'min')}`}
                />
              </div>
            )}
          </div>

          {/* ===== Description ===== */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.description', 'Job Description')}</h2>
              {editingSection !== 'description' && sectionActions('description')}
            </div>
            {editingSection === 'description' ? (
              <div className="mt-3 space-y-3">
                <textarea
                  rows={10}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder={t('product.jobDetail.enterContent', 'Enter content (Markdown supported)...')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y"
                />
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingSection(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    {t('product.jobDetail.cancel', 'Cancel')}
                  </button>
                  <button onClick={saveSection} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {t('product.jobDetail.saveSection', 'Save')}
                  </button>
                </div>
              </div>
            ) : job.description ? (
              <div className="mt-3 prose prose-sm prose-slate max-w-none text-slate-600">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400 italic">{t('product.jobDetail.noContent', 'No content')}</p>
            )}
          </div>

          {/* ===== Hard Requirements ===== */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.hardRequirements', 'Requirements')}</h2>
              {editingSection !== 'hardRequirements' && sectionActions('hardRequirements')}
            </div>
            {editingSection === 'hardRequirements' ? (
              <div className="mt-3 space-y-3">
                <textarea
                  rows={8}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder={t('product.jobDetail.enterContent', 'Enter content (Markdown supported)...')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y"
                />
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingSection(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    {t('product.jobDetail.cancel', 'Cancel')}
                  </button>
                  <button onClick={saveSection} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {t('product.jobDetail.saveSection', 'Save')}
                  </button>
                </div>
              </div>
            ) : job.hardRequirements ? (
              <div className="mt-3 prose prose-sm prose-slate max-w-none text-slate-600">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.hardRequirements}</ReactMarkdown>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400 italic">{t('product.jobDetail.noContent', 'No content')}</p>
            )}
          </div>

          {/* ===== Qualifications ===== */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.qualifications', 'Qualifications')}</h2>
              {editingSection !== 'qualifications' && sectionActions('qualifications')}
            </div>
            {editingSection === 'qualifications' ? (
              <div className="mt-3 space-y-3">
                <textarea rows={8} value={editText} onChange={(e) => setEditText(e.target.value)} placeholder={t('product.jobDetail.enterContent', 'Enter content (Markdown supported)...')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y" />
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingSection(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">{t('product.jobDetail.cancel', 'Cancel')}</button>
                  <button onClick={saveSection} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{t('product.jobDetail.saveSection', 'Save')}</button>
                </div>
              </div>
            ) : job.qualifications ? (
              <div className="mt-3 prose prose-sm prose-slate max-w-none text-slate-600"><ReactMarkdown remarkPlugins={[remarkGfm]}>{job.qualifications}</ReactMarkdown></div>
            ) : (
              <p className="mt-3 text-sm text-slate-400 italic">{t('product.jobDetail.noContent', 'No content')}</p>
            )}
          </div>

          {/* ===== Nice to Have ===== */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.niceToHave', 'Nice to Have')}</h2>
              {editingSection !== 'niceToHave' && sectionActions('niceToHave')}
            </div>
            {editingSection === 'niceToHave' ? (
              <div className="mt-3 space-y-3">
                <textarea rows={6} value={editText} onChange={(e) => setEditText(e.target.value)} placeholder={t('product.jobDetail.enterContent', 'Enter content (Markdown supported)...')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y" />
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingSection(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">{t('product.jobDetail.cancel', 'Cancel')}</button>
                  <button onClick={saveSection} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{t('product.jobDetail.saveSection', 'Save')}</button>
                </div>
              </div>
            ) : job.niceToHave ? (
              <div className="mt-3 prose prose-sm prose-slate max-w-none text-slate-600"><ReactMarkdown remarkPlugins={[remarkGfm]}>{job.niceToHave}</ReactMarkdown></div>
            ) : (
              <p className="mt-3 text-sm text-slate-400 italic">{t('product.jobDetail.noContent', 'No content')}</p>
            )}
          </div>

          {/* ===== Benefits ===== */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.benefits', 'Benefits')}</h2>
              {editingSection !== 'benefits' && sectionActions('benefits')}
            </div>
            {editingSection === 'benefits' ? (
              <div className="mt-3 space-y-3">
                <textarea rows={6} value={editText} onChange={(e) => setEditText(e.target.value)} placeholder={t('product.jobDetail.enterContent', 'Enter content (Markdown supported)...')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y" />
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingSection(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">{t('product.jobDetail.cancel', 'Cancel')}</button>
                  <button onClick={saveSection} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{t('product.jobDetail.saveSection', 'Save')}</button>
                </div>
              </div>
            ) : job.benefits ? (
              <div className="mt-3 prose prose-sm prose-slate max-w-none text-slate-600"><ReactMarkdown remarkPlugins={[remarkGfm]}>{job.benefits}</ReactMarkdown></div>
            ) : (
              <p className="mt-3 text-sm text-slate-400 italic">{t('product.jobDetail.noContent', 'No content')}</p>
            )}
          </div>

          {/* ===== Interview Config ===== */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.interviewConfig', 'Interview Config')}</h2>
              {!editingBasicInfo && (
                <button onClick={openBasicInfoEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />{t('product.jobDetail.edit', 'Edit')}
                </button>
              )}
            </div>
            {!editingBasicInfo ? (
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <InfoItem icon={<Briefcase className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.interviewMode', 'Interview Mode')} value={job.interviewMode === 'question_bank' ? t('product.jobDetail.questionBank', 'Question Bank') : t('product.jobDetail.standard', 'Standard')} />
                <InfoItem icon={<Target className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.passingScore', 'Passing Score') + ' (20-80)'} value={String(job.passingScore ?? 60)} />
                <InfoItem icon={<Users className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.interviewLang', 'Interview Language')} value={getInterviewLanguageDisplay(job.interviewLanguage)} />
                <InfoItem icon={<Timer className="h-4 w-4 text-slate-400" />} label={t('product.jobDetail.interviewDuration', 'Duration') + ` (${t('product.jobDetail.minutes', 'min')})`} value={job.interviewDuration ? `${job.interviewDuration}` : '30'} />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <SelectField label={t('product.jobDetail.interviewMode', 'Interview Mode')} value={bd.interviewMode} onChange={(v) => setBd('interviewMode', v)} options={['standard', 'question_bank']} renderOption={(v) => v === 'question_bank' ? t('product.jobDetail.questionBank', 'Question Bank') : t('product.jobDetail.standard', 'Standard')} />
                <EditField label={t('product.jobDetail.passingScore', 'Passing Score') + ' (20-80)'} value={bd.passingScore} onChange={(v) => setBd('passingScore', v)} type="number" min={20} max={80} />
                <SelectField label={t('product.jobDetail.interviewLang', 'Interview Language')} value={bd.interviewLanguage} onChange={(v) => setBd('interviewLanguage', v)} options={INTERVIEW_LANGUAGE_OPTIONS.map((o) => o.value)} renderOption={(v) => INTERVIEW_LANGUAGE_OPTIONS.find((o) => o.value === v)?.label || v} />
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('product.jobDetail.interviewDuration', 'Duration')} ({t('product.jobDetail.minutes', 'min')})</label>
                  <div className="relative">
                    <input type="number" value={bd.interviewDuration} onChange={(e) => setBd('interviewDuration', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-12 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{t('product.jobDetail.minutes', 'min')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Interview Requirements */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{t('product.jobDetail.interviewRequirements', 'Interview Requirements')}</h3>
                {editingSection !== 'interviewRequirements' && sectionActions('interviewRequirements')}
              </div>
              {editingSection === 'interviewRequirements' ? (
                <div className="mt-3 space-y-3">
                  <textarea rows={6} value={editText} onChange={(e) => setEditText(e.target.value)} placeholder={t('product.jobDetail.interviewRequirementsPlaceholder', 'What to evaluate during the interview...')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y" />
                  {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingSection(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">{t('product.jobDetail.cancel', 'Cancel')}</button>
                    <button onClick={saveSection} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{t('product.jobDetail.saveSection', 'Save')}</button>
                  </div>
                </div>
              ) : job.interviewRequirements ? (
                <div className="mt-3 prose prose-sm prose-slate max-w-none text-slate-600"><ReactMarkdown remarkPlugins={[remarkGfm]}>{job.interviewRequirements}</ReactMarkdown></div>
              ) : (
                <p className="mt-3 text-sm text-slate-400 italic">{t('product.jobDetail.noContent', 'No content')}</p>
              )}
            </div>

            {/* Evaluation Rules */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{t('product.jobDetail.evaluationRules', 'Evaluation Rules')}</h3>
                {editingSection !== 'evaluationRules' && sectionActions('evaluationRules')}
              </div>
              {editingSection === 'evaluationRules' ? (
                <div className="mt-3 space-y-3">
                  <textarea rows={6} value={editText} onChange={(e) => setEditText(e.target.value)} placeholder={t('product.jobDetail.evaluationRulesPlaceholder', 'Scoring criteria, weights, pass/fail thresholds...')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y" />
                  {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingSection(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">{t('product.jobDetail.cancel', 'Cancel')}</button>
                    <button onClick={saveSection} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{t('product.jobDetail.saveSection', 'Save')}</button>
                  </div>
                </div>
              ) : job.evaluationRules ? (
                <div className="mt-3 prose prose-sm prose-slate max-w-none text-slate-600"><ReactMarkdown remarkPlugins={[remarkGfm]}>{job.evaluationRules}</ReactMarkdown></div>
              ) : (
                <p className="mt-3 text-sm text-slate-400 italic">{t('product.jobDetail.noContent', 'No content')}</p>
              )}
            </div>
          </div>

          {/* ===== Applicants ===== */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.tabApplicants', 'Applicants')}</h2>
              <span className="text-sm text-slate-500">{t('product.jobDetail.totalApplicants', 'Total')}: {matches.length}</span>
            </div>
            {matches.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">{t('product.jobDetail.noApplicants', 'No applicants yet')}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-3 pr-4 text-left font-medium text-slate-500">{t('product.jobDetail.candidate', 'Candidate')}</th>
                      <th className="pb-3 pr-4 text-left font-medium text-slate-500">{t('product.jobDetail.status', 'Status')}</th>
                      <th className="pb-3 pr-4 text-left font-medium text-slate-500">{t('product.jobDetail.appliedDate', 'Date')}</th>
                      <th className="pb-3 pr-4 text-left font-medium text-slate-500">{t('product.jobDetail.score', 'Score')}</th>
                      <th className="pb-3 text-left font-medium text-slate-500">{t('product.jobDetail.grade', 'Grade')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match) => (
                      <tr key={match.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">{getInitials(match.resume.name)}</div>
                            <span className="font-medium text-slate-900">{match.resume.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${MATCH_STATUS_COLORS[match.status] || MATCH_STATUS_COLORS.new}`}>
                            {t(`product.jobDetail.matchStatus.${match.status}`, match.status)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{formatDate(match.appliedAt || match.createdAt)}</td>
                        <td className="py-3 pr-4">{match.score != null ? <ScoreBar score={match.score} /> : <span className="text-slate-400">—</span>}</td>
                        <td className="py-3">{match.grade ? <GradeBadge grade={match.grade} /> : <span className="text-slate-400">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <BarChart3 className="h-4 w-4 text-slate-400" />{t('product.jobDetail.tabOverview', 'Job Analytics')}
            </h2>
            <div className="mt-4 space-y-4">
              <AnalyticItem icon={<Users className="h-4 w-4 text-blue-500" />} label={t('product.jobDetail.totalApplicants', 'Total Applicants')} value={String(analytics.total)} />
              <AnalyticItem icon={<Target className="h-4 w-4 text-green-500" />} label={t('product.jobDetail.avgScore', 'Avg Score')} value={analytics.total > 0 ? String(analytics.avgScore) : '—'} />
              <AnalyticItem icon={<TrendingUp className="h-4 w-4 text-purple-500" />} label={t('product.jobDetail.inviteInterview', 'Invited')} value={String(analytics.invitedCount)} />
              <AnalyticItem icon={<Star className="h-4 w-4 text-amber-500" />} label={t('product.jobDetail.shortlist', 'Shortlisted')} value={String(analytics.shortlistedCount)} />
            </div>
          </div>

          {statusBreakdown.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.pipelineBreakdown', 'Pipeline')}</h2>
              <div className="mt-4 space-y-3">
                {statusBreakdown.map((item) => (
                  <div key={item.status}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 capitalize">{t(`product.jobDetail.matchStatus.${item.status}`, item.status)}</span>
                      <span className="font-medium text-slate-900">{item.count}</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${(item.count / maxStatusCount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('product.jobDetail.timeline', 'Timeline')}</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t('product.jobDetail.created', 'Created')}</span>
                <span className="font-medium text-slate-900">{formatDate(job.createdAt)}</span>
              </div>
              {job.publishedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{t('product.jobDetail.published', 'Published')}</span>
                  <span className="font-medium text-slate-900">{formatDate(job.publishedAt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t('product.jobDetail.daysOpen', 'Days Open')}</span>
                <span className="font-medium text-slate-900">{daysOpen}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
