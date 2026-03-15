import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from '../../lib/axios';
import MatchDetailModal from '../../components/MatchDetailModal';

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
  hiringRequest?: { id: string; title: string; requirements: string } | null;
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

type TabKey = 'details' | 'applicants' | 'overview';

type SectionKey = 'description' | 'qualifications' | 'hardRequirements' | 'interviewRequirements' | 'evaluationRules';

const LANG_DISPLAY: Record<string, string> = {
  en: 'English', zh: '中文', 'zh-TW': '繁體中文', ja: '日本語',
  es: 'Español', fr: 'Français', pt: 'Português', de: 'Deutsch',
};

const JOB_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  open: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-red-100 text-red-700',
  filled: 'bg-blue-100 text-blue-700',
};

const GRADE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-700',
  A: 'bg-emerald-100 text-emerald-700',
  'B+': 'bg-blue-100 text-blue-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-orange-100 text-orange-700',
  F: 'bg-red-100 text-red-700',
};

const MATCH_STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600',
  reviewed: 'bg-blue-100 text-blue-700',
  shortlisted: 'bg-emerald-100 text-emerald-700',
  applied: 'bg-indigo-100 text-indigo-700',
  rejected: 'bg-red-100 text-red-700',
  invited: 'bg-purple-100 text-purple-700',
};

const MATCH_STATUSES = ['', 'new', 'reviewed', 'shortlisted', 'applied', 'rejected', 'invited'];

const SECTIONS: { key: SectionKey; icon: string }[] = [
  { key: 'description', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  { key: 'qualifications', icon: 'M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5' },
  { key: 'hardRequirements', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'interviewRequirements', icon: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155' },
  { key: 'evaluationRules', icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605' },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  description: 'Job Description',
  qualifications: 'Qualifications',
  hardRequirements: 'Hard Requirements',
  interviewRequirements: 'Interview Requirements',
  evaluationRules: 'Evaluation Rules',
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Inline editing state
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null);
  const [editText, setEditText] = useState('');
  const [activeSection, setActiveSection] = useState<SectionKey>('description');

  // AI refine state
  const [aiRefineSection, setAiRefineSection] = useState<SectionKey | null>(null);
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiRefining, setAiRefining] = useState(false);

  // Applicants state
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [detailMatch, setDetailMatch] = useState<MatchResult | null>(null);
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [confirmInvite, setConfirmInvite] = useState<MatchResult | null>(null);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    axios.get(`/api/v1/jobs/${id}`)
      .then((res) => {
        if (res.data.success) setJob(res.data.data);
        else setError(res.data.error || 'Failed to load job');
      })
      .catch(() => setError('Failed to load job'))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchMatches = useCallback(async () => {
    if (!id || matchesLoaded) return;
    setLoadingMatches(true);
    try {
      const res = await axios.get(`/api/v1/matching/results/${id}`);
      if (res.data.success) setMatches(res.data.data || []);
    } catch { /* silent */ } finally {
      setLoadingMatches(false);
      setMatchesLoaded(true);
    }
  }, [id, matchesLoaded]);

  useEffect(() => {
    if (activeTab !== 'details' && !matchesLoaded) fetchMatches();
  }, [activeTab, matchesLoaded, fetchMatches]);

  const handleStatusUpdate = async (matchId: string, newStatus: string) => {
    try {
      await axios.patch(`/api/v1/matching/results/${matchId}`, { status: newStatus });
      setMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, status: newStatus } : m));
    } catch { /* silent */ }
  };

  const handleInvite = (match: MatchResult) => setConfirmInvite(match);

  const confirmAndInvite = async () => {
    const match = confirmInvite;
    if (!match || !job) return;
    setConfirmInvite(null);
    setInviteStatus((prev) => ({ ...prev, [match.id]: 'sending' }));
    try {
      const resumeRes = await axios.get(`/api/v1/resumes/${match.resumeId}`);
      const resumeText = resumeRes.data.data?.resumeText || '';
      const inviteRes = await axios.post('/api/v1/invite-candidate', {
        resume: resumeText,
        jd: job.description || job.title,
      });
      const accessToken = inviteRes.data.data?.accessToken;
      if (accessToken) {
        setInviteLinks((prev) => ({ ...prev, [match.id]: `${window.location.origin}/interview-room?token=${accessToken}` }));
      }
      setInviteStatus((prev) => ({ ...prev, [match.id]: 'sent' }));
      handleStatusUpdate(match.id, 'invited');
    } catch {
      setInviteStatus((prev) => ({ ...prev, [match.id]: 'error' }));
    }
  };

  const filteredMatches = useMemo(() => {
    if (!statusFilter) return matches;
    return matches.filter((m) => m.status === statusFilter);
  }, [matches, statusFilter]);

  // Save a section to backend
  const saveSection = async (section: SectionKey, value: string) => {
    if (!job) return;
    setSaveStatus('saving');
    try {
      const res = await axios.patch(`/api/v1/jobs/${job.id}`, { [section]: value });
      if (res.data.success) {
        setJob(res.data.data);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  };

  const startEditing = (section: SectionKey) => {
    if (!job) return;
    setEditingSection(section);
    setEditText(job[section] || '');
  };

  const cancelEditing = () => {
    setEditingSection(null);
    setEditText('');
  };

  const saveEditing = () => {
    if (!editingSection) return;
    saveSection(editingSection, editText);
    setEditingSection(null);
    setEditText('');
  };

  // AI Refine
  const openAiRefine = (section: SectionKey) => {
    setAiRefineSection(section);
    setAiInstructions('');
  };

  const runAiRefine = async () => {
    if (!aiRefineSection || !job) return;
    setAiRefining(true);
    try {
      const currentText = job[aiRefineSection] || '';
      const action = currentText.trim() ? 'enhance' : 'generate_section';
      const res = await axios.post(`/api/v1/jobs/${job.id}/generate-content`, {
        action,
        section: aiRefineSection,
        instructions: aiInstructions || undefined,
      });
      if (res.data.success && res.data.data) {
        setJob(res.data.data);
      }
    } catch { /* silent */ } finally {
      setAiRefining(false);
      setAiRefineSection(null);
      setAiInstructions('');
    }
  };

  const scrollToSection = (section: SectionKey) => {
    setActiveSection(section);
    sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

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

  const locationText = job.locations && Array.isArray(job.locations) && job.locations.length > 0
    ? (job.locations as LocationEntry[]).map((l) => `${l.city}${l.city && l.country ? ', ' : ''}${l.country}`).join(' | ')
    : job.location || null;

  const salaryText = (job.salaryMin === 0 && job.salaryMax === 0)
    ? t('product.jobs.salaryNegotiable', 'Negotiable')
    : (job.salaryMin || job.salaryMax)
      ? `${job.salaryCurrency || 'USD'} ${job.salaryMin?.toLocaleString() || '—'} – ${job.salaryMax?.toLocaleString() || '—'} / ${job.salaryPeriod === 'yearly' ? t('product.jobDetail.yearly', 'year') : t('product.jobDetail.monthly', 'month')}`
      : null;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'details', label: t('product.jobDetail.tabDetails', 'Details') },
    { key: 'applicants', label: t('product.jobDetail.tabApplicants', 'Applicants'), count: matchesLoaded ? matches.length : undefined },
    { key: 'overview', label: t('product.jobDetail.tabOverview', 'Overview') },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/product/jobs" className="hover:text-blue-600 transition-colors">
          {t('product.jobDetail.backToJobs', 'Back to Jobs')}
        </Link>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        <span className="text-slate-800 font-medium truncate">{job.title}</span>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.draft}`}>
                  {job.status}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                {job.companyName && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    {job.companyName}
                  </span>
                )}
                {job.department && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {job.department}
                  </span>
                )}
                {locationText && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {locationText}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {job.workType && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 capitalize">{job.workType}</span>}
                {job.employmentType && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 capitalize">{job.employmentType}</span>}
                {job.experienceLevel && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 capitalize">{job.experienceLevel}</span>}
                {salaryText && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{salaryText}</span>}
              </div>
            </div>
            {/* Save status indicator */}
            <div className="flex items-center gap-3 shrink-0">
              {saveStatus === 'saving' && <span className="text-xs text-slate-400 flex items-center gap-1"><div className="h-3 w-3 animate-spin rounded-full border-b-2 border-slate-400" />{t('product.jobDetail.saving', 'Saving...')}</span>}
              {saveStatus === 'saved' && <span className="text-xs text-emerald-600 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>{t('product.jobDetail.saved', 'Saved')}</span>}
              {saveStatus === 'error' && <span className="text-xs text-red-500">{t('product.jobDetail.saveError', 'Save failed')}</span>}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-400">
            <span>{t('product.jobDetail.created', 'Created')}: {new Date(job.createdAt).toLocaleDateString()}</span>
            <span>{t('product.jobDetail.updated', 'Updated')}: {new Date(job.updatedAt).toLocaleDateString()}</span>
            {job.publishedAt && <span>{t('product.jobDetail.published', 'Published')}: {new Date(job.publishedAt).toLocaleDateString()}</span>}
            {job.hiringRequest && (
              <Link to={`/product/hiring/${job.hiringRequest.id}`} className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                {job.hiringRequest.title}
              </Link>
            )}
          </div>
        </div>
        {job.notes && (
          <div className="px-6 pb-4">
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" /></svg>
                <span className="text-xs font-semibold text-amber-700">{t('product.jobs.notes', 'Notes')}</span>
              </div>
              <p className="text-sm text-amber-800 whitespace-pre-wrap">{job.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-6 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative pb-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                activeTab === tab.key ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
              }`}>{tab.count}</span>
            )}
            {activeTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <div className="flex gap-6">
          {/* Side Navigation */}
          <nav className="w-52 shrink-0 hidden lg:block">
            <div className="sticky top-6 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-3">{t('product.jobDetail.sections', 'Sections')}</p>
              {SECTIONS.map(({ key, icon }) => {
                const hasContent = !!job[key];
                return (
                  <button
                    key={key}
                    onClick={() => scrollToSection(key)}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                      activeSection === key
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeSection === key ? 'text-indigo-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                    </svg>
                    <span className="truncate">{t(`product.jobDetail.${key}`, SECTION_LABELS[key])}</span>
                    {!hasContent && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title={t('product.jobDetail.empty', 'Empty')} />
                    )}
                  </button>
                );
              })}

              {/* Interview config summary */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-3">{t('product.jobDetail.interviewConfig', 'Interview Config')}</p>
                <div className="space-y-2 px-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{t('product.jobDetail.mode', 'Mode')}</span>
                    <span className="text-slate-700 font-medium capitalize">{job.interviewMode || 'standard'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{t('product.jobDetail.passingScore', 'Passing')}</span>
                    <span className="text-slate-700 font-medium">{job.passingScore ?? 60}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{t('product.jobDetail.language', 'Language')}</span>
                    <span className="text-slate-700 font-medium">{LANG_DISPLAY[job.interviewLanguage || 'en'] || 'English'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{t('product.jobDetail.duration', 'Duration')}</span>
                    <span className="text-slate-700 font-medium">{job.interviewDuration || 30}m</span>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Content Sections */}
          <div className="flex-1 min-w-0 space-y-4">
            {SECTIONS.map(({ key }) => (
              <div
                key={key}
                ref={(el) => { sectionRefs.current[key] = el; }}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden"
              >
                {/* Section Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {t(`product.jobDetail.${key}`, SECTION_LABELS[key])}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {/* AI Refine Button */}
                    <button
                      onClick={() => openAiRefine(key)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors"
                      title={t('product.jobDetail.aiRefine', 'AI Refine')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                      </svg>
                      {job[key] ? t('product.jobDetail.aiRefine', 'AI Refine') : t('product.jobDetail.aiGenerate', 'AI Generate')}
                    </button>
                    {/* Edit Button */}
                    {editingSection !== key && (
                      <button
                        onClick={() => startEditing(key)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                        </svg>
                        {t('product.jobDetail.edit', 'Edit')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Section Body */}
                <div className="px-5 py-4">
                  {editingSection === key ? (
                    <div className="space-y-3">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full min-h-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y placeholder:text-slate-400"
                        placeholder={t('product.jobDetail.enterContent', 'Enter content using Markdown...')}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-slate-400">{t('product.jobDetail.markdownSupported', 'Markdown supported')}</p>
                        <div className="flex items-center gap-2">
                          <button onClick={cancelEditing} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                            {t('common.cancel', 'Cancel')}
                          </button>
                          <button onClick={saveEditing} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
                            {t('product.jobDetail.saveSection', 'Save')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : job[key] ? (
                    <div className="prose-sm">
                      <MarkdownContent text={job[key]!} />
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <svg className="mx-auto h-8 w-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="mt-2 text-sm text-slate-400">{t('product.jobDetail.noContent', 'No content yet')}</p>
                      <div className="mt-3 flex justify-center gap-2">
                        <button onClick={() => startEditing(key)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                          {t('product.jobDetail.writeManually', 'Write manually')}
                        </button>
                        <span className="text-slate-300">|</span>
                        <button onClick={() => openAiRefine(key)} className="text-xs font-medium text-violet-600 hover:text-violet-700">
                          {t('product.jobDetail.generateWithAi', 'Generate with AI')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'applicants' && (
        <ApplicantsTab
          matches={filteredMatches}
          allMatches={matches}
          loading={loadingMatches}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onStatusUpdate={handleStatusUpdate}
          onViewDetail={setDetailMatch}
          onInvite={handleInvite}
          inviteStatus={inviteStatus}
          inviteLinks={inviteLinks}
          t={t}
        />
      )}

      {activeTab === 'overview' && (
        <OverviewTab matches={matches} loading={loadingMatches} t={t} />
      )}

      {/* Match Detail Modal */}
      {detailMatch && (
        <MatchDetailModal
          open={!!detailMatch}
          onClose={() => setDetailMatch(null)}
          matchData={detailMatch.matchData}
          candidateName={detailMatch.resume.name}
          score={detailMatch.score}
          grade={detailMatch.grade}
        />
      )}

      {/* Invite Confirmation Modal */}
      {confirmInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmInvite(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">
              {t('product.jobDetail.confirmInviteTitle', 'Invite to Interview')}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {t('product.jobDetail.confirmInviteMessage', 'Send an AI interview invitation to {{name}}?', { name: confirmInvite.resume.name })}
            </p>
            {confirmInvite.resume.email && (
              <p className="mt-1.5 text-sm text-slate-600">
                <span className="text-slate-400">{t('product.jobDetail.confirmInviteEmail', 'Email')}:</span> {confirmInvite.resume.email}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmInvite(null)} className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                {t('common.cancel', 'Cancel')}
              </button>
              <button onClick={confirmAndInvite} className="px-3 py-1.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors">
                {t('product.jobDetail.confirmInviteSend', 'Send Invitation')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Refine Modal */}
      {aiRefineSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !aiRefining && setAiRefineSection(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                <h3 className="text-base font-semibold text-slate-900">
                  {job[aiRefineSection]
                    ? t('product.jobDetail.aiRefineTitle', 'AI Refine: {{section}}', { section: t(`product.jobDetail.${aiRefineSection}`, SECTION_LABELS[aiRefineSection]) })
                    : t('product.jobDetail.aiGenerateTitle', 'AI Generate: {{section}}', { section: t(`product.jobDetail.${aiRefineSection}`, SECTION_LABELS[aiRefineSection]) })
                  }
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {job[aiRefineSection]
                  ? t('product.jobDetail.aiRefineDesc', 'The AI will improve the existing content based on your instructions.')
                  : t('product.jobDetail.aiGenerateDesc', 'The AI will generate content for this section based on the job details.')
                }
              </p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('product.jobDetail.aiInstructions', 'Your instructions')}
                <span className="text-slate-400 font-normal ml-1">({t('product.jobDetail.aiOptional', 'optional')})</span>
              </label>
              <textarea
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                placeholder={t('product.jobDetail.aiPlaceholder', 'e.g. "Make it more concise", "Add more technical details", "Translate to Chinese"...')}
                className="w-full min-h-[100px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-y placeholder:text-slate-400"
                disabled={aiRefining}
              />
              {job[aiRefineSection] && (
                <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 max-h-32 overflow-y-auto">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t('product.jobDetail.currentContent', 'Current content preview')}</p>
                  <p className="text-xs text-slate-500 line-clamp-4 whitespace-pre-wrap">{job[aiRefineSection]!.slice(0, 500)}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
              <button
                onClick={() => setAiRefineSection(null)}
                disabled={aiRefining}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={runAiRefine}
                disabled={aiRefining}
                className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {aiRefining ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t('product.jobDetail.aiProcessing', 'Processing...')}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    {job[aiRefineSection] ? t('product.jobDetail.aiRefineBtn', 'Refine with AI') : t('product.jobDetail.aiGenerateBtn', 'Generate with AI')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Markdown Renderer
 * ─────────────────────────────────────────────────────────────────────────── */
function MarkdownContent({ text }: { text: string }) {
  const mdComponents = {
    h1: ({ children, ...props }: any) => <h1 className="text-xl font-bold text-slate-900 mt-4 mb-2" {...props}>{children}</h1>,
    h2: ({ children, ...props }: any) => <h2 className="text-base font-semibold text-slate-800 mt-4 mb-2" {...props}>{children}</h2>,
    h3: ({ children, ...props }: any) => <h3 className="text-sm font-semibold text-slate-700 mt-3 mb-1.5" {...props}>{children}</h3>,
    p: ({ children, ...props }: any) => <p className="text-sm text-slate-700 leading-relaxed mb-2" {...props}>{children}</p>,
    ul: ({ children, ...props }: any) => <ul className="list-disc list-inside text-sm text-slate-700 space-y-1 mb-2 ml-1" {...props}>{children}</ul>,
    ol: ({ children, ...props }: any) => <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1 mb-2 ml-1" {...props}>{children}</ol>,
    li: ({ children, ...props }: any) => <li className="text-sm text-slate-700 leading-relaxed" {...props}>{children}</li>,
    strong: ({ children, ...props }: any) => <strong className="font-semibold text-slate-900" {...props}>{children}</strong>,
    a: ({ children, ...props }: any) => <a className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,
    blockquote: ({ children, ...props }: any) => <blockquote className="border-l-3 border-slate-300 pl-3 italic text-slate-600 my-2" {...props}>{children}</blockquote>,
    hr: (props: any) => <hr className="border-slate-200 my-3" {...props} />,
    table: ({ children, ...props }: any) => <div className="overflow-x-auto my-2"><table className="min-w-full text-sm border border-slate-200 rounded-lg" {...props}>{children}</table></div>,
    th: ({ children, ...props }: any) => <th className="bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600 border-b border-slate-200" {...props}>{children}</th>,
    td: ({ children, ...props }: any) => <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100" {...props}>{children}</td>,
  };

  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{text}</ReactMarkdown>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Applicants Tab
 * ─────────────────────────────────────────────────────────────────────────── */
function ApplicantsTab({ matches, allMatches, loading, statusFilter, onStatusFilterChange, onStatusUpdate, onViewDetail, onInvite, inviteStatus, inviteLinks, t }: {
  matches: MatchResult[]; allMatches: MatchResult[]; loading: boolean;
  statusFilter: string; onStatusFilterChange: (s: string) => void;
  onStatusUpdate: (id: string, status: string) => void;
  onViewDetail: (m: MatchResult) => void;
  onInvite: (m: MatchResult) => void;
  inviteStatus: Record<string, 'sending' | 'sent' | 'error'>;
  inviteLinks: Record<string, string>;
  t: any;
}) {
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '': allMatches.length };
    for (const m of allMatches) counts[m.status] = (counts[m.status] || 0) + 1;
    return counts;
  }, [allMatches]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {MATCH_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => onStatusFilterChange(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s || t('product.jobDetail.allStatuses', 'All')}
            <span className="ml-1 opacity-60">({statusCounts[s] || 0})</span>
          </button>
        ))}
      </div>

      {matches.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-600">{t('product.jobDetail.noApplicants', 'No applicants yet')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('product.jobDetail.noApplicantsDesc', 'Run AI matching from Smart Matching or apply candidates from Talent Hub.')}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link to="/product/matching" className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
              {t('product.jobDetail.goToMatching', 'Smart Matching')}
            </Link>
            <Link to="/product/talent" className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              {t('product.jobDetail.goToTalent', 'Talent Hub')}
            </Link>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {matches.map((m) => (
          <div key={m.id}>
            <div className={`rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4 hover:border-slate-300 transition-colors ${inviteLinks[m.id] ? 'rounded-b-none border-b-0' : ''}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                {m.resume.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={`/product/talent/${m.resumeId}`} className="text-sm font-semibold text-slate-900 hover:text-blue-600 truncate">{m.resume.name}</Link>
                  {m.grade && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[m.grade] || 'bg-slate-100 text-slate-600'}`}>{m.grade}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_STATUS_COLORS[m.status] || MATCH_STATUS_COLORS.new}`}>{m.status}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  {m.resume.currentRole && <span>{m.resume.currentRole}</span>}
                  {m.resume.email && <span>{m.resume.email}</span>}
                </div>
              </div>
              <div className="text-center shrink-0">
                <p className={`text-2xl font-bold ${
                  (m.score ?? 0) >= 80 ? 'text-emerald-600' :
                  (m.score ?? 0) >= 60 ? 'text-blue-600' :
                  (m.score ?? 0) >= 40 ? 'text-amber-600' : 'text-red-600'
                }`}>{m.score ?? '—'}</p>
                <p className="text-xs text-slate-400">{t('product.jobDetail.score', 'score')}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(m.score ?? 0) >= 60 && m.status !== 'invited' && m.status !== 'applied' && inviteStatus[m.id] !== 'sending' && inviteStatus[m.id] !== 'sent' && (
                  <button
                    onClick={() => onInvite(m)}
                    title={t('product.jobDetail.inviteInterview', 'Invite to Interview')}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    {t('product.jobDetail.inviteInterview', 'Invite')}
                  </button>
                )}
                {inviteStatus[m.id] === 'sending' && (
                  <span className="flex items-center gap-1.5 text-xs text-purple-600 px-2">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-purple-600" />
                    {t('product.jobDetail.inviteSending', 'Sending...')}
                  </span>
                )}
                {inviteStatus[m.id] === 'sent' && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 px-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    {t('product.jobDetail.inviteSent', 'Invited')}
                  </span>
                )}
                {inviteStatus[m.id] === 'error' && (
                  <button onClick={() => onInvite(m)} className="text-xs text-red-600 hover:text-red-700 px-2">{t('product.jobDetail.inviteRetry', 'Retry')}</button>
                )}
                {m.status !== 'shortlisted' && m.status !== 'applied' && (
                  <button onClick={() => onStatusUpdate(m.id, 'shortlisted')} title={t('product.jobDetail.shortlist', 'Shortlist')} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  </button>
                )}
                {m.status !== 'rejected' && (
                  <button onClick={() => onStatusUpdate(m.id, 'rejected')} title={t('product.jobDetail.reject', 'Reject')} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <button onClick={() => onViewDetail(m)} title={t('product.jobDetail.viewDetails', 'View Details')} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>
            {inviteLinks[m.id] && (
              <div className="rounded-b-2xl border border-t-0 border-slate-200 bg-purple-50/50 px-4 py-2 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.49 8.81" />
                </svg>
                <a href={inviteLinks[m.id]} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-700 hover:text-purple-800 truncate underline underline-offset-2">{inviteLinks[m.id]}</a>
                <button onClick={() => navigator.clipboard.writeText(inviteLinks[m.id])} className="shrink-0 text-xs text-purple-600 hover:text-purple-700 font-medium">
                  {t('product.jobDetail.copyLink', 'Copy')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Overview Tab
 * ─────────────────────────────────────────────────────────────────────────── */
function OverviewTab({ matches, loading, t }: { matches: MatchResult[]; loading: boolean; t: any }) {
  const stats = useMemo(() => {
    if (matches.length === 0) return null;
    const statusCounts: Record<string, number> = {};
    const gradeCounts: Record<string, number> = {};
    const scoreRanges = [0, 0, 0, 0];
    let totalScore = 0;
    let scoredCount = 0;
    let topGrade = '';
    const gradeOrder = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];
    for (const m of matches) {
      statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
      if (m.grade) {
        gradeCounts[m.grade] = (gradeCounts[m.grade] || 0) + 1;
        if (!topGrade || gradeOrder.indexOf(m.grade) < gradeOrder.indexOf(topGrade)) topGrade = m.grade;
      }
      if (m.score !== null) {
        totalScore += m.score;
        scoredCount++;
        if (m.score >= 80) scoreRanges[0]++;
        else if (m.score >= 60) scoreRanges[1]++;
        else if (m.score >= 40) scoreRanges[2]++;
        else scoreRanges[3]++;
      }
    }
    return { total: matches.length, avgScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null, topGrade, statusCounts, gradeCounts, scoreRanges, gradeOrder: gradeOrder.filter((g) => gradeCounts[g]) };
  }, [matches]);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" /></div>;
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-600">{t('product.jobDetail.noStatsYet', 'No statistics available yet')}</p>
      </div>
    );
  }

  const pipelineStatuses = [
    { key: 'new', label: 'New', color: 'border-slate-300 bg-slate-50', text: 'text-slate-700' },
    { key: 'reviewed', label: 'Reviewed', color: 'border-blue-200 bg-blue-50', text: 'text-blue-700' },
    { key: 'shortlisted', label: 'Shortlisted', color: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700' },
    { key: 'applied', label: 'Applied', color: 'border-indigo-200 bg-indigo-50', text: 'text-indigo-700' },
    { key: 'rejected', label: 'Rejected', color: 'border-red-200 bg-red-50', text: 'text-red-700' },
    { key: 'invited', label: 'Invited', color: 'border-purple-200 bg-purple-50', text: 'text-purple-700' },
  ];

  const scoreRangeLabels = ['80–100', '60–79', '40–59', '0–39'];
  const scoreRangeColors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-red-500'];
  const maxRange = Math.max(...stats.scoreRanges, 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-500">{t('product.jobDetail.totalApplicants', 'Total Applicants')}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className={`text-3xl font-bold ${(stats.avgScore ?? 0) >= 80 ? 'text-emerald-600' : (stats.avgScore ?? 0) >= 60 ? 'text-blue-600' : (stats.avgScore ?? 0) >= 40 ? 'text-amber-600' : 'text-slate-400'}`}>{stats.avgScore ?? '—'}</p>
          <p className="mt-1 text-xs text-slate-500">{t('product.jobDetail.avgScore', 'Average Score')}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          {stats.topGrade ? <span className={`inline-flex rounded-full px-3 py-1 text-lg font-bold ${GRADE_COLORS[stats.topGrade] || 'bg-slate-100 text-slate-600'}`}>{stats.topGrade}</span> : <p className="text-3xl font-bold text-slate-400">—</p>}
          <p className="mt-1 text-xs text-slate-500">{t('product.jobDetail.topGrade', 'Top Grade')}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.jobDetail.pipelineBreakdown', 'Pipeline Breakdown')}</h3>
        <div className="grid grid-cols-6 gap-3">
          {pipelineStatuses.map((s) => (
            <div key={s.key} className={`rounded-xl border p-4 text-center ${s.color}`}>
              <p className={`text-2xl font-bold ${s.text}`}>{stats.statusCounts[s.key] || 0}</p>
              <p className="mt-1 text-xs text-slate-500 capitalize">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.jobDetail.scoreDistribution', 'Score Distribution')}</h3>
        <div className="space-y-3">
          {scoreRangeLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-14 text-xs font-medium text-slate-500 text-right">{label}</span>
              <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${scoreRangeColors[i]}`} style={{ width: `${(stats.scoreRanges[i] / maxRange) * 100}%` }} />
              </div>
              <span className="w-8 text-xs font-semibold text-slate-700 text-right">{stats.scoreRanges[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {stats.gradeOrder.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.jobDetail.gradeDistribution', 'Grade Distribution')}</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {stats.gradeOrder.map((g) => (
              <div key={g} className="flex items-center gap-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_COLORS[g]}`}>{g}</span>
                <span className="text-sm font-semibold text-slate-700">{stats.gradeCounts[g]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
