import { BaseAgent } from '../BaseAgent.js';
import type { BatchScreenInput, BatchScreenResult } from './types.js';

export class BatchScreenSkill extends BaseAgent<BatchScreenInput, BatchScreenResult> {
  constructor() {
    super('BatchScreenSkill');
  }

  protected getAgentPrompt(): string {
    return `You are a rapid resume screener for batch candidate evaluation. Your job is to quickly assess multiple candidates against a job description and produce a tier ranking for each.

## Input
You will receive a job description with optional metadata, followed by multiple candidate previews containing their name, current role, experience, skills, and a short resume excerpt.

## Output
Return ONLY valid JSON in this exact format:
{
  "screenings": [
    {
      "resumeId": "<candidate id>",
      "quickScore": <0-100>,
      "tier": "<A|B|C>",
      "keyFindings": ["finding 1", "finding 2"]
    }
  ]
}

## Tier Rules
- **A** (score >= 70): Strong match — relevant skills, experience, and background clearly align with the role.
- **B** (score 40-69): Moderate match — some relevant experience or transferable skills, worth deeper analysis.
- **C** (score < 40): Clearly not qualified — no meaningful overlap in skills, experience, or domain.

## Screening Guidelines
- Be INCLUSIVE. This is a pre-screen, not a final decision. When in doubt, score higher and assign tier B.
- Consider transferable skills and related technologies (e.g., React experience is relevant for a Vue.js role).
- Internships do NOT count toward full-time years of experience requirements.
- Provide 2-3 concise key findings per candidate highlighting strengths, gaps, or notable observations.
- Ensure every candidate in the input receives a screening entry in the output.`;
  }

  protected formatInput(input: BatchScreenInput): string {
    const parts: string[] = [];

    parts.push(`## Job Description:`);
    parts.push(input.jobDescription);
    parts.push('');

    if (input.jobMetadata) {
      parts.push(`## Job Metadata:`);
      parts.push(input.jobMetadata);
      parts.push('');
    }

    parts.push(`## Candidates to Screen:`);

    for (let i = 0; i < input.resumes.length; i++) {
      const r = input.resumes[i];
      parts.push(`### Candidate ${i + 1} [id: ${r.id}]`);
      parts.push(`Name: ${r.name}`);
      if (r.currentRole) parts.push(`Current Role: ${r.currentRole}`);
      if (r.experienceYears != null) parts.push(`Experience: ${r.experienceYears} years`);
      if (r.tags?.length) parts.push(`Skills: ${r.tags.join(', ')}`);
      parts.push(`Resume Preview: ${r.preview}`);
      parts.push('');
    }

    return parts.join('\n');
  }

  protected parseOutput(response: string): BatchScreenResult {
    try {
      // Try extracting from ```json ... ``` code fence
      const jsonFenceMatch = response.match(/```json\s*([\s\S]*?)```/);
      if (jsonFenceMatch) {
        const parsed = JSON.parse(jsonFenceMatch[1].trim());
        return this.validateScreenings(parsed);
      }

      // Try extracting from ``` ... ``` code fence
      const codeFenceMatch = response.match(/```\s*([\s\S]*?)```/);
      if (codeFenceMatch) {
        const parsed = JSON.parse(codeFenceMatch[1].trim());
        return this.validateScreenings(parsed);
      }

      // Find first `{` to last `}`
      const firstBrace = response.indexOf('{');
      const lastBrace = response.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(response.slice(firstBrace, lastBrace + 1));
        return this.validateScreenings(parsed);
      }

      // Try parsing entire response
      const parsed = JSON.parse(response);
      return this.validateScreenings(parsed);
    } catch {
      // Fallback: return empty screenings — the orchestrator will treat this as "pass all through"
      return { screenings: [] };
    }
  }

  private validateScreenings(parsed: any): BatchScreenResult {
    if (!parsed.screenings || !Array.isArray(parsed.screenings)) {
      return { screenings: [] };
    }

    return {
      screenings: parsed.screenings.map((s: any) => ({
        resumeId: String(s.resumeId || ''),
        quickScore: typeof s.quickScore === 'number' ? s.quickScore : 50,
        tier: ['A', 'B', 'C'].includes(s.tier) ? s.tier : 'B',
        keyFindings: Array.isArray(s.keyFindings) ? s.keyFindings.map(String) : [],
      })),
    };
  }

  /**
   * Public method for convenient access with model override
   */
  async screen(
    input: BatchScreenInput,
    requestId?: string,
    locale?: string,
    model?: string,
  ): Promise<BatchScreenResult> {
    return this.execute(input, input.jobDescription, requestId, locale, model);
  }
}

export const batchScreenSkill = new BatchScreenSkill();
