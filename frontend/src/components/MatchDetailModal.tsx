import { useTranslation } from 'react-i18next';

interface MatchDetailModalProps {
  open: boolean;
  onClose: () => void;
  matchData: any;
  candidateName: string;
  score: number | null;
  grade: string | null;
}

const GRADE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  A: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'B+': 'bg-blue-100 text-blue-700 border-blue-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-amber-100 text-amber-700 border-amber-200',
  D: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-red-100 text-red-700 border-red-200',
};

function ScoreBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  const color =
    score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">
          {score}/100 <span className="text-slate-400">(weight: {weight}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function MatchDetailModal({ open, onClose, matchData, candidateName, score, grade }: MatchDetailModalProps) {
  const { t } = useTranslation();

  if (!open || !matchData) return null;

  const overallFit = matchData.overallFit;
  const breakdown = matchData.overallMatchScore?.breakdown;
  const recommendations = matchData.recommendations;
  const hardGaps = matchData.hardRequirementGaps;
  const interviewQuestions = matchData.suggestedInterviewQuestions;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0">
              <span className="text-sm font-bold text-blue-600">{candidateName?.[0]?.toUpperCase() || '?'}</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{candidateName}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                {score !== null && (
                  <span
                    className={`text-sm font-bold ${
                      score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-blue-600' : score >= 40 ? 'text-amber-600' : 'text-red-600'
                    }`}
                  >
                    {t('product.matching.detailScore', 'Score: {{score}}', { score })}
                  </span>
                )}
                {grade && (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold border ${GRADE_COLORS[grade] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {grade}
                  </span>
                )}
                {matchData.overallMatchScore?.confidence && (
                  <span className="text-xs text-slate-400">
                    {t('product.matching.detailConfidence', 'Confidence: {{level}}', { level: matchData.overallMatchScore.confidence })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Overall Fit */}
          {overallFit && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${
                    overallFit.verdict?.includes('Strong')
                      ? 'bg-emerald-100 text-emerald-700'
                      : overallFit.verdict?.includes('Good')
                        ? 'bg-blue-100 text-blue-700'
                        : overallFit.verdict?.includes('Moderate')
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                  }`}
                >
                  {overallFit.verdict}
                </span>
                {overallFit.hiringRecommendation && (
                  <span className="text-xs text-slate-500">
                    {overallFit.hiringRecommendation}
                  </span>
                )}
              </div>
              {overallFit.summary && (
                <p className="text-sm text-slate-700 leading-relaxed">{overallFit.summary}</p>
              )}
              {overallFit.topReasons && overallFit.topReasons.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {overallFit.topReasons.map((reason: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-blue-500 mt-0.5 shrink-0">&#8226;</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
              {overallFit.suggestedRole && (
                <p className="mt-2 text-xs text-slate-500">
                  {t('product.matching.detailSuggestedRole', 'Suggested role: {{role}}', { role: overallFit.suggestedRole })}
                </p>
              )}
            </div>
          )}

          {/* Score Breakdown */}
          {breakdown && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">
                {t('product.matching.detailBreakdown', 'Score Breakdown')}
              </h4>
              <div className="space-y-3">
                <ScoreBar
                  label={t('product.matching.detailSkillMatch', 'Skill Match')}
                  score={breakdown.skillMatchScore ?? 0}
                  weight={breakdown.skillMatchWeight ?? 40}
                />
                <ScoreBar
                  label={t('product.matching.detailExperience', 'Experience')}
                  score={breakdown.experienceScore ?? 0}
                  weight={breakdown.experienceWeight ?? 35}
                />
                <ScoreBar
                  label={t('product.matching.detailPotential', 'Potential')}
                  score={breakdown.potentialScore ?? 0}
                  weight={breakdown.potentialWeight ?? 25}
                />
              </div>
            </div>
          )}

          {/* Preference Alignment */}
          {matchData.preferenceAlignment && matchData.preferenceAlignment.overallScore < 100 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">
                {t('product.matching.detailPrefAlignment', 'Preference Alignment')}
              </h4>
              <div className="space-y-3">
                {([
                  ['locationFit', t('product.matching.prefDim.location', 'Location')],
                  ['workTypeFit', t('product.matching.prefDim.workType', 'Work Type')],
                  ['salaryFit', t('product.matching.prefDim.salary', 'Salary Range')],
                  ['jobTypeFit', t('product.matching.prefDim.jobType', 'Job Type')],
                  ['companyTypeFit', t('product.matching.prefDim.companyType', 'Company Type')],
                ] as [string, string][]).map(([key, label]) => {
                  const dim = (matchData.preferenceAlignment as any)?.[key];
                  if (!dim || dim.score === 100) return null;
                  const color = dim.score >= 80 ? 'bg-emerald-500' : dim.score >= 50 ? 'bg-amber-500' : 'bg-red-500';
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">{label}</span>
                        <span className="text-slate-500">{dim.score}/100</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${dim.score}%` }} />
                      </div>
                      {dim.assessment && <p className="text-[11px] text-slate-400">{dim.assessment}</p>}
                    </div>
                  );
                })}
              </div>
              {matchData.preferenceAlignment.overallAssessment && (
                <p className="mt-3 text-xs text-slate-600">{matchData.preferenceAlignment.overallAssessment}</p>
              )}
              {matchData.preferenceAlignment.warnings?.length > 0 && (
                <div className="mt-3 space-y-1">
                  {matchData.preferenceAlignment.warnings.map((w: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
                      <span className="shrink-0 mt-0.5">&#9888;</span>
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hard Requirement Gaps */}
          {hardGaps && hardGaps.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">
                {t('product.matching.detailGaps', 'Requirement Gaps')}
              </h4>
              <div className="space-y-2">
                {hardGaps.map((gap: any, i: number) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          gap.severity === 'dealbreaker'
                            ? 'bg-red-100 text-red-700'
                            : gap.severity === 'critical'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {gap.severity}
                      </span>
                      <span className="text-sm font-medium text-slate-900">{gap.requirement}</span>
                    </div>
                    {gap.candidateStatus && (
                      <p className="mt-1 text-xs text-slate-500">{gap.candidateStatus}</p>
                    )}
                    {gap.impact && (
                      <p className="mt-0.5 text-xs text-slate-400">{gap.impact}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {recommendations && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">
                {t('product.matching.detailRecommendations', 'Recommendations')}
              </h4>
              {recommendations.forRecruiter && recommendations.forRecruiter.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    {t('product.matching.detailForRecruiter', 'For Recruiter')}
                  </p>
                  <ul className="space-y-1">
                    {recommendations.forRecruiter.map((rec: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="text-emerald-500 mt-0.5 shrink-0">&#8226;</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recommendations.forCandidate && recommendations.forCandidate.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    {t('product.matching.detailForCandidate', 'For Candidate')}
                  </p>
                  <ul className="space-y-1">
                    {recommendations.forCandidate.map((rec: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="text-blue-500 mt-0.5 shrink-0">&#8226;</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recommendations.interviewQuestions && recommendations.interviewQuestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    {t('product.matching.detailInterviewQuestions', 'Key Interview Questions')}
                  </p>
                  <ul className="space-y-1">
                    {recommendations.interviewQuestions.map((q: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="text-purple-500 mt-0.5 shrink-0">{i + 1}.</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Interview Focus Areas */}
          {overallFit?.interviewFocus && overallFit.interviewFocus.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">
                {t('product.matching.detailInterviewFocus', 'Interview Focus Areas')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {overallFit.interviewFocus.map((area: string, i: number) => (
                  <span key={i} className="rounded-full bg-purple-50 border border-purple-200 px-3 py-1 text-xs font-medium text-purple-700">
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Interview Questions (detailed) */}
          {interviewQuestions && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">
                {t('product.matching.detailSuggestedQuestions', 'Suggested Interview Questions')}
              </h4>

              {interviewQuestions.technical && interviewQuestions.technical.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
                    {t('product.matching.detailTechnical', 'Technical')}
                  </p>
                  <div className="space-y-3">
                    {interviewQuestions.technical.map((area: any, ai: number) => (
                      <div key={ai}>
                        <p className="text-xs font-semibold text-slate-700 mb-1">
                          {area.area}{area.subArea ? ` — ${area.subArea}` : ''}
                        </p>
                        {area.questions?.map((q: any, qi: number) => (
                          <div key={qi} className="ml-3 mb-2 rounded-lg bg-slate-50 p-3">
                            <p className="text-sm text-slate-800">{q.question}</p>
                            {q.purpose && <p className="mt-1 text-xs text-slate-500">{q.purpose}</p>}
                            {q.difficulty && (
                              <span className="mt-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">
                                {q.difficulty}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {interviewQuestions.behavioral && interviewQuestions.behavioral.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">
                    {t('product.matching.detailBehavioral', 'Behavioral')}
                  </p>
                  <div className="space-y-3">
                    {interviewQuestions.behavioral.map((area: any, ai: number) => (
                      <div key={ai}>
                        <p className="text-xs font-semibold text-slate-700 mb-1">
                          {area.area}{area.subArea ? ` — ${area.subArea}` : ''}
                        </p>
                        {area.questions?.map((q: any, qi: number) => (
                          <div key={qi} className="ml-3 mb-2 rounded-lg bg-slate-50 p-3">
                            <p className="text-sm text-slate-800">{q.question}</p>
                            {q.purpose && <p className="mt-1 text-xs text-slate-500">{q.purpose}</p>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {interviewQuestions.experienceValidation && interviewQuestions.experienceValidation.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2">
                    {t('product.matching.detailExperienceValidation', 'Experience Validation')}
                  </p>
                  <div className="space-y-3">
                    {interviewQuestions.experienceValidation.map((area: any, ai: number) => (
                      <div key={ai}>
                        <p className="text-xs font-semibold text-slate-700 mb-1">
                          {area.area}{area.subArea ? ` — ${area.subArea}` : ''}
                        </p>
                        {area.questions?.map((q: any, qi: number) => (
                          <div key={qi} className="ml-3 mb-2 rounded-lg bg-slate-50 p-3">
                            <p className="text-sm text-slate-800">{q.question}</p>
                            {q.purpose && <p className="mt-1 text-xs text-slate-500">{q.purpose}</p>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
