export interface HiringRequirements {
  jobTitle?: string;
  department?: string;
  reportingLine?: string;
  roleType?: string;
  headcount?: string;
  primaryResponsibilities?: string[];
  secondaryResponsibilities?: string[];
  hardSkills?: string[];
  softSkills?: string[];
  yearsOfExperience?: string;
  education?: string;
  industryExperience?: string;
  preferredQualifications?: string[];
  salaryRange?: string;
  equityBonus?: string;
  benefits?: string[];
  workLocation?: string;
  geographicRestrictions?: string;
  startDate?: string;
  travelRequirements?: string;
  interviewStages?: string[];
  keyStakeholders?: string[];
  timelineExpectations?: string;
  teamCulture?: string;
  reasonForOpening?: string;
  dealBreakers?: string[];
}

export type ChatRole = "user" | "model";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  isThinking?: boolean;
  isError?: boolean;
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  requirements: HiringRequirements;
  updatedAt: number;
}

export interface HistoryMessage {
  role: ChatRole;
  text: string;
}

export type ConfigReason = "missing_api_key" | "placeholder_api_key";

export type AgentAlexProvider = 'claude' | 'gemini';

export interface AppConfigStatus {
  configured: boolean;
  reason?: ConfigReason;
  provider?: AgentAlexProvider;
  webSearchEnabled?: boolean;
}

export interface SearchCandidate {
  name: string;
  score: number;
  grade: string;
  resumeId: string;
  verdict: string;
  highlights: string[];
  gaps: string[];
}

export type ChatStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "requirements-update"; data: Partial<HiringRequirements> }
  | { type: "suggestions"; data: string[] }
  | { type: "search-started"; data: { searchId: string; agentId: string; totalResumes: number; filteredCount: number } }
  | { type: "search-progress"; data: { searchId: string; completed: number; total: number } }
  | { type: "search-result"; data: { searchId: string; candidate: SearchCandidate } }
  | { type: "search-completed"; data: { searchId: string; agentId: string; totalMatched: number; totalScreened: number; topCandidates: SearchCandidate[] } }
  | { type: "web-search-started"; data: { query: string } }
  | { type: "web-search-completed"; data: { query: string; resultCount: number } }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export type LiveClientMessage =
  | { type: "init"; history: HistoryMessage[] }
  | { type: "audio"; data: string }
  | { type: "close" };

export type LiveServerMessage =
  | { type: "connected" }
  | { type: "audio"; data: string }
  | { type: "interrupted" }
  | { type: "requirements-update"; data: Partial<HiringRequirements> }
  | { type: "error"; code: string; message: string };
