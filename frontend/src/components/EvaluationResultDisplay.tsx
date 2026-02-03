import { useMemo, useState } from 'react';

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

function getSeverityBorderColor(severity: string): string {
  switch (severity) {
    case 'Dealbreaker': return 'border-red-600';
    case 'Critical': return 'border-orange-500';
    case 'Significant': return 'border-yellow-500';
    default: return 'border-gray-300';
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
    <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800">{title}</span>
          {badge}
        </div>
        <span className="text-gray-500 transform transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="p-4 bg-white">
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
        <span className="text-sm font-medium text-gray-500">Question {index + 1}</span>
        <div className="flex gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            qa.correctness === 'Correct' ? 'bg-green-100 text-green-800' :
            qa.correctness === 'Partially Correct' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {qa.correctness}
          </span>
          <span className={`px-2 py-1 rounded text-xs font-medium ${getScoreBgColor(qa.score)} ${getScoreColor(qa.score)}`}>
            Score: {qa.score}
          </span>
        </div>
      </div>
      <p className="font-medium text-gray-800 mb-2">{qa.question}</p>
      <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">{qa.answer}</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
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
        <span className={`px-2 py-1 rounded text-xs font-bold text-white ${getRiskColor(analysis.riskLevel)}`}>
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
            <div className="text-xs text-gray-500">Suspicion Score</div>
          </div>
          <div className="flex-1">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className={`h-3 rounded-full ${getRiskColor(analysis.riskLevel)}`}
                style={{ width: `${analysis.suspicionScore}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
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
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      ind.severity === 'High' ? 'bg-red-100 text-red-800' :
                      ind.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{ind.severity}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{ind.description}</p>
                  {ind.evidence && (
                    <p className="text-xs text-gray-500 mt-1 italic">"{ind.evidence}"</p>
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
                <span key={i} className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded">
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
  if (!analysis) return null;
  
  const totalMustHaves = 
    (analysis.extractedMustHaves?.skills?.length ?? 0) + 
    (analysis.extractedMustHaves?.experiences?.length ?? 0) + 
    (analysis.extractedMustHaves?.qualifications?.length ?? 0);
  
  const verifiedCount = analysis.interviewVerification?.verified?.length ?? 0;
  const failedCount = analysis.interviewVerification?.failed?.length ?? 0;
  const notTestedCount = analysis.interviewVerification?.notTested?.length ?? 0;
  
  return (
    <CollapsibleSection 
      title="硬性要求分析 (Must-Have Analysis)" 
      defaultOpen={true}
      badge={
        <div className="flex gap-2">
          {analysis.disqualified && (
            <span className="px-2 py-1 rounded text-xs font-bold text-white bg-red-700 animate-pulse">
              DISQUALIFIED
            </span>
          )}
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            analysis.mustHaveScore >= 80 ? 'bg-green-100 text-green-800' :
            analysis.mustHaveScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {analysis.passRate}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Disqualification Alert */}
        {analysis.disqualified && (
          <div className="bg-red-100 border-2 border-red-500 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800 font-bold mb-2">
              <span className="text-xl">⚠️</span>
              <span>候选人已被淘汰 (Candidate Disqualified)</span>
            </div>
            <ul className="list-disc pl-6 text-red-700 space-y-1">
              {analysis.disqualificationReasons?.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Must-Have Score */}
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className={`text-3xl font-bold ${getScoreColor(analysis.mustHaveScore)}`}>
              {analysis.mustHaveScore}
            </div>
            <div className="text-xs text-gray-500">Must-Have Score</div>
          </div>
          <div className="flex-1">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className={`h-3 rounded-full ${
                  analysis.mustHaveScore >= 80 ? 'bg-green-500' :
                  analysis.mustHaveScore >= 60 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${analysis.mustHaveScore}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-green-600">✓ {verifiedCount} verified</span>
              <span className="text-red-600">✗ {failedCount} failed</span>
              <span className="text-gray-500">? {notTestedCount} not tested</span>
            </div>
          </div>
        </div>

        {/* Assessment */}
        <p className="text-gray-700">{analysis.assessment}</p>

        {/* Extracted Must-Haves */}
        {totalMustHaves > 0 && (
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">从JD中提取的硬性要求</h4>
            <div className="space-y-2">
              {analysis.extractedMustHaves?.skills?.map((item, i) => (
                <div key={`skill-${i}`} className="flex items-start gap-2 p-2 bg-gray-50 rounded">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCriticalityColor(item.criticality)}`}>
                    {item.criticality}
                  </span>
                  <div>
                    <span className="font-medium">{item.skill}</span>
                    <p className="text-sm text-gray-500">{item.reason}</p>
                  </div>
                </div>
              ))}
              {analysis.extractedMustHaves?.experiences?.map((item, i) => (
                <div key={`exp-${i}`} className="flex items-start gap-2 p-2 bg-gray-50 rounded">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCriticalityColor(item.criticality)}`}>
                    {item.criticality}
                  </span>
                  <div>
                    <span className="font-medium">{item.experience}</span>
                    {item.minimumYears && <span className="text-sm text-gray-500 ml-2">({item.minimumYears})</span>}
                    <p className="text-sm text-gray-500">{item.reason}</p>
                  </div>
                </div>
              ))}
              {analysis.extractedMustHaves?.qualifications?.map((item, i) => (
                <div key={`qual-${i}`} className="flex items-start gap-2 p-2 bg-gray-50 rounded">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCriticalityColor(item.criticality)}`}>
                    {item.criticality}
                  </span>
                  <div>
                    <span className="font-medium">{item.qualification}</span>
                    <p className="text-sm text-gray-500">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification Results */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Verified */}
          {(analysis.interviewVerification?.verified?.length ?? 0) > 0 && (
            <div className="bg-green-50 p-3 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-2">✓ 已验证通过</h4>
              <div className="space-y-2">
                {analysis.interviewVerification?.verified?.map((item, i) => (
                  <div key={i} className="border-l-4 border-green-500 pl-2 py-1">
                    <div className="font-medium text-green-800">{item.requirement}</div>
                    <p className="text-sm text-green-700">验证于: {item.verifiedBy}</p>
                    <p className="text-xs text-green-600 italic">"{item.evidence}"</p>
                    <span className={`text-xs px-1 rounded ${
                      item.confidenceLevel === 'High' ? 'bg-green-200' :
                      item.confidenceLevel === 'Medium' ? 'bg-yellow-200' :
                      'bg-gray-200'
                    }`}>
                      {item.confidenceLevel} confidence
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed */}
          {(analysis.interviewVerification?.failed?.length ?? 0) > 0 && (
            <div className="bg-red-50 p-3 rounded-lg">
              <h4 className="font-semibold text-red-800 mb-2">✗ 未通过验证</h4>
              <div className="space-y-2">
                {analysis.interviewVerification?.failed?.map((item, i) => (
                  <div key={i} className={`border-l-4 ${getSeverityBorderColor(item.severity)} pl-2 py-1`}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-red-800">{item.requirement}</span>
                      <span className={`text-xs px-1 rounded ${getCriticalityColor(item.severity)}`}>
                        {item.severity}
                      </span>
                    </div>
                    <p className="text-sm text-red-700">失败于: {item.failedAt}</p>
                    <p className="text-sm text-red-600">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Not Tested */}
        {(analysis.interviewVerification?.notTested?.length ?? 0) > 0 && (
          <div className="bg-yellow-50 p-3 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">⚠️ 未在面试中测试 (需下一轮验证)</h4>
            <div className="space-y-2">
              {analysis.interviewVerification?.notTested?.map((item, i) => (
                <div key={i} className="border-l-4 border-yellow-500 pl-2 py-1">
                  <div className="font-medium text-yellow-800">{item.requirement}</div>
                  <p className="text-sm text-yellow-700">建议: {item.recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

export default function EvaluationResultDisplay({ data }: EvaluationResultDisplayProps) {
  if (!data) return null;

  // Calculate Q&A stats
  const qaStats = useMemo(() => {
    if (!data.questionAnswerAssessment?.length) return null;
    const total = data.questionAnswerAssessment.length;
    const correct = data.questionAnswerAssessment.filter(q => q.correctness === 'Correct').length;
    const avgScore = data.questionAnswerAssessment.reduce((sum, q) => sum + q.score, 0) / total;
    return { total, correct, avgScore: Math.round(avgScore) };
  }, [data.questionAnswerAssessment]);

  return (
    <div className="space-y-6">
      {/* Header Score Card */}
      <div className={`p-6 rounded-xl border-2 ${getScoreBgColor(data.score)}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className={`text-5xl font-bold ${getScoreColor(data.score)}`}>
                {data.score}
              </span>
              <span className="text-gray-500 text-lg">/100</span>
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
          <div className="text-sm text-gray-500">Level Assessment</div>
          <div className="text-xl font-bold text-gray-800">{data.levelAssessment || '-'}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-sm text-gray-500">Tech Depth</div>
          <div className="text-xl font-bold text-gray-800">{data.technicalAnalysis?.depthRating || '-'}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-sm text-gray-500">Response Quality</div>
          <div className="text-xl font-bold text-gray-800">{data.technicalAnalysis?.responseQuality || '-'}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-sm text-gray-500">Culture Fit</div>
          <div className="text-xl font-bold text-gray-800">{data.behavioralAnalysis?.compatibility || '-'}</div>
        </div>
      </div>

      {/* Cheating Analysis (if present) */}
      {data.cheatingAnalysis && <CheatingAnalysisSection analysis={data.cheatingAnalysis} />}

      {/* Must-Have Analysis (CRITICAL - determines disqualification) */}
      {data.mustHaveAnalysis && <MustHaveAnalysisSection analysis={data.mustHaveAnalysis} />}

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CollapsibleSection title="Strengths">
          <ul className="space-y-2">
            {data.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span className="text-gray-700">{s}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
        <CollapsibleSection title="Weaknesses">
          <ul className="space-y-2">
            {data.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-red-500 mt-1">✗</span>
                <span className="text-gray-700">{w}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      </div>

      {/* Technical Analysis */}
      <CollapsibleSection title="Technical Analysis" badge={
        <span className={`px-2 py-1 rounded text-xs font-medium ${
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
                    <span key={i} className="px-2 py-1 bg-green-200 text-green-800 text-sm rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {(data.technicalAnalysis?.claimedButUnverified?.length ?? 0) > 0 && (
              <div className="bg-yellow-50 p-3 rounded-lg">
                <h4 className="font-semibold text-yellow-800 mb-2">Claimed but Unverified</h4>
                <div className="flex flex-wrap gap-1">
                  {data.technicalAnalysis?.claimedButUnverified?.map((s, i) => (
                    <span key={i} className="px-2 py-1 bg-yellow-200 text-yellow-800 text-sm rounded">{s}</span>
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
                    <p className="text-sm text-gray-600 mt-1 ml-6">{req.analysis}</p>
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
                <table className="min-w-full text-sm">
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
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getMatchLevelColor(req.matchLevel)}`}>
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
                  <span key={i} className="px-2 py-1 bg-blue-200 text-blue-800 text-sm rounded">{s}</span>
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
            <table className="min-w-full text-sm">
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
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getRatingColor(skill.rating)}`}>
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
            <span className="text-sm text-gray-500">
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
        <span className={`px-2 py-1 rounded text-xs font-medium ${
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
                <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">{d}</span>
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

      {/* Expert Advice & Recommendation */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-bold text-lg text-gray-800 mb-3">Expert Advice & Recommendation</h3>
        
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
                <span key={i} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">{type}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
