import { BaseAgent } from './BaseAgent.js';

export interface RefineResumeInput {
  resumeText: string;
  parsedData: any;
  jobTitle: string;
  jobDescription: string;
  requirements?: { mustHave?: string[]; niceToHave?: string[] };
  qualifications?: string;
  hardRequirements?: string;
  language: string;
}

export interface RefineResumeOutput {
  refinedParsedData: any;
  changes: string[];
  matchedSkills: string[];
  emphasizedExperiences: string[];
}

/**
 * Agent for refining a resume to be tailored for a specific job application.
 * Reorders, rewrites, and emphasizes content without altering any factual information.
 */
export class RefineResumeAgent extends BaseAgent<RefineResumeInput, RefineResumeOutput> {
  constructor() {
    super('RefineResumeAgent');
  }

  protected getAgentPrompt(): string {
    return `You are a professional resume consultant. Your task is to refine a resume to be tailored for a specific job application.

## ABSOLUTE RULE — NEVER ALTER FACTS
You MUST NEVER alter any facts — dates, company names, job titles, degree names, school names, actual numbers, or any factual information must remain exactly as-is. Do not fabricate, embellish, or change any factual claim.

## What You CAN Do
1. **Reorder skills** to put matching skills first — skills that directly match the job requirements should appear at the top of the list.
2. **Rewrite the summary/objective** to target the specific role — tailor the professional summary so it speaks directly to the position being applied for.
3. **Emphasize/expand bullet points** for experiences that are relevant to the job — add more descriptive language or detail to highlight relevance, but only where the data supports it.
4. **Use stronger action verbs** and quantify achievements where the data supports it — replace weak verbs with impactful ones, and surface metrics that already exist in the resume.
5. **De-prioritize (but keep) irrelevant experiences** — move less relevant roles lower or make their descriptions more concise, but never remove them.
6. **Highlight projects, technologies, and companies** that are an exact match with job requirements — draw attention to direct overlaps.

## Output Format
Output must be valid JSON with the exact structure below and NOTHING else (no markdown fences, no additional text):

{
  "refinedParsedData": { ... },
  "changes": ["<human-readable description of each change made>"],
  "matchedSkills": ["<skills from the resume that matched job requirements>"],
  "emphasizedExperiences": ["<experiences that were emphasized or expanded>"]
}

## Output Field Rules
- \`refinedParsedData\` must follow the same structure as the input \`parsedData\` (skills, experience[], education[], summary, etc.). Preserve all fields.
- \`changes\` is a human-readable list of every change you made so the user can review.
- \`matchedSkills\` lists skills from the resume that match the job requirements.
- \`emphasizedExperiences\` lists the experiences (by job title or project name) that were emphasized.

## LANGUAGE RULE
You MUST output ALL content (including changes descriptions, matched skills, emphasized experiences, and all text inside refinedParsedData) in the language specified by the user. If the language is Chinese, ALL text must be in Chinese. If English, in English. And so on for any language.`;
  }

  protected formatInput(input: RefineResumeInput): string {
    let prompt = `## Resume Parsed Data (JSON):\n\`\`\`json\n${JSON.stringify(input.parsedData, null, 2)}\n\`\`\`\n`;

    prompt += `\n## Target Job Title:\n${input.jobTitle}\n`;
    prompt += `\n## Job Description:\n${input.jobDescription}\n`;

    if (input.requirements) {
      if (input.requirements.mustHave && input.requirements.mustHave.length > 0) {
        prompt += `\n## Must-Have Requirements:\n${input.requirements.mustHave.map(r => `- ${r}`).join('\n')}\n`;
      }
      if (input.requirements.niceToHave && input.requirements.niceToHave.length > 0) {
        prompt += `\n## Nice-to-Have Requirements:\n${input.requirements.niceToHave.map(r => `- ${r}`).join('\n')}\n`;
      }
    }

    if (input.qualifications) {
      prompt += `\n## Qualifications:\n${input.qualifications}\n`;
    }

    if (input.hardRequirements) {
      prompt += `\n## Hard Requirements:\n${input.hardRequirements}\n`;
    }

    prompt += `\n## Target Output Language: ${input.language}\n`;
    prompt += `\nPlease refine this resume to be tailored for the target job. Remember: NEVER alter any facts. Output valid JSON only.`;

    return prompt;
  }

  protected parseOutput(response: string): RefineResumeOutput {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        return {
          refinedParsedData: parsed.refinedParsedData ?? parsed,
          changes: Array.isArray(parsed.changes) ? parsed.changes : [],
          matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills : [],
          emphasizedExperiences: Array.isArray(parsed.emphasizedExperiences) ? parsed.emphasizedExperiences : [],
        };
      } catch {
        // Continue to try parsing the entire response
      }
    }

    try {
      const parsed = JSON.parse(response);
      return {
        refinedParsedData: parsed.refinedParsedData ?? parsed,
        changes: Array.isArray(parsed.changes) ? parsed.changes : [],
        matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills : [],
        emphasizedExperiences: Array.isArray(parsed.emphasizedExperiences) ? parsed.emphasizedExperiences : [],
      };
    } catch {
      // Return fallback with original data unchanged
      return {
        refinedParsedData: {},
        changes: [],
        matchedSkills: [],
        emphasizedExperiences: [],
      };
    }
  }

  /**
   * Refine a resume for a specific job application
   */
  async refine(input: RefineResumeInput, requestId?: string): Promise<RefineResumeOutput> {
    return this.execute(input, input.jobDescription, requestId, input.language);
  }
}

export const refineResumeAgent = new RefineResumeAgent();
