import { Message } from '../types/index.js';
import { BaseAgent } from './BaseAgent.js';
import { logger } from '../services/LoggerService.js';

export interface PreMatchFilterResumeSummary {
  id: string;
  name: string;
  currentRole: string | null;
  experienceYears: string | null;
  tags: string[];
  preview: string; // first ~500 chars of resumeText
}

export interface PreMatchFilterInput {
  jobTitle: string;
  jobDescription: string;
  jobLocation?: string | null;
  jobWorkType?: string | null;
  jobEmploymentType?: string | null;
  resumes: PreMatchFilterResumeSummary[];
  preferences: {
    locations?: string[];
    jobTypes?: string[];
    freeText?: string;
  };
}

export interface PreMatchFilterOutput {
  passedIds: string[];
  excluded: Array<{ resumeId: string; reason: string }>;
}

export class PreMatchFilterAgent extends BaseAgent<PreMatchFilterInput, PreMatchFilterOutput> {
  private filterModel: string;

  constructor() {
    super('PreMatchFilter');
    this.filterModel = process.env.LLM_PREMATCH_FILTER || '';
  }

  isEnabled(): boolean {
    return !!this.filterModel;
  }

  protected getAgentPrompt(): string {
    return `You are a fast resume pre-screening assistant. Your job is to quickly assess which candidates are clearly irrelevant for a given job, based on the job description, candidate summaries, and any user-specified preferences.

## Your Task
Given a job posting and a list of candidate summaries, determine which candidates should PASS through to full AI matching and which should be EXCLUDED as clearly irrelevant.

## Rules
- Be INCLUSIVE, not exclusive. When in doubt, let the candidate pass through.
- Only exclude candidates who are CLEARLY irrelevant (e.g., a junior frontend developer for a senior data scientist role).
- Consider transferable skills — don't exclude candidates just because their title doesn't match.
- Respect user preferences strictly — if user specifies locations or job types, filter by those.
- If a candidate's information is too limited to judge, let them pass.

## Output Format
Return ONLY valid JSON:
{
  "passedIds": ["id1", "id2", ...],
  "excluded": [
    { "resumeId": "id3", "reason": "Brief reason for exclusion" }
  ]
}`;
  }

  protected formatInput(input: PreMatchFilterInput): string {
    const parts = [
      `## Job: ${input.jobTitle}`,
      input.jobLocation ? `Location: ${input.jobLocation}` : '',
      input.jobWorkType ? `Work Type: ${input.jobWorkType}` : '',
      input.jobEmploymentType ? `Employment Type: ${input.jobEmploymentType}` : '',
      '',
      `## Job Description`,
      input.jobDescription.slice(0, 2000),
      '',
    ].filter(Boolean);

    // User preferences
    const prefs = input.preferences;
    if (prefs.locations?.length || prefs.jobTypes?.length || prefs.freeText) {
      parts.push('## User Preferences');
      if (prefs.locations?.length) parts.push(`Preferred locations: ${prefs.locations.join(', ')}`);
      if (prefs.jobTypes?.length) parts.push(`Preferred job types: ${prefs.jobTypes.join(', ')}`);
      if (prefs.freeText) parts.push(`Custom filter: ${prefs.freeText}`);
      parts.push('');
    }

    parts.push(`## Candidates (${input.resumes.length} total)`);
    for (const r of input.resumes) {
      parts.push(`---`);
      parts.push(`ID: ${r.id}`);
      parts.push(`Name: ${r.name}`);
      if (r.currentRole) parts.push(`Current Role: ${r.currentRole}`);
      if (r.experienceYears) parts.push(`Experience: ${r.experienceYears} years`);
      if (r.tags.length) parts.push(`Tags: ${r.tags.join(', ')}`);
      parts.push(`Preview: ${r.preview}`);
    }

    return parts.join('\n');
  }

  protected parseOutput(response: string): PreMatchFilterOutput {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          passedIds: Array.isArray(parsed.passedIds) ? parsed.passedIds : [],
          excluded: Array.isArray(parsed.excluded) ? parsed.excluded : [],
        };
      }
    } catch {
      // fallback: pass all
    }
    return { passedIds: [], excluded: [] };
  }

  /**
   * Execute with the LLM_PREMATCH_FILTER model override
   */
  async filter(input: PreMatchFilterInput, requestId?: string): Promise<PreMatchFilterOutput> {
    const stepNum = requestId ? logger.startStep(requestId, 'PreMatchFilter: Filter') : 0;
    logger.logAgentStart(requestId || '', this.name, { resumeCount: input.resumes.length });
    logger.info('PREMATCH', `→ Pre-filter with model ${this.filterModel}, ${input.resumes.length} resumes`, {
      model: this.filterModel,
      resumeCount: input.resumes.length,
    }, requestId);

    const systemPrompt = this.getAgentPrompt();
    const userMessage = this.formatInput(input);

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await this.llm.chat(messages, {
        temperature: 0.3, // Lower temp for more consistent filtering
        model: this.filterModel,
        requestId,
      });

      const output = this.parseOutput(response);

      // If parseOutput returned empty passedIds (parse failure), pass all resumes through
      if (output.passedIds.length === 0 && output.excluded.length === 0) {
        output.passedIds = input.resumes.map((r) => r.id);
      }

      logger.info('PREMATCH', `← Pre-filter complete: ${output.passedIds.length} passed, ${output.excluded.length} excluded`, {
        passed: output.passedIds.length,
        excluded: output.excluded.length,
      }, requestId);
      logger.logAgentEnd(requestId || '', this.name, true, JSON.stringify(output).length);

      if (requestId && stepNum) logger.endStep(requestId, stepNum, 'completed');
      return output;
    } catch (error) {
      logger.error('PREMATCH', 'Pre-filter failed, passing all resumes through', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, requestId);
      logger.logAgentEnd(requestId || '', this.name, false);
      if (requestId && stepNum) logger.endStep(requestId, stepNum, 'failed');

      // Graceful degradation: pass all resumes through
      return {
        passedIds: input.resumes.map((r) => r.id),
        excluded: [],
      };
    }
  }
}
