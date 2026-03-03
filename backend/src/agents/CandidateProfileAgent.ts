import { BaseAgent } from './BaseAgent.js';
import type { RecruitmentIntelligenceInput, CandidateProfileResult } from '../types/index.js';

export class CandidateProfileAgent extends BaseAgent<RecruitmentIntelligenceInput, CandidateProfileResult> {
  constructor() {
    super('CandidateProfileAgent');
  }

  protected getAgentPrompt(): string {
    return `You are a senior talent strategist with 15+ years of experience in executive search, talent acquisition, and workforce planning across multiple industries.

Given a job title, requirements, and optional job description, generate a comprehensive ideal candidate profile/persona that helps recruiters understand exactly who they should be looking for.

## Analysis Areas:

### 1. Candidate Persona Summary
Write a 2-3 sentence vivid description of the ideal candidate — who they are, what drives them, and what makes them exceptional for this role.

### 2. Ideal Background
- **Typical Degrees**: List 2-4 relevant educational backgrounds (be specific: e.g., "BS in Computer Science" not just "engineering degree")
- **Typical Career Path**: Show 2-3 realistic career progression paths that lead to this role (e.g., "Junior Developer → Mid-Level Engineer → Senior Engineer → Tech Lead")
- **Years of Experience**: Specify the sweet spot range (e.g., "5-8 years")
- **Industry Background**: List 2-4 industries where ideal candidates typically come from

### 3. Skill Mapping
- **Must-Have Skills**: List the absolutely essential skills with:
  - Expected seniority level for each (e.g., "Advanced", "Expert", "Intermediate")
  - Why this skill is critical for the role
- **Nice-to-Have Skills**: List bonus skills with the value they add

### 4. Personality & Culture Fit
- **Traits**: List 4-6 personality traits with importance level (Critical/High/Medium) and reasoning
- **Culture Fit Indicators**: List 3-5 behaviors or values that signal cultural alignment

### 5. Day in the Life
Write a realistic 3-5 sentence description of what a typical day looks like for someone in this role. Include specific activities, interactions, and challenges they would face.

## Output Format
Respond ONLY with a JSON object in this exact format:
\`\`\`json
{
  "candidatePersonaSummary": "...",
  "idealBackground": {
    "typicalDegrees": ["BS in Computer Science", "MS in Software Engineering"],
    "typicalCareerPath": ["Junior Dev → Mid Dev → Senior Dev → Lead"],
    "yearsOfExperience": "5-8 years",
    "industryBackground": ["SaaS", "FinTech"]
  },
  "skillMapping": {
    "mustHave": [
      { "skill": "React", "seniorityExpectation": "Advanced", "reason": "Core frontend framework used daily" }
    ],
    "niceToHave": [
      { "skill": "GraphQL", "valueAdd": "Enables faster API development" }
    ]
  },
  "personalityTraits": {
    "traits": [
      { "trait": "Self-motivated", "importance": "Critical", "reason": "Remote-first team requires autonomy" }
    ],
    "cultureFitIndicators": ["Enjoys mentoring junior developers", "Proactive communicator"]
  },
  "dayInTheLife": "..."
}
\`\`\`

## Important Rules
- Be specific and actionable — avoid vague generic descriptions
- Ground your analysis in the actual requirements provided
- If the job description is light on detail, make reasonable inferences but note assumptions
- Tailor the persona to the seniority level implied by the requirements
- Consider both technical and soft skill dimensions`;
  }

  protected formatInput(input: RecruitmentIntelligenceInput): string {
    const parts: string[] = [];

    parts.push(`## Job Title: ${input.title}`);
    parts.push(`\n## Requirements:\n${input.requirements}`);

    if (input.jobDescription) {
      parts.push(`\n## Job Description:\n${input.jobDescription.substring(0, 6000)}`);
    }

    parts.push('\nPlease generate the ideal candidate profile for this position.');

    return parts.join('\n');
  }

  protected parseOutput(response: string): CandidateProfileResult {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as CandidateProfileResult;
      } catch {
        // fall through
      }
    }

    try {
      return JSON.parse(response) as CandidateProfileResult;
    } catch {
      return {
        candidatePersonaSummary: 'Unable to generate candidate profile.',
        idealBackground: {
          typicalDegrees: [],
          typicalCareerPath: [],
          yearsOfExperience: '',
          industryBackground: [],
        },
        skillMapping: {
          mustHave: [],
          niceToHave: [],
        },
        personalityTraits: {
          traits: [],
          cultureFitIndicators: [],
        },
        dayInTheLife: '',
      };
    }
  }

  async analyze(input: RecruitmentIntelligenceInput, requestId?: string): Promise<CandidateProfileResult> {
    const jdContent = input.jobDescription || input.requirements;
    return this.executeWithJsonResponse(input, jdContent, requestId);
  }
}

export const candidateProfileAgent = new CandidateProfileAgent();
