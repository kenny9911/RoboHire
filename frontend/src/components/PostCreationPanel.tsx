import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import axios from '../lib/axios';
import { normalizeInterviewLanguage } from '../utils/interviewLanguage';

interface PostCreationPanelProps {
  hiringRequestId: string;
}

interface LinkedJob {
  id: string;
  title: string;
  status: string;
}

export default function PostCreationPanel({ hiringRequestId }: PostCreationPanelProps) {
  const { t, i18n } = useTranslation();
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [matchState, setMatchState] = useState<'idle' | 'running' | 'done'>('idle');
  const [matchResult, setMatchResult] = useState<{ matched: number; total: number } | null>(null);
  const [intelState, setIntelState] = useState<'idle' | 'running' | 'done'>('idle');
  const [jobState, setJobState] = useState<'loading' | 'missing' | 'creating' | 'ready'>('loading');
  const [linkedJob, setLinkedJob] = useState<LinkedJob | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [intelSummary, setIntelSummary] = useState<{
    difficultyScore: number;
    difficultyLevel: string;
    salaryRange: string;
    topPlatforms: string[];
  } | null>(null);

  useEffect(() => {
    const fetchPanelState = async () => {
      try {
        const [resumeRes, jobsRes] = await Promise.all([
          axios.get('/api/v1/resumes', { params: { limit: 1 } }),
          axios.get('/api/v1/jobs', { params: { hiringRequestId, limit: 1 } }),
        ]);

        if (resumeRes.data.success) {
          setResumeCount(resumeRes.data.pagination?.total ?? 0);
        }

        if (jobsRes.data.success && Array.isArray(jobsRes.data.data) && jobsRes.data.data.length > 0) {
          setLinkedJob(jobsRes.data.data[0]);
          setJobState('ready');
        } else {
          setLinkedJob(null);
          setJobState('missing');
        }
      } catch {
        setResumeCount(0);
        setLinkedJob(null);
        setJobState('missing');
      }
    };
    fetchPanelState();
  }, [hiringRequestId]);

  const handleCreateJob = async () => {
    setJobState('creating');
    setJobError(null);
    try {
      const res = await axios.post(`/api/v1/jobs/from-request/${hiringRequestId}`, {
        preferredLanguage: normalizeInterviewLanguage(i18n.language),
      });
      if (res.data.success && res.data.data) {
        setLinkedJob(res.data.data);
        setJobState('ready');
      } else {
        setJobState('missing');
        setJobError(t('hiring.postCreation.createJobError', 'Unable to create a job right now. Please try again.'));
      }
    } catch {
      setJobState('missing');
      setJobError(t('hiring.postCreation.createJobError', 'Unable to create a job right now. Please try again.'));
    }
  };

  const handleAutoMatch = async () => {
    if (!linkedJob) return;
    setMatchState('running');
    try {
      const res = await axios.post(`/api/v1/hiring-requests/${hiringRequestId}/auto-match`, {});
      if (res.data.success) {
        setMatchResult({
          matched: res.data.data.matched,
          total: res.data.data.total,
        });
        setMatchState('done');
      }
    } catch {
      setMatchState('idle');
    }
  };

  const handleGenerateIntel = async () => {
    setIntelState('running');
    try {
      const res = await axios.post(`/api/v1/hiring-requests/${hiringRequestId}/intelligence`, {});
      if (res.data.success && res.data.data) {
        const report = res.data.data;
        const salary = report.marketIntelligence?.salaryRanges?.[0];
        setIntelSummary({
          difficultyScore: report.marketIntelligence?.recruitmentDifficulty?.score ?? 0,
          difficultyLevel: report.marketIntelligence?.recruitmentDifficulty?.level ?? '',
          salaryRange: salary ? `${salary.rangeLow} – ${salary.rangeHigh} ${salary.currency}` : '',
          topPlatforms: (report.sourcingStrategy?.platforms ?? [])
            .filter((p: { effectiveness: string }) => p.effectiveness === 'High')
            .slice(0, 2)
            .map((p: { platform: string }) => p.platform),
        });
        setIntelState('done');
      }
    } catch {
      setIntelState('idle');
    }
  };

  return (
    <div className="space-y-4 pt-4 max-w-5xl mx-auto">
      {/* Cards row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {/* Card 1: Create Job */}
        <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {t('hiring.postCreation.createJobTitle', 'Create Job')}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {t('hiring.postCreation.createJobDesc', 'Create a job from this hiring request before matching candidates or sending interview invitations.')}
          </p>

          <div className="mt-auto">
          {jobState === 'loading' ? (
            <div className="h-8 flex items-center">
              <div className="animate-pulse bg-slate-200 rounded h-4 w-24" />
            </div>
          ) : jobState === 'ready' && linkedJob ? (
            <div>
              <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium mb-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('hiring.postCreation.createJobDone', 'Job ready for matching')}
              </div>
              <p className="text-xs text-slate-600 mb-2 line-clamp-2">
                {linkedJob.title}
              </p>
              <Link
                to={`/product/jobs/${linkedJob.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {t('hiring.postCreation.openJobAction', 'Open job')} →
              </Link>
            </div>
          ) : jobState === 'creating' ? (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-200 border-t-blue-600" />
              {t('hiring.postCreation.createJobCreating', 'Creating job...')}
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-600 mb-2">
                {t('hiring.postCreation.createJobHint', 'This request is saved, but matching stays locked until a job is created.')}
              </p>
              <button
                onClick={handleCreateJob}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {t('hiring.postCreation.createJobAction', 'Create job now')}
              </button>
              {jobError && (
                <p className="mt-2 text-[11px] text-rose-600">{jobError}</p>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Card 2: Smart Resume Match */}
        <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {t('hiring.postCreation.smartMatch', 'Smart Match')}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {t('hiring.postCreation.smartMatchDesc', 'Run AI matching after the job is ready so downstream interview invitations use the correct job configuration.')}
          </p>

          <div className="mt-auto">
            {!linkedJob ? (
              <div>
                <p className="text-xs text-slate-400 mb-2">
                  {t('hiring.postCreation.smartMatchNeedsJob', 'Create a job first to unlock matching and interview invitations.')}
                </p>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 cursor-not-allowed"
                >
                  {t('hiring.postCreation.smartMatchLocked', 'Locked until job is created')}
                </button>
              </div>
            ) : resumeCount === null ? (
              <div className="h-8 flex items-center">
                <div className="animate-pulse bg-slate-200 rounded h-4 w-24" />
              </div>
            ) : resumeCount === 0 ? (
              <div>
                <p className="text-xs text-slate-400 mb-2">
                  {t('hiring.postCreation.smartMatchNoResumes', 'No resumes found yet. Upload resumes to start matching.')}
                </p>
                <Link
                  to="/product/talent"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  {t('hiring.postCreation.smartMatchNoResumesAction', 'Go to talent hub')} →
                </Link>
              </div>
            ) : matchState === 'idle' ? (
              <div>
                <p className="text-xs text-slate-600 mb-2">
                  {t('hiring.postCreation.smartMatchHasResumes', 'Your talent hub has {{count}} resumes ready for matching.', { count: resumeCount })}
                </p>
                <button
                  onClick={handleAutoMatch}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 transition-colors"
                >
                  {t('hiring.postCreation.smartMatchAction', 'Run smart match')}
                </button>
              </div>
            ) : matchState === 'running' ? (
              <div className="flex items-center gap-2 text-xs text-cyan-600">
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-cyan-200 border-t-cyan-600" />
                {t('hiring.postCreation.smartMatchRunning', 'Matching candidates...')}
              </div>
            ) : matchResult ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('hiring.postCreation.smartMatchDone', '{{matched}} of {{total}} resumes matched', { matched: matchResult.matched, total: matchResult.total })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Card 3: Recruitment Intelligence */}
        <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {t('hiring.postCreation.intelReport')}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {t('hiring.postCreation.intelReportDesc')}
          </p>

          <div className="mt-auto">
          {intelState === 'idle' ? (
            <button
              onClick={handleGenerateIntel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {t('hiring.postCreation.intelReportAction')}
            </button>
          ) : intelState === 'running' ? (
            <div className="flex items-center gap-2 text-xs text-indigo-600">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-200 border-t-indigo-600" />
              {t('hiring.postCreation.intelReportGenerating')}
            </div>
          ) : intelSummary ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('hiring.postCreation.intelReportDone')}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {intelSummary.difficultyScore > 0 && (
                  <div className="bg-slate-50 rounded-lg p-2">
                    <span className="text-slate-400 block">{t('dashboard.intelligence.difficulty')}</span>
                    <span className="font-semibold text-slate-700">{intelSummary.difficultyScore}/10 {intelSummary.difficultyLevel}</span>
                  </div>
                )}
                {intelSummary.salaryRange && (
                  <div className="bg-slate-50 rounded-lg p-2">
                    <span className="text-slate-400 block">{t('dashboard.intelligence.salaryRanges')}</span>
                    <span className="font-semibold text-slate-700">{intelSummary.salaryRange}</span>
                  </div>
                )}
              </div>
              {intelSummary.topPlatforms.length > 0 && (
                <div className="text-[11px] text-slate-500">
                  {t('dashboard.intelligence.platforms')}: {intelSummary.topPlatforms.join(', ')}
                </div>
              )}
              <Link
                to={`/product/hiring/${hiringRequestId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                {t('hiring.postCreation.viewFullReport')} →
              </Link>
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {/* Go to Hiring Request */}
      <div className="flex justify-center gap-3 flex-wrap">
        {linkedJob && (
          <Link
            to={`/product/jobs/${linkedJob.id}`}
            className="rounded-full border border-slate-200 bg-white px-6 py-3 font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_24px_-16px_rgba(15,23,42,0.2)]"
          >
            {t('hiring.postCreation.openJobPrimary', 'Open Job')}
          </Link>
        )}
        <Link
          to={`/product/hiring/${hiringRequestId}`}
          className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-16px_rgba(37,99,235,0.85)]"
        >
          {t('hiring.postCreation.viewReport', 'View Hiring Project')}
        </Link>
      </div>
    </div>
  );
}
