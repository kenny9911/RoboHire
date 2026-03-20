import { InviteCandidateRequest, RoboHireInvitationResponse } from '../types/index.js';
import { logger } from '../services/LoggerService.js';
import { llmService } from '../services/llm/LLMService.js';
import { languageService } from '../services/LanguageService.js';

const DEFAULT_GOHIRE_INVITATION_API = 'https://report-agent.gohire.top/instant/instant/v1/invitation';
const LEGACY_GOHIRE_SINGLE_PATH_API = 'https://report-agent.gohire.top/instant/instant/v1/invitation';

interface InviteApiMeta {
  endpoint: string;
  deliveryMode: 'remote_api' | 'fallback_local';
}

function normalizeInvitationApiUrl(raw?: string): string {
  const configured = (raw || '').trim();
  return configured || DEFAULT_GOHIRE_INVITATION_API;
}

function buildInvitationApiCandidates(raw?: string): string[] {
  const primary = normalizeInvitationApiUrl(raw);
  const candidates = [primary];

  const addCandidate = (url: string) => {
    const normalized = normalizeInvitationApiUrl(url);
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (primary.endsWith('/instant/v1/invitation')) {
    addCandidate(primary.replace(/\/instant\/v1\/invitation$/i, '/instant/instant/v1/invitation'));
  }
  if (primary.endsWith('/instant/instant/v1/invitation')) {
    addCandidate(primary.replace(/\/instant\/instant\/v1\/invitation$/i, '/instant/v1/invitation'));
  }

  addCandidate(DEFAULT_GOHIRE_INVITATION_API);
  addCandidate(LEGACY_GOHIRE_SINGLE_PATH_API);

  return candidates;
}

function shouldRetryWithAlternateEndpoint(status: number, errorText: string): boolean {
  if (status === 404) return true;
  if (status >= 500 && /status\s*404|404/i.test(errorText)) return true;
  return false;
}

function attachInviteApiMeta<T extends RoboHireInvitationResponse>(result: T, meta: InviteApiMeta): T {
  Object.defineProperty(result, '__gohireApiMeta', {
    value: meta,
    enumerable: false,
    configurable: true,
    writable: false,
  });
  return result;
}

// External invitation API – prefer GOHIRE_INVITATION_API, keep ROBOHIRE_INVITATION_API as legacy fallback
const RAW_GOHIRE_INVITATION_API = process.env.GOHIRE_INVITATION_API || process.env.ROBOHIRE_INVITATION_API;
const GOHIRE_INVITATION_API = normalizeInvitationApiUrl(RAW_GOHIRE_INVITATION_API);
const GOHIRE_INVITATION_API_CANDIDATES = buildInvitationApiCandidates(RAW_GOHIRE_INVITATION_API);

if (RAW_GOHIRE_INVITATION_API && GOHIRE_INVITATION_API !== RAW_GOHIRE_INVITATION_API.trim()) {
  logger.warn('InviteAgent', 'Normalized GOHIRE_INVITATION_API', {
    configured: RAW_GOHIRE_INVITATION_API,
    normalized: GOHIRE_INVITATION_API,
  });
}

export interface GoHireInvitationRequestBody {
  recruiter_email: string;
  jd_content: string;
  interviewer_requirement: string;
  resume_text: string;
  request_source: 'robohire';
}

export interface GoHireInvitationCallLog {
  provider: 'gohire';
  deliveryMode: 'remote_api' | 'fallback_local';
  endpoint: string;
  method: 'POST';
  generatedAt: string;
  requestId: string | null;
  actualCall: string;
  requestBody: GoHireInvitationRequestBody;
  responseBody: RoboHireInvitationResponse;
}

function resolveRecruiterEmail(recruiterEmail?: string): string {
  return recruiterEmail || process.env.RECRUITER_EMAIL || process.env.recruiter_email || 'hr@lightark.ai';
}

export function buildGoHireInvitationRequestBody(
  resume: string,
  jd: string,
  recruiterEmail?: string,
  interviewerRequirement?: string,
): GoHireInvitationRequestBody {
  return {
    recruiter_email: resolveRecruiterEmail(recruiterEmail),
    jd_content: jd,
    interviewer_requirement: interviewerRequirement || '',
    resume_text: resume,
    request_source: 'robohire',
  };
}

export function buildGoHireInvitationCallLog({
  resume,
  jd,
  recruiterEmail,
  interviewerRequirement,
  response,
  requestId,
  deliveryMode,
  endpoint,
}: {
  resume: string;
  jd: string;
  recruiterEmail?: string;
  interviewerRequirement?: string;
  response: RoboHireInvitationResponse;
  requestId?: string;
  deliveryMode: 'remote_api' | 'fallback_local';
  endpoint?: string;
}): GoHireInvitationCallLog {
  const requestBody = buildGoHireInvitationRequestBody(
    resume,
    jd,
    recruiterEmail,
    interviewerRequirement,
  );

  return {
    provider: 'gohire',
    deliveryMode,
    endpoint: endpoint || GOHIRE_INVITATION_API,
    method: 'POST',
    generatedAt: new Date().toISOString(),
    requestId: requestId || null,
    actualCall: [
      `POST ${endpoint || GOHIRE_INVITATION_API}`,
      'Content-Type: application/json',
      '',
      JSON.stringify(requestBody, null, 2),
    ].join('\n'),
    requestBody,
    responseBody: JSON.parse(JSON.stringify(response)) as RoboHireInvitationResponse,
  };
}

/**
 * Agent for sending interview invitations via GoHire 一键邀约 API
 * Calls the external API to create invitation and send email to candidate
 */
export class InviteAgent {
  private agentName: string;

  constructor() {
    this.agentName = 'InviteAgent';
  }

  /**
   * Send an interview invitation via GoHire API
   */
  async sendInvitation(
    resume: string,
    jd: string,
    recruiterEmail?: string,
    interviewerRequirement?: string,
    requestId?: string
  ): Promise<RoboHireInvitationResponse> {
    const stepId = logger.startStep(requestId || '', `${this.agentName}: Call GoHire API`);

    const email = resolveRecruiterEmail(recruiterEmail);
    const requestBody = buildGoHireInvitationRequestBody(
      resume,
      jd,
      recruiterEmail,
      interviewerRequirement,
    );

    logger.info(this.agentName, 'Sending invitation request to GoHire API', {
      endpoint: GOHIRE_INVITATION_API,
      candidates: GOHIRE_INVITATION_API_CANDIDATES,
      recruiter_email: email,
      jd_length: jd.length,
      resume_length: resume.length,
      has_interviewer_requirement: !!interviewerRequirement,
    }, requestId);

    try {
      let lastError = 'Unknown invitation API failure';

      for (let index = 0; index < GOHIRE_INVITATION_API_CANDIDATES.length; index += 1) {
        const endpoint = GOHIRE_INVITATION_API_CANDIDATES[index];
        const isLastCandidate = index === GOHIRE_INVITATION_API_CANDIDATES.length - 1;
        const startTime = Date.now();

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          const elapsed = Date.now() - startTime;

          if (!response.ok) {
            const errorText = await response.text();
            lastError = `GoHire API error: ${response.status} - ${errorText}`;

            logger.error(this.agentName, 'GoHire API request failed', {
              endpoint,
              status: response.status,
              statusText: response.statusText,
              error: errorText,
            }, requestId);

            if (!isLastCandidate && shouldRetryWithAlternateEndpoint(response.status, errorText)) {
              logger.warn(this.agentName, 'Retrying invitation with alternate endpoint', {
                failedEndpoint: endpoint,
                nextEndpoint: GOHIRE_INVITATION_API_CANDIDATES[index + 1],
                status: response.status,
              }, requestId);
              continue;
            }
            break;
          }

          const result = await response.json() as RoboHireInvitationResponse;

          logger.info(this.agentName, 'GoHire API response received', {
            endpoint,
            candidate_email: result.email,
            candidate_name: result.name,
            job_title: result.job_title,
            user_id: result.user_id,
            message: result.message,
            elapsed_ms: elapsed,
          }, requestId);

          logger.endStep(requestId || '', stepId, 'completed', {
            endpoint,
            candidate_email: result.email,
            job_title: result.job_title,
            elapsed_ms: elapsed,
          });

          return attachInviteApiMeta(result, {
            endpoint,
            deliveryMode: 'remote_api',
          });
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          logger.error(this.agentName, 'Failed to send invitation', {
            endpoint,
            error: lastError,
          }, requestId);

          if (!isLastCandidate) {
            logger.warn(this.agentName, 'Retrying invitation after transport error', {
              failedEndpoint: endpoint,
              nextEndpoint: GOHIRE_INVITATION_API_CANDIDATES[index + 1],
            }, requestId);
            continue;
          }
        }
      }

      logger.endStep(requestId || '', stepId, 'failed', { error: lastError });
      return await this.generateFallbackInvitation(
        resume,
        jd,
      recruiterEmail,
      interviewerRequirement,
      requestId,
      lastError
      );
    } catch (error) {
      logger.error(this.agentName, 'Failed to send invitation', {
        error: error instanceof Error ? error.message : String(error),
      }, requestId);
      logger.endStep(requestId || '', stepId, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return await this.generateFallbackInvitation(
        resume,
        jd,
        recruiterEmail,
        interviewerRequirement,
        requestId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Generate an interview invitation (legacy method for backward compatibility)
   * Now calls the GoHire API instead of generating email locally
   */
  async generateInvitation(
    resume: string,
    jd: string,
    requestId?: string,
    recruiterEmail?: string,
    interviewerRequirement?: string
  ): Promise<RoboHireInvitationResponse> {
    return this.sendInvitation(resume, jd, recruiterEmail, interviewerRequirement, requestId);
  }

  private async generateFallbackInvitation(
    resume: string,
    jd: string,
    recruiterEmail?: string,
    interviewerRequirement?: string,
    requestId?: string,
    reason?: string
  ): Promise<RoboHireInvitationResponse> {
    const fallbackStep = logger.startStep(requestId || '', `${this.agentName}: Fallback invitation`);

    const email = resolveRecruiterEmail(recruiterEmail);
    const candidateEmail = this.extractEmail(resume) || 'candidate@example.com';
    const candidateName = this.extractName(resume) || 'Candidate';
    const jobTitle = this.extractJobTitle(jd) || 'Interview Invitation';
    const companyName = process.env.COMPANY_NAME || 'RoboHire';
    const homeUrl = process.env.ROBOHIRE_HOME_URL || 'https://robohire.io';
    const loginUrl = process.env.ROBOHIRE_LOGIN_URL || `${homeUrl}/video-interview`;
    const now = Date.now();

    const languageInstruction = languageService.getLanguageInstruction(jd || resume);
    const systemPrompt = `${languageInstruction}

You are a senior recruiter. Draft a professional interview invitation email for the candidate.
Output plain text only, no markdown or code fences.
Include a short subject line and the email body.
Keep it concise and friendly.`;

    const userPrompt = [
      `Recruiter email: ${email}`,
      `Company: ${companyName}`,
      `Role: ${jobTitle}`,
      interviewerRequirement ? `Interviewer requirement: ${interviewerRequirement}` : '',
      `Job description:\n${jd.slice(0, 3000)}`,
      `Resume:\n${resume.slice(0, 3000)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    let message = '';
    try {
      message = (await llmService.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.6, requestId }
      )).trim();
    } catch (error) {
      message = 'Invitation generated locally. Please follow up with the candidate to schedule an interview.';
      logger.error(this.agentName, 'Fallback LLM invitation failed', {
        error: error instanceof Error ? error.message : String(error),
      }, requestId);
    }

    logger.info(this.agentName, 'Using fallback invitation generator', {
      reason,
      candidateEmail,
      candidateName,
      jobTitle,
    }, requestId);

    logger.endStep(requestId || '', fallbackStep, 'completed', {
      reason,
    });

    const fallbackResult: RoboHireInvitationResponse = {
      email: candidateEmail,
      bcc: [],
      name: candidateName,
      login_url: loginUrl,
      home_url: homeUrl,
      display_name: candidateName,
      user_id: 0,
      request_introduction_id: `local_${now}`,
      expiration: 0,
      expiration_time: now + 7 * 24 * 60 * 60 * 1000,
      company_name: companyName,
      job_title: jobTitle,
      job_interview_duration: 30,
      job_summary: '',
      interview_req: interviewerRequirement || null,
      qrcode_url: '',
      password: null,
      message,
    };

    return attachInviteApiMeta(fallbackResult, {
      endpoint: GOHIRE_INVITATION_API,
      deliveryMode: 'fallback_local',
    });
  }

  private extractEmail(text: string): string | null {
    const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : null;
  }

  private extractName(text: string): string | null {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (line.length > 0 && line.length <= 60 && !line.includes('@') && !/resume|cv/i.test(line)) {
        return line;
      }
    }

    return null;
  }

  private extractJobTitle(text: string): string | null {
    const titleMatch = text.match(/(?:Job\s*Title|职位名称|职位|岗位|Role|Title)\s*[:：]\s*(.+)/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const shortLine = lines.find((line) => line.length <= 80);
    return shortLine || null;
  }
}

export const inviteAgent = new InviteAgent();
