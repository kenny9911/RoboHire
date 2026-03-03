import { useTranslation } from 'react-i18next';

interface ResumeCardProps {
  resume: {
    id: string;
    name: string;
    currentRole: string | null;
    experienceYears: string | null;
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
}

export default function ResumeCard({ resume, onClick }: ResumeCardProps) {
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
    if (!score) return 'bg-gray-100 text-gray-500';
    if (score >= 80) return 'bg-emerald-100 text-emerald-700';
    if (score >= 60) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
            {resume.name}
          </h3>
          {resume.currentRole && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{resume.currentRole}</p>
          )}
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
            <span key={i} className="inline-block bg-indigo-50 text-indigo-600 text-[11px] px-2 py-0.5 rounded-full">
              {skill}
            </span>
          ))}
          {extraSkills > 0 && (
            <span className="inline-block bg-gray-100 text-gray-500 text-[11px] px-2 py-0.5 rounded-full">
              +{extraSkills}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>{new Date(resume.createdAt).toLocaleDateString()}</span>
        {topFit ? (
          <span className="truncate max-w-[120px]" title={topFit.hiringRequest.title}>
            {t('resumeLibrary.card.topFit', 'Top Fit')}: {topFit.hiringRequest.title}
          </span>
        ) : (
          <span>{resume.tags.length > 0 ? resume.tags.slice(0, 2).join(', ') : ''}</span>
        )}
      </div>
    </div>
  );
}
