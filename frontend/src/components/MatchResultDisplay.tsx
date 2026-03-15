import { useMemo, useState } from 'react';

export interface MatchResultData {
  resumeAnalysis: {
    candidateName: string;
    totalYearsExperience: string;
    currentRole: string;
    technicalSkills: string[];
    softSkills: string[];
    industries: string[];
    educationLevel: string;
    certifications: string[];
    keyAchievements: string[];
  };
  jdAnalysis: {
    jobTitle: string;
    seniorityLevel: string;
    requiredYearsExperience: string;
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
    industryFocus: string;
    keyResponsibilities: string[];
  };
  mustHaveAnalysis?: {
    extractedMustHaves: {
      skills: Array<{
        skill: string;
        reason: string;
        explicitlyStated: boolean;
      }>;
      experiences: Array<{
        experience: string;
        reason: string;
        minimumYears: string;
      }>;
      qualifications: Array<{
        qualification: string;
        reason: string;
      }>;
    };
    candidateEvaluation: {
      meetsAllMustHaves: boolean;
      matchedSkills: Array<{
        skill: string;
        candidateEvidence: string;
        proficiency: string;
      }>;
      missingSkills: Array<{
        skill: string;
        severity: string;
        canBeLearnedQuickly: boolean;
        alternativeEvidence: string;
      }>;
      matchedExperiences: Array<{
        experience: string;
        candidateEvidence: string;
        exceeds: boolean;
      }>;
      missingExperiences: Array<{
        experience: string;
        severity: string;
        gap: string;
        partiallyMet: string;
      }>;
      matchedQualifications: string[];
      missingQualifications: Array<{
        qualification: string;
        severity: string;
        alternative: string;
      }>;
    };
    mustHaveScore: number;
    disqualified: boolean;
    disqualificationReasons: string[];
    gapAnalysis: string;
  };
  niceToHaveAnalysis?: {
    extractedNiceToHaves: {
      skills: Array<{
        skill: string;
        valueAdd: string;
      }>;
      experiences: Array<{
        experience: string;
        valueAdd: string;
      }>;
      qualifications: Array<{
        qualification: string;
        valueAdd: string;
      }>;
    };
    candidateEvaluation: {
      matchedSkills: string[];
      matchedExperiences: string[];
      matchedQualifications: string[];
      bonusSkills: string[];
    };
    niceToHaveScore: number;
    competitiveAdvantage: string;
  };
  skillMatch: {
    matchedMustHave: Array<{
      skill: string;
      proficiencyLevel: string;
      evidenceFromResume: string;
    }>;
    missingMustHave: Array<{
      skill: string;
      importance: string;
      mitigationPossibility: string;
    }>;
    matchedNiceToHave: string[];
    missingNiceToHave: string[];
    additionalRelevantSkills: string[];
  };
  skillMatchScore: {
    score: number;
    breakdown: {
      mustHaveScore: number;
      niceToHaveScore: number;
      depthOfExpertise: number;
    };
    skillApplicationAnalysis: string;
    credibilityFlags: {
      hasRedFlags: boolean;
      concerns: string[];
      positiveIndicators: string[];
    };
  };
  experienceMatch: {
    required: string;
    candidate: string;
    yearsGap: string;
    assessment: string;
  };
  experienceValidation: {
    score: number;
    relevanceToRole: string;
    gaps: Array<{
      area: string;
      severity: string;
      canBeAddressed: string;
    }>;
    strengths: Array<{
      area: string;
      impact: string;
    }>;
    careerProgression: string;
  };
  candidatePotential: {
    growthTrajectory: string;
    leadershipIndicators: string[];
    learningAgility: string;
    uniqueValueProps: string[];
    cultureFitIndicators: string[];
    riskFactors: string[];
  };
  transferableSkills?: Array<{
    required: string;
    candidateHas: string;
    relevance: string;
    valueFactor: number;
  }>;
  experienceBreakdown?: {
    fullTimeExperience: string;
    internshipExperience: string;
    contractExperience?: string;
    totalRelevantExperience: string;
    note: string;
  };
  hardRequirementGaps?: Array<{
    requirement: string;
    severity: 'dealbreaker' | 'critical' | 'significant';
    candidateStatus: string;
    impact: string;
  }>;
  overallMatchScore: {
    score: number;
    grade: string;
    breakdown: {
      skillMatchWeight: number;
      skillMatchScore: number;
      experienceWeight: number;
      experienceScore: number;
      potentialWeight: number;
      potentialScore: number;
    };
    confidence: string;
  };
  overallFit: {
    verdict: string;
    summary: string;
    topReasons: string[];
    interviewFocus: string[];
    hiringRecommendation: string;
    suggestedRole: string;
  };
  recommendations: {
    forRecruiter: string[];
    forCandidate: string[];
    interviewQuestions: string[];
  };
  suggestedInterviewQuestions?: {
    technical: InterviewQuestionCategory[];
    behavioral: InterviewQuestionCategory[];
    experienceValidation: InterviewQuestionCategory[];
    situational: InterviewQuestionCategory[];
    cultureFit: InterviewQuestionCategory[];
    redFlagProbing: InterviewQuestionCategory[];
  };
  areasToProbeDeeper?: ProbingArea[];
}

export interface InterviewQuestionCategory {
  area: string;
  subArea?: string;
  questions: InterviewQuestion[];
}

export interface InterviewQuestion {
  question: string;
  purpose: string;
  lookFor: string[];
  followUps: string[];
  difficulty: string;
  timeEstimate: string;
}

export interface ProbingArea {
  area: string;
  priority: string;
  reason: string;
  subAreas: ProbingSubArea[];
  suggestedApproach: string;
}

export interface ProbingSubArea {
  name: string;
  specificConcerns: string[];
  validationQuestions: string[];
  greenFlags: string[];
  redFlags: string[];
}

interface Props {
  data: MatchResultData;
  requestId?: string;
}

const RadialProgressBar = ({ score, size = 100 }: { score: number; size?: number; }) => {
  const getScoreColor = (s: number) => {
    if (s >= 85) return '#10b981'; // emerald-500
    if (s >= 70) return '#84cc16'; // lime-500
    if (s >= 55) return '#facc15'; // yellow-400
    if (s >= 40) return '#f97316'; // orange-500
    return '#ef4444'; // red-500
  };

  const color = getScoreColor(score);
  const strokeWidth = size / 12;
  const innerRadius = (size / 2) - strokeWidth;
  const circumference = innerRadius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          className="text-gray-200"
          stroke="currentColor"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={innerRadius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          r={innerRadius}
          cx={size / 2}
          cy={size / 2}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-800">{score}</span>
        <span className="text-xs text-gray-500">Fit</span>
      </div>
    </div>
  );
};


// Helper components
const ScoreCircle = ({ score, size = 'large', label }: { score: number; size?: 'large' | 'medium' | 'small'; label?: string }) => {
  const getScoreColor = (s: number) => {
    if (s >= 85) return { bg: 'bg-emerald-500', text: 'text-emerald-500', ring: 'ring-emerald-500' };
    if (s >= 70) return { bg: 'bg-green-500', text: 'text-green-500', ring: 'ring-green-500' };
    if (s >= 55) return { bg: 'bg-yellow-500', text: 'text-yellow-500', ring: 'ring-yellow-500' };
    if (s >= 40) return { bg: 'bg-orange-500', text: 'text-orange-500', ring: 'ring-orange-500' };
    return { bg: 'bg-red-500', text: 'text-red-500', ring: 'ring-red-500' };
  };
  
  const colors = getScoreColor(score);
  const sizeClasses = {
    large: 'w-32 h-32 text-4xl',
    medium: 'w-20 h-20 text-2xl',
    small: 'w-14 h-14 text-lg',
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center bg-white ring-4 ${colors.ring} shadow-lg`}>
        <span className={`font-bold ${colors.text}`}>{score}</span>
      </div>
      {label && <span className="text-sm text-gray-500 mt-2">{label}</span>}
    </div>
  );
};

const ProgressBar = ({ value, max = 100, label, showValue = true }: { value: number; max?: number; label?: string; showValue?: boolean }) => {
  const percentage = Math.min((value / max) * 100, 100);
  const getColor = (p: number) => {
    if (p >= 85) return 'bg-emerald-500';
    if (p >= 70) return 'bg-green-500';
    if (p >= 55) return 'bg-yellow-500';
    if (p >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between mb-1">
          <span className="text-sm text-gray-600">{label}</span>
          {showValue && <span className="text-sm font-medium text-gray-800">{value}%</span>}
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full transition-all duration-500 ${getColor(percentage)}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'success' | 'warning' | 'error' | 'info' | 'default' }) => {
  const variants = {
    success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200',
    default: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]}`}>
      {children}
    </span>
  );
};

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ children, icon, className = '' }: { children: React.ReactNode; icon?: string; className?: string }) => (
  <div className={`px-6 py-4 border-b border-gray-100 ${className}`}>
    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
      {icon && <span>{icon}</span>}
      {children}
    </h3>
  </div>
);

const CardContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

const SkillTag = ({ skill, matched = false }: { skill: string; matched?: boolean }) => (
  <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium ${
    matched 
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
      : 'bg-gray-50 text-gray-600 border border-gray-200'
  }`}>
    {matched && <span className="mr-1">✓</span>}
    {skill}
  </span>
);

export default function MatchResultDisplay({ data, requestId: _requestId }: Props) {
  const summaryData = useMemo(() => {
    const strengths: { text: string }[] = [];
    const gaps: { text: string; severity: string }[] = [];

    // Prioritize Gaps
    if (data.hardRequirementGaps) {
      for (const g of data.hardRequirementGaps) {
        if (gaps.length >= 3) break;
        gaps.push({ text: `Missing: ${g.requirement}`, severity: g.severity });
      }
    }
    if (gaps.length < 3 && data.mustHaveAnalysis?.disqualified) {
      for (const reason of data.mustHaveAnalysis.disqualificationReasons) {
        if (gaps.length >= 3) break;
        if (!gaps.some(g => g.text.includes(reason))) {
            gaps.push({ text: reason, severity: 'dealbreaker' });
        }
      }
    }
    if (gaps.length < 3 && data.mustHaveAnalysis?.candidateEvaluation.missingSkills) {
      for (const s of data.mustHaveAnalysis.candidateEvaluation.missingSkills) {
        if (gaps.length >= 3) break;
        if (!gaps.some(g => g.text.includes(s.skill))) {
            gaps.push({ text: `Missing Skill: ${s.skill}`, severity: s.severity.toLowerCase() });
        }
      }
    }

    // Prioritize Strengths
    if (data.mustHaveAnalysis?.candidateEvaluation.matchedSkills) {
        for (const s of data.mustHaveAnalysis.candidateEvaluation.matchedSkills) {
            if (strengths.length >= 3) break;
            strengths.push({ text: `Strong in ${s.skill}` });
        }
    }
    if (strengths.length < 3 && data.experienceValidation?.strengths) {
        for (const s of data.experienceValidation.strengths) {
            if (strengths.length >= 3) break;
            if (!strengths.some(st => st.text.includes(s.area))) {
                strengths.push({ text: s.area });
            }
        }
    }
    if (strengths.length < 3 && data.experienceMatch.yearsGap && parseFloat(data.experienceMatch.yearsGap) > 0) {
        strengths.push({ text: `Exceeds experience by ${data.experienceMatch.yearsGap} years`});
    }

    return { strengths: strengths.slice(0, 3), gaps: gaps.slice(0, 3) };
  }, [data]);

  const niceToHaveExtracted = data.niceToHaveAnalysis?.extractedNiceToHaves ?? {
    skills: [],
    experiences: [],
    qualifications: [],
  };

  const getSeverityIcon = (severity: string) => {
    const s = severity.toLowerCase();
    if (s === 'dealbreaker') return '🚫';
    if (s === 'critical') return '❌';
    if (s === 'significant' || s === 'high') return '⚠️';
    return '🔸';
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* New "Recruiter's At-a-Glance" Header */}
      <Card>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Candidate Info */}
            <div className="md:col-span-3">
              <h1 className="text-2xl font-bold text-gray-800">{data.resumeAnalysis.candidateName}</h1>
              <p className="text-gray-600">{data.resumeAnalysis.currentRole}</p>
              <p className="text-sm text-gray-500 mt-1">{data.jdAnalysis.jobTitle}</p>
            </div>
            
            {/* Score */}
            <div className="md:col-span-2 flex justify-center">
                <RadialProgressBar score={data.overallMatchScore.score} />
            </div>

            {/* Strengths & Gaps */}
            <div className="md:col-span-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-gray-600 mb-2">Top Strengths</h4>
                  <ul className="space-y-1">
                    {summaryData.strengths.length > 0 ? summaryData.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-emerald-500 mt-1">✅</span>
                        <span>{s.text}</span>
                      </li>
                    )) : <li className="text-sm text-gray-500">None highlighted</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-600 mb-2">Critical Gaps</h4>
                  <ul className="space-y-1">
                    {summaryData.gaps.length > 0 ? summaryData.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-1">{getSeverityIcon(g.severity)}</span>
                        <span>{g.text}</span>
                      </li>
                    )) : <li className="text-sm text-gray-500">No critical gaps found</li>}
                  </ul>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="md:col-span-3 flex flex-col items-stretch gap-2">
                <button className="w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                    Add to Shortlist
                </button>
                <button className="w-full bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors">
                    Reject
                </button>
                 <a href="#full-report" className="w-full text-center text-sm text-indigo-600 hover:underline mt-2">
                    View Full Report ↓
                </a>
            </div>
          </div>
        </div>
      </Card>


      {/* Score Breakdown */}
      <div id="full-report" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="text-center">
            <ScoreCircle score={data.skillMatchScore.score} size="medium" />
            <h4 className="font-semibold text-gray-800 mt-3">Skills Match</h4>
            <p className="text-gray-500 text-sm">Weight: {data.overallMatchScore.breakdown.skillMatchWeight}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="text-center">
            <ScoreCircle score={data.experienceValidation.score} size="medium" />
            <h4 className="font-semibold text-gray-800 mt-3">Experience</h4>
            <p className="text-gray-500 text-sm">Weight: {data.overallMatchScore.breakdown.experienceWeight}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="text-center">
            <ScoreCircle score={data.overallMatchScore.breakdown.potentialScore} size="medium" />
            <h4 className="font-semibold text-gray-800 mt-3">Potential</h4>
            <p className="text-gray-500 text-sm">Weight: {data.overallMatchScore.breakdown.potentialWeight}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader icon="📋">Executive Summary</CardHeader>
        <CardContent>
          <p className="text-gray-700 text-lg leading-relaxed">{data.overallFit.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.overallFit.topReasons.map((reason, i) => (
              <Badge key={i} variant="info">{reason}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Disqualification Alert */}
      {data.mustHaveAnalysis?.disqualified && (
        <Card className="border-2 border-red-300 bg-red-50">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="text-4xl">🚫</div>
              <div>
                <h3 className="text-xl font-bold text-red-700 mb-2">Candidate Does Not Meet Must-Have Requirements</h3>
                <p className="text-red-600 mb-4">This candidate is missing critical must-have qualifications and may not be suitable for this role.</p>
                <div className="space-y-2">
                  {data.mustHaveAnalysis.disqualificationReasons.map((reason, i) => (
                    <div key={i} className="flex items-start gap-2 text-red-700">
                      <span>✗</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hard Requirement Gaps */}
      {data.hardRequirementGaps && data.hardRequirementGaps.length > 0 && (
        <Card>
          <CardHeader icon="🚫">Hard Requirement Gaps</CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.hardRequirementGaps.map((gap, i) => (
                <div key={i} className={`rounded-lg p-4 border-l-4 ${
                  gap.severity === 'dealbreaker' ? 'bg-red-50 border-red-500' :
                  gap.severity === 'critical' ? 'bg-orange-50 border-orange-500' :
                  'bg-yellow-50 border-yellow-500'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{gap.requirement}</span>
                    <Badge variant={gap.severity === 'dealbreaker' ? 'error' : gap.severity === 'critical' ? 'warning' : 'default'}>
                      {gap.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">Candidate: {gap.candidateStatus}</p>
                  <p className="text-sm text-gray-500">{gap.impact}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Must-Have Analysis */}
      {data.mustHaveAnalysis && (
        <Card className={data.mustHaveAnalysis.disqualified ? 'border-2 border-red-200' : ''}>
          <CardHeader icon="🎯">
            Must-Have Requirements Analysis
            {data.mustHaveAnalysis.candidateEvaluation.meetsAllMustHaves ? (
              <Badge variant="success" >All Met ✓</Badge>
            ) : (
              <Badge variant="error">Gaps Found</Badge>
            )}
          </CardHeader>
          <CardContent>
            {/* Must-Have Score */}
            <div className="mb-6 flex items-center gap-6">
              <ScoreCircle score={data.mustHaveAnalysis.mustHaveScore} size="medium" />
              <div>
                <h4 className="font-semibold text-gray-800">Must-Have Score</h4>
                <p className="text-gray-500 text-sm">Based on critical requirements coverage</p>
              </div>
            </div>

            {/* Extracted Must-Haves from JD */}
            <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
              <h4 className="font-medium text-indigo-800 mb-3">📝 Extracted Must-Have Requirements from JD</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Skills */}
                <div>
                  <h5 className="text-sm font-medium text-indigo-600 mb-2">Required Skills</h5>
                  <div className="space-y-2">
                    {data.mustHaveAnalysis.extractedMustHaves.skills.map((s, i) => (
                      <div key={i} className="bg-white rounded p-2 text-sm">
                        <p className="font-medium text-gray-800">{s.skill}</p>
                        <p className="text-gray-500 text-xs">{s.reason}</p>
                        {s.explicitlyStated && <Badge variant="info">Explicit</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Experiences */}
                <div>
                  <h5 className="text-sm font-medium text-indigo-600 mb-2">Required Experience</h5>
                  <div className="space-y-2">
                    {data.mustHaveAnalysis.extractedMustHaves.experiences.map((e, i) => (
                      <div key={i} className="bg-white rounded p-2 text-sm">
                        <p className="font-medium text-gray-800">{e.experience}</p>
                        <p className="text-gray-500 text-xs">{e.minimumYears}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Qualifications */}
                <div>
                  <h5 className="text-sm font-medium text-indigo-600 mb-2">Required Qualifications</h5>
                  <div className="space-y-2">
                    {data.mustHaveAnalysis.extractedMustHaves.qualifications.map((q, i) => (
                      <div key={i} className="bg-white rounded p-2 text-sm">
                        <p className="font-medium text-gray-800">{q.qualification}</p>
                        <p className="text-gray-500 text-xs">{q.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate Evaluation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Matched */}
              <div>
                <h4 className="font-medium text-emerald-700 mb-3 flex items-center gap-2">
                  <span>✅</span> Met Requirements
                </h4>
                
                {/* Matched Skills */}
                {data.mustHaveAnalysis.candidateEvaluation.matchedSkills.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">Skills</p>
                    <div className="space-y-2">
                      {data.mustHaveAnalysis.candidateEvaluation.matchedSkills.map((s, i) => (
                        <div key={i} className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-emerald-800">{s.skill}</span>
                            <Badge variant="success">{s.proficiency}</Badge>
                          </div>
                          <p className="text-sm text-emerald-600">{s.candidateEvidence}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matched Experiences */}
                {data.mustHaveAnalysis.candidateEvaluation.matchedExperiences.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">Experience</p>
                    <div className="space-y-2">
                      {data.mustHaveAnalysis.candidateEvaluation.matchedExperiences.map((e, i) => (
                        <div key={i} className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-emerald-800">{e.experience}</span>
                            {e.exceeds && <Badge variant="success">Exceeds ↑</Badge>}
                          </div>
                          <p className="text-sm text-emerald-600">{e.candidateEvidence}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matched Qualifications */}
                {data.mustHaveAnalysis.candidateEvaluation.matchedQualifications.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Qualifications</p>
                    <div className="flex flex-wrap gap-2">
                      {data.mustHaveAnalysis.candidateEvaluation.matchedQualifications.map((q, i) => (
                        <Badge key={i} variant="success">{q}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Missing */}
              <div>
                <h4 className="font-medium text-red-700 mb-3 flex items-center gap-2">
                  <span>❌</span> Missing Requirements
                </h4>

                {/* Missing Skills */}
                {data.mustHaveAnalysis.candidateEvaluation.missingSkills.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">Skills</p>
                    <div className="space-y-2">
                      {data.mustHaveAnalysis.candidateEvaluation.missingSkills.map((s, i) => (
                        <div key={i} className="bg-red-50 rounded-lg p-3 border border-red-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-red-800">{s.skill}</span>
                            <Badge variant={s.severity === 'Dealbreaker' ? 'error' : 'warning'}>{s.severity}</Badge>
                          </div>
                          <p className="text-sm text-red-600">{s.alternativeEvidence || 'No alternative evidence found'}</p>
                          {s.canBeLearnedQuickly && (
                            <p className="text-xs text-orange-600 mt-1">⚡ Can be learned quickly</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing Experiences */}
                {data.mustHaveAnalysis.candidateEvaluation.missingExperiences.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">Experience</p>
                    <div className="space-y-2">
                      {data.mustHaveAnalysis.candidateEvaluation.missingExperiences.map((e, i) => (
                        <div key={i} className="bg-red-50 rounded-lg p-3 border border-red-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-red-800">{e.experience}</span>
                            <Badge variant={e.severity === 'Dealbreaker' ? 'error' : 'warning'}>{e.severity}</Badge>
                          </div>
                          <p className="text-sm text-red-600">Gap: {e.gap}</p>
                          {e.partiallyMet && (
                            <p className="text-xs text-orange-600 mt-1">Partially met: {e.partiallyMet}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing Qualifications */}
                {data.mustHaveAnalysis.candidateEvaluation.missingQualifications.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Qualifications</p>
                    <div className="space-y-2">
                      {data.mustHaveAnalysis.candidateEvaluation.missingQualifications.map((q, i) => (
                        <div key={i} className="bg-red-50 rounded-lg p-3 border border-red-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-red-800">{q.qualification}</span>
                            <Badge variant={q.severity === 'Dealbreaker' ? 'error' : 'warning'}>{q.severity}</Badge>
                          </div>
                          {q.alternative && (
                            <p className="text-sm text-orange-600">Alternative: {q.alternative}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.mustHaveAnalysis.candidateEvaluation.missingSkills.length === 0 &&
                 data.mustHaveAnalysis.candidateEvaluation.missingExperiences.length === 0 &&
                 data.mustHaveAnalysis.candidateEvaluation.missingQualifications.length === 0 && (
                  <p className="text-emerald-600 bg-emerald-50 rounded-lg p-3">No missing must-have requirements!</p>
                )}
              </div>
            </div>

            {/* Gap Analysis */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-700 mb-2">📊 Gap Analysis</h4>
              <p className="text-gray-600">{data.mustHaveAnalysis.gapAnalysis}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nice-to-Have Analysis */}
      {data.niceToHaveAnalysis && (
        <Card>
          <CardHeader icon="⭐">Nice-to-Have Analysis</CardHeader>
          <CardContent>
            {/* Nice-to-Have Score */}
            <div className="mb-6 flex items-center gap-6">
              <ScoreCircle score={data.niceToHaveAnalysis.niceToHaveScore} size="medium" />
              <div>
                <h4 className="font-semibold text-gray-800">Nice-to-Have Score</h4>
                <p className="text-gray-500 text-sm">Bonus qualifications coverage</p>
              </div>
            </div>

            {/* Extracted Nice-to-Haves from JD */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-3">📝 Extracted Nice-to-Have Requirements from JD</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Skills */}
                <div>
                  <h5 className="text-sm font-medium text-blue-600 mb-2">Preferred Skills</h5>
                  <div className="space-y-2">
                    {niceToHaveExtracted.skills.map((s, i) => (
                      <div key={i} className="bg-white rounded p-2 text-sm">
                        <p className="font-medium text-gray-800">{s.skill}</p>
                        <p className="text-gray-500 text-xs">{s.valueAdd}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Experiences */}
                <div>
                  <h5 className="text-sm font-medium text-blue-600 mb-2">Preferred Experience</h5>
                  <div className="space-y-2">
                    {niceToHaveExtracted.experiences.map((e, i) => (
                      <div key={i} className="bg-white rounded p-2 text-sm">
                        <p className="font-medium text-gray-800">{e.experience}</p>
                        <p className="text-gray-500 text-xs">{e.valueAdd}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Qualifications */}
                <div>
                  <h5 className="text-sm font-medium text-blue-600 mb-2">Preferred Qualifications</h5>
                  <div className="space-y-2">
                    {niceToHaveExtracted.qualifications.map((q, i) => (
                      <div key={i} className="bg-white rounded p-2 text-sm">
                        <p className="font-medium text-gray-800">{q.qualification}</p>
                        <p className="text-gray-500 text-xs">{q.valueAdd}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate Evaluation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Matched Nice-to-Haves */}
              <div>
                <h4 className="font-medium text-blue-700 mb-3 flex items-center gap-2">
                  <span>✨</span> Matched Nice-to-Haves
                </h4>
                
                {data.niceToHaveAnalysis.candidateEvaluation.matchedSkills.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm text-gray-500 mb-2">Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {data.niceToHaveAnalysis.candidateEvaluation.matchedSkills.map((s, i) => (
                        <Badge key={i} variant="info">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {data.niceToHaveAnalysis.candidateEvaluation.matchedExperiences.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm text-gray-500 mb-2">Experience</p>
                    <div className="flex flex-wrap gap-2">
                      {data.niceToHaveAnalysis.candidateEvaluation.matchedExperiences.map((e, i) => (
                        <Badge key={i} variant="info">{e}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {data.niceToHaveAnalysis.candidateEvaluation.matchedQualifications.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Qualifications</p>
                    <div className="flex flex-wrap gap-2">
                      {data.niceToHaveAnalysis.candidateEvaluation.matchedQualifications.map((q, i) => (
                        <Badge key={i} variant="info">{q}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bonus Skills */}
              <div>
                <h4 className="font-medium text-purple-700 mb-3 flex items-center gap-2">
                  <span>🎁</span> Bonus Skills (Not in JD)
                </h4>
                {data.niceToHaveAnalysis.candidateEvaluation.bonusSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.niceToHaveAnalysis.candidateEvaluation.bonusSkills.map((s, i) => (
                      <Badge key={i} variant="success">{s}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No additional bonus skills identified</p>
                )}
              </div>
            </div>

            {/* Competitive Advantage */}
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-2">🏆 Competitive Advantage</h4>
              <p className="text-blue-700">{data.niceToHaveAnalysis.competitiveAdvantage}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Candidate Profile */}
        <Card>
          <CardHeader icon="👤">Candidate Profile</CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h5 className="text-sm font-medium text-gray-500 mb-2">Education</h5>
              <p className="text-gray-800">{data.resumeAnalysis.educationLevel}</p>
            </div>
            <div>
              <h5 className="text-sm font-medium text-gray-500 mb-2">Industries</h5>
              <div className="flex flex-wrap gap-2">
                {data.resumeAnalysis.industries.map((ind, i) => (
                  <Badge key={i} variant="default">{ind}</Badge>
                ))}
              </div>
            </div>
            {data.resumeAnalysis.certifications.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-gray-500 mb-2">Certifications</h5>
                <div className="flex flex-wrap gap-2">
                  {data.resumeAnalysis.certifications.map((cert, i) => (
                    <Badge key={i} variant="success">{cert}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h5 className="text-sm font-medium text-gray-500 mb-2">Key Achievements</h5>
              <ul className="space-y-2">
                {data.resumeAnalysis.keyAchievements.map((achievement, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <span className="text-emerald-500 mt-1">●</span>
                    {achievement}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Job Requirements */}
        <Card>
          <CardHeader icon="📄">Job Requirements</CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h5 className="text-sm font-medium text-gray-500 mb-2">Industry Focus</h5>
              <p className="text-gray-800">{data.jdAnalysis.industryFocus}</p>
            </div>
            <div>
              <h5 className="text-sm font-medium text-gray-500 mb-2">Key Responsibilities</h5>
              <ul className="space-y-2">
                {data.jdAnalysis.keyResponsibilities.map((resp, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <span className="text-indigo-500 mt-1">●</span>
                    {resp}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Skills Analysis */}
      <Card>
        <CardHeader icon="🎯">Skills Analysis</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Must-Have Skills */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                Must-Have Skills
              </h4>
              
              {/* Matched */}
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-2">Matched ({data.skillMatch.matchedMustHave.length})</p>
                <div className="space-y-3">
                  {data.skillMatch.matchedMustHave.map((skill, i) => (
                    <div key={i} className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-emerald-800">{skill.skill}</span>
                        <Badge variant="success">{skill.proficiencyLevel}</Badge>
                      </div>
                      <p className="text-sm text-emerald-600">{skill.evidenceFromResume}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Missing */}
              {data.skillMatch.missingMustHave.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Missing ({data.skillMatch.missingMustHave.length})</p>
                  <div className="space-y-3">
                    {data.skillMatch.missingMustHave.map((skill, i) => (
                      <div key={i} className="bg-red-50 rounded-lg p-3 border border-red-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-red-800">{skill.skill}</span>
                          <Badge variant={skill.importance === 'Critical' ? 'error' : 'warning'}>{skill.importance}</Badge>
                        </div>
                        <p className="text-sm text-red-600">{skill.mitigationPossibility}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Nice-to-Have Skills */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                Nice-to-Have Skills
              </h4>
              
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-2">Matched</p>
                <div className="flex flex-wrap gap-2">
                  {data.skillMatch.matchedNiceToHave.map((skill, i) => (
                    <SkillTag key={i} skill={skill} matched />
                  ))}
                </div>
              </div>

              {data.skillMatch.missingNiceToHave.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">Missing</p>
                  <div className="flex flex-wrap gap-2">
                    {data.skillMatch.missingNiceToHave.map((skill, i) => (
                      <SkillTag key={i} skill={skill} />
                    ))}
                  </div>
                </div>
              )}

              {data.skillMatch.additionalRelevantSkills.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Additional Relevant Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {data.skillMatch.additionalRelevantSkills.map((skill, i) => (
                      <Badge key={i} variant="info">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Skill Score Breakdown */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <h4 className="font-semibold text-gray-800 mb-4">Score Breakdown</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ProgressBar value={data.skillMatchScore.breakdown.mustHaveScore} label="Must-Have Coverage" />
              <ProgressBar value={data.skillMatchScore.breakdown.niceToHaveScore} label="Nice-to-Have Coverage" />
              <ProgressBar value={data.skillMatchScore.breakdown.depthOfExpertise} label="Depth of Expertise" />
            </div>
            <p className="mt-4 text-gray-600 text-sm bg-gray-50 rounded-lg p-4">
              {data.skillMatchScore.skillApplicationAnalysis}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Transferable Skills */}
      {data.transferableSkills && data.transferableSkills.length > 0 && (
        <Card>
          <CardHeader icon="🔄">Transferable Skills</CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Adjacent skills that transfer to the required competencies
            </p>
            <div className="space-y-3">
              {data.transferableSkills.map((ts, i) => (
                <div key={i} className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{ts.candidateHas}</Badge>
                      <span className="text-gray-400">→</span>
                      <Badge variant="default">{ts.required}</Badge>
                    </div>
                    <span className="text-sm font-medium text-blue-700">{ts.valueFactor}% value</span>
                  </div>
                  <p className="text-sm text-blue-700">{ts.relevance}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credibility Analysis */}
      <Card>
        <CardHeader icon={data.skillMatchScore.credibilityFlags.hasRedFlags ? "⚠️" : "✅"}>
          Credibility Analysis
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Positive Indicators */}
            <div>
              <h4 className="font-medium text-emerald-700 mb-3 flex items-center gap-2">
                <span>✓</span> Positive Indicators
              </h4>
              <ul className="space-y-2">
                {data.skillMatchScore.credibilityFlags.positiveIndicators.map((indicator, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700 bg-emerald-50 rounded-lg p-3">
                    <span className="text-emerald-500">●</span>
                    {indicator}
                  </li>
                ))}
              </ul>
            </div>

            {/* Concerns */}
            <div>
              <h4 className="font-medium text-orange-700 mb-3 flex items-center gap-2">
                <span>!</span> Areas of Concern
              </h4>
              {data.skillMatchScore.credibilityFlags.concerns.length > 0 ? (
                <ul className="space-y-2">
                  {data.skillMatchScore.credibilityFlags.concerns.map((concern, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700 bg-orange-50 rounded-lg p-3">
                      <span className="text-orange-500">●</span>
                      {concern}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 bg-gray-50 rounded-lg p-3">No concerns identified</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Experience Validation */}
      <Card>
        <CardHeader icon="📊">Experience Validation</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Required</p>
              <p className="text-xl font-bold text-gray-800">{data.experienceMatch.required}</p>
            </div>
            <div className="text-center p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-indigo-600">Candidate Has</p>
              <p className="text-xl font-bold text-indigo-800">{data.experienceMatch.candidate}</p>
            </div>
            <div className="text-center p-4 bg-emerald-50 rounded-lg">
              <p className="text-sm text-emerald-600">Gap</p>
              <p className="text-xl font-bold text-emerald-800">{data.experienceMatch.yearsGap}</p>
            </div>
          </div>

          {/* Experience Breakdown by Type */}
          {data.experienceBreakdown && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs text-blue-600">Full-Time</p>
                  <p className="text-lg font-bold text-blue-800">{data.experienceBreakdown.fullTimeExperience}</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-xs text-amber-600">Internship</p>
                  <p className="text-lg font-bold text-amber-800">{data.experienceBreakdown.internshipExperience}</p>
                </div>
                {data.experienceBreakdown.contractExperience && (
                  <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-xs text-purple-600">Contract</p>
                    <p className="text-lg font-bold text-purple-800">{data.experienceBreakdown.contractExperience}</p>
                  </div>
                )}
              </div>
              {data.experienceBreakdown.note && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-6">{data.experienceBreakdown.note}</p>
              )}
            </>
          )}

          <div className="mb-6">
            <ProgressBar value={data.experienceValidation.score} label="Experience Relevance Score" />
            <p className="mt-2 text-sm text-gray-600">
              Relevance to Role: <Badge variant={data.experienceValidation.relevanceToRole === 'High' ? 'success' : data.experienceValidation.relevanceToRole === 'Medium' ? 'warning' : 'error'}>{data.experienceValidation.relevanceToRole}</Badge>
            </p>
          </div>

          <p className="text-gray-700 bg-gray-50 rounded-lg p-4 mb-6">{data.experienceMatch.assessment}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strengths */}
            <div>
              <h4 className="font-medium text-emerald-700 mb-3">💪 Strengths</h4>
              <div className="space-y-3">
                {data.experienceValidation.strengths.map((strength, i) => (
                  <div key={i} className="bg-emerald-50 rounded-lg p-3 border-l-4 border-emerald-500">
                    <p className="font-medium text-emerald-800">{strength.area}</p>
                    <p className="text-sm text-emerald-600">{strength.impact}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Gaps */}
            <div>
              <h4 className="font-medium text-orange-700 mb-3">📉 Gaps</h4>
              {data.experienceValidation.gaps.length > 0 ? (
                <div className="space-y-3">
                  {data.experienceValidation.gaps.map((gap, i) => (
                    <div key={i} className="bg-orange-50 rounded-lg p-3 border-l-4 border-orange-500">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-orange-800">{gap.area}</p>
                        <Badge variant={gap.severity === 'Critical' ? 'error' : gap.severity === 'Moderate' ? 'warning' : 'default'}>{gap.severity}</Badge>
                      </div>
                      <p className="text-sm text-orange-600">Can be addressed: {gap.canBeAddressed}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 bg-gray-50 rounded-lg p-3">No significant gaps identified</p>
              )}
            </div>
          </div>

          <div className="mt-6 p-4 bg-indigo-50 rounded-lg">
            <h4 className="font-medium text-indigo-800 mb-2">📈 Career Progression</h4>
            <p className="text-indigo-700">{data.experienceValidation.careerProgression}</p>
          </div>
        </CardContent>
      </Card>

      {/* Candidate Potential */}
      <Card>
        <CardHeader icon="🚀">Candidate Potential</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Growth Trajectory</h4>
              <p className="text-gray-600 bg-gray-50 rounded-lg p-4">{data.candidatePotential.growthTrajectory}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Learning Agility</h4>
              <p className="text-gray-600 bg-gray-50 rounded-lg p-4">{data.candidatePotential.learningAgility}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            {data.candidatePotential.leadershipIndicators.length > 0 && (
              <div>
                <h4 className="font-medium text-purple-700 mb-3">👑 Leadership Indicators</h4>
                <ul className="space-y-2">
                  {data.candidatePotential.leadershipIndicators.map((indicator, i) => (
                    <li key={i} className="text-gray-700 bg-purple-50 rounded-lg p-2 text-sm">{indicator}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.candidatePotential.uniqueValueProps.length > 0 && (
              <div>
                <h4 className="font-medium text-blue-700 mb-3">⭐ Unique Value</h4>
                <ul className="space-y-2">
                  {data.candidatePotential.uniqueValueProps.map((prop, i) => (
                    <li key={i} className="text-gray-700 bg-blue-50 rounded-lg p-2 text-sm">{prop}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.candidatePotential.riskFactors.length > 0 && (
              <div>
                <h4 className="font-medium text-red-700 mb-3">⚠️ Risk Factors</h4>
                <ul className="space-y-2">
                  {data.candidatePotential.riskFactors.map((risk, i) => (
                    <li key={i} className="text-gray-700 bg-red-50 rounded-lg p-2 text-sm">{risk}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {data.candidatePotential.cultureFitIndicators.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium text-gray-700 mb-3">🤝 Culture Fit Indicators</h4>
              <div className="flex flex-wrap gap-2">
                {data.candidatePotential.cultureFitIndicators.map((indicator, i) => (
                  <Badge key={i} variant="info">{indicator}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader icon="💡">Recommendations</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* For Recruiter */}
            <div>
              <h4 className="font-medium text-indigo-700 mb-3">For Recruiter</h4>
              <ul className="space-y-2">
                {data.recommendations.forRecruiter.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <span className="text-indigo-500 mt-1">→</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>

            {/* For Candidate */}
            {data.recommendations.forCandidate.length > 0 && (
              <div>
                <h4 className="font-medium text-green-700 mb-3">For Candidate</h4>
                <ul className="space-y-2">
                  {data.recommendations.forCandidate.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <span className="text-green-500 mt-1">→</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Interview Questions */}
          {data.recommendations.interviewQuestions.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h4 className="font-medium text-purple-700 mb-3">🎤 Suggested Interview Questions</h4>
              <div className="space-y-3">
                {data.recommendations.interviewQuestions.map((question, i) => (
                  <div key={i} className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
                    <span className="text-purple-800">{i + 1}. {question}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interview Focus Areas */}
          {data.overallFit.interviewFocus.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h4 className="font-medium text-orange-700 mb-3">🔍 Areas to Probe in Interview</h4>
              <div className="flex flex-wrap gap-2">
                {data.overallFit.interviewFocus.map((area, i) => (
                  <Badge key={i} variant="warning">{area}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Interview Questions */}
      {data.suggestedInterviewQuestions && (
        <Card>
          <CardHeader icon="🎯">Suggested Interview Questions</CardHeader>
          <CardContent>
            <InterviewQuestionsSection questions={data.suggestedInterviewQuestions} />
          </CardContent>
        </Card>
      )}

      {/* Areas to Probe Deeper */}
      {data.areasToProbeDeeper && data.areasToProbeDeeper.length > 0 && (
        <Card className="border-2 border-orange-200">
          <CardHeader icon="🔬">Areas to Probe Deeper</CardHeader>
          <CardContent>
            <ProbingAreasSection areas={data.areasToProbeDeeper} />
          </CardContent>
        </Card>
      )}

      {/* Suggested Role */}
      {data.overallFit.suggestedRole && (
        <Card className="border-2 border-indigo-200">
          <CardContent className="text-center py-6">
            <p className="text-gray-500 text-sm mb-2">Alternative Role Suggestion</p>
            <p className="text-xl font-bold text-indigo-600">{data.overallFit.suggestedRole}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Interview Questions Section Component
const InterviewQuestionsSection = ({ questions }: { questions: MatchResultData['suggestedInterviewQuestions'] }) => {
  const categories = [
    { key: 'technical' as const, label: 'Technical Questions', icon: '💻', color: 'indigo' },
    { key: 'behavioral' as const, label: 'Behavioral Questions', icon: '🧠', color: 'purple' },
    { key: 'experienceValidation' as const, label: 'Experience Validation', icon: '✅', color: 'green' },
    { key: 'situational' as const, label: 'Situational Questions', icon: '🎭', color: 'blue' },
    { key: 'cultureFit' as const, label: 'Culture Fit Questions', icon: '🤝', color: 'teal' },
    { key: 'redFlagProbing' as const, label: 'Red Flag Probing', icon: '⚠️', color: 'red' },
  ];

  const colorClasses: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', badge: 'bg-indigo-100 text-indigo-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', badge: 'bg-teal-100 text-teal-700' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
  };

  const getDifficultyColor = (difficulty: string) => {
    const d = difficulty.toLowerCase();
    if (d === 'basic') return 'bg-green-100 text-green-700';
    if (d === 'intermediate') return 'bg-blue-100 text-blue-700';
    if (d === 'advanced') return 'bg-orange-100 text-orange-700';
    if (d === 'expert') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  if (!questions) return null;

  return (
    <div className="space-y-8">
      {categories.map(({ key, label, icon, color }) => {
        const categoryQuestions = questions[key];
        if (!categoryQuestions || categoryQuestions.length === 0) return null;

        const colors = colorClasses[color];

        return (
          <div key={key} className="space-y-4">
            <h4 className={`font-semibold ${colors.text} flex items-center gap-2 text-lg`}>
              <span>{icon}</span> {label}
            </h4>
            
            {categoryQuestions.map((category, catIdx) => (
              <div key={catIdx} className={`${colors.bg} rounded-xl p-5 border ${colors.border}`}>
                <div className="flex items-center gap-2 mb-4">
                  <h5 className={`font-medium ${colors.text}`}>{category.area}</h5>
                  {category.subArea && (
                    <span className={`text-sm px-2 py-0.5 rounded ${colors.badge}`}>
                      {category.subArea}
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  {category.questions.map((q, qIdx) => (
                    <InterviewQuestionCard
                      key={qIdx}
                      question={q}
                      index={qIdx + 1}
                      getDifficultyColor={getDifficultyColor}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// Interview Question Card Component
const InterviewQuestionCard = ({ 
  question, 
  index, 
  getDifficultyColor 
}: { 
  question: InterviewQuestion; 
  index: number;
  getDifficultyColor: (d: string) => string;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Question Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold text-gray-400 text-sm">Q{index}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getDifficultyColor(question.difficulty)}`}>
                {question.difficulty}
              </span>
              <span className="text-xs text-gray-400">⏱ {question.timeEstimate}</span>
            </div>
            <p className="font-medium text-gray-800">{question.question}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {/* Purpose */}
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Purpose</p>
            <p className="text-sm text-gray-600">{question.purpose}</p>
          </div>

          {/* What to Look For */}
          {question.lookFor && question.lookFor.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">What to Look For</p>
              <div className="flex flex-wrap gap-2">
                {question.lookFor.map((item, i) => (
                  <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full border border-emerald-200">
                    ✓ {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up Questions */}
          {question.followUps && question.followUps.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Follow-up Questions</p>
              <ul className="space-y-1">
                {question.followUps.map((followUp, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-indigo-500">→</span>
                    {followUp}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Probing Areas Section Component
const ProbingAreasSection = ({ areas }: { areas: ProbingArea[] }) => {
  const priorityColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    Critical: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', badge: 'bg-red-500 text-white' },
    High: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', badge: 'bg-orange-500 text-white' },
    Medium: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', badge: 'bg-yellow-500 text-white' },
    Low: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800', badge: 'bg-blue-500 text-white' },
  };

  return (
    <div className="space-y-6">
      {areas.map((area, idx) => {
        const colors = priorityColors[area.priority] || priorityColors.Medium;

        return (
          <div key={idx} className={`${colors.bg} rounded-xl p-5 border-2 ${colors.border}`}>
            {/* Area Header */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h4 className={`font-bold text-lg ${colors.text}`}>{area.area}</h4>
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${colors.badge}`}>
                    {area.priority} Priority
                  </span>
                </div>
                <p className="text-gray-600">{area.reason}</p>
              </div>
            </div>

            {/* Suggested Approach */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Suggested Approach</p>
              <p className="text-sm text-gray-700">{area.suggestedApproach}</p>
            </div>

            {/* Sub-Areas */}
            {area.subAreas && area.subAreas.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-600">Sub-Areas to Investigate:</p>
                {area.subAreas.map((subArea, subIdx) => (
                  <ProbingSubAreaCard key={subIdx} subArea={subArea} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Probing Sub-Area Card Component
const ProbingSubAreaCard = ({ subArea }: { subArea: ProbingSubArea }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <h5 className="font-medium text-gray-800">{subArea.name}</h5>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-4">
          {/* Specific Concerns */}
          {subArea.specificConcerns && subArea.specificConcerns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Specific Concerns</p>
              <ul className="space-y-1">
                {subArea.specificConcerns.map((concern, i) => (
                  <li key={i} className="text-sm text-orange-700 flex items-start gap-2">
                    <span>⚠️</span> {concern}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation Questions */}
          {subArea.validationQuestions && subArea.validationQuestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Validation Questions</p>
              <ul className="space-y-2">
                {subArea.validationQuestions.map((q, i) => (
                  <li key={i} className="text-sm text-gray-700 bg-gray-50 p-2 rounded flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">Q:</span> {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Green Flags vs Red Flags */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subArea.greenFlags && subArea.greenFlags.length > 0 && (
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider mb-2">✅ Green Flags (Good Signs)</p>
                <ul className="space-y-1">
                  {subArea.greenFlags.map((flag, i) => (
                    <li key={i} className="text-sm text-emerald-700">{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            {subArea.redFlags && subArea.redFlags.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs font-medium text-red-700 uppercase tracking-wider mb-2">🚩 Red Flags (Warning Signs)</p>
                <ul className="space-y-1">
                  {subArea.redFlags.map((flag, i) => (
                    <li key={i} className="text-sm text-red-700">{flag}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
