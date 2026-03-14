import { useState, useEffect, useMemo, useCallback } from 'react';
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

const LANG_DISPLAY: Record<string, string> = {
  en: 'English',
  zh: '中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  de: 'Deutsch',
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
  rejected: 'bg-red-100 text-red-700',
  invited: 'bg-purple-100 text-purple-700',
};

const MATCH_STATUSES = ['', 'new', 'reviewed', 'shortlisted', 'rejected', 'invited'];

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('details');

  // Applicants state
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [detailMatch, setDetailMatch] = useState<MatchResult | null>(null);
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [confirmInvite, setConfirmInvite] = useState<MatchResult | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    axios.get(`/api/v1/jobs/${id}`)
      .then((res) => {
        if (res.data.success) {
          setJob(res.data.data);
        } else {
          setError(res.data.error || 'Failed to load job');
        }
      })
      .catch(() => setError('Failed to load job'))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchMatches = useCallback(async () => {
    if (!id || matchesLoaded) return;
    setLoadingMatches(true);
    try {
      const res = await axios.get(`/api/v1/matching/results/${id}`);
      if (res.data.success) {
        setMatches(res.data.data || []);
      }
    } catch {
      // silent
    } finally {
      setLoadingMatches(false);
      setMatchesLoaded(true);
    }
  }, [id, matchesLoaded]);

  // Fetch matches when switching to applicants or overview tab
  useEffect(() => {
    if (activeTab !== 'details' && !matchesLoaded) {
      fetchMatches();
    }
  }, [activeTab, matchesLoaded, fetchMatches]);

  const handleStatusUpdate = async (matchId: string, newStatus: string) => {
    try {
      await axios.patch(`/api/v1/matching/results/${matchId}`, { status: newStatus });
      setMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, status: newStatus } : m));
    } catch {
      // silent
    }
  };

  const handleInvite = (match: MatchResult) => {
    setConfirmInvite(match);
  };

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
        setInviteLinks((prev) => ({
          ...prev,
          [match.id]: `${window.location.origin}/interview-room?token=${accessToken}`,
        }));
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

  const salaryText = (job.salaryMin || job.salaryMax)
    ? `${job.salaryCurrency || 'USD'} ${job.salaryMin?.toLocaleString() || '—'} – ${job.salaryMax?.toLocaleString() || '—'} / ${job.salaryPeriod === 'yearly' ? t('product.jobDetail.yearly', 'year') : t('product.jobDetail.monthly', 'month')}`
    : null;

  const sectionCls = 'rounded-2xl border border-slate-200 bg-white p-6';
  const headingCls = 'text-sm font-semibold text-slate-800 mb-3';

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'details', label: t('product.jobDetail.tabDetails', 'Details') },
    { key: 'applicants', label: t('product.jobDetail.tabApplicants', 'Applicants'), count: matchesLoaded ? matches.length : undefined },
    { key: 'overview', label: t('product.jobDetail.tabOverview', 'Overview') },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/product/jobs" className="hover:text-blue-600 transition-colors">
          {t('product.jobDetail.backToJobs', 'Back to Jobs')}
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium truncate">{job.title}</span>
      </div>

      {/* Title + Status + Actions */}
      <HeaderCard job={job} locationText={locationText} salaryText={salaryText} navigate={navigate} t={t} />

      {/* Tab Bar */}
      <div className="flex items-center gap-6 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative pb-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-indigo-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                activeTab === tab.key ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
              }`}>
                {tab.count}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <DetailsTab job={job} sectionCls={sectionCls} headingCls={headingCls} t={t} />
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
                <span className="text-slate-400">{t('product.jobDetail.confirmInviteEmail', 'Email')}:</span>{' '}
                {confirmInvite.resume.email}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmInvite(null)}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={confirmAndInvite}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                {t('product.jobDetail.confirmInviteSend', 'Send Invitation')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Header Card
 * ─────────────────────────────────────────────────────────────────────────── */
function HeaderCard({ job, locationText, salaryText, navigate, t }: {
  job: Job; locationText: string | null; salaryText: string | null;
  navigate: (path: string, opts?: any) => void; t: any;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.draft}`}>
              {job.status}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-500 flex-wrap">
            {job.companyName && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                {job.companyName}
              </span>
            )}
            {job.department && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {job.department}
              </span>
            )}
            {locationText && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {locationText}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {job.workType && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 capitalize">{job.workType}</span>}
            {job.employmentType && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 capitalize">{job.employmentType}</span>}
            {job.experienceLevel && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 capitalize">{job.experienceLevel}</span>}
            {salaryText && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{salaryText}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/product/jobs', { state: { editId: job.id } })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            {t('product.jobDetail.edit', 'Edit')}
          </button>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-400">
        <span>{t('product.jobDetail.created', 'Created')}: {new Date(job.createdAt).toLocaleDateString()}</span>
        <span>{t('product.jobDetail.updated', 'Updated')}: {new Date(job.updatedAt).toLocaleDateString()}</span>
        {job.publishedAt && <span>{t('product.jobDetail.published', 'Published')}: {new Date(job.publishedAt).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Details Tab
 * ─────────────────────────────────────────────────────────────────────────── */
function DetailsTab({ job, sectionCls, headingCls, t }: { job: Job; sectionCls: string; headingCls: string; t: any }) {
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

  const renderContent = (text: string) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{text}</ReactMarkdown>
  );

  return (
    <div className="space-y-6">
      {job.hiringRequest && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.linkedRequest', 'Linked Hiring Request')}</h2>
          <Link to={`/product/hiring/${job.hiringRequest.id}`} className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            {job.hiringRequest.title}
          </Link>
          {job.hiringRequest.requirements && (
            <p className="mt-2 text-xs text-slate-500 line-clamp-3">{job.hiringRequest.requirements.slice(0, 300)}</p>
          )}
        </div>
      )}

      {job.description && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.description', 'Job Description')}</h2>
          {renderContent(job.description)}
        </div>
      )}

      {job.qualifications && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.qualifications', 'Qualifications')}</h2>
          {renderContent(job.qualifications)}
        </div>
      )}

      {job.hardRequirements && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.hardRequirements', 'Hard Requirements')}</h2>
          {renderContent(job.hardRequirements)}
        </div>
      )}

      {(job.interviewMode || job.interviewRequirements || job.evaluationRules) && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.interviewConfig', 'Interview Configuration')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{t('product.jobDetail.mode', 'Mode')}</p>
              <p className="text-sm font-medium text-slate-800 capitalize">{job.interviewMode || 'standard'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{t('product.jobDetail.passingScore', 'Passing Score')}</p>
              <p className="text-sm font-medium text-slate-800">{job.passingScore ?? 60}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{t('product.jobDetail.language', 'Language')}</p>
              <p className="text-sm font-medium text-slate-800">{LANG_DISPLAY[job.interviewLanguage || 'en'] || job.interviewLanguage || 'English'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{t('product.jobDetail.duration', 'Duration')}</p>
              <p className="text-sm font-medium text-slate-800">{job.interviewDuration || 30} min</p>
            </div>
          </div>
          {job.interviewRequirements && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-slate-600 mb-2">{t('product.jobDetail.interviewRequirements', 'Interview Requirements')}</h3>
              {renderContent(job.interviewRequirements)}
            </div>
          )}
          {job.evaluationRules && (
            <div>
              <h3 className="text-xs font-semibold text-slate-600 mb-2">{t('product.jobDetail.evaluationRules', 'Evaluation Rules')}</h3>
              {renderContent(job.evaluationRules)}
            </div>
          )}
        </div>
      )}
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
    for (const m of allMatches) {
      counts[m.status] = (counts[m.status] || 0) + 1;
    }
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
            {s !== '' && <span className="ml-1 opacity-60">({statusCounts[s] || 0})</span>}
            {s === '' && <span className="ml-1 opacity-60">({allMatches.length})</span>}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {matches.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-600">
            {t('product.jobDetail.noApplicants', 'No applicants yet')}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {t('product.jobDetail.noApplicantsDesc', 'Run AI matching from Smart Matching or apply candidates from Talent Hub.')}
          </p>
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

      {/* Match cards */}
      <div className="space-y-3">
        {matches.map((m) => (
          <div key={m.id}>
          <div className={`rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4 hover:border-slate-300 transition-colors ${inviteLinks[m.id] ? 'rounded-b-none border-b-0' : ''}`}>
            {/* Avatar */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
              {m.resume.name.charAt(0).toUpperCase()}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link to={`/product/talent/${m.resumeId}`} className="text-sm font-semibold text-slate-900 hover:text-blue-600 truncate">
                  {m.resume.name}
                </Link>
                {m.grade && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[m.grade] || 'bg-slate-100 text-slate-600'}`}>
                    {m.grade}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_STATUS_COLORS[m.status] || MATCH_STATUS_COLORS.new}`}>
                  {m.status}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                {m.resume.currentRole && <span>{m.resume.currentRole}</span>}
                {m.resume.email && <span>{m.resume.email}</span>}
              </div>
            </div>

            {/* Score */}
            <div className="text-center shrink-0">
              <p className={`text-2xl font-bold ${
                (m.score ?? 0) >= 80 ? 'text-emerald-600' :
                (m.score ?? 0) >= 60 ? 'text-blue-600' :
                (m.score ?? 0) >= 40 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {m.score ?? '—'}
              </p>
              <p className="text-xs text-slate-400">{t('product.jobDetail.score', 'score')}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Invite to Interview — score >= 60 and not already invited/sending */}
              {(m.score ?? 0) >= 60 && m.status !== 'invited' && inviteStatus[m.id] !== 'sending' && inviteStatus[m.id] !== 'sent' && (
                <button
                  onClick={() => onInvite(m)}
                  title={t('product.jobDetail.inviteInterview', 'Invite to Interview')}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  {t('product.jobDetail.inviteInterview', 'Invite to Interview')}
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
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {t('product.jobDetail.inviteSent', 'Invited')}
                </span>
              )}
              {inviteStatus[m.id] === 'error' && (
                <button
                  onClick={() => onInvite(m)}
                  className="text-xs text-red-600 hover:text-red-700 px-2"
                >
                  {t('product.jobDetail.inviteRetry', 'Retry')}
                </button>
              )}
              {m.status !== 'shortlisted' && (
                <button
                  onClick={() => onStatusUpdate(m.id, 'shortlisted')}
                  title={t('product.jobDetail.shortlist', 'Shortlist')}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </button>
              )}
              {m.status !== 'rejected' && (
                <button
                  onClick={() => onStatusUpdate(m.id, 'rejected')}
                  title={t('product.jobDetail.reject', 'Reject')}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => onViewDetail(m)}
                title={t('product.jobDetail.viewDetails', 'View Details')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Interview link row — shown after successful invite */}
          {inviteLinks[m.id] && (
            <div className="rounded-b-2xl border border-t-0 border-slate-200 bg-purple-50/50 px-4 py-2 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.49 8.81" />
              </svg>
              <a
                href={inviteLinks[m.id]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-700 hover:text-purple-800 truncate underline underline-offset-2"
              >
                {inviteLinks[m.id]}
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(inviteLinks[m.id])}
                className="shrink-0 text-xs text-purple-600 hover:text-purple-700 font-medium"
              >
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
    const scoreRanges = [0, 0, 0, 0]; // 80-100, 60-79, 40-59, 0-39
    let totalScore = 0;
    let scoredCount = 0;
    let topGrade = '';

    const gradeOrder = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];

    for (const m of matches) {
      statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
      if (m.grade) {
        gradeCounts[m.grade] = (gradeCounts[m.grade] || 0) + 1;
        if (!topGrade || gradeOrder.indexOf(m.grade) < gradeOrder.indexOf(topGrade)) {
          topGrade = m.grade;
        }
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

    return {
      total: matches.length,
      avgScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
      topGrade,
      statusCounts,
      gradeCounts,
      scoreRanges,
      gradeOrder: gradeOrder.filter((g) => gradeCounts[g]),
    };
  }, [matches]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-600">
          {t('product.jobDetail.noStatsYet', 'No statistics available yet')}
        </p>
      </div>
    );
  }

  const pipelineStatuses = [
    { key: 'new', label: 'New', color: 'border-slate-300 bg-slate-50', text: 'text-slate-700' },
    { key: 'reviewed', label: 'Reviewed', color: 'border-blue-200 bg-blue-50', text: 'text-blue-700' },
    { key: 'shortlisted', label: 'Shortlisted', color: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700' },
    { key: 'rejected', label: 'Rejected', color: 'border-red-200 bg-red-50', text: 'text-red-700' },
    { key: 'invited', label: 'Invited', color: 'border-purple-200 bg-purple-50', text: 'text-purple-700' },
  ];

  const scoreRangeLabels = ['80–100', '60–79', '40–59', '0–39'];
  const scoreRangeColors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-red-500'];
  const maxRange = Math.max(...stats.scoreRanges, 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-500">{t('product.jobDetail.totalApplicants', 'Total Applicants')}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className={`text-3xl font-bold ${
            (stats.avgScore ?? 0) >= 80 ? 'text-emerald-600' :
            (stats.avgScore ?? 0) >= 60 ? 'text-blue-600' :
            (stats.avgScore ?? 0) >= 40 ? 'text-amber-600' : 'text-slate-400'
          }`}>
            {stats.avgScore ?? '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{t('product.jobDetail.avgScore', 'Average Score')}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          {stats.topGrade ? (
            <span className={`inline-flex rounded-full px-3 py-1 text-lg font-bold ${GRADE_COLORS[stats.topGrade] || 'bg-slate-100 text-slate-600'}`}>
              {stats.topGrade}
            </span>
          ) : (
            <p className="text-3xl font-bold text-slate-400">—</p>
          )}
          <p className="mt-1 text-xs text-slate-500">{t('product.jobDetail.topGrade', 'Top Grade')}</p>
        </div>
      </div>

      {/* Pipeline breakdown */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.jobDetail.pipelineBreakdown', 'Pipeline Breakdown')}</h3>
        <div className="grid grid-cols-5 gap-3">
          {pipelineStatuses.map((s) => (
            <div key={s.key} className={`rounded-xl border p-4 text-center ${s.color}`}>
              <p className={`text-2xl font-bold ${s.text}`}>{stats.statusCounts[s.key] || 0}</p>
              <p className="mt-1 text-xs text-slate-500 capitalize">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Score distribution */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('product.jobDetail.scoreDistribution', 'Score Distribution')}</h3>
        <div className="space-y-3">
          {scoreRangeLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-14 text-xs font-medium text-slate-500 text-right">{label}</span>
              <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${scoreRangeColors[i]}`}
                  style={{ width: `${(stats.scoreRanges[i] / maxRange) * 100}%` }}
                />
              </div>
              <span className="w-8 text-xs font-semibold text-slate-700 text-right">{stats.scoreRanges[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grade distribution */}
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
