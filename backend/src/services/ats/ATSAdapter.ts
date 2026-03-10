/**
 * Canonical data types for ATS integration.
 * Each adapter maps ATS-specific entities to/from these types.
 */

export interface ATSCredentials {
  apiKey: string;
  subdomain?: string;
  [key: string]: unknown;
}

export interface ATSJob {
  id: string;
  title: string;
  status: string;
  department?: string;
  location?: string;
}

export interface ATSCandidate {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  resumeText?: string;
  resumeUrl?: string;
}

export interface ATSApplication {
  id: string;
  jobId: string;
  candidateId: string;
  stage: string;
  status: string;
}

export interface ATSWebhookEvent {
  type: string;
  candidateId?: string;
  applicationId?: string;
  jobId?: string;
  stage?: string;
  data?: Record<string, unknown>;
}

export type ATSProvider = 'greenhouse' | 'lever' | 'ashby' | 'bamboohr' | 'workable';

export const ATS_PROVIDERS: ATSProvider[] = ['greenhouse', 'lever', 'ashby', 'bamboohr', 'workable'];

export interface ATSAdapter {
  readonly provider: ATSProvider;

  /** Validate credentials by making a lightweight API call. */
  testConnection(credentials: ATSCredentials): Promise<boolean>;

  /** List open jobs from the ATS. */
  listJobs(credentials: ATSCredentials): Promise<ATSJob[]>;

  /** Get a single job by ATS job ID. */
  getJob(credentials: ATSCredentials, jobId: string): Promise<ATSJob>;

  /** Push a candidate into the ATS for a given job. Returns the external candidate/application ID. */
  pushCandidate(credentials: ATSCredentials, jobId: string, candidate: ATSCandidate): Promise<string>;

  /** Update a candidate's stage/status in the ATS. */
  updateCandidateStage(credentials: ATSCredentials, applicationId: string, stage: string): Promise<void>;

  /** Map an ATS-specific stage name to RoboHire pipeline status. */
  mapStageToRoboHire(atsStage: string): string;

  /** Parse an inbound webhook payload from this ATS. Returns null if invalid. */
  parseWebhookPayload(payload: unknown, signature?: string, secret?: string): ATSWebhookEvent | null;
}
