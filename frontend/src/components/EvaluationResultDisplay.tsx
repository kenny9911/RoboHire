import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { highlightEvaluationKeywords } from '../utils/evaluationHighlight';

interface InterviewEvaluation {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  hiringDecision: string;
  skillsAssessment?: Array<{
    skill: string;
    rating: string;
    evidence: string;
  }>;
  mustHaveAnalysis?: {
    extractedMustHaves: {
      skills: Array<{ skill: string; reason: string; criticality: string }>;
      experiences: Array<{ experience: string; reason: string; minimumYears?: string; criticality: string }>;
      qualifications: Array<{ qualification: string; reason: string; criticality: string }>;
    };
    interviewVerification: {
      verified: Array<{ requirement: string; verifiedBy: string; evidence: string; confidenceLevel: string }>;
      failed: Array<{ requirement: string; failedAt: string; reason: string; severity: string }>;
      notTested: Array<{ requirement: string; recommendation: string }>;
    };
    mustHaveScore: number;
    passRate: string;
    disqualified: boolean;
    disqualificationReasons: string[];
    assessment: string;
  };
  technicalAnalysis?: {
    summary: string;
    depthRating: string;
    details: string[];
    provenSkills: string[];
    claimedButUnverified: string[];
    responseQuality: string;
  };
  jdMatch?: {
    requirements: Array<{
      requirement: string;
      matchLevel: string;
      score: number;
      explanation: string;
    }>;
    hardRequirementsAnalysis: Array<{
      requirement: string;
      met: boolean;
      analysis: string;
    }>;
    extraSkillsFound: string[];
    summary: string;
  };
  behavioralAnalysis?: {
    summary: string;
    compatibility: string;
    details: string[];
  };
  interviewersKit?: {
    suggestedQuestions: string[];
    focusAreas: string[];
  };
  levelAssessment?: string;
  expertAdvice?: string;
  suitableWorkTypes?: string[];
  questionAnswerAssessment?: Array<{
    question: string;
    answer: string;
    score: number;
    correctness: string;
    thoughtProcess: string;
    logicalThinking: string;
    clarity: string;
    completeness: string;
    relatedMustHave?: string;
    mustHaveVerified?: boolean;
    weight?: string;
  }>;
  cheatingAnalysis?: {
    suspicionScore: number;
    riskLevel: string;
    summary: string;
    indicators: Array<{
      type: string;
      description: string;
      severity: string;
      evidence: string;
    }>;
    authenticitySignals: string[];
    recommendation: string;
  };
  personalityAssessment?: {
    mbtiEstimate: string;
    mbtiConfidence: string;
    mbtiExplanation: string;
    bigFiveTraits: Array<{
      trait: string;
      level: string;
      evidence: string;
    }>;
    communicationStyle: string;
    workStylePreferences: string[];
    motivators: string[];
    potentialChallenges: string[];
    teamDynamicsAdvice: string;
    summary: string;
  };
  skillRadar?: {
    professionalAbility: number;
    teamCollaboration: number;
    communication: number;
    achievementContribution: number;
    experienceFit: number;
  };
  keyCompetencyAssessment?: {
    professionalCompetency?: { score: number; assessment: string };
    resumeInterviewConsistency?: { score: number; assessment: string };
    achievementsContribution?: { score: number; assessment: string };
    logicCommunication?: { score: number; assessment: string };
    businessTeamwork?: { score: number; assessment: string };
    overallCompetency?: string;
  };
}

interface EvaluationResultDisplayProps {
  data: InterviewEvaluation | null;
}

// Helper function to get score color
function getScoreColor(score: number): string {
  if (score >= 85) return 'text-green-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBgColor(score: number): string {
  if (score >= 85) return 'bg-green-100 border-green-300';
  if (score >= 70) return 'bg-blue-100 border-blue-300';
  if (score >= 50) return 'bg-yellow-100 border-yellow-300';
  return 'bg-red-100 border-red-300';
}

function getDecisionColor(decision: string): string {
  switch (decision) {
    case 'Strong Hire': return 'bg-green-600';
    case 'Hire': return 'bg-blue-600';
    case 'Weak Hire': return 'bg-yellow-600';
    case 'No Hire': return 'bg-red-600';
    case 'Disqualified': return 'bg-red-800';
    default: return 'bg-gray-600';
  }
}

function getCriticalityColor(criticality: string): string {
  switch (criticality) {
    case 'Dealbreaker': return 'bg-red-600 text-white';
    case 'Critical': return 'bg-orange-500 text-white';
    case 'Important': return 'bg-yellow-500 text-yellow-900';
    default: return 'bg-gray-500 text-white';
  }
}

function getRiskColor(risk: string): string {
  switch (risk) {
    case 'Low': return 'bg-green-500';
    case 'Medium': return 'bg-yellow-500';
    case 'High': return 'bg-orange-500';
    case 'Critical': return 'bg-red-600';
    default: return 'bg-gray-500';
  }
}

function getMatchLevelColor(level: string): string {
  switch (level) {
    case 'High': return 'bg-green-100 text-green-800';
    case 'Medium': return 'bg-yellow-100 text-yellow-800';
    case 'Low': return 'bg-orange-100 text-orange-800';
    case 'None': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function getRatingColor(rating: string): string {
  switch (rating) {
    case 'Excellent': return 'bg-green-100 text-green-800';
    case 'Good': return 'bg-blue-100 text-blue-800';
    case 'Adequate': return 'bg-yellow-100 text-yellow-800';
    case 'Insufficient': return 'bg-orange-100 text-orange-800';
    case 'Not Demonstrated': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

// Collapsible Section Component
function CollapsibleSection({ 
  title, 
  children, 
  defaultOpen = true,
  badge,
}: { 
  title: string; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-gray-200 rounded-xl mb-4 overflow-hidden shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg text-gray-900">{title}</span>
          {badge}
        </div>
        <span className="text-gray-500 transform transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="p-5 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

// Question Answer Card
interface QAItem {
  question: string;
  answer: string;
  score: number;
  correctness: string;
  thoughtProcess: string;
  logicalThinking: string;
  clarity: string;
  completeness: string;
}

function QACard({ qa, index }: { qa: QAItem; index: number }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <span className="text-base font-medium text-gray-500">Question {index + 1}</span>
        <div className="flex gap-2">
          <span className={`px-2 py-1 rounded text-base font-medium ${
            qa.correctness === 'Correct' ? 'bg-green-100 text-green-800' :
            qa.correctness === 'Partially Correct' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {qa.correctness}
          </span>
          <span className={`px-2 py-1 rounded text-base font-medium ${getScoreBgColor(qa.score)} ${getScoreColor(qa.score)}`}>
            Score: {qa.score}
          </span>
        </div>
      </div>
      <p className="font-medium text-gray-800 mb-2">{qa.question}</p>
      <p className="text-base text-gray-600 mb-3 bg-gray-50 p-2 rounded">{qa.answer}</p>
      <div className="grid grid-cols-2 gap-2 text-base">
        <div><span className="text-gray-500">Clarity:</span> <span className="font-medium">{qa.clarity}</span></div>
        <div><span className="text-gray-500">Completeness:</span> <span className="font-medium">{qa.completeness}</span></div>
        <div className="col-span-2"><span className="text-gray-500">Thought Process:</span> <span className="text-gray-700">{qa.thoughtProcess}</span></div>
        <div className="col-span-2"><span className="text-gray-500">Logical Thinking:</span> <span className="text-gray-700">{qa.logicalThinking}</span></div>
      </div>
    </div>
  );
}

// Cheating Analysis Section
function CheatingAnalysisSection({ analysis }: { analysis: InterviewEvaluation['cheatingAnalysis'] }) {
  if (!analysis) return null;
  
  return (
    <CollapsibleSection 
      title="Cheating Detection Analysis" 
      defaultOpen={analysis.riskLevel !== 'Low'}
      badge={
        <span className={`px-2 py-1 rounded text-base font-bold text-white ${getRiskColor(analysis.riskLevel)}`}>
          {analysis.riskLevel} Risk
        </span>
      }
    >
      <div className="space-y-4">
        {/* Suspicion Score */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className={`text-3xl font-bold ${getScoreColor(100 - analysis.suspicionScore)}`}>
              {analysis.suspicionScore}
            </div>
            <div className="text-base text-gray-500">Suspicion Score</div>
          </div>
          <div className="flex-1">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className={`h-3 rounded-full ${getRiskColor(analysis.riskLevel)}`}
                style={{ width: `${analysis.suspicionScore}%` }}
              />
            </div>
            <div className="flex justify-between text-base text-gray-400 mt-1">
              <span>Genuine</span>
              <span>AI-Assisted</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-gray-700">{analysis.summary}</p>
        </div>

        {/* Indicators */}
        {analysis.indicators.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Detected Indicators</h4>
            <div className="space-y-2">
              {analysis.indicators.map((ind, i) => (
                <div key={i} className="border-l-4 border-orange-400 pl-3 py-2 bg-orange-50 rounded-r">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-gray-800">{ind.type}</span>
                    <span className={`px-2 py-0.5 rounded text-base ${
                      ind.severity === 'High' ? 'bg-red-100 text-red-800' :
                      ind.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{ind.severity}</span>
                  </div>
                  <p className="text-base text-gray-600 mt-1">{ind.description}</p>
                  {ind.evidence && (
                    <p className="text-base text-gray-500 mt-1 italic">"{ind.evidence}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Authenticity Signals */}
        {analysis.authenticitySignals.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Authenticity Signals (Positive)</h4>
            <div className="flex flex-wrap gap-2">
              {analysis.authenticitySignals.map((signal, i) => (
                <span key={i} className="px-2 py-1 bg-green-100 text-green-800 text-base rounded">
                  ✓ {signal}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recommendation */}
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
          <span className="font-medium text-blue-800">Recommendation:</span>
          <p className="text-blue-700 mt-1">{analysis.recommendation}</p>
        </div>
      </div>
    </CollapsibleSection>
  );
}

// Must-Have Analysis Section
function MustHaveAnalysisSection({ analysis }: { analysis: InterviewEvaluation['mustHaveAnalysis'] }) {
  const { t } = useTranslation();
  if (!analysis) return null;

  const totalMustHaves =
    (analysis.extractedMustHaves?.skills?.length ?? 0) +
    (analysis.extractedMustHaves?.experiences?.length ?? 0) +
    (analysis.extractedMustHaves?.qualifications?.length ?? 0);

  const verifiedCount = analysis.interviewVerification?.verified?.length ?? 0;
  const failedCount = analysis.interviewVerification?.failed?.length ?? 0;
  const notTestedCount = analysis.interviewVerification?.notTested?.length ?? 0;

  const requirementGroups = [
    {
      key: 'skills',
      label: t('goHireEval.mustHave.skills', '技能要求'),
      items:
        analysis.extractedMustHaves?.skills?.map((item) => ({
          title: item.skill,
          meta: null,
          reason: item.reason,
          criticality: item.criticality,
        })) || [],
    },
    {
      key: 'experiences',
      label: t('goHireEval.mustHave.experiences', '经验要求'),
      items:
        analysis.extractedMustHaves?.experiences?.map((item) => ({
          title: item.experience,
          meta: item.minimumYears || null,
          reason: item.reason,
          criticality: item.criticality,
        })) || [],
    },
    {
      key: 'qualifications',
      label: t('goHireEval.mustHave.qualifications', '资质要求'),
      items:
        analysis.extractedMustHaves?.qualifications?.map((item) => ({
          title: item.qualification,
          meta: null,
          reason: item.reason,
          criticality: item.criticality,
        })) || [],
    },
  ].filter((group) => group.items.length > 0);

  const verificationGroups = [
    {
      key: 'verified',
      label: t('goHireEval.mustHave.verified', '已验证通过'),
      count: verifiedCount,
      tone: 'emerald' as const,
      items:
        analysis.interviewVerification?.verified?.map((item) => ({
          title: item.requirement,
          sublabel: `${t('goHireEval.mustHave.verifiedAt', '验证点')}: ${item.verifiedBy}`,
          detail: item.evidence,
          meta: item.confidenceLevel,
        })) || [],
    },
    {
      key: 'failed',
      label: t('goHireEval.mustHave.failed', '未通过验证'),
      count: failedCount,
      tone: 'rose' as const,
      items:
        analysis.interviewVerification?.failed?.map((item) => ({
          title: item.requirement,
          sublabel: `${t('goHireEval.mustHave.failedAt', '问题点')}: ${item.failedAt}`,
          detail: item.reason,
          meta: item.severity,
        })) || [],
    },
    {
      key: 'notTested',
      label: t('goHireEval.mustHave.notTested', '待补充验证'),
      count: notTestedCount,
      tone: 'amber' as const,
      items:
        analysis.interviewVerification?.notTested?.map((item) => ({
          title: item.requirement,
          sublabel: t('goHireEval.mustHave.nextRound', '下一轮建议'),
          detail: item.recommendation,
          meta: null,
        })) || [],
    },
  ].filter((group) => group.items.length > 0);

  const topRiskSummary = [
    ...(analysis.disqualificationReasons || []).map((reason) => ({
      label: t('goHireEval.mustHave.summaryDisqualified', '淘汰原因'),
      text: reason,
      tone: 'rose' as const,
    })),
    ...((analysis.interviewVerification?.failed || []).map((item) => ({
      label: t('goHireEval.mustHave.summaryFailed', '未通过'),
      text: `${item.requirement}: ${item.reason}`,
      tone: 'rose' as const,
    }))),
    ...((analysis.interviewVerification?.notTested || []).map((item) => ({
      label: t('goHireEval.mustHave.summaryPending', '待验证'),
      text: `${item.requirement}: ${item.recommendation}`,
      tone: 'amber' as const,
    }))),
  ].slice(0, 3);

  const toneClasses = {
    emerald: {
      dot: 'bg-emerald-500',
      header: 'text-emerald-700',
      badge: 'bg-emerald-50 text-emerald-700',
      meta: 'bg-emerald-50 text-emerald-700',
    },
    rose: {
      dot: 'bg-rose-500',
      header: 'text-rose-700',
      badge: 'bg-rose-50 text-rose-700',
      meta: 'bg-rose-50 text-rose-700',
    },
    amber: {
      dot: 'bg-amber-500',
      header: 'text-amber-700',
      badge: 'bg-amber-50 text-amber-700',
      meta: 'bg-amber-50 text-amber-700',
    },
  };

  return (
    <CollapsibleSection
      title={t('goHireEval.mustHave.title', '硬性要求检查')}
      defaultOpen={true}
      badge={
        <div className="flex gap-2">
          {analysis.disqualified && (
            <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
              {t('goHireEval.mustHave.disqualified', '已淘汰')}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            analysis.mustHaveScore >= 80 ? 'bg-green-100 text-green-800' :
            analysis.mustHaveScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {analysis.passRate}
          </span>
        </div>
      }
    >
      <div className="space-y-5">
        {topRiskSummary.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('goHireEval.mustHave.topFindings', '重点风险摘要')}
              </h4>
              <span className="text-xs text-slate-400">
                {t('goHireEval.mustHave.topFindingsHint', '优先查看这 3 项')}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {topRiskSummary.map((item, index) => (
                <div key={`${item.label}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${item.tone === 'rose' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    <span className={`text-xs font-medium ${item.tone === 'rose' ? 'text-rose-700' : 'text-amber-700'}`}>
                      {item.label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis.disqualified && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
              <span className="text-xl">⚠️</span>
              <span>{t('goHireEval.mustHave.disqualifiedSummary', '候选人因硬性要求未达标被淘汰')}</span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-red-700">
              {analysis.disqualificationReasons?.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{t('goHireEval.mustHave.score', '硬性要求得分')}</div>
            <div className={`mt-2 text-3xl font-semibold ${getScoreColor(analysis.mustHaveScore)}`}>
              {analysis.mustHaveScore}
            </div>
            <div className="mt-1 text-xs text-slate-500">{analysis.passRate}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{t('goHireEval.mustHave.total', 'JD 硬性要求')}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{totalMustHaves}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{t('goHireEval.mustHave.passed', '已通过')}</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-600">{verifiedCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{t('goHireEval.mustHave.risks', '风险 / 待验证')}</div>
            <div className="mt-2 text-2xl font-semibold text-rose-600">{failedCount + notTestedCount}</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            {t('goHireEval.mustHave.quickRead', '快速结论')}
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-700">{analysis.assessment}</p>
        </div>

        {requirementGroups.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">{t('goHireEval.mustHave.fromJd', 'JD 提取的硬性要求')}</h4>
              <span className="text-xs text-slate-400">{t('goHireEval.mustHave.fromJdHint', '按类别整理')}</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {requirementGroups.map((group) => (
                <section key={group.key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h5 className="text-sm font-semibold text-slate-800">{group.label}</h5>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {group.items.length}
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {group.items.map((item, index) => (
                      <li key={`${group.key}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{item.title}</span>
                          {item.meta && (
                            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                              {item.meta}
                            </span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getCriticalityColor(item.criticality)}`}>
                            {item.criticality}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-6 text-slate-500">{item.reason}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        {verificationGroups.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">{t('goHireEval.mustHave.interviewCheck', '面试验证结果')}</h4>
              <span className="text-xs text-slate-400">{t('goHireEval.mustHave.interviewCheckHint', '按结果分组')}</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {verificationGroups.map((group) => (
                <section key={group.key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${toneClasses[group.tone].dot}`} />
                      <h5 className={`text-sm font-semibold ${toneClasses[group.tone].header}`}>{group.label}</h5>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[group.tone].badge}`}>
                      {group.count}
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {group.items.map((item, index) => (
                      <li key={`${group.key}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{item.title}</span>
                          {item.meta && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[group.tone].meta}`}>
                              {item.meta}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs text-slate-500">{item.sublabel}</p>
                        <p className="mt-1.5 text-sm leading-6 text-slate-700">{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

export default function EvaluationResultDisplay({ data }: EvaluationResultDisplayProps) {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  if (!data) return null;

  // Calculate Q&A stats
  const qaStats = useMemo(() => {
    if (!data.questionAnswerAssessment?.length) return null;
    const total = data.questionAnswerAssessment.length;
    const correct = data.questionAnswerAssessment.filter(q => q.correctness === 'Correct').length;
    const avgScore = data.questionAnswerAssessment.reduce((sum, q) => sum + q.score, 0) / total;
    return { total, correct, avgScore: Math.round(avgScore) };
  }, [data.questionAnswerAssessment]);

  const content = (
    <div className="space-y-6">
      {/* Header Score Card */}
      <div className={`p-6 rounded-xl border-2 ${getScoreBgColor(data.score)}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className={`text-5xl font-bold ${getScoreColor(data.score)}`}>
                {data.score}
              </span>
              <span className="text-gray-500 text-xl">/100</span>
            </div>
            <div className="mt-2">
              <span className={`inline-block px-4 py-2 rounded-full text-white font-bold ${getDecisionColor(data.hiringDecision)}`}>
                {data.hiringDecision}
              </span>
            </div>
          </div>
          <div className="flex-1 max-w-xl">
            <p className="text-gray-700">{data.summary}</p>
          </div>
        </div>
      </div>

      {/* Level & Fit */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-base text-gray-500">Level Assessment</div>
          <div className="text-xl font-bold text-gray-800">{data.levelAssessment || '-'}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-base text-gray-500">Tech Depth</div>
          <div className="text-xl font-bold text-gray-800">{data.technicalAnalysis?.depthRating || '-'}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-base text-gray-500">Response Quality</div>
          <div className="text-xl font-bold text-gray-800">{data.technicalAnalysis?.responseQuality || '-'}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-base text-gray-500">Culture Fit</div>
          <div className="text-xl font-bold text-gray-800">{data.behavioralAnalysis?.compatibility || '-'}</div>
        </div>
      </div>

      {/* Skill Radar */}
      {data.skillRadar && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-4">{t('goHireEval.skillRadar', '技能雷达')}</h3>
          <div className="flex justify-center">
            <ResponsiveContainer width={340} height={300}>
              <RadarChart data={[
                { subject: t('goHireEval.radarProfessional', '专业能力'), value: data.skillRadar.professionalAbility, fullMark: 100 },
                { subject: t('goHireEval.radarTeam', '团队协作'), value: data.skillRadar.teamCollaboration, fullMark: 100 },
                { subject: t('goHireEval.radarCommunication', '沟通表达'), value: data.skillRadar.communication, fullMark: 100 },
                { subject: t('goHireEval.radarAchievement', '成果贡献'), value: data.skillRadar.achievementContribution, fullMark: 100 },
                { subject: t('goHireEval.radarExperience', '履历适配'), value: data.skillRadar.experienceFit, fullMark: 100 },
              ]}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 14, fontWeight: 500 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Score" dataKey="value" stroke="#3b82f6" fill="#60a5fa" fillOpacity={0.5} strokeWidth={2} dot={{ r: 4, fill: '#3b82f6' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Key Competency Assessment */}
      {data.keyCompetencyAssessment && (
        <CollapsibleSection title={t('goHireEval.keyCompetencyTitle', '关键能力深度评估')} defaultOpen>
          <div className="space-y-4">
            {[
              { key: 'professionalCompetency', label: t('goHireEval.kcProfessional', '专业能力与实践经验'), data: data.keyCompetencyAssessment.professionalCompetency, icon: '🎯' },
              { key: 'resumeInterviewConsistency', label: t('goHireEval.kcConsistency', '简历描述与面试表现匹配度'), data: data.keyCompetencyAssessment.resumeInterviewConsistency, icon: '🔍' },
              { key: 'achievementsContribution', label: t('goHireEval.kcAchievements', '项目/工作成果与贡献'), data: data.keyCompetencyAssessment.achievementsContribution, icon: '🏆' },
              { key: 'logicCommunication', label: t('goHireEval.kcLogic', '逻辑思维与沟通表达'), data: data.keyCompetencyAssessment.logicCommunication, icon: '💡' },
              { key: 'businessTeamwork', label: t('goHireEval.kcBusiness', '业务理解与团队协作'), data: data.keyCompetencyAssessment.businessTeamwork, icon: '🤝' },
            ].map((item) => (
              <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-base font-semibold text-slate-900">{item.label}</span>
                  </div>
                  <div className={`text-xl font-bold ${
                    (item.data?.score ?? 0) >= 80 ? 'text-green-600' :
                    (item.data?.score ?? 0) >= 60 ? 'text-blue-600' :
                    (item.data?.score ?? 0) >= 40 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {item.data?.score ?? '—'}
                  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full ${
                      (item.data?.score ?? 0) >= 80 ? 'bg-green-500' :
                      (item.data?.score ?? 0) >= 60 ? 'bg-blue-500' :
                      (item.data?.score ?? 0) >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(item.data?.score ?? 0, 100)}%` }}
                  />
                </div>
                {item.data?.assessment && (
                  <p className="text-base text-slate-700 leading-relaxed">{item.data.assessment}</p>
                )}
              </div>
            ))}
            {data.keyCompetencyAssessment.overallCompetency && (
              <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4">
                <h4 className="text-base font-semibold text-indigo-900 mb-2">{t('goHireEval.kcOverall', '能力综合评价')}</h4>
                <p className="text-base text-indigo-800 leading-relaxed">{data.keyCompetencyAssessment.overallCompetency}</p>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Cheating Analysis (if present) */}
      {data.cheatingAnalysis && <CheatingAnalysisSection analysis={data.cheatingAnalysis} />}

      {/* Must-Have Analysis (CRITICAL - determines disqualification) */}
      {data.mustHaveAnalysis && <MustHaveAnalysisSection analysis={data.mustHaveAnalysis} />}

      {/* Strengths & Weaknesses */}
      <CollapsibleSection title={t('goHireEval.strengthsAndWeaknesses', '优势与不足')}>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h4 className="flex items-center gap-3 text-lg font-semibold text-slate-900">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">✓</span>
                {t('goHireEval.strengths', '优势')}
              </h4>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {data.strengths.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {data.strengths.map((s, i) => (
                <li key={i} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal leading-7 text-slate-800 md:text-[15px]" dangerouslySetInnerHTML={{ __html: highlightEvaluationKeywords(s, 'green') }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h4 className="flex items-center gap-3 text-lg font-semibold text-slate-900">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700">!</span>
                {t('goHireEval.weaknesses', '不足与风险')}
              </h4>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {data.weaknesses.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {data.weaknesses.map((w, i) => (
                <li key={i} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal leading-7 text-slate-800 md:text-[15px]" dangerouslySetInnerHTML={{ __html: highlightEvaluationKeywords(w, 'red') }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </CollapsibleSection>

      {/* Technical Analysis */}
      <CollapsibleSection title="Technical Analysis" badge={
        <span className={`px-2 py-1 rounded text-base font-medium ${
          data.technicalAnalysis?.depthRating === 'Expert' ? 'bg-green-100 text-green-800' :
          data.technicalAnalysis?.depthRating === 'Advanced' ? 'bg-blue-100 text-blue-800' :
          data.technicalAnalysis?.depthRating === 'Intermediate' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}>
          {data.technicalAnalysis?.depthRating}
        </span>
      }>
        <div className="space-y-4">
          <p className="text-gray-700">{data.technicalAnalysis?.summary}</p>
          
          {(data.technicalAnalysis?.details?.length ?? 0) > 0 && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Details</h4>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                {data.technicalAnalysis?.details?.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(data.technicalAnalysis?.provenSkills?.length ?? 0) > 0 && (
              <div className="bg-green-50 p-3 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">Proven Skills</h4>
                <div className="flex flex-wrap gap-1">
                  {data.technicalAnalysis?.provenSkills?.map((s, i) => (
                    <span key={i} className="px-2 py-1 bg-green-200 text-green-800 text-base rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {(data.technicalAnalysis?.claimedButUnverified?.length ?? 0) > 0 && (
              <div className="bg-yellow-50 p-3 rounded-lg">
                <h4 className="font-semibold text-yellow-800 mb-2">Claimed but Unverified</h4>
                <div className="flex flex-wrap gap-1">
                  {data.technicalAnalysis?.claimedButUnverified?.map((s, i) => (
                    <span key={i} className="px-2 py-1 bg-yellow-200 text-yellow-800 text-base rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* JD Match */}
      <CollapsibleSection title="JD Match Analysis">
        <div className="space-y-4">
          <p className="text-gray-700">{data.jdMatch?.summary}</p>
          
          {/* Hard Requirements */}
          {(data.jdMatch?.hardRequirementsAnalysis?.length ?? 0) > 0 && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Hard Requirements</h4>
              <div className="space-y-2">
                {data.jdMatch?.hardRequirementsAnalysis?.map((req, i) => (
                  <div key={i} className={`p-3 rounded-lg border ${req.met ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className={req.met ? 'text-green-600' : 'text-red-600'}>{req.met ? '✓' : '✗'}</span>
                      <span className="font-medium text-gray-800">{req.requirement}</span>
                    </div>
                    <p className="text-base text-gray-600 mt-1 ml-6">{req.analysis}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Requirements Match */}
          {(data.jdMatch?.requirements?.length ?? 0) > 0 && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Requirements</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-base">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Requirement</th>
                      <th className="px-3 py-2 text-center">Match</th>
                      <th className="px-3 py-2 text-center">Score</th>
                      <th className="px-3 py-2 text-left">Explanation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.jdMatch?.requirements?.map((req, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-800">{req.requirement}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-1 rounded text-base font-medium ${getMatchLevelColor(req.matchLevel)}`}>
                            {req.matchLevel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center font-medium">{req.score}/10</td>
                        <td className="px-3 py-2 text-gray-600">{req.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Extra Skills */}
          {(data.jdMatch?.extraSkillsFound?.length ?? 0) > 0 && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-2">Extra Skills Found (Bonus)</h4>
              <div className="flex flex-wrap gap-1">
                {data.jdMatch?.extraSkillsFound?.map((s, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-200 text-blue-800 text-base rounded">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Skills Assessment */}
      {(data.skillsAssessment?.length ?? 0) > 0 && (
        <CollapsibleSection title="Skills Assessment">
          <div className="overflow-x-auto">
            <table className="min-w-full text-base">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Skill</th>
                  <th className="px-3 py-2 text-center">Rating</th>
                  <th className="px-3 py-2 text-left">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.skillsAssessment?.map((skill, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium text-gray-800">{skill.skill}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 rounded text-base font-medium ${getRatingColor(skill.rating)}`}>
                        {skill.rating}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{skill.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {/* Question-Answer Assessment */}
      {(data.questionAnswerAssessment?.length ?? 0) > 0 && (
        <CollapsibleSection 
          title="Question-by-Question Analysis" 
          defaultOpen={false}
          badge={qaStats && (
            <span className="text-base text-gray-500">
              {qaStats.correct}/{qaStats.total} correct • Avg: {qaStats.avgScore}
            </span>
          )}
        >
          <div className="space-y-3">
            {data.questionAnswerAssessment?.map((qa, i) => (
              <QACard key={i} qa={qa} index={i} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Behavioral Analysis */}
      <CollapsibleSection title="Behavioral Analysis" badge={
        <span className={`px-2 py-1 rounded text-base font-medium ${
          data.behavioralAnalysis?.compatibility === 'High' ? 'bg-green-100 text-green-800' :
          data.behavioralAnalysis?.compatibility === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}>
          {data.behavioralAnalysis?.compatibility} Compatibility
        </span>
      }>
        <div className="space-y-3">
          <p className="text-gray-700">{data.behavioralAnalysis?.summary}</p>
          {(data.behavioralAnalysis?.details?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.behavioralAnalysis?.details?.map((d, i) => (
                <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-base">{d}</span>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Interviewer's Kit */}
      <CollapsibleSection title="Interviewer's Kit (Next Steps)" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data.interviewersKit?.focusAreas?.length ?? 0) > 0 && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Focus Areas</h4>
              <ul className="space-y-1">
                {data.interviewersKit?.focusAreas?.map((area, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500">→</span>
                    <span className="text-gray-600">{area}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(data.interviewersKit?.suggestedQuestions?.length ?? 0) > 0 && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Suggested Questions</h4>
              <ul className="space-y-1">
                {data.interviewersKit?.suggestedQuestions?.map((q, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-purple-500">?</span>
                    <span className="text-gray-600">{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Personality Assessment (性格测试) */}
      {data.personalityAssessment && (
        <CollapsibleSection title={t('goHireEval.personalityAssessment', 'Personality Assessment 性格测试')} badge={data.personalityAssessment.mbtiEstimate}>
          <div className="space-y-5">
            {/* Summary */}
            <p className="text-gray-700">{data.personalityAssessment.summary}</p>

            {/* MBTI Card */}
            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
              <div className="flex items-center gap-4 mb-3">
                <span className="text-3xl font-bold text-indigo-700">{data.personalityAssessment.mbtiEstimate}</span>
                <span className={`px-2 py-0.5 rounded-full text-base font-medium ${
                  data.personalityAssessment.mbtiConfidence === 'High' ? 'bg-green-100 text-green-700' :
                  data.personalityAssessment.mbtiConfidence === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {t(`goHireEval.level${data.personalityAssessment.mbtiConfidence?.replace('-', '')}` as any, data.personalityAssessment.mbtiConfidence)} {t('goHireEval.confidence', 'Confidence')}
                </span>
              </div>
              <p className="text-gray-600 text-base">{data.personalityAssessment.mbtiExplanation}</p>
            </div>

            {/* Big Five Traits */}
            {data.personalityAssessment.bigFiveTraits?.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-3">{t('goHireEval.bigFiveOcean', 'Big Five (OCEAN)')}</h4>
                <div className="space-y-2">
                  {data.personalityAssessment.bigFiveTraits.map((bt, i) => {
                    const levelPercent = bt.level === 'High' ? 90 : bt.level === 'Medium-High' ? 72 : bt.level === 'Medium' ? 50 : bt.level === 'Medium-Low' ? 30 : 12;
                    const barColor = bt.level === 'High' || bt.level === 'Medium-High' ? 'bg-indigo-500' : bt.level === 'Medium' ? 'bg-blue-400' : 'bg-slate-400';
                    return (
                      <div key={i} className="bg-white border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-medium text-gray-800 text-base">{t(`goHireEval.trait${bt.trait}` as any, bt.trait)}</span>
                          <span className="text-base text-gray-500">{t(`goHireEval.level${bt.level?.replace(/[- ]/g, '')}` as any, bt.level)}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full mb-2">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${levelPercent}%` }} />
                        </div>
                        <p className="text-base text-gray-500">{bt.evidence}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Communication & Work Style */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-100 rounded-lg p-4">
                <h4 className="font-semibold text-gray-700 mb-2 text-base">{t('goHireEval.communicationStyle', 'Communication Style')}</h4>
                <p className="text-gray-600 text-base">{data.personalityAssessment.communicationStyle}</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-lg p-4">
                <h4 className="font-semibold text-gray-700 mb-2 text-base">{t('goHireEval.teamDynamics', 'Team Dynamics')}</h4>
                <p className="text-gray-600 text-base">{data.personalityAssessment.teamDynamicsAdvice}</p>
              </div>
            </div>

            {/* Tags: Motivators, Work Style, Challenges */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.personalityAssessment.motivators?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 text-base">{t('goHireEval.motivators', 'Motivators')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {data.personalityAssessment.motivators.map((m, i) => (
                      <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-base">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.personalityAssessment.workStylePreferences?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 text-base">{t('goHireEval.workStyle', 'Work Style')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {data.personalityAssessment.workStylePreferences.map((w, i) => (
                      <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-base">{w}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.personalityAssessment.potentialChallenges?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 text-base">{t('goHireEval.potentialChallenges', 'Potential Challenges')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {data.personalityAssessment.potentialChallenges.map((c, i) => (
                      <span key={i} className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-base">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Expert Advice & Recommendation */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-bold text-xl text-gray-800 mb-3">Expert Advice & Recommendation</h3>
        
        {data.expertAdvice && (
          <p className="text-gray-700 mb-4">{data.expertAdvice}</p>
        )}
        
        <div className="bg-white/70 rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-gray-700 mb-2">Final Recommendation</h4>
          <p className="text-gray-700">{data.recommendation}</p>
        </div>

        {(data.suitableWorkTypes?.length ?? 0) > 0 && (
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Suitable Work Types</h4>
            <div className="flex flex-wrap gap-2">
              {data.suitableWorkTypes?.map((type, i) => (
                <span key={i} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-base">{type}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-auto">
        <div className="sticky top-0 z-10 flex justify-end p-3 bg-white border-b border-slate-200">
          <button
            onClick={() => setIsFullscreen(false)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
            title="Exit fullscreen"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
        <div className="max-w-5xl mx-auto p-6">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsFullscreen(true)}
        className="absolute top-2 right-2 z-10 p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
        title="Fullscreen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </button>
      {content}
    </div>
  );
}
