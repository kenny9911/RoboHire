import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from '../../lib/axios';
import { usePageState } from '../../hooks/usePageState';

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
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  description: string | null;
  qualifications: string | null;
  hardRequirements: string | null;
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
  en: 'USD', zh: 'CNY', 'zh-TW': 'TWD', ja: 'JPY',
  es: 'EUR', fr: 'EUR', pt: 'EUR', de: 'EUR',
};

function getInitialForm(lang?: string) {
  const l = lang || 'en';
  return {
    title: '',
    companyName: '',
    department: '',
    location: '',
    workType: '',
    employmentType: '',
    experienceLevel: '',
    salaryMin: '',
    salaryMax: '',
    salaryCurrency: LANG_CURRENCY_MAP[l] || 'USD',
    salaryPeriod: 'monthly',
    description: '',
    qualifications: '',
    hardRequirements: '',
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
      className="inline-flex items-center justify-center h-5 w-5 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
      title={hasContent ? t('product.jobs.enhance', 'Refine with AI') : t('product.jobs.generate', 'Generate with AI')}
    >
      {loading ? (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-blue-500" />
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
        </svg>
      )}
    </button>
  );
}

export default function Jobs() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [jobs, setJobs] = usePageState<Job[]>('jobs.list', []);
  const [loading, setLoading] = useState(jobs.length > 0 ? false : true);
  const [statusFilter, setStatusFilter] = usePageState<string>('jobs.statusFilter', '');
  const [showCreate, setShowCreate] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingFileName, setImportingFileName] = useState('');
  const [importStageIndex, setImportStageIndex] = useState(0);
  const [locations, setLocations] = useState<LocationEntry[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newCountry, setNewCountry] = useState('');
  const [newCity, setNewCity] = useState('');
  const [showSalaryDropdown, setShowSalaryDropdown] = useState(false);
  const salaryDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ ...INITIAL_FORM });
  const importStages = [
    t('product.jobs.importStageUpload', 'Uploading file'),
    t('product.jobs.importStageExtract', 'Extracting JD content'),
    t('product.jobs.importStageApply', 'Applying details to the form'),
  ];

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
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const res = await axios.get('/api/v1/jobs', { params });
      setJobs(res.data.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

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
        locations: locations.length > 0 ? locations : null,
      });
      setJobs((prev) => [res.data.data, ...prev]);
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
        locations: locations.length > 0 ? locations : null,
      });
      setJobs((prev) => prev.map((j) => (j.id === editingJob.id ? res.data.data : j)));
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

  const LANG_NAMES: Record<string, string> = {
    en: 'English', zh: '中文 (Chinese)', 'zh-TW': '繁體中文 (Traditional Chinese)',
    ja: '日本語 (Japanese)', es: 'Español (Spanish)', fr: 'Français (French)',
    pt: 'Português (Portuguese)', de: 'Deutsch (German)',
  };

  const getLanguageParam = () => LANG_NAMES[form.interviewLanguage] || form.interviewLanguage;

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
        setJobs((prev) => prev.map((j) => (j.id === editingJob.id ? res.data.data : j)));
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
        setJobs((prev) => prev.map((j) => (j.id === editingJob.id ? res.data.data : j)));
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
      formData.append('language', form.interviewLanguage);
      const res = await axios.post('/api/v1/jobs/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const suggested = res.data.data?.suggestedFields;
      if (suggested) {
        setImportStageIndex(importStages.length - 1);
        setForm((p) => ({
          ...p,
          title: suggested.title || p.title,
          companyName: suggested.companyName || p.companyName,
          description: suggested.description || p.description,
          department: suggested.department || p.department,
          location: suggested.location || p.location,
          workType: suggested.workType || p.workType,
          employmentType: suggested.employmentType || p.employmentType,
          experienceLevel: suggested.experienceLevel || p.experienceLevel,
          qualifications: suggested.qualifications || p.qualifications,
          hardRequirements: suggested.hardRequirements || p.hardRequirements,
        }));
      }
    } catch {
      // handle error
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async (jobId: string) => {
    try {
      const res = await axios.get(`/api/v1/jobs/${jobId}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-${jobId.slice(0, 8)}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // handle error
    }
  };

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    try {
      const res = await axios.patch(`/api/v1/jobs/${jobId}`, { status: newStatus });
      setJobs((prev) => prev.map((j) => (j.id === jobId ? res.data.data : j)));
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
      salaryMin: job.salaryMin?.toString() || '',
      salaryMax: job.salaryMax?.toString() || '',
      salaryCurrency: job.salaryCurrency || 'USD',
      salaryPeriod: job.salaryPeriod || 'monthly',
      description: job.description || '',
      qualifications: job.qualifications || '',
      hardRequirements: job.hardRequirements || '',
      interviewMode: job.interviewMode || 'standard',
      passingScore: job.passingScore?.toString() || '60',
      interviewLanguage: job.interviewLanguage || 'en',
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

      {/* Status filter */}
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
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md,.markdown" onChange={handleImport} className="hidden" />
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
                <button
                  type="button"
                  onClick={() => handleExport(editingJob.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {t('product.jobs.exportJob', 'Export')}
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
                    value={getSalaryDisplayValue()}
                    onFocus={() => setShowSalaryDropdown(true)}
                    onChange={(e) => {
                      // Allow free text entry — try to parse
                      const raw = e.target.value;
                      if (!raw) {
                        setForm((p) => ({ ...p, salaryMin: '', salaryMax: '' }));
                      }
                    }}
                    placeholder={t('product.jobs.salaryPlaceholder', 'Select or enter salary range, e.g. 20-30K/mo')}
                    className={inputCls}
                    readOnly
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
                            // Show manual entry — clear to let user type
                            setForm((p) => ({ ...p, salaryMin: '', salaryMax: '' }));
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
                  onChange={(e) => setForm((p) => ({ ...p, salaryCurrency: e.target.value, salaryMin: '', salaryMax: '' }))}
                  className={inputCls + ' sm:w-24'}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CNY">CNY</option>
                  <option value="JPY">JPY</option>
                  <option value="TWD">TWD</option>
                  <option value="CAD">CAD</option>
                  <option value="AUD">AUD</option>
                </select>
              </div>
              {/* Manual min/max inputs shown when dropdown is closed and values are set or user wants custom */}
              {!showSalaryDropdown && (form.salaryMin || form.salaryMax) && form.salaryMin !== '0' && (
                <div className="mt-2 grid grid-cols-2 gap-3">
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
                  onChange={(e) => setForm((p) => ({ ...p, interviewLanguage: e.target.value }))}
                  className={inputCls}
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="ja">日本語</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="pt">Português</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('product.jobs.interviewDuration', 'Duration (min)')}</label>
                <select
                  value={form.interviewDuration}
                  onChange={(e) => setForm((p) => ({ ...p, interviewDuration: e.target.value }))}
                  className={inputCls}
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                </select>
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
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 hover:border-blue-200 transition-colors"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className="text-base font-semibold text-slate-900 hover:text-blue-600 cursor-pointer transition-colors"
                      onClick={() => navigate(`/product/jobs/${job.id}`)}
                    >{job.title}</h3>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[job.status] || STATUS_COLORS.draft}`}>
                      {t(`product.jobs.status.${job.status}`, job.status.charAt(0).toUpperCase() + job.status.slice(1))}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    {job.companyName && <span className="font-medium">{job.companyName}</span>}
                    {job.department && <span>{job.department}</span>}
                    {job.locations && Array.isArray(job.locations) && job.locations.length > 0 ? (
                      <span>{(job.locations as LocationEntry[]).map((l) => `${l.city}${l.city && l.country ? ', ' : ''}${l.country}`).join(' | ')}</span>
                    ) : job.location ? (
                      <span>{job.location}</span>
                    ) : null}
                    {job.workType && <span className="capitalize">{job.workType}</span>}
                    {job.employmentType && <span className="capitalize">{job.employmentType}</span>}
                    {job.experienceLevel && <span className="capitalize">{job.experienceLevel}</span>}
                    {(job.salaryMin != null || job.salaryMax != null) && (job.salaryMin !== 0 || job.salaryMax !== 0) && (
                      <span>
                        {job.salaryCurrency || 'USD'} {job.salaryMin?.toLocaleString() || '—'} – {job.salaryMax?.toLocaleString() || '—'}/{job.salaryPeriod === 'yearly' ? t('product.jobs.perYear', 'yr') : t('product.jobs.perMonth', 'mo')}
                      </span>
                    )}
                    {job.salaryMin === 0 && job.salaryMax === 0 && (
                      <span>{t('product.jobs.salaryNegotiable', 'Negotiable')}</span>
                    )}
                  </div>
                  {job.description && (
                    <p className="mt-2 text-sm text-slate-600 line-clamp-2">{job.description.slice(0, 200)}</p>
                  )}
                  {job.notes && (
                    <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5">
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
                      </svg>
                      {job.notes.slice(0, 80)}{job.notes.length > 80 ? '...' : ''}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {t('product.jobs.created', 'Created')} {new Date(job.createdAt).toLocaleDateString()}
                    {job.hiringRequest && (
                      <> · {t('product.jobs.fromRequest', 'From request:')} {job.hiringRequest.title}</>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
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

                  <button
                    onClick={() => handleExport(job.id)}
                    title={t('product.jobs.exportJob', 'Export')}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>

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
              </div>
            </div>
          ))}
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
