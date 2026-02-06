import { InviteCandidateRequest, RoboHireInvitationResponse } from '../types/index.js';
import { logger } from '../services/LoggerService.js';
import { llmService } from '../services/llm/LLMService.js';
import { languageService } from '../services/LanguageService.js';

// External invitation API – override via ROBOHIRE_INVITATION_API env var
const ROBOHIRE_INVITATION_API =
  process.env.ROBOHIRE_INVITATION_API ||
  'https://api.robohire.io/instant/instant/v1/invitation';

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
        return await this.generateFallbackInvitation(
          resume,
          jd,
          recruiterEmail,
          interviewerRequirement,
          requestId,
          `RoboHire API error: ${response.status} - ${errorText}`
        );
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

  private async generateFallbackInvitation(
    resume: string,
    jd: string,
    recruiterEmail?: string,
    interviewerRequirement?: string,
    requestId?: string,
    reason?: string
  ): Promise<RoboHireInvitationResponse> {
    const fallbackStep = logger.startStep(requestId || '', `${this.agentName}: Fallback invitation`);

    const email = recruiterEmail || process.env.RECRUITER_EMAIL || process.env.recruiter_email || 'hr@lightark.ai';
    const candidateEmail = this.extractEmail(resume) || 'candidate@example.com';
    const candidateName = this.extractName(resume) || 'Candidate';
    const jobTitle = this.extractJobTitle(jd) || 'Interview Invitation';
    const companyName = process.env.COMPANY_NAME || 'RoboHire';
    const homeUrl = process.env.ROBOHIRE_HOME_URL || 'https://robohire.io';
    const loginUrl = process.env.ROBOHIRE_LOGIN_URL || `${homeUrl}/interview`;
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

    return {
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
