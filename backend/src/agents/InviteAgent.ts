import { InviteCandidateRequest, RoboHireInvitationResponse } from '../types/index.js';
import { logger } from '../services/LoggerService.js';

const ROBOHIRE_INVITATION_API = 'https://report-agent.robohire.io/instant/instant/v1/invitation';

/**
 * Agent for sending interview invitations via RoboHire 一键邀约 API
 * Calls the external API to create invitation and send email to candidate
 */
export class InviteAgent {
  private agentName: string;

  constructor() {
    this.agentName = 'InviteAgent';
  }

  /**
   * Send an interview invitation via RoboHire API
   */
  async sendInvitation(
    resume: string,
    jd: string,
    recruiterEmail?: string,
    interviewerRequirement?: string,
    requestId?: string
  ): Promise<RoboHireInvitationResponse> {
    const stepId = logger.startStep(requestId || '', `${this.agentName}: Call RoboHire API`);
    
    // Use provided email or fall back to environment variable
    const email = recruiterEmail || process.env.RECRUITER_EMAIL || process.env.recruiter_email || 'hr@lightark.ai';
    
    const requestBody = {
      recruiter_email: email,
      jd_content: jd,
      interviewer_requirement: interviewerRequirement || '',
      resume_text: resume,
    };

    logger.info(this.agentName, 'Sending invitation request to RoboHire API', {
      recruiter_email: email,
      jd_length: jd.length,
      resume_length: resume.length,
      has_interviewer_requirement: !!interviewerRequirement,
    }, requestId);

    try {
      const startTime = Date.now();
      
      const response = await fetch(ROBOHIRE_INVITATION_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(this.agentName, 'RoboHire API request failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        }, requestId);
        logger.endStep(requestId || '', stepId, 'failed', { error: errorText });
        throw new Error(`RoboHire API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as RoboHireInvitationResponse;

      logger.info(this.agentName, 'RoboHire API response received', {
        candidate_email: result.email,
        candidate_name: result.name,
        job_title: result.job_title,
        user_id: result.user_id,
        message: result.message,
        elapsed_ms: elapsed,
      }, requestId);

      logger.endStep(requestId || '', stepId, 'completed', {
        candidate_email: result.email,
        job_title: result.job_title,
        elapsed_ms: elapsed,
      });

      return result;
    } catch (error) {
      logger.error(this.agentName, 'Failed to send invitation', {
        error: error instanceof Error ? error.message : String(error),
      }, requestId);
      logger.endStep(requestId || '', stepId, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate an interview invitation (legacy method for backward compatibility)
   * Now calls the RoboHire API instead of generating email locally
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
}

export const inviteAgent = new InviteAgent();
