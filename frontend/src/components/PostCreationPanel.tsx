import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import axios from '../lib/axios';

interface PostCreationPanelProps {
  hiringRequestId: string;
}

export default function PostCreationPanel({ hiringRequestId }: PostCreationPanelProps) {
  const { t } = useTranslation();
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [matchState, setMatchState] = useState<'idle' | 'running' | 'done'>('idle');
  const [matchResult, setMatchResult] = useState<{ matched: number; total: number } | null>(null);
  const [intelState, setIntelState] = useState<'idle' | 'running' | 'done'>('idle');
  const [intelSummary, setIntelSummary] = useState<{
    difficultyScore: number;
    difficultyLevel: string;
    salaryRange: string;
    topPlatforms: string[];
  } | null>(null);

  useEffect(() => {
    const fetchResumeCount = async () => {
      try {
        const res = await axios.get('/api/v1/resumes', { params: { limit: 1 } });
        if (res.data.success) {
          setResumeCount(res.data.pagination?.total ?? 0);
        }
      } catch {
        setResumeCount(0);
      }
    };
    fetchResumeCount();
  }, []);

  const handleAutoMatch = async () => {
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
    <div className="space-y-4 pt-4 max-w-2xl mx-auto">
      {/* Cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Card 1: Smart Resume Match */}
        <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {t('hiring.postCreation.smartMatch')}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {t('hiring.postCreation.smartMatchDesc')}
          </p>

          {resumeCount === null ? (
            <div className="h-8 flex items-center">
              <div className="animate-pulse bg-slate-200 rounded h-4 w-24" />
            </div>
          ) : resumeCount === 0 ? (
            <div>
              <p className="text-xs text-slate-400 mb-2">
                {t('hiring.postCreation.smartMatchNoResumes')}
              </p>
              <Link
                to="/dashboard/resumes"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {t('hiring.postCreation.smartMatchNoResumesAction')} →
              </Link>
            </div>
          ) : matchState === 'idle' ? (
            <div>
              <p className="text-xs text-slate-600 mb-2">
                {t('hiring.postCreation.smartMatchHasResumes', { count: resumeCount })}
              </p>
              <button
                onClick={handleAutoMatch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {t('hiring.postCreation.smartMatchAction')}
              </button>
            </div>
          ) : matchState === 'running' ? (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-200 border-t-blue-600" />
              {t('hiring.postCreation.smartMatchRunning')}
            </div>
          ) : matchResult ? (
            <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t('hiring.postCreation.smartMatchDone', { matched: matchResult.matched, total: matchResult.total })}
            </div>
          ) : null}
        </div>

        {/* Card 2: Recruitment Intelligence */}
        <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
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
                to="/dashboard"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                {t('hiring.postCreation.viewFullReport')} →
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {/* Go to Dashboard */}
      <div className="flex justify-center">
        <Link
          to="/dashboard"
          className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-16px_rgba(37,99,235,0.85)]"
        >
          {t('hiring.postCreation.goToDashboard')}
        </Link>
      </div>
    </div>
  );
}
