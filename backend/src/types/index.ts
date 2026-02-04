// LLM Types
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  requestId?: string;
}

export interface LLMUsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  usage: LLMUsageInfo;
  model: string;
}

export interface LLMProvider {
  chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
  getProviderName(): string;
}

// Resume Types - Expanded to preserve all content
export interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  address?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  skills: string[] | SkillsDetailed;
  experience: WorkExperience[];
  projects?: Project[];
  education: Education[];
  certifications?: Certification[];
  awards?: Award[];
  languages?: LanguageSkill[];
  volunteerWork?: VolunteerWork[];
  publications?: string[];
  patents?: string[];
  summary?: string;
  otherSections?: Record<string, string>;
  rawText?: string;
}

export interface SkillsDetailed {
  technical?: string[];
  soft?: string[];
  languages?: string[];
  tools?: string[];
  frameworks?: string[];
  other?: string[];
}

export interface WorkExperience {
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  duration: string;
  description?: string;
  achievements?: string[];
  technologies?: string[];
}

export interface Project {
  name: string;
  role?: string;
  date?: string;
  description?: string;
  technologies?: string[];
  link?: string;
}

export interface Education {
  institution: string;
  degree: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  year: string;
  gpa?: string;
  achievements?: string[];
  coursework?: string[];
}

export interface Certification {
  name: string;
  issuer?: string;
  date?: string;
  expiryDate?: string;
  credentialId?: string;
}

export interface Award {
  name: string;
  issuer?: string;
  date?: string;
  description?: string;
}

export interface LanguageSkill {
  language: string;
  proficiency?: string;
}

export interface VolunteerWork {
  organization: string;
  role?: string;
  duration?: string;
  description?: string;
}

// JD Types - Expanded to preserve all content
export interface ParsedJD {
  title: string;
  company: string;
  companyDescription?: string;
  team?: string;
  location: string;
  workType?: string;
  employmentType?: string;
  experienceLevel?: string;
  jobOverview?: string;
  requirements: string[] | RequirementsDetailed;
  responsibilities: string[];
  qualifications: string[] | QualificationsDetailed;
  benefits: string[];
  compensation?: CompensationInfo;
  salary?: string;
  applicationProcess?: string;
  deadline?: string;
  contactInfo?: string;
  additionalInfo?: Record<string, string>;
  rawText?: string;
}

export interface RequirementsDetailed {
  mustHave?: string[];
  niceToHave?: string[];
}

export interface QualificationsDetailed {
  education?: string[];
  certifications?: string[];
  experience?: string[];
  skills?: {
    technical?: string[];
    soft?: string[];
    tools?: string[];
    languages?: string[];
  };
}

export interface CompensationInfo {
  salary?: string;
  bonus?: string;
  equity?: string;
  other?: string;
}

// Match Result Types - Enhanced Analysis
export interface MatchResult {
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
  mustHaveAnalysis: {
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
  niceToHaveAnalysis: {
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
    interviewQuestions: string[]; // Legacy simple format
  };
  suggestedInterviewQuestions: {
    technical: InterviewQuestionCategory[];
    behavioral: InterviewQuestionCategory[];
    experienceValidation: InterviewQuestionCategory[];
    situational: InterviewQuestionCategory[];
    cultureFit: InterviewQuestionCategory[];
    redFlagProbing: InterviewQuestionCategory[];
  };
  areasToProbeDeeper: ProbingArea[];
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
  difficulty: 'Basic' | 'Intermediate' | 'Advanced' | 'Expert';
  timeEstimate: string;
}

export interface ProbingArea {
  area: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
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

// Invitation Types
export interface InvitationEmail {
  subject: string;
  body: string;
}

// 一键邀约 API Response
export interface RoboHireInvitationResponse {
  email: string;
  bcc: string[];
  name: string;
  login_url: string;
  home_url: string;
  display_name: string;
  user_id: number;
  request_introduction_id: string;
  expiration: number;
  expiration_time: number;
  company_name: string;
  job_title: string;
  job_interview_duration: number;
  job_summary: string;
  interview_req: string | null;
  qrcode_url: string;
  password: string | null;
  message: string;
}

// Interview Evaluation Types - Comprehensive
export interface InterviewEvaluation {
  // Core scores and decision
  score: number; // 0-100 overall match score
  summary: string; // Persuasive candidate highlight intro
  strengths: string[]; // 3-5 key strengths with evidence
  weaknesses: string[]; // 2-4 potential concerns or gaps
  recommendation: string; // Detailed hiring recommendation with reasoning
  hiringDecision: 'Strong Hire' | 'Hire' | 'Weak Hire' | 'No Hire' | 'Disqualified';

  // Skills assessment (legacy compatibility)
  skillsAssessment: SkillAssessment[];

  // 1. Must-Have Requirements Analysis (Critical - determines disqualification)
  mustHaveAnalysis: MustHaveInterviewAnalysis;

  // 2. Technical Capability Assessment
  technicalAnalysis: TechnicalAnalysis;

  // 3. JD Match & Extra Skills
  jdMatch: JDMatchAnalysis;

  // 4. Behavioral Analysis
  behavioralAnalysis: BehavioralAnalysis;

  // 5. Interviewer's Kit
  interviewersKit: InterviewersKit;

  // 6. Level & Fit Assessment
  levelAssessment: 'Expert' | 'Senior' | 'Intermediate' | 'Junior';
  expertAdvice: string; // Professional advice on level, potential growth, specific fit
  suitableWorkTypes: string[]; // Specific roles they're best suited for

  // 7. Question-Answer Assessment
  questionAnswerAssessment: QuestionAnswerAssessment[];

  // 8. Cheating Analysis (optional)
  cheatingAnalysis?: CheatingAnalysis;
}

// Must-Have Interview Analysis - Determines disqualification
export interface MustHaveInterviewAnalysis {
  // Extracted must-have requirements from JD
  extractedMustHaves: {
    skills: Array<{
      skill: string;
      reason: string; // Why it's a must-have
      criticality: 'Dealbreaker' | 'Critical' | 'Important';
    }>;
    experiences: Array<{
      experience: string;
      reason: string;
      minimumYears?: string;
      criticality: 'Dealbreaker' | 'Critical' | 'Important';
    }>;
    qualifications: Array<{
      qualification: string;
      reason: string;
      criticality: 'Dealbreaker' | 'Critical' | 'Important';
    }>;
  };
  
  // Verification through interview answers
  interviewVerification: {
    verified: Array<{
      requirement: string;
      verifiedBy: string; // Which Q&A verified this
      evidence: string; // Quote or summary proving competency
      confidenceLevel: 'High' | 'Medium' | 'Low';
    }>;
    failed: Array<{
      requirement: string;
      failedAt: string; // Which Q&A revealed the failure
      reason: string; // Why they failed (wrong answer, no knowledge, etc.)
      severity: 'Dealbreaker' | 'Critical' | 'Significant';
    }>;
    notTested: Array<{
      requirement: string;
      recommendation: string; // What to ask in next round
    }>;
  };
  
  // Scoring
  mustHaveScore: number; // 0-100
  passRate: string; // e.g., "3/5 must-haves verified"
  
  // Disqualification
  disqualified: boolean;
  disqualificationReasons: string[];
  
  // Overall assessment
  assessment: string;
}

export interface SkillAssessment {
  skill: string;
  rating: 'Excellent' | 'Good' | 'Adequate' | 'Insufficient' | 'Not Demonstrated';
  evidence: string;
}

export interface TechnicalAnalysis {
  summary: string; // Deep dive into technical depth/breadth
  depthRating: 'Expert' | 'Advanced' | 'Intermediate' | 'Novice';
  details: string[]; // Specific technical points/findings
  provenSkills: string[]; // Skills with demonstrated real depth
  claimedButUnverified: string[]; // Skills claimed but not proven
  responseQuality: 'High' | 'Medium' | 'Low';
}

export interface JDMatchAnalysis {
  requirements: JDRequirementMatch[];
  hardRequirementsAnalysis: HardRequirementAnalysis[];
  extraSkillsFound: string[]; // Skills NOT in JD but demonstrated
  summary: string;
}

export interface JDRequirementMatch {
  requirement: string; // Copy verbatim from JD
  matchLevel: 'High' | 'Medium' | 'Low' | 'None';
  score: number; // 0-10
  explanation: string; // Evidence-based justification
}

export interface HardRequirementAnalysis {
  requirement: string; // The mandatory requirement
  met: boolean;
  analysis: string; // Explanation of why met or not
}

export interface BehavioralAnalysis {
  summary: string; // Assessment of soft skills/culture
  compatibility: 'High' | 'Medium' | 'Low';
  details: string[]; // e.g., "Communication: Clear", "Adaptability: Strong"
}

export interface InterviewersKit {
  suggestedQuestions: string[]; // Questions to probe gaps/verify skills
  focusAreas: string[]; // Areas needing more investigation
}

export interface QuestionAnswerAssessment {
  question: string; // The question asked
  answer: string; // Summary of candidate's response
  score: number; // 0-100 score for this specific answer
  correctness: 'Correct' | 'Partially Correct' | 'Incorrect';
  thoughtProcess: string; // Evaluation of their reasoning
  logicalThinking: string; // Evaluation of their logic
  clarity: 'High' | 'Medium' | 'Low';
  completeness: 'Complete' | 'Partial' | 'Incomplete';
  // Must-have requirement linkage
  relatedMustHave?: string; // If this Q&A tests a must-have requirement
  mustHaveVerified?: boolean; // If a must-have requirement, did they pass?
  weight: 'Must-Have' | 'Important' | 'Nice-to-Have'; // Question importance weight
}

// Cheating Detection Types
export interface CheatingAnalysis {
  suspicionScore: number; // 0-100 (0=definitely genuine, 100=definitely AI-assisted)
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  summary: string; // 2-3 sentence assessment
  indicators: CheatingIndicator[];
  authenticitySignals: string[]; // List of genuine behavior signs found
  recommendation: string; // Action recommendation
}

export interface CheatingIndicator {
  type: string; // Category name
  description: string; // What was detected
  severity: 'Low' | 'Medium' | 'High';
  evidence: string; // Direct quote or example
}

// API Request Types
export interface MatchResumeRequest {
  resume: string;
  jd: string;
}

export interface InviteCandidateRequest {
  resume: string;
  jd: string;
  recruiter_email?: string;
  interviewer_requirement?: string;
}

export interface EvaluateInterviewRequest {
  resume: string;
  jd: string;
  interviewScript: string;
  includeCheatingDetection?: boolean;
  userInstructions?: string;
}

// API Response Types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
