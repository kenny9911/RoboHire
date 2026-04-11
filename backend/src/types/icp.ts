/**
 * Types for the Ideal Candidate Profile (ICP) + Hard Requirements feature.
 *
 * Both the LLM agent (as output schema) and the matcher (as input context)
 * use these shapes, so they must stay in sync with docs/icp-architecture.md.
 */

// ── Hard Requirements ──────────────────────────────────────────────────────

export type HRField =
  // numeric
  | 'experienceYears'
  | 'salaryExpectation'
  // string (single value)
  | 'location'
  | 'currentRole'
  | 'education.degree'
  | 'education.field'
  // string array (from parsed resume metadata)
  | 'languages'
  | 'skills.technical'
  | 'tags'
  // catch-all
  | 'custom';

export type HROperator =
  // numeric
  | 'eq'
  | 'neq'
  | 'gte'
  | 'lte'
  | 'gt'
  | 'lt'
  // arrays
  | 'contains'
  | 'contains_any'
  | 'contains_all'
  | 'not_contains'
  // string regex
  | 'matches'
  | 'not_matches'
  // set membership
  | 'in'
  | 'not_in';

export interface HardRequirement {
  /** Local UUID — generated client-side, used for diffs and edits */
  id: string;
  field: HRField;
  operator: HROperator;
  value: unknown;
  description: string;
  enabled: boolean;
  source?: 'user' | 'icp_suggestion';
  sourceIcpVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── ICP profile JSON shape ─────────────────────────────────────────────────

export type CoreSkillImportance = 'critical' | 'high' | 'medium';

export interface CoreSkill {
  skill: string;
  importance: CoreSkillImportance;
  /** Why this skill — provenance for the user (e.g. "5 of 5 liked candidates") */
  rationale: string;
}

export type CompanySize = 'startup' | 'midsize' | 'enterprise';

export interface ICPSignal {
  trait: string;
  weight: number; // 0..1, how strong the pattern is
  source: 'liked' | 'disliked' | 'jd';
  evidence?: string;
}

export interface IdealCandidateProfile {
  seniorityRange?: { min: number; ideal: number; max?: number; unit: 'years' };
  preferredLocations?: string[];
  preferredIndustries?: string[];

  coreSkills: CoreSkill[];
  bonusSkills: string[];
  antiSkills: string[];

  preferredCompanySizes?: CompanySize[];
  preferredRoleProgression?: string;

  yearsOfExperience: { min: number; ideal: number; max?: number };

  signals: ICPSignal[];

  anchorCandidateIds: string[];
  antiAnchorCandidateIds: string[];

  generatedAt: string;
}

// ── Agent → IdealCandidateProfileAgent I/O ────────────────────────────────

export interface ExemplarCandidate {
  id: string;
  name: string;
  headline: string | null;
  matchScore: number | null;
  reason: string | null;
  /** Compact extract from parsedData — see docs/icp-architecture.md §4.1 */
  resumeDigest: string;
  status: 'liked' | 'disliked';
}

export interface IdealProfileInput {
  jobTitle: string;
  jobDescription: string;
  agentInstructions: string | null;
  currentCriteria: Array<{ id?: string; text: string; pinned: boolean; bucket: 'most' | 'least' }>;
  currentICP: IdealCandidateProfile | null;
  currentHardRequirements: HardRequirement[];
  likedCandidates: ExemplarCandidate[];
  dislikedCandidates: ExemplarCandidate[];
  language?: string;
}

export interface IdealProfileOutput {
  profile: IdealCandidateProfile;
  suggestedHardRequirements: HardRequirement[];
  narrativeSummary: string;
  confidence: number; // 0..1
  reasoningTrace: string;
}

// ── Persisted ICP row shape (mirrors Prisma AgentIdealProfile) ────────────

export interface PersistedIdealProfile {
  id: string;
  agentId: string;
  userId: string;
  version: number;
  profile: IdealCandidateProfile;
  suggestedHardRequirements: HardRequirement[] | null;
  narrativeSummary: string | null;
  confidence: number;
  generatedFromLikes: number;
  generatedFromDislikes: number;
  generatedAt: Date;
  updatedAt: Date;
}
