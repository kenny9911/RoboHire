import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../../context/AuthContext';
import axios from '../../lib/axios';
import MatchDetailModal from '../../components/MatchDetailModal';
import { getPreferredResumeEmail } from '../../utils/resumeContact';
import {
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
    preferences?: {
      email?: string | null;
    } | null;
    currentRole: string | null;
    experienceYears: string | null;
    tags: string[];
  };
}

type TabKey = 'details' | 'applicants' | 'overview';

type SectionKey = 'description' | 'qualifications' | 'hardRequirements' | 'niceToHave' | 'benefits' | 'interviewRequirements' | 'evaluationRules';

// Sidebar sections — description+qualifications merged; qualifications hidden
const VISIBLE_SECTIONS: SectionKey[] = ['description', 'hardRequirements', 'niceToHave', 'benefits', 'interviewRequirements', 'evaluationRules'];

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
  { key: 'niceToHave', icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z' },
  { key: 'benefits', icon: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z' },
  { key: 'interviewRequirements', icon: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155' },
  { key: 'evaluationRules', icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605' },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  description: 'Job Description',
  qualifications: 'Qualifications',
  hardRequirements: 'Hard Requirements',
  niceToHave: 'Nice to Have',
  benefits: 'Benefits',
  interviewRequirements: 'Interview Requirements',
  evaluationRules: 'Evaluation Rules',
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Inline editing state
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null);
  const [editText, setEditText] = useState('');
  const [editingSubKey, setEditingSubKey] = useState<string | null>(null);
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

  // Basic info editing state
  const [editingBasicInfo, setEditingBasicInfo] = useState(false);
  const [basicInfoDraft, setBasicInfoDraft] = useState<Partial<Job>>({});

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
      const candidateEmail = getPreferredResumeEmail(resumeRes.data.data);
      const inviteRes = await axios.post('/api/v1/invite-candidate', {
        resume: resumeText,
        jd: job.description || job.title,
        candidate_email: candidateEmail || undefined,
        recruiter_email: user?.email || undefined,
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

  const salaryDisplay = job.salaryText
    ? job.salaryText
    : (job.salaryMin === 0 && job.salaryMax === 0)
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

      {/* Header — Title + Status + Badges */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {editingBasicInfo ? (
                <input
                  value={basicInfoDraft.title ?? ''}
                  onChange={(e) => setBasicInfoDraft((d) => ({ ...d, title: e.target.value }))}
                  className="text-2xl font-bold text-slate-900 bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none w-full pb-0.5"
                />
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.draft}`}>
                    {t(`product.jobs.status.${job.status}`, job.status)}
                  </span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {job.employmentType && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 capitalize">{job.employmentType}</span>}
                {job.experienceLevel && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 capitalize">{t(`product.jobDetail.exp${job.experienceLevel.charAt(0).toUpperCase() + job.experienceLevel.slice(1)}`, job.experienceLevel)}</span>}
                {salaryDisplay && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{salaryDisplay}</span>}
              </div>
            </div>
            {/* Save status + Edit button */}
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
      </div>

      {/* Basic Information Card */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">{t('product.jobDetail.basicInfo', 'Basic Information')}</h3>
          </div>
          {editingBasicInfo ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditingBasicInfo(false); setBasicInfoDraft({}); }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={async () => {
                  if (!job) return;
                  setSaveStatus('saving');
                  try {
                    const res = await axios.patch(`/api/v1/jobs/${job.id}`, basicInfoDraft);
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
                  setEditingBasicInfo(false);
                  setBasicInfoDraft({});
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                {t('product.jobDetail.saveSection', 'Save')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditingBasicInfo(true);
                setBasicInfoDraft({
                  title: job.title,
                  companyName: job.companyName,
                  department: job.department,
                  location: job.location,
                  workType: job.workType,
                  employmentType: job.employmentType,
                  experienceLevel: job.experienceLevel,
                  education: job.education,
                  headcount: job.headcount,
                  salaryText: job.salaryText,
                  notes: job.notes,
                  interviewLanguage: job.interviewLanguage,
                  interviewDuration: job.interviewDuration,
                  passingScore: job.passingScore,
                });
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
              {t('product.jobDetail.edit', 'Edit')}
            </button>
          )}
        </div>
        <div className="px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {/* Company */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />}
              iconBg="bg-blue-50" iconColor="text-blue-500"
              label={t('product.jobDetail.company', 'Company')}
              value={job.companyName}
              editing={editingBasicInfo}
              editValue={basicInfoDraft.companyName ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, companyName: v }))}
            />
            {/* Department */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />}
              iconBg="bg-violet-50" iconColor="text-violet-500"
              label={t('product.jobDetail.department', 'Department')}
              value={job.department}
              editing={editingBasicInfo}
              editValue={basicInfoDraft.department ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, department: v }))}
            />
            {/* Experience Level */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />}
              iconBg="bg-teal-50" iconColor="text-teal-500"
              label={t('product.jobDetail.experienceLevel', 'Experience Level')}
              value={job.experienceLevel}
              editing={editingBasicInfo}
              editType="select"
              selectOptions={[
                { value: '', label: '—' },
                { value: 'intern', label: t('product.jobDetail.expIntern', 'Intern') },
                { value: 'entry', label: t('product.jobDetail.expEntry', 'Entry') },
                { value: 'mid', label: t('product.jobDetail.expMid', 'Mid') },
                { value: 'senior', label: t('product.jobDetail.expSenior', 'Senior') },
                { value: 'lead', label: t('product.jobDetail.expLead', 'Lead') },
                { value: 'executive', label: t('product.jobDetail.expExecutive', 'Executive') },
              ]}
              editValue={basicInfoDraft.experienceLevel ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, experienceLevel: v || null }))}
            />
            {/* Education */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />}
              iconBg="bg-purple-50" iconColor="text-purple-500"
              label={t('product.jobDetail.education', 'Education')}
              value={job.education}
              editing={editingBasicInfo}
              editType="select"
              selectOptions={[
                { value: '', label: '—' },
                { value: 'none', label: t('product.jobDetail.eduNone', 'No Requirement') },
                { value: 'high_school', label: t('product.jobDetail.eduHighSchool', 'High School') },
                { value: 'associate', label: t('product.jobDetail.eduAssociate', 'Associate') },
                { value: 'bachelor', label: t('product.jobDetail.eduBachelor', 'Bachelor') },
                { value: 'master', label: t('product.jobDetail.eduMaster', 'Master') },
                { value: 'phd', label: t('product.jobDetail.eduPhd', 'PhD') },
              ]}
              editValue={basicInfoDraft.education ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, education: v || null }))}
            />
            {/* Location */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />}
              iconBg="bg-orange-50" iconColor="text-orange-500"
              label={t('product.jobDetail.location', 'Location')}
              value={locationText}
              editing={editingBasicInfo}
              editValue={basicInfoDraft.location ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, location: v }))}
            />
            {/* Headcount */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />}
              iconBg="bg-sky-50" iconColor="text-sky-500"
              label={t('product.jobDetail.headcount', 'Headcount')}
              value={`${job.headcount || 1}`}
              editing={editingBasicInfo}
              editType="number"
              editValue={`${basicInfoDraft.headcount ?? 1}`}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, headcount: Math.max(1, parseInt(v) || 1) }))}
            />
            {/* Work Type */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />}
              iconBg="bg-slate-100" iconColor="text-slate-500"
              label={t('product.jobDetail.workType', 'Work Type')}
              value={job.workType}
              editing={editingBasicInfo}
              editType="select"
              selectOptions={[
                { value: '', label: '—' },
                { value: 'onsite', label: t('product.jobDetail.wtOnsite', 'Onsite') },
                { value: 'remote', label: t('product.jobDetail.wtRemote', 'Remote') },
                { value: 'hybrid', label: t('product.jobDetail.wtHybrid', 'Hybrid') },
              ]}
              editValue={basicInfoDraft.workType ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, workType: v || null }))}
            />
            {/* Employment Type */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />}
              iconBg="bg-rose-50" iconColor="text-rose-500"
              label={t('product.jobDetail.employmentType', 'Employment Type')}
              value={job.employmentType}
              editing={editingBasicInfo}
              editType="select"
              selectOptions={[
                { value: '', label: '—' },
                { value: 'full-time', label: t('product.jobDetail.etFullTime', 'Full-time') },
                { value: 'part-time', label: t('product.jobDetail.etPartTime', 'Part-time') },
                { value: 'contract', label: t('product.jobDetail.etContract', 'Contract') },
                { value: 'internship', label: t('product.jobDetail.etInternship', 'Internship') },
              ]}
              editValue={basicInfoDraft.employmentType ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, employmentType: v || null }))}
            />
            {/* Interview Duration */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />}
              iconBg="bg-green-50" iconColor="text-green-500"
              label={t('product.jobDetail.interviewDuration', 'Interview Duration')}
              value={job.interviewDuration ? `${job.interviewDuration} ${t('product.jobDetail.minutes', 'min')}` : null}
              editing={editingBasicInfo}
              editType="number"
              editValue={`${basicInfoDraft.interviewDuration ?? ''}`}
              onEditChange={(v) => {
                if (v === '') {
                  setBasicInfoDraft((d) => ({ ...d, interviewDuration: undefined }));
                  return;
                }
                let val = parseInt(v, 10);
                if (isNaN(val)) return;
                if (val > 45) val = 45;
                setBasicInfoDraft((d) => ({ ...d, interviewDuration: val }));
              }}
            />
            {/* Interview Language */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />}
              iconBg="bg-indigo-50" iconColor="text-indigo-500"
              label={t('product.jobDetail.interviewLang', 'Interview Language')}
              value={getInterviewLanguageDisplay(job.interviewLanguage)}
              editing={editingBasicInfo}
              editType="select"
              selectOptions={INTERVIEW_LANGUAGE_OPTIONS}
              editValue={normalizeInterviewLanguage(basicInfoDraft.interviewLanguage ?? job.interviewLanguage)}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, interviewLanguage: v }))}
            />
            {/* Passing Score */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
              iconBg="bg-amber-50" iconColor="text-amber-500"
              label={t('product.jobDetail.passingScore', 'Passing Score')}
              value={job.passingScore != null ? `${job.passingScore}` : null}
              editing={editingBasicInfo}
              editType="number"
              editValue={`${basicInfoDraft.passingScore ?? 60}`}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, passingScore: Math.min(100, Math.max(0, parseInt(v) || 60)) }))}
            />
            {/* Salary */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
              iconBg="bg-emerald-50" iconColor="text-emerald-500"
              label={t('product.jobDetail.salary', 'Salary')}
              value={salaryDisplay}
              editing={editingBasicInfo}
              editValue={basicInfoDraft.salaryText ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, salaryText: v || null }))}
            />
            {/* Notes */}
            <BasicInfoField
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />}
              iconBg="bg-yellow-50" iconColor="text-yellow-600"
              label={t('product.jobs.notes', 'Notes')}
              value={job.notes}
              editing={editingBasicInfo}
              editValue={basicInfoDraft.notes ?? ''}
              onEditChange={(v) => setBasicInfoDraft((d) => ({ ...d, notes: v || null }))}
            />
          </div>
        </div>
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
              {VISIBLE_SECTIONS.map((key) => {
                const sectionDef = SECTIONS.find(s => s.key === key);
                if (!sectionDef) return null;
                const hasContent = key === 'description' ? !!(job.description || job.qualifications) : !!job[key];
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
                      <path strokeLinecap="round" strokeLinejoin="round" d={sectionDef.icon} />
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
                    <span className="text-slate-700 font-medium">{getInterviewLanguageDisplay(job.interviewLanguage)}</span>
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
            {/* Description + Qualifications — merged with per-sub-section editing */}
            <div ref={(el) => { sectionRefs.current.description = el; }}>
              <DescriptionSections
                job={job}
                editingSubKey={editingSubKey}
                onEditSubSection={(subKey, text) => {
                  setEditingSection('description');
                  setEditText(text);
                  setEditingSubKey(subKey);
                }}
                onCancelEdit={() => { cancelEditing(); setEditingSubKey(null); }}
                onSaveSubSection={async (fullDescription) => {
                  setEditingSubKey(null);
                  setEditingSection(null);
                  setEditText('');
                  // Save combined text to description and clear qualifications to avoid duplication
                  if (!job) return;
                  setSaveStatus('saving');
                  try {
                    const res = await axios.patch(`/api/v1/jobs/${job.id}`, {
                      description: fullDescription,
                      qualifications: '',
                    });
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
                }}
                onAiRefine={(subSectionTitle, subSectionContent) => {
                  // Use description section AI refine with targeted instructions
                  setAiRefineSection('description');
                  setAiInstructions(subSectionContent
                    ? `Only refine and improve the "${subSectionTitle}" section. Keep all other sections unchanged.`
                    : `Generate content for the "${subSectionTitle}" section.`
                  );
                }}
                editText={editText}
                onEditTextChange={setEditText}
                t={t}
              />
            </div>

            {/* Other sections (hardRequirements, interviewRequirements, evaluationRules) */}
            {VISIBLE_SECTIONS.filter(k => k !== 'description').map((key) => (
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
                    <button
                      onClick={() => openAiRefine(key)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                      </svg>
                      {job[key] ? t('product.jobDetail.aiRefine', 'AI Refine') : t('product.jobDetail.aiGenerate', 'AI Generate')}
                    </button>
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
                      <AutoGrowTextarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full min-h-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y placeholder:text-slate-400"
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
            {getPreferredResumeEmail(confirmInvite.resume) && (
              <p className="mt-1.5 text-sm text-slate-600">
                <span className="text-slate-400">{t('product.jobDetail.confirmInviteEmail', 'Email')}:</span> {getPreferredResumeEmail(confirmInvite.resume)}
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
 *  BasicInfoField — single field in the basic info grid
 * ─────────────────────────────────────────────────────────────────────────── */

function BasicInfoField({ icon, iconBg, iconColor, label, value, editing, editValue, onEditChange, editType, selectOptions }: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | null | undefined;
  editing: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  editType?: 'text' | 'select' | 'number';
  selectOptions?: { value: string; label: string }[];
}) {
  const displayValue = (selectOptions && value ? selectOptions.find((o) => o.value === value)?.label : value) || '—';

  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <svg className={`w-5 h-5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          {icon}
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        {editing ? (
          editType === 'select' && selectOptions ? (
            <select
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              className="w-full text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {selectOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type={editType === 'number' ? 'number' : 'text'}
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              min={editType === 'number' ? '1' : undefined}
              className="w-full text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          )
        ) : (
          <p className="text-sm font-semibold text-slate-800 capitalize truncate">{displayValue}</p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Formatted Job Description — splits description into structured sections
 * ─────────────────────────────────────────────────────────────────────────── */

const JD_SECTION_DEFS: { key: string; patterns: RegExp; icon: string; color: string; bgColor: string; borderColor: string }[] = [
  {
    key: 'overview',
    patterns: /^(?:#{1,3}\s*)?(?:职位概览|职位概述|Job\s*Overview|Overview|Position\s*Overview|About\s*(?:the\s*)?(?:Role|Position))/im,
    icon: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-100',
  },
  {
    key: 'compensation',
    patterns: /^(?:#{1,3}\s*)?(?:薪资待遇|薪酬福利|薪资|Compensation|Salary|Pay\s*(?:Range|Package))/im,
    icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-100',
  },
  {
    key: 'responsibilities',
    patterns: /^(?:#{1,3}\s*)?(?:岗位职责|工作职责|职责|Responsibilities|Key\s*Responsibilities|What\s*You.*(?:Do|Build)|Role\s*Responsibilities)/im,
    icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-100',
  },
  {
    key: 'requirements',
    patterns: /^(?:#{1,3}\s*)?(?:任职要求|岗位要求|任职资格|Requirements|Qualifications|What\s*We.*(?:Look|Need)|Must\s*Have|Required\s*Skills)/im,
    icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-100',
  },
];

interface JdSection {
  key: string;
  title: string;
  rawHeader: string; // Original header line including markdown prefix (e.g. "## 福利待遇")
  content: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

function parseJobDescriptionSections(text: string): JdSection[] | null {
  // Try to detect at least 2 section headers to confirm structured content
  let matchCount = 0;
  for (const def of JD_SECTION_DEFS) {
    if (def.patterns.test(text)) matchCount++;
  }
  if (matchCount < 2) return null; // Not structured enough, fall back to markdown

  const sections: JdSection[] = [];

  // Find all section positions
  const positions: { index: number; defIdx: number; title: string; rawHeader: string }[] = [];
  for (let i = 0; i < JD_SECTION_DEFS.length; i++) {
    const match = text.match(JD_SECTION_DEFS[i].patterns);
    if (match && match.index !== undefined) {
      positions.push({ index: match.index, defIdx: i, title: match[0].replace(/^#{1,3}\s*/, '').trim(), rawHeader: match[0] });
    }
  }

  // Sort by position in text
  positions.sort((a, b) => a.index - b.index);

  // Check for content before the first section (title/intro)
  if (positions.length > 0 && positions[0].index > 0) {
    const preamble = text.slice(0, positions[0].index).trim();
    if (preamble.length > 10) {
      sections.push({
        key: 'title',
        title: '',
        rawHeader: '',
        content: preamble,
        icon: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
        color: 'text-slate-700',
        bgColor: 'bg-slate-50',
        borderColor: 'border-slate-100',
      });
    }
  }

  // Extract each section's content
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const def = JD_SECTION_DEFS[pos.defIdx];
    const headerMatch = text.slice(pos.index).match(def.patterns)!;
    const contentStart = pos.index + headerMatch[0].length;
    const contentEnd = i + 1 < positions.length ? positions[i + 1].index : text.length;
    const content = text.slice(contentStart, contentEnd).trim();

    if (content) {
      sections.push({
        key: def.key,
        title: pos.title,
        rawHeader: pos.rawHeader,
        content,
        icon: def.icon,
        color: def.color,
        bgColor: def.bgColor,
        borderColor: def.borderColor,
      });
    }
  }

  return sections.length >= 2 ? sections : null;
}

function JdSectionContent({ content }: { content: string; sectionKey: string }) {
  return (
    <div className="prose-sm max-w-none">
      <MarkdownContent text={content} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Auto-growing textarea component
 * ─────────────────────────────────────────────────────────────────────────── */

function AutoGrowTextarea({ value, onChange, className }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      className={className}
      style={{ overflow: 'hidden' }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Description Sections — merged description+qualifications with per-section editing
 * ─────────────────────────────────────────────────────────────────────────── */

interface DescriptionSectionsProps {
  job: Job;
  editingSubKey: string | null;
  onEditSubSection: (subKey: string, text: string) => void;
  onCancelEdit: () => void;
  onSaveSubSection: (fullDescription: string) => void;
  onAiRefine: (subSectionTitle: string, subSectionContent: string) => void;
  editText: string;
  onEditTextChange: (text: string) => void;
  t: any;
}

function DescriptionSections({
  job, editingSubKey, onEditSubSection, onCancelEdit, onSaveSubSection,
  onAiRefine, editText, onEditTextChange, t,
}: DescriptionSectionsProps) {
  // Combine description + qualifications
  const combinedText = [job.description, job.qualifications].filter(Boolean).join('\n\n');

  const sections = useMemo(() => parseJobDescriptionSections(combinedText), [combinedText]);

  const handleSave = () => {
    if (!sections || !editingSubKey) return;
    // Reconstruct full text by replacing the edited section, preserving original headers
    const rebuilt = sections.map((s) => {
      if (s.key === editingSubKey) {
        return s.key === 'title' ? editText : `${s.rawHeader}\n${editText}`;
      }
      return s.key === 'title' ? s.content : `${s.rawHeader}\n${s.content}`;
    }).join('\n\n');
    onSaveSubSection(rebuilt);
  };

  // No structured content — show empty state with global AI generate
  if (!combinedText.trim()) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-semibold text-slate-800">
            {t('product.jobDetail.description', 'Job Description')}
          </h3>
          <button
            onClick={() => onAiRefine('', '')}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            {t('product.jobDetail.aiGenerate', 'AI Generate')}
          </button>
        </div>
        <div className="py-12 text-center">
          <svg className="mx-auto h-8 w-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="mt-2 text-sm text-slate-400">{t('product.jobDetail.noContent', 'No content yet')}</p>
          <button onClick={() => onAiRefine('', '')} className="mt-3 text-xs font-medium text-violet-600 hover:text-violet-700">
            {t('product.jobDetail.generateWithAi', 'Generate with AI')}
          </button>
        </div>
      </div>
    );
  }

  // Unstructured content — render as single block with standard edit
  if (!sections) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-semibold text-slate-800">
            {t('product.jobDetail.description', 'Job Description')}
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onAiRefine(t('product.jobDetail.description', 'Job Description'), combinedText)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {t('product.jobDetail.aiRefine', 'AI Refine')}
            </button>
            <button
              onClick={() => onEditSubSection('_full', combinedText)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
              </svg>
              {t('product.jobDetail.edit', 'Edit')}
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          {editingSubKey === '_full' ? (
            <div className="space-y-3">
              <AutoGrowTextarea
                value={editText}
                onChange={(e) => onEditTextChange(e.target.value)}
                className="w-full min-h-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y placeholder:text-slate-400"
              />
              <div className="flex justify-end gap-2">
                <button onClick={onCancelEdit} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                  {t('common.cancel', 'Cancel')}
                </button>
                <button onClick={() => onSaveSubSection(editText)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
                  {t('product.jobDetail.saveSection', 'Save')}
                </button>
              </div>
            </div>
          ) : (
            <div className="prose-sm">
              <MarkdownContent text={combinedText} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Structured content — render each sub-section with its own edit/AI buttons
  return (
    <div className="space-y-4">
      {sections.map((section, idx) => {
        const isEditing = editingSubKey === section.key;

        // Title/preamble block
        if (section.key === 'title') {
          return (
            <div key={section.key + idx} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <AutoGrowTextarea
                      value={editText}
                      onChange={(e) => onEditTextChange(e.target.value)}
                      className="w-full min-h-[80px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={onCancelEdit} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                        {t('common.cancel', 'Cancel')}
                      </button>
                      <button onClick={handleSave} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
                        {t('product.jobDetail.saveSection', 'Save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[15px] text-slate-800 leading-relaxed whitespace-pre-wrap flex-1">{section.content}</div>
                    <button
                      onClick={() => onEditSubSection(section.key, section.content)}
                      className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      title={t('product.jobDetail.edit', 'Edit')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // Regular sub-section with colored header
        return (
          <div key={section.key + idx} className={`rounded-xl border ${section.borderColor} overflow-hidden`}>
            {/* Sub-section header with edit + AI buttons */}
            <div className={`flex items-center justify-between px-4 py-2.5 ${section.bgColor}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg ${section.bgColor} flex items-center justify-center`}>
                  <svg className={`w-4 h-4 ${section.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
                  </svg>
                </div>
                <h4 className={`text-sm font-semibold ${section.color} tracking-wide`}>
                  {section.title}
                </h4>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onAiRefine(section.title, section.content)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-violet-700 bg-white/70 hover:bg-white transition-colors"
                  title={t('product.jobDetail.aiRefine', 'AI Refine')}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  {t('product.jobDetail.aiRefine', 'AI Refine')}
                </button>
                {!isEditing && (
                  <button
                    onClick={() => onEditSubSection(section.key, section.content)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 bg-white/70 hover:bg-white transition-colors"
                    title={t('product.jobDetail.edit', 'Edit')}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                    </svg>
                    {t('product.jobDetail.edit', 'Edit')}
                  </button>
                )}
              </div>
            </div>
            {/* Sub-section content or edit textarea */}
            <div className="px-5 py-4 bg-white">
              {isEditing ? (
                <div className="space-y-3">
                  <AutoGrowTextarea
                    value={editText}
                    onChange={(e) => onEditTextChange(e.target.value)}
                    className="w-full min-h-[120px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={onCancelEdit} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <button onClick={handleSave} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
                      {t('product.jobDetail.saveSection', 'Save')}
                    </button>
                  </div>
                </div>
              ) : (
                <JdSectionContent content={section.content} sectionKey={section.key} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
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
            {s ? t(`product.matchStatus.${s}`, s) : t('product.jobDetail.allStatuses', 'All')}
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
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_STATUS_COLORS[m.status] || MATCH_STATUS_COLORS.new}`}>{t(`product.matchStatus.${m.status}`, m.status)}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  {m.resume.currentRole && <span>{m.resume.currentRole}</span>}
                  {getPreferredResumeEmail(m.resume) && <span>{getPreferredResumeEmail(m.resume)}</span>}
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
                  <button onClick={() => onStatusUpdate(m.id, 'shortlisted')} title={t('product.matching.shortlistTooltip', 'Add to shortlist for next-round review')} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    <span className="hidden sm:inline">{t('product.jobDetail.shortlist', 'Shortlist')}</span>
                  </button>
                )}
                {m.status !== 'rejected' && (
                  <button onClick={() => onStatusUpdate(m.id, 'rejected')} title={t('product.jobDetail.reject', 'Reject')} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    <span className="hidden sm:inline">{t('product.jobDetail.reject', 'Reject')}</span>
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
