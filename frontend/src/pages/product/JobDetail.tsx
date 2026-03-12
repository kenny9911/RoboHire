import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from '../../lib/axios';

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

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  open: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-red-100 text-red-700',
  filled: 'bg-blue-100 text-blue-700',
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {text}
    </ReactMarkdown>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/product/jobs" className="hover:text-blue-600 transition-colors">
          {t('product.jobDetail.backToJobs', 'Back to Jobs')}
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium truncate">{job.title}</span>
      </div>

      {/* Title + Status + Actions */}
      <div className={sectionCls}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[job.status] || STATUS_COLORS.draft}`}>
                {job.status}
              </span>
            </div>

            {/* Meta row */}
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

            {/* Tags row */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {job.workType && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 capitalize">{job.workType}</span>
              )}
              {job.employmentType && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 capitalize">{job.employmentType}</span>
              )}
              {job.experienceLevel && (
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 capitalize">{job.experienceLevel}</span>
              )}
              {salaryText && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{salaryText}</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
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

        {/* Dates */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-400">
          <span>{t('product.jobDetail.created', 'Created')}: {new Date(job.createdAt).toLocaleDateString()}</span>
          <span>{t('product.jobDetail.updated', 'Updated')}: {new Date(job.updatedAt).toLocaleDateString()}</span>
          {job.publishedAt && <span>{t('product.jobDetail.published', 'Published')}: {new Date(job.publishedAt).toLocaleDateString()}</span>}
        </div>
      </div>

      {/* Linked Hiring Request */}
      {job.hiringRequest && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.linkedRequest', 'Linked Hiring Request')}</h2>
          <Link
            to={`/product/hiring/${job.hiringRequest.id}`}
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            {job.hiringRequest.title}
          </Link>
          {job.hiringRequest.requirements && (
            <p className="mt-2 text-xs text-slate-500 line-clamp-3">{job.hiringRequest.requirements.slice(0, 300)}</p>
          )}
        </div>
      )}

      {/* Description */}
      {job.description && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.description', 'Job Description')}</h2>
          {renderContent(job.description)}
        </div>
      )}

      {/* Qualifications */}
      {job.qualifications && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.qualifications', 'Qualifications')}</h2>
          {renderContent(job.qualifications)}
        </div>
      )}

      {/* Hard Requirements */}
      {job.hardRequirements && (
        <div className={sectionCls}>
          <h2 className={headingCls}>{t('product.jobDetail.hardRequirements', 'Hard Requirements')}</h2>
          {renderContent(job.hardRequirements)}
        </div>
      )}

      {/* Interview Configuration */}
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
