import type {
  MatchResult,
  PreferenceAlignment,
  InterviewQuestionCategory,
  ProbingArea,
} from '../../types/index.js';

// ---------------------------------------------------------------------------
// Phase 1: Batch Screening
// ---------------------------------------------------------------------------

export interface BatchScreenInput {
  jobTitle: string;
  jobDescription: string; // truncated to ~2000 chars
  jobMetadata?: string;
  resumes: Array<{
    id: string;
    name: string;
    currentRole?: string;
    experienceYears?: number;
    tags?: string[];
    preview: string; // first 500 chars of resumeText
  }>;
}

export interface BatchScreenResult {
  screenings: Array<{
    resumeId: string;
    quickScore: number; // 0-100
    tier: 'A' | 'B' | 'C';
    keyFindings: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Phase 2: Skill Decomposition — Partial Result Types
// ---------------------------------------------------------------------------

export interface SkillMatchInput {
  resume: string;
  jd: string;
  jobMetadata?: string;
}

export interface SkillMatchOutput {
  resumeAnalysis: {
    technicalSkills: string[];
    softSkills: string[];
    certifications: string[];
    educationLevel: string;
  };
  jdAnalysis: MatchResult['jdAnalysis'];
  mustHaveAnalysis: MatchResult['mustHaveAnalysis'];
  niceToHaveAnalysis: MatchResult['niceToHaveAnalysis'];
  skillMatch: MatchResult['skillMatch'];
  skillMatchScore: MatchResult['skillMatchScore'];
  transferableSkills: MatchResult['transferableSkills'];
  hardRequirementGaps: MatchResult['hardRequirementGaps'];
}

export interface ExperienceMatchInput {
  resume: string;
  jd: string;
  jobMetadata?: string;
}

export interface ExperienceMatchOutput {
  resumeAnalysis: {
    candidateName: string;
    totalYearsExperience: string;
    currentRole: string;
    industries: string[];
    keyAchievements: string[];
  };
  experienceMatch: MatchResult['experienceMatch'];
  experienceValidation: MatchResult['experienceValidation'];
  candidatePotential: MatchResult['candidatePotential'];
  experienceBreakdown: MatchResult['experienceBreakdown'];
}

export interface PreferenceMatchInput {
  resume: string;
  jd: string;
  candidatePreferences?: string;
  jobMetadata?: string;
}

export interface PreferenceMatchOutput {
  preferenceAlignment: PreferenceAlignment;
  suggestedInterviewQuestions: {
    technical: InterviewQuestionCategory[];
    behavioral: InterviewQuestionCategory[];
    experienceValidation: InterviewQuestionCategory[];
    situational: InterviewQuestionCategory[];
    cultureFit: InterviewQuestionCategory[];
    redFlagProbing: InterviewQuestionCategory[];
  };
  areasToProbeDeeper: ProbingArea[];
  recommendations: MatchResult['recommendations'];
  overallFit: {
    interviewFocus: string[];
    suggestedRole: string;
  };
}

// ---------------------------------------------------------------------------
// Tiered resume with screening data
// ---------------------------------------------------------------------------

export interface TieredResume {
  id: string;
  name: string;
  resumeText: string;
  currentRole?: string | null;
  experienceYears?: string | number | null;
  tags?: string[];
  preferences?: any;
  tier: 'A' | 'B' | 'C';
  quickScore: number;
  keyFindings: string[];
}
