import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';
import { useAuth } from '../../context/AuthContext';
import RecruiterTeamFilter, { type RecruiterTeamFilterValue } from '../../components/RecruiterTeamFilter';
import { formatDateTimeLabel } from '../../utils/dateTime';
import {
  getInterviewLanguageApiName,
  getInterviewLanguageDisplay,
  INTERVIEW_LANGUAGE_OPTIONS,
  normalizeInterviewLanguage,
} from '../../utils/interviewLanguage';

interface LocationEntry {
  country: string;
  city: string;
}

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
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  hiringRequest?: { id: string; title: string } | null;
  stats?: {
    matches: number;
    interviews: number;
    completedInterviews: number;
  };
}

interface AnalysisResult {
  marketSummary: string;
  salaryRanges: { region: string; level: string; rangeLow: string; rangeHigh: string; currency: string; notes?: string }[];
  supplyDemand: { assessment: string; details: string; talentPoolSize: string };
  recruitmentDifficulty: { score: number; level: string; factors: string[] };
  timeToHire: { estimateDays: string; factors: string[] };
  competition: { competitor: string; hiringActivity: string; relevance: string }[];
  marketTrends: { trend: string; impact: string; details: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  open: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-red-100 text-red-700',
  filled: 'bg-blue-100 text-blue-700',
};

const LANG_CURRENCY_MAP: Record<string, string> = {
  en: 'USD', zh: 'CNY', 'zh-TW': 'NTD', ja: 'JPY', ko: 'KRW',
  es: 'USD', fr: 'USD', pt: 'USD', de: 'USD',
};

function getInitialForm(lang?: string) {
  const l = normalizeInterviewLanguage(lang);
  return {
    title: '',
    companyName: '',
    department: '',
    location: '',
    workType: '',
    employmentType: '',
    experienceLevel: '',
    education: '',
    headcount: '1',
    salaryMin: '',
    salaryMax: '',
    salaryCurrency: LANG_CURRENCY_MAP[l] || 'USD',
    salaryPeriod: 'monthly',
    salaryText: '',
    description: '',
    qualifications: '',
    hardRequirements: '',
    niceToHave: '',
    benefits: '',
    interviewMode: 'standard',
    passingScore: '60',
    interviewLanguage: l,
    interviewDuration: '30',
    interviewRequirements: '',
    evaluationRules: '',
    notes: '',
  };
}

const INITIAL_FORM = getInitialForm();

type JobViewMode = 'list' | 'cards';
type JobSortOrder = 'created_desc' | 'created_asc' | 'title_asc' | 'title_desc';
type JobDateRangeFilter = 'all' | 'today' | 'week' | 'month';

function getJobLocationsLabel(job: Job): string | null {
  if (job.locations && Array.isArray(job.locations) && job.locations.length > 0) {
    return (job.locations as LocationEntry[])
      .map((entry) => `${entry.city}${entry.city && entry.country ? ', ' : ''}${entry.country}`)
      .join(' | ');
  }
  return job.location || null;
}

function AIWandButton({ onClick, loading, hasContent, t }: {
  onClick: () => void;
  loading: boolean;
  hasContent: boolean;
  t: (key: string, fallback: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center justify-center h-6 w-6 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
      title={hasContent ? t('product.jobs.enhance', 'Refine with AI') : t('product.jobs.generate', 'Generate with AI')}
    >
      {loading ? (
        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-500" />
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a4.42 4.42 0 0 1 0-8.527l6.135-1.581a2 2 0 0 0 1.438-1.437l1.582-6.135a4.42 4.42 0 0 1 8.527 0l1.581 6.135a2 2 0 0 0 1.437 1.438l6.135 1.582a4.42 4.42 0 0 1 0 8.527l-6.135 1.581a2 2 0 0 0-1.438 1.437l-1.582 6.135a4.42 4.42 0 0 1-8.527 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
      )}
    </button>
  );
}

export default function Jobs() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = usePageState<Job[]>('jobs.list', []);
  const [loading, setLoading] = useState(jobs.length > 0 ? false : true);
  const [statusFilter, setStatusFilter] = usePageState<string>('jobs.statusFilter', '');
  const [viewMode, setViewMode] = usePageState<JobViewMode>('jobs.viewMode', 'list');
  const [searchQuery, setSearchQuery] = usePageState<string>('jobs.searchQuery', '');
  const [clientFilter, setClientFilter] = usePageState<string>('jobs.clientFilter', '');
  const [dateRangeFilter, setDateRangeFilter] = usePageState<JobDateRangeFilter>('jobs.dateRangeFilter', 'all');
  const [sortOrder, setSortOrder] = usePageState<JobSortOrder>('jobs.sortOrder', 'created_desc');
  const [recruiterFilter, setRecruiterFilter] = useState<RecruiterTeamFilterValue>({});
  const [showCreate, setShowCreate] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingFileName, setImportingFileName] = useState('');
  const [importStageIndex, setImportStageIndex] = useState(0);
  const [locations, setLocations] = useState<LocationEntry[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newCountry, setNewCountry] = useState('');
  const [newCity, setNewCity] = useState('');
  const [showSalaryDropdown, setShowSalaryDropdown] = useState(false);
  const [exportDropdownId, setExportDropdownId] = useState<string | null>(null);
  const salaryDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ ...INITIAL_FORM });
  const importStages = [
    t('product.jobs.importStageUpload', 'Uploading file'),
    t('product.jobs.importStageExtract', 'Extracting JD content'),
    t('product.jobs.importStageApply', 'Applying details to the form'),
  ];

  const formatSalarySummary = useCallback((job: Job) => {
    if (job.salaryText) return job.salaryText;
    if ((job.salaryMin != null || job.salaryMax != null) && (job.salaryMin !== 0 || job.salaryMax !== 0)) {
      return `${job.salaryCurrency || 'USD'} ${job.salaryMin?.toLocaleString() || '—'} – ${job.salaryMax?.toLocaleString() || '—'}/${job.salaryPeriod === 'yearly' ? t('product.jobs.perYear', 'yr') : t('product.jobs.perMonth', 'mo')}`;
    }
    if (job.salaryMin === 0 && job.salaryMax === 0) return t('product.jobs.salaryNegotiable', 'Negotiable');
    return null;
  }, [t]);

  const matchesDateRange = useCallback((job: Job, range: JobDateRangeFilter) => {
    if (range === 'all') return true;

    const createdAt = new Date(job.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;

    const now = new Date();

    if (range === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return createdAt >= startOfDay;
    }

    if (range === 'week') {
      const today = now.getDay();
      const diffToMonday = (today + 6) % 7;
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);
      return createdAt >= startOfWeek;
    }

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return createdAt >= startOfMonth;
  }, []);

  useEffect(() => {
    if (!importing) {
      setImportStageIndex(0);
      return;
    }

    setImportStageIndex(0);
    const timer = window.setInterval(() => {
      setImportStageIndex((prev) => Math.min(prev + 1, importStages.length - 1));
    }, 900);

    return () => window.clearInterval(timer);
  }, [importing, importStages.length]);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page: 1, limit: 50 };
      if (statusFilter) params.status = statusFilter;
      if (recruiterFilter.filterUserId) params.filterUserId = recruiterFilter.filterUserId;
      if (recruiterFilter.filterTeamId) params.filterTeamId = recruiterFilter.filterTeamId;

      const collected: Job[] = [];
      const seen = new Set<string>();
      let page = 1;
      let totalPages = 1;

      do {
        const res = await axios.get('/api/v1/jobs', { params: { ...params, page } });
        const pageItems: Job[] = res.data.data || [];
        pageItems.forEach((job) => {
          if (seen.has(job.id)) return;
          seen.add(job.id);
          collected.push(job);
        });
        totalPages = Math.max(1, Number(res.data.pagination?.totalPages || 1));
        page += 1;
      } while (page <= totalPages);

      setJobs(collected);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter, recruiterFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const clientOptions = useMemo(
    () =>
      Array.from(
        new Set(
          jobs
            .map((job) => job.companyName?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b, i18n.language)),
    [i18n.language, jobs],
  );

  useEffect(() => {
    if (!clientFilter || clientOptions.includes(clientFilter)) return;
    setClientFilter('');
  }, [clientFilter, clientOptions, setClientFilter]);

  const displayedJobs = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    const next = jobs.filter((job) => {
      if (clientFilter && (job.companyName || '') !== clientFilter) return false;
      if (!matchesDateRange(job, dateRangeFilter)) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        job.title,
        job.companyName,
        job.department,
        getJobLocationsLabel(job),
        job.hiringRequest?.title,
        job.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    next.sort((a, b) => {
      if (sortOrder === 'created_desc') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortOrder === 'created_asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortOrder === 'title_asc') {
        return a.title.localeCompare(b.title, i18n.language);
      }
      return b.title.localeCompare(a.title, i18n.language);
    });

    return next;
  }, [clientFilter, dateRangeFilter, i18n.language, jobs, matchesDateRange, searchQuery, sortOrder]);

  const hasActiveFilters = Boolean(searchQuery.trim() || clientFilter || dateRangeFilter !== 'all');

  const resetForm = () => {
    setForm(getInitialForm(i18n.language));
    setLocations([]);
    setAnalysisResult(null);
    setImportingFileName('');
  };

  type SalaryPreset = { label: string; min: number; max: number; period: string };

  // Salary presets by currency
  const SALARY_PRESETS: Record<string, SalaryPreset[]> = {
    CNY: [
      { label: t('product.jobs.salaryNegotiable', 'Negotiable'), min: 0, max: 0, period: 'monthly' },
      { label: '10-15K/' + t('product.jobs.perMonth', 'mo'), min: 10000, max: 15000, period: 'monthly' },
      { label: '15-20K/' + t('product.jobs.perMonth', 'mo'), min: 15000, max: 20000, period: 'monthly' },
      { label: '20-25K/' + t('product.jobs.perMonth', 'mo'), min: 20000, max: 25000, period: 'monthly' },
      { label: '25-30K/' + t('product.jobs.perMonth', 'mo'), min: 25000, max: 30000, period: 'monthly' },
      { label: '30-40K/' + t('product.jobs.perMonth', 'mo'), min: 30000, max: 40000, period: 'monthly' },
      { label: '40-50K/' + t('product.jobs.perMonth', 'mo'), min: 40000, max: 50000, period: 'monthly' },
      { label: '50-70K/' + t('product.jobs.perMonth', 'mo'), min: 50000, max: 70000, period: 'monthly' },
      { label: '70-100K/' + t('product.jobs.perMonth', 'mo'), min: 70000, max: 100000, period: 'monthly' },
    ],
    USD: [
      { label: t('product.jobs.salaryNegotiable', 'Negotiable'), min: 0, max: 0, period: 'yearly' },
      { label: '$50K-$80K/' + t('product.jobs.perYear', 'yr'), min: 50000, max: 80000, period: 'yearly' },
      { label: '$80K-$100K/' + t('product.jobs.perYear', 'yr'), min: 80000, max: 100000, period: 'yearly' },
      { label: '$100K-$130K/' + t('product.jobs.perYear', 'yr'), min: 100000, max: 130000, period: 'yearly' },
      { label: '$130K-$160K/' + t('product.jobs.perYear', 'yr'), min: 130000, max: 160000, period: 'yearly' },
      { label: '$160K-$200K/' + t('product.jobs.perYear', 'yr'), min: 160000, max: 200000, period: 'yearly' },
      { label: '$200K-$250K/' + t('product.jobs.perYear', 'yr'), min: 200000, max: 250000, period: 'yearly' },
      { label: '$250K+/' + t('product.jobs.perYear', 'yr'), min: 250000, max: 0, period: 'yearly' },
    ],
    EUR: [
      { label: t('product.jobs.salaryNegotiable', 'Negotiable'), min: 0, max: 0, period: 'yearly' },
      { label: '€40K-€60K/' + t('product.jobs.perYear', 'yr'), min: 40000, max: 60000, period: 'yearly' },
      { label: '€60K-€80K/' + t('product.jobs.perYear', 'yr'), min: 60000, max: 80000, period: 'yearly' },
      { label: '€80K-€100K/' + t('product.jobs.perYear', 'yr'), min: 80000, max: 100000, period: 'yearly' },
      { label: '€100K-€130K/' + t('product.jobs.perYear', 'yr'), min: 100000, max: 130000, period: 'yearly' },
      { label: '€130K-€170K/' + t('product.jobs.perYear', 'yr'), min: 130000, max: 170000, period: 'yearly' },
    ],
    JPY: [
      { label: t('product.jobs.salaryNegotiable', 'Negotiable'), min: 0, max: 0, period: 'yearly' },
      { label: '¥400万-¥600万/' + t('product.jobs.perYear', 'yr'), min: 4000000, max: 6000000, period: 'yearly' },
      { label: '¥600万-¥800万/' + t('product.jobs.perYear', 'yr'), min: 6000000, max: 8000000, period: 'yearly' },
      { label: '¥800万-¥1000万/' + t('product.jobs.perYear', 'yr'), min: 8000000, max: 10000000, period: 'yearly' },
      { label: '¥1000万-¥1500万/' + t('product.jobs.perYear', 'yr'), min: 10000000, max: 15000000, period: 'yearly' },
    ],
    NTD: [
      { label: t('product.jobs.salaryNegotiable', 'Negotiable'), min: 0, max: 0, period: 'monthly' },
      { label: 'NT$30K-40K/' + t('product.jobs.perMonth', 'mo'), min: 30000, max: 40000, period: 'monthly' },
      { label: 'NT$40K-50K/' + t('product.jobs.perMonth', 'mo'), min: 40000, max: 50000, period: 'monthly' },
      { label: 'NT$50K-60K/' + t('product.jobs.perMonth', 'mo'), min: 50000, max: 60000, period: 'monthly' },
      { label: 'NT$60K-80K/' + t('product.jobs.perMonth', 'mo'), min: 60000, max: 80000, period: 'monthly' },
      { label: 'NT$80K-100K/' + t('product.jobs.perMonth', 'mo'), min: 80000, max: 100000, period: 'monthly' },
      { label: 'NT$100K-150K/' + t('product.jobs.perMonth', 'mo'), min: 100000, max: 150000, period: 'monthly' },
    ],
    KRW: [
      { label: t('product.jobs.salaryNegotiable', 'Negotiable'), min: 0, max: 0, period: 'yearly' },
      { label: '₩3000만-₩4000만/' + t('product.jobs.perYear', 'yr'), min: 30000000, max: 40000000, period: 'yearly' },
      { label: '₩4000만-₩5000만/' + t('product.jobs.perYear', 'yr'), min: 40000000, max: 50000000, period: 'yearly' },
      { label: '₩5000만-₩7000만/' + t('product.jobs.perYear', 'yr'), min: 50000000, max: 70000000, period: 'yearly' },
      { label: '₩7000만-₩1억/' + t('product.jobs.perYear', 'yr'), min: 70000000, max: 100000000, period: 'yearly' },
      { label: '₩1억+/' + t('product.jobs.perYear', 'yr'), min: 100000000, max: 0, period: 'yearly' },
    ],
  };

  const getSalaryPresets = (): SalaryPreset[] =>
    SALARY_PRESETS[form.salaryCurrency] || SALARY_PRESETS.USD;

  const getSalaryDisplayValue = (): string => {
    if (!form.salaryMin && !form.salaryMax) return '';
    if (form.salaryMin === '0' && form.salaryMax === '0') {
      return t('product.jobs.salaryNegotiable', 'Negotiable');
    }

    const currencySymbol =
      {
        USD: '$',
        EUR: '€',
        GBP: '£',
        CNY: '¥',
        JPY: '¥',
        TWD: 'NT$',
        NTD: 'NT$',
        KRW: '₩',
        CAD: 'CA$',
        AUD: 'A$',
      }[form.salaryCurrency] || form.salaryCurrency;
    const period =
      form.salaryPeriod === 'yearly'
        ? t('product.jobs.perYear', 'yr')
        : t('product.jobs.perMonth', 'mo');
    const formatAmount = (value: string) => {
      const num = parseInt(value, 10);
      if (Number.isNaN(num)) return value;
      if (num >= 10000) return `${(num / 1000).toFixed(0)}K`;
      return num.toLocaleString();
    };

    if (form.salaryMin && !form.salaryMax) {
      return `${currencySymbol}${formatAmount(form.salaryMin)}+/${period}`;
    }
    if (!form.salaryMin && form.salaryMax) {
      return `${t('product.jobs.upTo', 'Up to')} ${currencySymbol}${formatAmount(form.salaryMax)}/${period}`;
    }

    return `${currencySymbol}${formatAmount(form.salaryMin)} – ${currencySymbol}${formatAmount(form.salaryMax)}/${period}`;
  };

  // Close salary dropdown on click outside
  useEffect(() => {
    if (!showSalaryDropdown) return;
    const handler = (e: MouseEvent) => {
      if (salaryDropdownRef.current && !salaryDropdownRef.current.contains(e.target as Node)) {
        setShowSalaryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSalaryDropdown]);

  // Close export dropdown on click outside
  useEffect(() => {
    if (!exportDropdownId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-export-dropdown]')) return;
      setExportDropdownId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportDropdownId]);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await axios.post('/api/v1/jobs', {
        ...form,
        salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
        salaryMax: form.salaryMax ? parseInt(form.salaryMax) : null,
        passingScore: form.passingScore ? parseInt(form.passingScore) : 60,
        interviewDuration: form.interviewDuration ? parseInt(form.interviewDuration) : 30,
        headcount: form.headcount ? parseInt(form.headcount) : 1,
        locations: locations.length > 0 ? locations : null,
      });
      setJobs((prev) => [
        {
          ...res.data.data,
          stats: {
            matches: 0,
            interviews: 0,
            completedInterviews: 0,
          },
        },
        ...prev,
      ]);
      setShowCreate(false);
      resetForm();
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingJob) return;
    setSaving(true);
    try {
      const res = await axios.patch(`/api/v1/jobs/${editingJob.id}`, {
        ...form,
        salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
        salaryMax: form.salaryMax ? parseInt(form.salaryMax) : null,
        passingScore: form.passingScore ? parseInt(form.passingScore) : 60,
        interviewDuration: form.interviewDuration ? parseInt(form.interviewDuration) : 30,
        headcount: form.headcount ? parseInt(form.headcount) : 1,
        locations: locations.length > 0 ? locations : null,
      });
      setJobs((prev) => prev.map((j) => (
        j.id === editingJob.id
          ? { ...res.data.data, stats: j.stats }
          : j
      )));
      setEditingJob(null);
      resetForm();
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`/api/v1/jobs/${confirmDeleteId}`);
      setJobs((prev) => prev.filter((j) => j.id !== confirmDeleteId));
    } catch {
      // handle error
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const getLanguageParam = () => getInterviewLanguageApiName(form.interviewLanguage);

  const buildGeneratePayload = (extra: Record<string, any> = {}) => ({
    jobTitle: form.title,
    companyName: form.companyName || undefined,
    department: form.department || undefined,
    locations: locations.length > 0 ? locations : undefined,
    experienceLevel: form.experienceLevel || undefined,
    existingContent: {
      description: form.description || '',
      qualifications: form.qualifications || '',
      hardRequirements: form.hardRequirements || '',
      interviewRequirements: form.interviewRequirements || '',
      evaluationRules: form.evaluationRules || '',
    },
    language: getLanguageParam(),
    ...extra,
  });

  const handleGenerateSection = async (section: string) => {
    if (!form.title.trim()) return;
    setGeneratingSection(section);
    try {
      const hasContent = !!(form as any)[section]?.trim();
      const url = editingJob
        ? `/api/v1/jobs/${editingJob.id}/generate-content`
        : '/api/v1/jobs/generate-content';
      const res = await axios.post(url, editingJob
        ? { action: hasContent ? 'enhance' : 'generate_section', section, language: getLanguageParam() }
        : buildGeneratePayload({ action: hasContent ? 'enhance' : 'generate_section', section })
      );
      const generated = res.data.generated;
      if (generated?.sections?.[section]) {
        setForm((p) => ({ ...p, [section]: generated.sections[section] }));
      }
      if (editingJob && res.data.data) {
        setJobs((prev) => prev.map((j) => (
          j.id === editingJob.id
            ? { ...res.data.data, stats: j.stats }
            : j
        )));
      }
    } catch {
      // handle error
    } finally {
      setGeneratingSection(null);
    }
  };

  const handleGenerateAll = async () => {
    if (!form.title.trim()) return;
    setGeneratingAll(true);
    try {
      const url = editingJob
        ? `/api/v1/jobs/${editingJob.id}/generate-content`
        : '/api/v1/jobs/generate-content';
      const res = await axios.post(url, editingJob
        ? { action: 'generate_all', language: getLanguageParam() }
        : buildGeneratePayload({ action: 'generate_all' })
      );
      const generated = res.data.generated;
      if (generated?.sections) {
        setForm((p) => ({
          ...p,
          ...(generated.sections.description && { description: generated.sections.description }),
          ...(generated.sections.qualifications && { qualifications: generated.sections.qualifications }),
          ...(generated.sections.hardRequirements && { hardRequirements: generated.sections.hardRequirements }),
          ...(generated.sections.interviewRequirements && { interviewRequirements: generated.sections.interviewRequirements }),
          ...(generated.sections.evaluationRules && { evaluationRules: generated.sections.evaluationRules }),
        }));
      }
      if (editingJob && res.data.data) {
        setJobs((prev) => prev.map((j) => (
          j.id === editingJob.id
            ? { ...res.data.data, stats: j.stats }
            : j
        )));
      }
    } catch {
      // handle error
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleAnalyze = async () => {
    if (!editingJob) return;
    setAnalyzing(true);
    try {
      const res = await axios.post(`/api/v1/jobs/${editingJob.id}/analyze`);
      setAnalysisResult(res.data.data);
    } catch {
      // handle error
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportingFileName(file.name);
    setImportStageIndex(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', normalizeInterviewLanguage(form.interviewLanguage));
      const res = await axios.post('/api/v1/jobs/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const suggested = res.data.data?.suggestedFields;
      if (suggested) {
        setImportStageIndex(importStages.length - 1);
        // Build description from overview + responsibilities only
        const descParts: string[] = [];
        if (suggested.description) descParts.push(suggested.description);
        if (suggested.responsibilities) descParts.push(suggested.responsibilities);
        const combinedDescription = descParts.filter(Boolean).join('\n\n');

        setForm((p) => ({
          ...p,
          title: suggested.title || p.title,
          companyName: suggested.companyName || p.companyName,
          description: combinedDescription || suggested.description || p.description,
          department: suggested.department || p.department,
          location: suggested.location || p.location,
          workType: suggested.workType || p.workType,
          employmentType: suggested.employmentType || p.employmentType,
          experienceLevel: suggested.experienceLevel || p.experienceLevel,
          education: suggested.education || p.education,
          headcount: suggested.headcount ? String(suggested.headcount) : p.headcount,
          qualifications: suggested.qualifications || p.qualifications,
          hardRequirements: suggested.hardRequirements || p.hardRequirements,
          niceToHave: suggested.niceToHave || p.niceToHave,
          benefits: suggested.benefits || p.benefits,
          salaryMin: suggested.salaryMin || p.salaryMin,
          salaryMax: suggested.salaryMax || p.salaryMax,
          salaryCurrency: suggested.salaryCurrency || p.salaryCurrency,
          salaryPeriod: suggested.salaryPeriod || p.salaryPeriod,
        }));
      }
    } catch {
      // handle error
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async (jobId: string, format: 'pdf' | 'text' | 'markdown' | 'json' = 'json') => {
    try {
      const ext = { pdf: 'pdf', text: 'txt', markdown: 'md', json: 'json' }[format];
      const contentTypes: Record<string, string> = {
        pdf: 'application/pdf',
        text: 'text/plain',
        markdown: 'text/markdown',
        json: 'application/json',
      };
      const res = await axios.get(`/api/v1/jobs/${jobId}/export?format=${format}`, { responseType: 'blob' });

      // Check if the response is actually an error JSON disguised as blob
      if (res.data instanceof Blob && res.data.type === 'application/json' && format !== 'json') {
        const text = await res.data.text();
        try {
          const errData = JSON.parse(text);
          if (errData.error) {
            console.error('Export error:', errData.error);
            return;
          }
        } catch {
          // not JSON, proceed
        }
      }

      const blob = new Blob([res.data], { type: contentTypes[format] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-${jobId.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    try {
      const res = await axios.patch(`/api/v1/jobs/${jobId}`, { status: newStatus });
      setJobs((prev) => prev.map((j) => (
        j.id === jobId
          ? { ...res.data.data, stats: j.stats }
          : j
      )));
    } catch {
      // handle error
    }
  };

  const addLocation = () => {
    if (!newCountry.trim() && !newCity.trim()) return;
    setLocations((prev) => [...prev, { country: newCountry.trim(), city: newCity.trim() }]);
    setNewCountry('');
    setNewCity('');
  };

  const removeLocation = (idx: number) => {
    setLocations((prev) => prev.filter((_, i) => i !== idx));
  };

  const openEdit = (job: Job) => {
    setEditingJob(job);
    setShowCreate(false);
    setAnalysisResult(null);
    setForm({
      title: job.title,
      companyName: job.companyName || '',
      department: job.department || '',
      location: job.location || '',
      workType: job.workType || '',
      employmentType: job.employmentType || '',
      experienceLevel: job.experienceLevel || '',
      education: job.education || '',
      headcount: job.headcount?.toString() || '1',
      salaryMin: job.salaryMin?.toString() || '',
      salaryMax: job.salaryMax?.toString() || '',
      salaryCurrency: job.salaryCurrency || 'USD',
      salaryPeriod: job.salaryPeriod || 'monthly',
      salaryText: job.salaryText || '',
      description: job.description || '',
      qualifications: job.qualifications || '',
      hardRequirements: job.hardRequirements || '',
      niceToHave: job.niceToHave || '',
      benefits: job.benefits || '',
      interviewMode: job.interviewMode || 'standard',
      passingScore: job.passingScore?.toString() || '60',
      interviewLanguage: normalizeInterviewLanguage(job.interviewLanguage),
      interviewDuration: job.interviewDuration?.toString() || '30',
      interviewRequirements: job.interviewRequirements || '',
      evaluationRules: job.evaluationRules || '',
      notes: job.notes || '',
    });
    setLocations((job.locations as LocationEntry[]) || []);
  };

  const statuses = ['', 'draft', 'open', 'paused', 'closed', 'filled'];

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
  const importProgressWidth = `${Math.max(22, ((importStageIndex + 1) / importStages.length) * 100)}%`;

  const renderJobActions = (job: Job) => (
    <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
      {job.status === 'draft' && (
        <button
          onClick={() => handleStatusChange(job.id, 'open')}
          title={t('product.jobs.publish', 'Publish')}
          className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
      {job.status === 'open' && (
        <button
          onClick={() => handleStatusChange(job.id, 'paused')}
          title={t('product.jobs.pause', 'Pause')}
          className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}
      {job.status === 'paused' && (
        <button
          onClick={() => handleStatusChange(job.id, 'open')}
          title={t('product.jobs.resume', 'Resume')}
          className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}

      <button
        onClick={() => navigate(`/product/jobs/${job.id}`)}
        title={t('product.jobs.view', 'View')}
        className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </button>

      <button
        onClick={() => openEdit(job)}
        title={t('product.jobs.edit', 'Edit')}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>

      <div className="relative" data-export-dropdown>
        <button
          onClick={() => setExportDropdownId(exportDropdownId === job.id ? null : job.id)}
          title={t('product.jobs.exportJob', 'Export')}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        {exportDropdownId === job.id && (
          <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-50 min-w-[140px]">
            {([['pdf', 'PDF'], ['markdown', 'Markdown'], ['text', 'Text'], ['json', 'JSON']] as const).map(([fmt, label]) => (
              <button
                key={fmt}
                onClick={() => { handleExport(job.id, fmt); setExportDropdownId(null); }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => handleDelete(job.id)}
        title={t('product.jobs.delete', 'Delete')}
        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('product.jobs.title', 'Jobs')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('product.jobs.subtitle', 'Create and manage job postings with AI assistance.')}</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingJob(null); resetForm(); }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors self-start sm:self-auto shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('product.jobs.create', 'Create Job')}
        </button>
      </div>

      {/* Status filter + toolbar */}
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s ? t(`product.jobs.status.${s}`, s.charAt(0).toUpperCase() + s.slice(1)) : t('product.jobs.allStatuses', 'All')}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_minmax(180px,0.8fr)_minmax(160px,0.7fr)_minmax(180px,0.9fr)]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t('product.jobs.filterSearch', 'Search')}
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('product.jobs.searchPlaceholder', 'Search by title, client, department, or location...')}
                className={inputCls}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t('product.jobs.filterClient', 'Client')}
              </span>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className={inputCls}
              >
                <option value="">{t('product.jobs.filterAllClients', 'All clients')}</option>
                {clientOptions.map((client) => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t('product.jobs.filterDateRange', 'Created')}
              </span>
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value as JobDateRangeFilter)}
                className={inputCls}
              >
                <option value="all">{t('product.jobs.filterDateAll', 'All time')}</option>
                <option value="today">{t('product.jobs.filterDateToday', 'Today')}</option>
                <option value="week">{t('product.jobs.filterDateWeek', 'This week')}</option>
                <option value="month">{t('product.jobs.filterDateMonth', 'This month')}</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t('product.jobs.sortLabel', 'Sort')}
              </span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as JobSortOrder)}
                className={inputCls}
              >
                <option value="created_desc">{t('product.jobs.sortCreatedDesc', 'Created: newest first')}</option>
                <option value="created_asc">{t('product.jobs.sortCreatedAsc', 'Created: oldest first')}</option>
                <option value="title_asc">{t('product.jobs.sortTitleAsc', 'Title: A to Z')}</option>
                <option value="title_desc">{t('product.jobs.sortTitleDesc', 'Title: Z to A')}</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:flex-1">
              <p className="text-sm text-slate-500">
                {displayedJobs.length === jobs.length
                  ? t('product.jobs.resultsCount', '{{count}} jobs', { count: displayedJobs.length })
                  : t('product.jobs.resultsCountFiltered', 'Showing {{shown}} of {{total}} jobs', {
                      shown: displayedJobs.length,
                      total: jobs.length,
                    })}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setClientFilter('');
                      setDateRangeFilter('all');
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    {t('product.jobs.clearFilters', 'Clear filters')}
                  </button>
                )}
                {user?.role === 'admin' && (
                  <RecruiterTeamFilter
                    value={recruiterFilter}
                    onChange={setRecruiterFilter}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t('product.jobs.viewLabel', 'View')}
              </span>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  {t('product.jobs.viewList', 'List')}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h7v6H4V5zm9 0h7v6h-7V5zM4 13h7v6H4v-6zm9 0h7v6h-7v-6z" />
                  </svg>
                  {t('product.jobs.viewCards', 'Cards')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editingJob) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-6" aria-busy={importing}>
          {/* Form Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingJob ? t('product.jobs.editJob', 'Edit Job') : t('product.jobs.newJob', 'New Job')}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Import */}
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.markdown,.csv,.xlsx,.xls" onChange={handleImport} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                  importing
                    ? 'border border-blue-600 bg-blue-600 text-white shadow-[0_12px_30px_-18px_rgba(37,99,235,1)]'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {importing ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                {importing
                  ? t('product.jobs.importingJd', 'Importing JD...')
                  : t('product.jobs.importJd', 'Import JD')}
              </button>
              {/* Export */}
              {editingJob && (
                <div className="relative" data-export-dropdown>
                  <button
                    type="button"
                    onClick={() => setExportDropdownId(exportDropdownId === editingJob.id ? null : editingJob.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {t('product.jobs.exportJob', 'Export')}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {exportDropdownId === editingJob.id && (
                    <div className="absolute left-0 top-full mt-1 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-50 min-w-[140px]">
                      {([['pdf', 'PDF'], ['markdown', 'Markdown'], ['text', 'Text'], ['json', 'JSON']] as const).map(([fmt, label]) => (
                        <button key={fmt} type="button" onClick={() => { handleExport(editingJob.id, fmt); setExportDropdownId(null); }}
                          className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Preview */}
              {form.title.trim() && (
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {t('product.jobs.preview', 'Preview')}
                </button>
              )}
              {/* Auto-generate all */}
              {form.title.trim() && (
                <button
                  type="button"
                  onClick={handleGenerateAll}
                  disabled={generatingAll}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {generatingAll ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white" />
                  ) : (
                    <span className="text-sm">✦</span>
                  )}
                  {generatingAll
                    ? t('product.jobs.generating', 'Generating...')
                    : t('product.jobs.autoGenerateAll', 'Auto-Generate All')
                  }
                </button>
              )}
              {/* Close */}
              <button
                onClick={() => { setShowCreate(false); setEditingJob(null); resetForm(); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {importing && (
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-cyan-50 to-sky-50 p-4 shadow-[0_20px_40px_-28px_rgba(37,99,235,0.75)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200/80">
                    <div className="absolute inset-0 rounded-2xl bg-blue-400/30 animate-ping" />
                    <div className="relative h-5 w-5 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {t('product.jobs.importBannerTitle', 'Importing your job description')}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {t(
                        'product.jobs.importBannerBody',
                        'Parsing {{fileName}} and mapping the extracted details into the form. This can take a few seconds for larger files.',
                        { fileName: importingFileName || t('product.jobs.importDefaultFile', 'your file') }
                      )}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {importStages.map((stage, index) => {
                    const isDone = index < importStageIndex;
                    const isActive = index === importStageIndex;

                    return (
                      <div
                        key={stage}
                        className={`rounded-xl border px-3 py-2 text-xs transition-all ${
                          isActive
                            ? 'border-blue-300 bg-white text-blue-700 shadow-sm animate-pulse'
                            : isDone
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-blue-100 bg-white/70 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                              isActive
                                ? 'bg-blue-600 text-white'
                                : isDone
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {isDone ? '✓' : index + 1}
                          </span>
                          <span>{stage}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                  <span>{t('product.jobs.importWorking', 'Working')}</span>
                  <span>{importStages[importStageIndex]}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-blue-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-500 transition-[width] duration-700 ease-out"
                    style={{ width: importProgressWidth }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 1: Basic Info */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-3">{t('product.jobs.basicInfo', 'Basic Information')}</h4>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.companyName', 'Company Name')}</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                  placeholder={t('product.jobs.companyNamePlaceholder', 'e.g. Google, Microsoft')}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.field.title', 'Job Title')} *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder={t('product.jobs.field.titlePlaceholder', 'e.g. Senior Frontend Developer')}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.field.department', 'Department')}</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.field.experienceLevel', 'Experience Level')}</label>
                <select
                  value={form.experienceLevel}
                  onChange={(e) => setForm((p) => ({ ...p, experienceLevel: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">{t('product.jobs.field.select', 'Select...')}</option>
                  <option value="entry">{t('product.jobs.levels.entry', 'Entry Level')}</option>
                  <option value="mid">{t('product.jobs.levels.mid', 'Mid Level')}</option>
                  <option value="senior">{t('product.jobs.levels.senior', 'Senior')}</option>
                  <option value="lead">{t('product.jobs.levels.lead', 'Lead')}</option>
                  <option value="executive">{t('product.jobs.levels.executive', 'Executive')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.field.workType', 'Work Type')}</label>
                <select
                  value={form.workType}
                  onChange={(e) => setForm((p) => ({ ...p, workType: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">{t('product.jobs.field.select', 'Select...')}</option>
                  <option value="remote">{t('product.jobs.workTypes.remote', 'Remote')}</option>
                  <option value="hybrid">{t('product.jobs.workTypes.hybrid', 'Hybrid')}</option>
                  <option value="onsite">{t('product.jobs.workTypes.onsite', 'On-site')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.field.employmentType', 'Employment Type')}</label>
                <select
                  value={form.employmentType}
                  onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">{t('product.jobs.field.select', 'Select...')}</option>
                  <option value="full-time">{t('product.jobs.empTypes.fullTime', 'Full-time')}</option>
                  <option value="part-time">{t('product.jobs.empTypes.partTime', 'Part-time')}</option>
                  <option value="contract">{t('product.jobs.empTypes.contract', 'Contract')}</option>
                  <option value="internship">{t('product.jobs.empTypes.internship', 'Internship')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobDetail.education', 'Education')}</label>
                <select
                  value={form.education}
                  onChange={(e) => setForm((p) => ({ ...p, education: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">{t('product.jobs.field.select', 'Select...')}</option>
                  <option value="none">{t('product.jobDetail.eduNone', 'No Requirement')}</option>
                  <option value="high_school">{t('product.jobDetail.eduHighSchool', 'High School')}</option>
                  <option value="associate">{t('product.jobDetail.eduAssociate', 'Associate')}</option>
                  <option value="bachelor">{t('product.jobDetail.eduBachelor', 'Bachelor')}</option>
                  <option value="master">{t('product.jobDetail.eduMaster', 'Master')}</option>
                  <option value="phd">{t('product.jobDetail.eduPhd', 'PhD')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobDetail.headcount', 'Headcount')}</label>
                <input
                  type="number"
                  min={1}
                  value={form.headcount}
                  onChange={(e) => setForm((p) => ({ ...p, headcount: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Locations */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.locations', 'Locations')}</label>
              {locations.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {locations.map((loc, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 rounded-full px-3 py-1 text-xs font-medium">
                      {loc.city}{loc.city && loc.country ? ', ' : ''}{loc.country}
                      <button type="button" onClick={() => removeLocation(idx)} className="text-slate-400 hover:text-red-500">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  placeholder={t('product.jobs.country', 'Country')}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder={t('product.jobs.city', 'City')}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLocation(); } }}
                />
                <button
                  type="button"
                  onClick={addLocation}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {t('product.jobs.addLocation', 'Add')}
                </button>
              </div>
            </div>

            {/* Salary */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.salary', 'Salary')}</label>
                <div className="group relative">
                  <svg className="w-3.5 h-3.5 text-slate-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg z-50">
                    {t('product.jobs.salaryTooltip', 'Salary range including currency and period. e.g. $150,000 – $200,000 or ¥30,000 – ¥50,000/mo')}
                  </div>
                </div>
              </div>
              <div className="grid sm:grid-cols-[1fr_auto] gap-3">
                <div className="relative" ref={salaryDropdownRef}>
                  <input
                    type="text"
                    value={form.salaryText || getSalaryDisplayValue()}
                    onFocus={() => setShowSalaryDropdown(true)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setForm((p) => ({ ...p, salaryText: raw }));
                      if (!raw) {
                        setForm((p) => ({ ...p, salaryMin: '', salaryMax: '', salaryText: '' }));
                        return;
                      }
                      // Try to auto-parse range from text
                      const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:万|k|K)?\s*(?:-|–|—|~|到|to)\s*(\d+(?:\.\d+)?)\s*(?:万|k|K)?/i);
                      if (rangeMatch) {
                        const parseAmount = (s: string) => {
                          if (/万/i.test(raw)) return Math.round(parseFloat(s) * 10000);
                          if (/k/i.test(raw)) return Math.round(parseFloat(s) * 1000);
                          return Math.round(parseFloat(s));
                        };
                        setForm((p) => ({
                          ...p,
                          salaryMin: parseAmount(rangeMatch[1]).toString(),
                          salaryMax: parseAmount(rangeMatch[2]).toString(),
                        }));
                      }
                    }}
                    placeholder={t('product.jobs.salaryPlaceholder', 'Select or enter salary range, e.g. 20-30K/mo')}
                    className={inputCls}
                  />
                  {showSalaryDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50 max-h-64 overflow-y-auto">
                      {getSalaryPresets().map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setForm((p) => ({
                              ...p,
                              salaryMin: preset.min.toString(),
                              salaryMax: preset.max.toString(),
                              salaryPeriod: preset.period,
                              salaryText: '',
                            }));
                            setShowSalaryDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                      <div className="border-t border-slate-100 mt-1 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowSalaryDropdown(false);
                            setForm((p) => ({ ...p, salaryMin: '', salaryMax: '', salaryText: '' }));
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          {t('product.jobs.customSalary', 'Custom range...')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <select
                  value={form.salaryCurrency}
                  onChange={(e) => setForm((p) => ({ ...p, salaryCurrency: e.target.value, salaryMin: '', salaryMax: '', salaryText: '' }))}
                  className={inputCls + ' sm:w-24'}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CNY">CNY</option>
                  <option value="JPY">JPY</option>
                  <option value="NTD">NTD</option>
                  <option value="KRW">KRW</option>
                  <option value="CAD">CAD</option>
                  <option value="AUD">AUD</option>
                </select>
              </div>
              {/* Manual min/max inputs shown when dropdown is closed and values are set or user wants custom */}
              {!showSalaryDropdown && (form.salaryMin || form.salaryMax) && form.salaryMin !== '0' && (
                <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('product.jobs.salaryMinLabel', 'Min')}</label>
                    <input
                      type="number"
                      value={form.salaryMin}
                      onChange={(e) => setForm((p) => ({ ...p, salaryMin: e.target.value }))}
                      placeholder="e.g. 5000"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('product.jobs.salaryMaxLabel', 'Max')}</label>
                    <input
                      type="number"
                      value={form.salaryMax}
                      onChange={(e) => setForm((p) => ({ ...p, salaryMax: e.target.value }))}
                      placeholder="e.g. 10000"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('product.jobs.period', 'Period')}</label>
                    <select
                      value={form.salaryPeriod}
                      onChange={(e) => setForm((p) => ({ ...p, salaryPeriod: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="monthly">{t('product.jobs.perMonth', 'mo')}</option>
                      <option value="yearly">{t('product.jobs.perYear', 'yr')}</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.notes', 'Notes')}</label>
                <div className="group relative">
                  <svg className="w-3.5 h-3.5 text-slate-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg z-50">
                    {t('product.jobs.notesTooltip', 'Internal notes for the team only, not shown to candidates.')}
                  </div>
                </div>
              </div>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder={t('product.jobs.notesPlaceholder', 'e.g. Client prefers certain industry background, budget is negotiable, etc.')}
                rows={3}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-400">{t('product.jobs.notesDesc', 'Record client preferences, restrictions, or approval milestones. Not shown to candidates.')}</p>
            </div>
          </div>

          {/* Section 2: Job Description Content */}
          <div className="border-t border-slate-200 pt-6">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">{t('product.jobs.jobContent', 'Job Content')}</h4>

            {/* Description */}
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.field.description', 'Job Description')}</label>
                <AIWandButton
                  onClick={() => handleGenerateSection('description')}
                  loading={generatingSection === 'description'}
                  hasContent={!!form.description.trim()}
                  t={t}
                />
              </div>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={8}
                placeholder={t('product.jobs.field.descriptionPlaceholder', 'Write a job description or let AI generate one...')}
                className={`${inputCls} font-mono`}
              />
            </div>

            {/* Qualifications */}
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.qualifications', 'Qualifications')}</label>
                <AIWandButton
                  onClick={() => handleGenerateSection('qualifications')}
                  loading={generatingSection === 'qualifications'}
                  hasContent={!!form.qualifications.trim()}
                  t={t}
                />
              </div>
              <textarea
                value={form.qualifications}
                onChange={(e) => setForm((p) => ({ ...p, qualifications: e.target.value }))}
                rows={6}
                placeholder={t('product.jobs.qualificationsPlaceholder', 'Required skills, education, experience...')}
                className={`${inputCls} font-mono`}
              />
            </div>

            {/* Hard Requirements */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.hardRequirements', 'Hard Requirements')}</label>
                <AIWandButton
                  onClick={() => handleGenerateSection('hardRequirements')}
                  loading={generatingSection === 'hardRequirements'}
                  hasContent={!!form.hardRequirements.trim()}
                  t={t}
                />
              </div>
              <textarea
                value={form.hardRequirements}
                onChange={(e) => setForm((p) => ({ ...p, hardRequirements: e.target.value }))}
                rows={4}
                placeholder={t('product.jobs.hardRequirementsPlaceholder', 'Non-negotiable must-have criteria...')}
                className={`${inputCls} font-mono`}
              />
            </div>

            {/* Nice to Have */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.niceToHave', 'Nice to Have')}</label>
                <AIWandButton
                  onClick={() => handleGenerateSection('niceToHave')}
                  loading={generatingSection === 'niceToHave'}
                  hasContent={!!form.niceToHave.trim()}
                  t={t}
                />
              </div>
              <textarea
                value={form.niceToHave}
                onChange={(e) => setForm((p) => ({ ...p, niceToHave: e.target.value }))}
                rows={4}
                placeholder={t('product.jobs.niceToHavePlaceholder', 'Preferred qualifications...')}
                className={`${inputCls} font-mono`}
              />
            </div>

            {/* Benefits */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.benefits', 'Benefits')}</label>
                <AIWandButton
                  onClick={() => handleGenerateSection('benefits')}
                  loading={generatingSection === 'benefits'}
                  hasContent={!!form.benefits.trim()}
                  t={t}
                />
              </div>
              <textarea
                value={form.benefits}
                onChange={(e) => setForm((p) => ({ ...p, benefits: e.target.value }))}
                rows={4}
                placeholder={t('product.jobs.benefitsPlaceholder', 'Benefits and perks...')}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          {/* Section 3: Interview Configuration */}
          <div className="border-t border-slate-200 pt-6">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">{t('product.jobs.interviewConfig', 'Interview Configuration')}</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.interviewMode', 'Interview Mode')}</label>
                <select
                  value={form.interviewMode}
                  onChange={(e) => setForm((p) => ({ ...p, interviewMode: e.target.value }))}
                  className={inputCls}
                >
                  <option value="standard">{t('product.jobs.standard', 'Standard')}</option>
                  <option value="question_bank">{t('product.jobs.questionBank', 'Question Bank')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.passingScore', 'Passing Score')} (20-80)</label>
                <input
                  type="number"
                  min={20}
                  max={80}
                  value={form.passingScore}
                  onChange={(e) => setForm((p) => ({ ...p, passingScore: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.interviewLanguage', 'Language')}</label>
                <select
                  value={form.interviewLanguage}
                  onChange={(e) => setForm((p) => ({ ...p, interviewLanguage: normalizeInterviewLanguage(e.target.value) }))}
                  className={inputCls}
                >
                  {INTERVIEW_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.interviewDuration', 'Duration')}</label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={45}
                    value={form.interviewDuration || ''}
                    onChange={(e) => {
                      if (e.target.value === '') {
                        setForm((p) => ({ ...p, interviewDuration: '' }));
                        return;
                      }
                      let val = parseInt(e.target.value, 10);
                      if (isNaN(val)) return;
                      // Enforce max 45 minutes
                      if (val > 45) val = 45;
                      setForm((p) => ({ ...p, interviewDuration: val.toString() }));
                    }}
                    className={`${inputCls} pr-12`}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500 text-sm">
                    {t('product.jobDetail.minutes', 'min')}
                  </div>
                </div>
              </div>
            </div>

            {/* Interview Requirements */}
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.interviewRequirements', 'Interview Requirements')}</label>
                <AIWandButton
                  onClick={() => handleGenerateSection('interviewRequirements')}
                  loading={generatingSection === 'interviewRequirements'}
                  hasContent={!!form.interviewRequirements.trim()}
                  t={t}
                />
              </div>
              <textarea
                value={form.interviewRequirements}
                onChange={(e) => setForm((p) => ({ ...p, interviewRequirements: e.target.value }))}
                rows={4}
                placeholder={t('product.jobs.interviewRequirementsPlaceholder', 'What to assess during the interview...')}
                className={`${inputCls} font-mono`}
              />
              {!form.interviewRequirements.trim() && (
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, interviewRequirements: t('product.jobs.interviewRequirementsSuggestion', 'Focus on system design and distributed systems experience. Assess problem-solving ability with real-world scenarios.') }))}
                  className="mt-1.5 text-xs text-blue-500 hover:text-blue-700 transition-colors"
                >
                  {t('product.interview.useSuggestion', 'Use suggestion')}
                </button>
              )}
            </div>

            {/* Evaluation Rules */}
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium text-slate-700">{t('product.jobs.evaluationRules', 'Evaluation Rules')}</label>
                <AIWandButton
                  onClick={() => handleGenerateSection('evaluationRules')}
                  loading={generatingSection === 'evaluationRules'}
                  hasContent={!!form.evaluationRules.trim()}
                  t={t}
                />
              </div>
              <textarea
                value={form.evaluationRules}
                onChange={(e) => setForm((p) => ({ ...p, evaluationRules: e.target.value }))}
                rows={4}
                placeholder={t('product.jobs.evaluationRulesPlaceholder', 'Scoring criteria, weights, pass/fail thresholds...')}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 pt-4">
            <div>
              {editingJob && (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  {analyzing ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-amber-600" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  )}
                  {analyzing
                    ? t('product.jobs.analyzing', 'Analyzing...')
                    : t('product.jobs.demandAnalysis', 'Demand Analysis')
                  }
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setEditingJob(null); resetForm(); }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('product.jobs.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={editingJob ? handleUpdate : handleCreate}
                disabled={saving || !form.title.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving
                  ? t('product.jobs.saving', 'Saving...')
                  : editingJob
                    ? t('product.jobs.save', 'Save Changes')
                    : t('product.jobs.createBtn', 'Create Job')
                }
              </button>
            </div>
          </div>

          {/* Demand Analysis Results */}
          {analysisResult && (
            <div className="border-t border-slate-200 pt-6 space-y-4">
              <h4 className="text-sm font-semibold text-slate-800">{t('product.jobs.demandAnalysis', 'Demand Analysis')}</h4>

              {/* Market Summary */}
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-sm text-blue-800">{analysisResult.marketSummary}</p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                {/* Difficulty */}
                <div className="rounded-xl border border-slate-200 p-4 text-center">
                  <div className={`text-3xl font-bold ${
                    analysisResult.recruitmentDifficulty.score <= 3 ? 'text-emerald-600' :
                    analysisResult.recruitmentDifficulty.score <= 6 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {analysisResult.recruitmentDifficulty.score}/10
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{t('product.jobs.marketDifficulty', 'Market Difficulty')}</p>
                  <p className="text-xs font-medium text-slate-700">{analysisResult.recruitmentDifficulty.level}</p>
                </div>

                {/* Time to Hire */}
                <div className="rounded-xl border border-slate-200 p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600">{analysisResult.timeToHire.estimateDays}</div>
                  <p className="text-xs text-slate-500 mt-1">{t('product.jobs.timeToHire', 'Days to Hire')}</p>
                </div>

                {/* Supply/Demand */}
                <div className="rounded-xl border border-slate-200 p-4 text-center">
                  <div className="text-lg font-bold text-slate-800">{analysisResult.supplyDemand.assessment}</div>
                  <p className="text-xs text-slate-500 mt-1">{t('product.jobs.supplyDemand', 'Supply / Demand')}</p>
                  <p className="text-xs text-slate-600">{analysisResult.supplyDemand.talentPoolSize}</p>
                </div>
              </div>

              {/* Salary Benchmarks */}
              {analysisResult.salaryRanges.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-slate-600 mb-2">{t('product.jobs.salaryBenchmark', 'Salary Benchmarks')}</h5>
                  <div className="space-y-1">
                    {analysisResult.salaryRanges.map((sr, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-slate-700 font-medium">{sr.region}</span>
                        <span className="text-slate-900 font-bold">{sr.rangeLow} – {sr.rangeHigh} {sr.currency}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Competition */}
              {analysisResult.competition.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-slate-600 mb-2">{t('product.jobs.competitors', 'Competition')}</h5>
                  <div className="space-y-1">
                    {analysisResult.competition.map((c, i) => (
                      <div key={i} className="text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <span className="font-medium text-slate-800">{c.competitor}</span>
                        <span className="text-slate-500 ml-2">— {c.hiringActivity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trends */}
              {analysisResult.marketTrends.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-slate-600 mb-2">{t('product.jobs.trends', 'Market Trends')}</h5>
                  <div className="space-y-1">
                    {analysisResult.marketTrends.map((mt, i) => (
                      <div key={i} className="text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${
                            mt.impact === 'Positive' ? 'text-emerald-600' :
                            mt.impact === 'Negative' ? 'text-red-600' : 'text-slate-600'
                          }`}>{mt.impact}</span>
                          <span className="text-slate-800">{mt.trend}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Jobs List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900">{t('product.jobs.empty', 'No jobs yet')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('product.jobs.emptyDesc', 'Create your first job posting to get started.')}</p>
          <button
            onClick={() => { setShowCreate(true); resetForm(); }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('product.jobs.create', 'Create Job')}
          </button>
        </div>
      ) : displayedJobs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h18M3 12h18M3 19h18" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900">{t('product.jobs.noFilteredResults', 'No jobs match these filters')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('product.jobs.noFilteredResultsDesc', 'Try changing the client, created date, or search query.')}</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setClientFilter('');
              setDateRangeFilter('all');
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('product.jobs.clearFilters', 'Clear filters')}
          </button>
        </div>
      ) : (
        <div className={viewMode === 'cards' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}>
          {displayedJobs.map((job) => {
            const locationLabel = getJobLocationsLabel(job);
            const salarySummary = formatSalarySummary(job);
            const stats = [
              { label: t('product.jobs.statsHeadcount', 'Headcount'), value: job.headcount || 0 },
              { label: t('product.jobs.statsMatches', 'Matches'), value: job.stats?.matches ?? 0 },
              { label: t('product.jobs.statsInterviews', 'Interviews'), value: job.stats?.interviews ?? 0 },
              { label: t('product.jobs.statsCompleted', 'Completed'), value: job.stats?.completedInterviews ?? 0 },
            ];

            return (
              <div
                key={job.id}
                className={`rounded-2xl border border-slate-200 bg-white transition-colors hover:border-blue-200 ${
                  viewMode === 'cards' ? 'h-full p-5 shadow-[0_20px_44px_-36px_rgba(15,23,42,0.55)]' : 'p-4 sm:p-5'
                }`}
              >
                <div className={`flex ${viewMode === 'cards' ? 'h-full flex-col gap-4' : 'flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-5'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className="text-base font-semibold text-slate-900 hover:text-blue-600 cursor-pointer transition-colors"
                            onClick={() => navigate(`/product/jobs/${job.id}`)}
                          >
                            {job.title}
                          </h3>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[job.status] || STATUS_COLORS.draft}`}>
                            {t(`product.jobs.status.${job.status}`, job.status.charAt(0).toUpperCase() + job.status.slice(1))}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {job.companyName && <span className="font-medium text-slate-700">{job.companyName}</span>}
                          {job.department && <span>{job.department}</span>}
                          {locationLabel && <span>{locationLabel}</span>}
                          {job.workType && <span className="capitalize">{job.workType}</span>}
                          {job.employmentType && <span className="capitalize">{job.employmentType}</span>}
                          {job.experienceLevel && <span className="capitalize">{job.experienceLevel}</span>}
                          {salarySummary && <span>{salarySummary}</span>}
                        </div>
                      </div>
                      {viewMode === 'cards' && renderJobActions(job)}
                    </div>

                    {job.description && (
                      <p className={`mt-3 text-sm leading-6 text-slate-600 ${viewMode === 'cards' ? 'line-clamp-3' : 'line-clamp-2'}`}>
                        {job.description}
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {stats.map((stat) => (
                        <div key={stat.label} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    {job.notes && (
                      <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
                        </svg>
                        {job.notes.slice(0, 120)}{job.notes.length > 120 ? '...' : ''}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                      <span>
                        {t('product.jobs.created', 'Created')} {formatDateTimeLabel(job.createdAt)}
                      </span>
                      {job.hiringRequest && (
                        <span>· {t('product.jobs.fromRequest', 'From request:')} {job.hiringRequest.title}</span>
                      )}
                    </div>
                  </div>

                  {viewMode === 'list' && renderJobActions(job)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* JD Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Preview Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 rounded-t-2xl px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-900">{t('product.jobs.previewTitle', 'Job Description Preview')}</h2>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-6 space-y-6">
              {/* Title + Meta */}
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{form.title}</h1>
                {form.companyName && <p className="mt-1 text-base text-slate-500">{form.companyName}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.employmentType && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 capitalize">{form.employmentType}</span>}
                  {form.workType && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 capitalize">{form.workType}</span>}
                  {form.experienceLevel && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 capitalize">{form.experienceLevel}</span>}
                  {form.education && <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 capitalize">{form.education.replace('_', ' ')}</span>}
                  {form.location && <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">{form.location}</span>}
                  {parseInt(form.headcount) > 1 && <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">{t('product.jobDetail.headcount', 'Headcount')}: {form.headcount}</span>}
                  {(form.salaryText || form.salaryMin || form.salaryMax) && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      {form.salaryText || `${form.salaryCurrency} ${form.salaryMin || '—'} – ${form.salaryMax || '—'} / ${form.salaryPeriod === 'yearly' ? t('product.jobDetail.yearly', 'year') : t('product.jobDetail.monthly', 'month')}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Basic Info Grid */}
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                {form.department && (
                  <div><p className="text-xs text-slate-400">{t('product.jobDetail.department', 'Department')}</p><p className="text-sm font-medium text-slate-800">{form.department}</p></div>
                )}
                {form.location && (
                  <div><p className="text-xs text-slate-400">{t('product.jobDetail.location', 'Location')}</p><p className="text-sm font-medium text-slate-800">{form.location}</p></div>
                )}
                {form.education && (
                  <div><p className="text-xs text-slate-400">{t('product.jobDetail.education', 'Education')}</p><p className="text-sm font-medium text-slate-800 capitalize">{form.education.replace('_', ' ')}</p></div>
                )}
                <div><p className="text-xs text-slate-400">{t('product.jobDetail.headcount', 'Headcount')}</p><p className="text-sm font-medium text-slate-800">{form.headcount || '1'}</p></div>
                <div><p className="text-xs text-slate-400">{t('product.jobDetail.interviewDuration', 'Interview Duration')}</p><p className="text-sm font-medium text-slate-800">{form.interviewDuration} {t('product.jobDetail.minutes', 'min')}</p></div>
                <div><p className="text-xs text-slate-400">{t('product.jobDetail.interviewLang', 'Interview Language')}</p><p className="text-sm font-medium text-slate-800">{getInterviewLanguageDisplay(form.interviewLanguage)}</p></div>
              </div>

              {/* Content Sections */}
              {[
                { key: 'description', label: t('product.jobs.field.description', 'Job Description'), color: 'border-blue-200 bg-blue-50/30' },
                { key: 'qualifications', label: t('product.jobs.qualifications', 'Qualifications'), color: 'border-amber-200 bg-amber-50/30' },
                { key: 'hardRequirements', label: t('product.jobs.hardRequirements', 'Hard Requirements'), color: 'border-red-200 bg-red-50/30' },
                { key: 'niceToHave', label: t('product.jobs.niceToHave', 'Nice to Have'), color: 'border-violet-200 bg-violet-50/30' },
                { key: 'benefits', label: t('product.jobs.benefits', 'Benefits'), color: 'border-rose-200 bg-rose-50/30' },
                { key: 'interviewRequirements', label: t('product.jobs.interviewRequirements', 'Interview Requirements'), color: 'border-purple-200 bg-purple-50/30' },
                { key: 'evaluationRules', label: t('product.jobs.evaluationRules', 'Evaluation Rules'), color: 'border-teal-200 bg-teal-50/30' },
              ].map(({ key, label, color }) => {
                const value = (form as any)[key];
                if (!value?.trim()) return null;
                return (
                  <div key={key} className={`rounded-xl border ${color} overflow-hidden`}>
                    <div className="px-4 py-2.5 border-b border-inherit">
                      <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
                    </div>
                    <div className="px-4 py-3 bg-white">
                      <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{value}</div>
                    </div>
                  </div>
                );
              })}

              {form.notes?.trim() && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/30 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-200">
                    <h3 className="text-sm font-semibold text-amber-800">{t('product.jobs.notes', 'Notes')}</h3>
                  </div>
                  <div className="px-4 py-3 bg-white">
                    <p className="text-sm text-amber-800 whitespace-pre-wrap">{form.notes}</p>
                  </div>
                </div>
              )}
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
