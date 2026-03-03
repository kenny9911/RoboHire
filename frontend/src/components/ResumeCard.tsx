import { useTranslation } from 'react-i18next';

interface ResumeCardProps {
  resume: {
    id: string;
    name: string;
    currentRole: string | null;
    experienceYears: string | null;
    status?: string;
    tags: string[];
    createdAt: string;
    parsedData?: Record<string, unknown> | null;
    resumeJobFits?: Array<{
      fitScore: number | null;
      fitGrade: string | null;
      hiringRequest: { title: string };
    }>;
  };
  onClick: () => void;
  onRegenerateInsights?: () => void;
  onReanalyzeJobFit?: () => void;
  onReupload?: () => void;
  insightLoading?: boolean;
  jobFitLoading?: boolean;
}

export default function ResumeCard({
  resume,
  onClick,
  onRegenerateInsights,
  onReanalyzeJobFit,
  onReupload,
  insightLoading = false,
  jobFitLoading = false,
}: ResumeCardProps) {
  const { t } = useTranslation();

  // Extract top skills from parsedData
  const skills: string[] = [];
  if (resume.parsedData) {
    const pd = resume.parsedData as Record<string, unknown>;
    const sk = pd.skills as Record<string, unknown> | undefined;
    if (sk) {
      for (const cat of ['technical', 'tools', 'frameworks']) {
        if (Array.isArray(sk[cat])) {
          skills.push(...(sk[cat] as string[]));
        }
      }
    }
    if (Array.isArray(pd.skills)) {
      skills.push(...(pd.skills as string[]));
    }
  }
  const displaySkills = skills.slice(0, 5);
  const extraSkills = skills.length - 5;

  const topFit = resume.resumeJobFits?.[0];

  const fitColor = (score: number | null | undefined) => {
    if (!score) return 'bg-slate-100 text-slate-500';
    if (score >= 80) return 'bg-emerald-100 text-emerald-700';
    if (score >= 60) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div
      onClick={onClick}
      className="landing-gradient-stroke bg-white rounded-2xl p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)] transition-all duration-300 cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
            {resume.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {resume.currentRole && (
              <p className="text-xs text-slate-600 truncate">{resume.currentRole}</p>
            )}
            {resume.status === 'archived' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {t('resumeLibrary.card.archived', 'Archived')}
              </span>
            )}
          </div>
        </div>
        {topFit && topFit.fitScore != null && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${fitColor(topFit.fitScore)}`}>
            {topFit.fitScore}%
          </span>
        )}
      </div>

      {/* Skills */}
      {displaySkills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {displaySkills.map((skill, i) => (
            <span key={i} className="inline-block bg-blue-50 text-blue-600 text-[11px] px-2 py-0.5 rounded-full">
              {skill}
            </span>
          ))}
          {extraSkills > 0 && (
            <span className="inline-block bg-slate-100 text-slate-600 text-[11px] px-2 py-0.5 rounded-full">
              +{extraSkills}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{new Date(resume.createdAt).toLocaleDateString()}</span>
        {topFit ? (
          <span className="truncate max-w-[120px]" title={topFit.hiringRequest.title}>
            {t('resumeLibrary.card.topFit', 'Top Fit')}: {topFit.hiringRequest.title}
          </span>
        ) : (
          <span>{resume.tags.length > 0 ? resume.tags.slice(0, 2).join(', ') : ''}</span>
        )}
      </div>

      {(onRegenerateInsights || onReanalyzeJobFit || onReupload) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5">
          {onRegenerateInsights && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRegenerateInsights();
              }}
              disabled={insightLoading}
              title={insightLoading
                ? t('resumeLibrary.card.regeneratingInsights', 'Regenerating...')
                : t('resumeLibrary.card.regenerateInsights', 'Re-generate Insights')}
              className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-60"
            >
              {insightLoading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
            </button>
          )}
          {onReanalyzeJobFit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReanalyzeJobFit();
              }}
              disabled={jobFitLoading}
              title={jobFitLoading
                ? t('resumeLibrary.card.rematchingJobs', 'Re-matching...')
                : t('resumeLibrary.card.rematchJobs', 'Re-match Jobs')}
              className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-60"
            >
              {jobFitLoading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          )}
          {onReupload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReupload();
              }}
              title={t('resumeLibrary.card.reupload', 'Re-upload')}
              className="p-1.5 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
