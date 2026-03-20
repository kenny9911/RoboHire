import type { MatchResult } from '../../types/index.js';
import type { SkillMatchOutput, ExperienceMatchOutput, PreferenceMatchOutput } from './types.js';

/**
 * Pure function: merges three parallel skill outputs into a complete MatchResult.
 * No LLM call — deterministic computation only.
 */
export function mergeSkillResults(
  skillOut: SkillMatchOutput,
  expOut: ExperienceMatchOutput,
  prefOut: PreferenceMatchOutput,
): MatchResult {
  // Compute overall score from weighted components
  const skillScore = skillOut.skillMatchScore?.score ?? 0;
  const expScore = expOut.experienceValidation?.score ?? 0;
  const potentialScore = computePotentialScore(expOut);

  const SKILL_WEIGHT = 0.40;
  const EXP_WEIGHT = 0.35;
  const POTENTIAL_WEIGHT = 0.25;

  let rawScore = Math.round(
    skillScore * SKILL_WEIGHT +
    expScore * EXP_WEIGHT +
    potentialScore * POTENTIAL_WEIGHT
  );

  // Apply disqualification caps
  if (skillOut.mustHaveAnalysis?.disqualified) {
    rawScore = Math.min(rawScore, 25);
  }

  const dealbreakers = skillOut.hardRequirementGaps?.filter(
    (g) => g.severity === 'dealbreaker'
  );
  if (dealbreakers && dealbreakers.length > 0) {
    rawScore = Math.min(rawScore, 25);
  }

  const criticals = skillOut.hardRequirementGaps?.filter(
    (g) => g.severity === 'critical'
  );
  if (criticals && criticals.length > 0) {
    rawScore = Math.min(rawScore, 45);
  }

  const significants = skillOut.hardRequirementGaps?.filter(
    (g) => g.severity === 'significant'
  );
  if (significants && significants.length > 0) {
    rawScore = Math.min(rawScore, 65);
  }

  const score = Math.max(0, Math.min(100, rawScore));
  const grade = scoreToGrade(score);
  const verdict = scoreToVerdict(score);

  const result: MatchResult = {
    // Resume analysis: merge from both skill + experience outputs
    resumeAnalysis: {
      candidateName: expOut.resumeAnalysis?.candidateName ?? '',
      totalYearsExperience: expOut.resumeAnalysis?.totalYearsExperience ?? '0',
      currentRole: expOut.resumeAnalysis?.currentRole ?? '',
      technicalSkills: skillOut.resumeAnalysis?.technicalSkills ?? [],
      softSkills: skillOut.resumeAnalysis?.softSkills ?? [],
      industries: expOut.resumeAnalysis?.industries ?? [],
      educationLevel: skillOut.resumeAnalysis?.educationLevel ?? '',
      certifications: skillOut.resumeAnalysis?.certifications ?? [],
      keyAchievements: expOut.resumeAnalysis?.keyAchievements ?? [],
    },

    // From SkillMatchSkill
    jdAnalysis: skillOut.jdAnalysis ?? {
      jobTitle: '', seniorityLevel: '', requiredYearsExperience: '',
      mustHaveSkills: [], niceToHaveSkills: [], industryFocus: '', keyResponsibilities: [],
    },
    mustHaveAnalysis: skillOut.mustHaveAnalysis ?? defaultMustHaveAnalysis(),
    niceToHaveAnalysis: skillOut.niceToHaveAnalysis ?? defaultNiceToHaveAnalysis(),
    skillMatch: skillOut.skillMatch ?? {
      matchedMustHave: [], missingMustHave: [],
      matchedNiceToHave: [], missingNiceToHave: [], additionalRelevantSkills: [],
    },
    skillMatchScore: skillOut.skillMatchScore ?? {
      score: 0, breakdown: { mustHaveScore: 0, niceToHaveScore: 0, depthOfExpertise: 0 },
      skillApplicationAnalysis: '', credibilityFlags: { hasRedFlags: false, concerns: [], positiveIndicators: [] },
    },
    transferableSkills: skillOut.transferableSkills ?? [],
    hardRequirementGaps: skillOut.hardRequirementGaps ?? [],

    // From ExperienceMatchSkill
    experienceMatch: expOut.experienceMatch ?? {
      required: '', candidate: '', yearsGap: '', assessment: '',
    },
    experienceValidation: expOut.experienceValidation ?? {
      score: 0, relevanceToRole: '', gaps: [], strengths: [], careerProgression: '',
    },
    candidatePotential: expOut.candidatePotential ?? {
      growthTrajectory: '', leadershipIndicators: [], learningAgility: '',
      uniqueValueProps: [], cultureFitIndicators: [], riskFactors: [],
    },
    experienceBreakdown: expOut.experienceBreakdown,

    // Computed overall score
    overallMatchScore: {
      score,
      grade,
      breakdown: {
        skillMatchWeight: SKILL_WEIGHT,
        skillMatchScore: skillScore,
        experienceWeight: EXP_WEIGHT,
        experienceScore: expScore,
        potentialWeight: POTENTIAL_WEIGHT,
        potentialScore,
      },
      confidence: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low',
    },

    // Computed overall fit
    overallFit: {
      verdict,
      summary: buildSummary(score, grade, skillOut, expOut),
      topReasons: buildTopReasons(skillOut, expOut),
      interviewFocus: prefOut.overallFit?.interviewFocus ?? [],
      hiringRecommendation: buildHiringRec(score, grade),
      suggestedRole: prefOut.overallFit?.suggestedRole ?? '',
    },

    // From PreferenceMatchSkill
    recommendations: prefOut.recommendations ?? {
      forRecruiter: [], forCandidate: [], interviewQuestions: [],
    },
    suggestedInterviewQuestions: prefOut.suggestedInterviewQuestions ?? {
      technical: [], behavioral: [], experienceValidation: [],
      situational: [], cultureFit: [], redFlagProbing: [],
    },
    areasToProbeDeeper: prefOut.areasToProbeDeeper ?? [],
    preferenceAlignment: prefOut.preferenceAlignment,
  };

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computePotentialScore(exp: ExperienceMatchOutput): number {
  const cp = exp.candidatePotential;
  if (!cp) return 50;
  let score = 50;
  if (cp.leadershipIndicators?.length > 0) score += 10;
  if (cp.uniqueValueProps?.length > 0) score += 10;
  if (cp.riskFactors?.length > 2) score -= 15;
  if (cp.learningAgility === 'High' || cp.learningAgility === 'Exceptional') score += 15;
  if (cp.growthTrajectory === 'Upward' || cp.growthTrajectory === 'Accelerating') score += 10;
  return Math.max(0, Math.min(100, score));
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

function scoreToVerdict(score: number): string {
  if (score >= 80) return 'Strong Fit';
  if (score >= 65) return 'Good Fit';
  if (score >= 50) return 'Moderate Fit';
  if (score >= 30) return 'Weak Fit';
  return 'Not a Fit';
}

function buildSummary(score: number, grade: string, skill: SkillMatchOutput, exp: ExperienceMatchOutput): string {
  const matched = skill.skillMatch?.matchedMustHave?.length ?? 0;
  const missing = skill.skillMatch?.missingMustHave?.length ?? 0;
  const expYears = exp.resumeAnalysis?.totalYearsExperience ?? 'unknown';
  return `Score: ${score}/100 (${grade}). ${matched} must-have skills matched, ${missing} missing. ${expYears} years of experience.`;
}

function buildTopReasons(skill: SkillMatchOutput, exp: ExperienceMatchOutput): string[] {
  const reasons: string[] = [];
  if ((skill.skillMatch?.matchedMustHave?.length ?? 0) > 0) {
    reasons.push(`Strong skill alignment: ${skill.skillMatch.matchedMustHave.map(s => s.skill).slice(0, 3).join(', ')}`);
  }
  if ((exp.experienceValidation?.strengths?.length ?? 0) > 0) {
    reasons.push(`Experience strength: ${exp.experienceValidation.strengths[0].area}`);
  }
  if ((skill.skillMatch?.missingMustHave?.length ?? 0) > 0) {
    reasons.push(`Missing: ${skill.skillMatch.missingMustHave.map(s => s.skill).slice(0, 2).join(', ')}`);
  }
  if ((exp.experienceValidation?.gaps?.length ?? 0) > 0) {
    reasons.push(`Experience gap: ${exp.experienceValidation.gaps[0].area}`);
  }
  return reasons.slice(0, 5);
}

function buildHiringRec(score: number, grade: string): string {
  if (score >= 80) return 'Strongly recommend proceeding to interview';
  if (score >= 65) return 'Recommend interview with focus on gap areas';
  if (score >= 50) return 'Consider for interview if pipeline is limited';
  if (score >= 30) return 'Not recommended unless specific strengths align with team needs';
  return 'Do not proceed';
}

function defaultMustHaveAnalysis(): MatchResult['mustHaveAnalysis'] {
  return {
    extractedMustHaves: { skills: [], experiences: [], qualifications: [] },
    candidateEvaluation: {
      meetsAllMustHaves: false,
      matchedSkills: [], missingSkills: [],
      matchedExperiences: [], missingExperiences: [],
      matchedQualifications: [], missingQualifications: [],
    },
    mustHaveScore: 0,
    disqualified: false,
    disqualificationReasons: [],
    gapAnalysis: '',
  };
}

function defaultNiceToHaveAnalysis(): MatchResult['niceToHaveAnalysis'] {
  return {
    extractedNiceToHaves: { skills: [], experiences: [], qualifications: [] },
    candidateEvaluation: {
      matchedSkills: [], matchedExperiences: [],
      matchedQualifications: [], bonusSkills: [],
    },
    niceToHaveScore: 0,
    competitiveAdvantage: '',
  };
}

/**
 * Build a synthetic MatchResult for Tier C resumes (clearly unqualified).
 * Uses Phase 1 screening data — no LLM call.
 */
export function buildTierCResult(
  quickScore: number,
  keyFindings: string[],
  candidateName: string,
): MatchResult {
  const score = Math.min(quickScore, 30);
  const grade = scoreToGrade(score);

  return {
    resumeAnalysis: {
      candidateName,
      totalYearsExperience: '0',
      currentRole: '',
      technicalSkills: [],
      softSkills: [],
      industries: [],
      educationLevel: '',
      certifications: [],
      keyAchievements: [],
    },
    jdAnalysis: {
      jobTitle: '', seniorityLevel: '', requiredYearsExperience: '',
      mustHaveSkills: [], niceToHaveSkills: [], industryFocus: '', keyResponsibilities: [],
    },
    mustHaveAnalysis: defaultMustHaveAnalysis(),
    niceToHaveAnalysis: defaultNiceToHaveAnalysis(),
    skillMatch: {
      matchedMustHave: [], missingMustHave: [],
      matchedNiceToHave: [], missingNiceToHave: [], additionalRelevantSkills: [],
    },
    skillMatchScore: {
      score: 0,
      breakdown: { mustHaveScore: 0, niceToHaveScore: 0, depthOfExpertise: 0 },
      skillApplicationAnalysis: keyFindings.join('. '),
      credibilityFlags: { hasRedFlags: false, concerns: [], positiveIndicators: [] },
    },
    experienceMatch: { required: '', candidate: '', yearsGap: '', assessment: '' },
    experienceValidation: { score: 0, relevanceToRole: '', gaps: [], strengths: [], careerProgression: '' },
    candidatePotential: {
      growthTrajectory: '', leadershipIndicators: [], learningAgility: '',
      uniqueValueProps: [], cultureFitIndicators: [], riskFactors: [],
    },
    overallMatchScore: {
      score,
      grade,
      breakdown: {
        skillMatchWeight: 0.40, skillMatchScore: 0,
        experienceWeight: 0.35, experienceScore: 0,
        potentialWeight: 0.25, potentialScore: 0,
      },
      confidence: 'Low',
    },
    overallFit: {
      verdict: 'Not a Fit',
      summary: `Rapid screening score: ${quickScore}/100. ${keyFindings.join('. ')}`,
      topReasons: keyFindings,
      interviewFocus: [],
      hiringRecommendation: 'Do not proceed',
      suggestedRole: '',
    },
    recommendations: { forRecruiter: [], forCandidate: [], interviewQuestions: [] },
    suggestedInterviewQuestions: {
      technical: [], behavioral: [], experienceValidation: [],
      situational: [], cultureFit: [], redFlagProbing: [],
    },
    areasToProbeDeeper: [],
  };
}
