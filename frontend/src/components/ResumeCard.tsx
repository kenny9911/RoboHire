import { useTranslation } from 'react-i18next';
import { IconStar, IconLoader2, IconBulb, IconUsers, IconUpload } from '@tabler/icons-react';

// Define the enriched data structure that the card will now receive
interface EnrichedResumeJobFit {
  fitScore: number | null;
  fitGrade: string | null;
  hiringRequest: { title: string };
  hasRedFlags?: boolean;
  topStrengths?: string[];
}

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
    // Use the enriched job fit interface
    resumeJobFits?: EnrichedResumeJobFit[];
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

  // Extract top skills from parsedData for general display
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

  // Condition for the new "Top Candidate" highlight
  const isTopCandidate = topFit && topFit.fitScore && topFit.fitScore > 85 && !topFit.hasRedFlags;

  const fitColor = (score: number | null | undefined) => {
    if (!score) return 'bg-slate-100 text-slate-500';
    if (score >= 80) return 'bg-emerald-100 text-emerald-700';
    if (score >= 60) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div
      onClick={onClick}
      className={`relative landing-gradient-stroke bg-white rounded-2xl p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)] transition-all duration-300 cursor-pointer group ${
        isTopCandidate ? 'border-2 border-emerald-400 shadow-emerald-200/50' : ''
      }`}
    >
      {/* Top Candidate Badge */}
      {isTopCandidate && (
        <div title="Top Candidate: Score >85% and no red flags" className="absolute top-0 right-0 mt-3 mr-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400 text-white shadow-lg">
            <IconStar size={20} stroke={1.5} />
          </span>
        </div>
      )}

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
      {displaySkills.length > 0 && !isTopCandidate && (
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
      
      {/* Top Candidate Summary */}
      {isTopCandidate && topFit?.topStrengths && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs font-semibold text-emerald-800 mb-1">Highlight</p>
            <p className="text-xs text-emerald-700">{topFit.topStrengths.join(', ')}.</p>
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
                <IconLoader2 className="animate-spin" size={14} stroke={1.5} />
              ) : (
                <IconBulb size={14} stroke={1.5} />
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
                <IconLoader2 className="animate-spin" size={14} stroke={1.5} />
              ) : (
                <IconUsers size={14} stroke={1.5} />
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
              <IconUpload size={14} stroke={1.5} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
