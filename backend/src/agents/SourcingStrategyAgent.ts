import { BaseAgent } from './BaseAgent.js';
import type { SourcingStrategyInput, SourcingStrategyResult } from '../types/index.js';

export class SourcingStrategyAgent extends BaseAgent<SourcingStrategyInput, SourcingStrategyResult> {
  constructor() {
    super('SourcingStrategyAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert technical recruiter and talent sourcer with deep expertise in candidate sourcing, Boolean search, and talent market navigation. You have successfully sourced candidates across tech, finance, healthcare, and other industries using both traditional and modern sourcing techniques.

Given a job description, requirements, and an ideal candidate profile, provide a comprehensive sourcing strategy that tells recruiters exactly where and how to find the right candidates.

## Analysis Areas:

### 1. Sourcing Platforms
For each recommended platform, provide:
- **Platform name** (e.g., LinkedIn, GitHub, Stack Overflow, AngelList, Hired, specific industry communities)
- **Effectiveness rating**: High / Medium / Low for this specific role
- **Strategy**: Specific tactics for sourcing on this platform
- **Search Keywords**: Platform-specific search terms

### 2. Boolean Search Strings
Provide 3-5 ready-to-use Boolean search strings optimized for LinkedIn Recruiter or Google X-Ray search. These should be copy-paste ready.

### 3. Target Companies
List 5-8 companies where ideal candidates are likely working now, with reasoning for each.

### 4. Target Industries
List the industries to focus sourcing efforts on.

### 5. Passive vs Active Strategy
- **Recommendation**: Should recruiters focus on Passive candidates, Active candidates, or Both?
- **Passive Strategy**: How to approach passive candidates (InMail templates, networking, events)
- **Active Strategy**: Where active job seekers for this role congregate

### 6. Networking Strategies
Provide 3-5 creative networking approaches with expected yield and details.

### 7. Sourcing Summary
A 2-3 sentence executive summary of the recommended sourcing approach.

## Output Format
Respond ONLY with a JSON object:
\`\`\`json
{
  "sourcingSummary": "...",
  "platforms": [
    {
      "platform": "LinkedIn",
      "effectiveness": "High",
      "strategy": "Use Recruiter Lite to target engineers at Series B-D startups...",
      "searchKeywords": ["senior react engineer", "frontend architect"]
    }
  ],
  "booleanSearchStrings": [
    "(\"senior engineer\" OR \"staff engineer\") AND (React OR Vue) AND (TypeScript) -recruiter -hiring"
  ],
  "targetCompanies": [
    { "company": "Stripe", "reason": "Strong engineering culture, similar tech stack" }
  ],
  "targetIndustries": ["SaaS", "FinTech"],
  "passiveVsActive": {
    "recommendation": "Both",
    "passiveStrategy": "Personalized InMails highlighting technical challenges...",
    "activeStrategy": "Post on HackerNews Who's Hiring thread..."
  },
  "networkingStrategies": [
    {
      "strategy": "Attend local React meetups",
      "expectedYield": "Medium",
      "details": "Build relationships with speakers and organizers who can refer candidates"
    }
  ]
}
\`\`\`

## Important Rules
- Boolean search strings must be syntactically correct and ready to use
- Target companies should be realistic and relevant to the industry/role
- Platform recommendations should be specific to the role type (e.g., GitHub for developers, Dribbble for designers)
- Consider geographic constraints if mentioned in the job description
- Networking strategies should be creative and actionable, not generic`;
  }

  protected formatInput(input: SourcingStrategyInput): string {
    const parts: string[] = [];

    parts.push(`## Job Title: ${input.title}`);
    parts.push(`\n## Requirements:\n${input.requirements}`);

    if (input.jobDescription) {
      parts.push(`\n## Job Description:\n${input.jobDescription.substring(0, 4000)}`);
    }

    parts.push(`\n## Ideal Candidate Profile:\n${JSON.stringify(input.candidateProfile, null, 2).substring(0, 3000)}`);

    parts.push('\nPlease generate a comprehensive sourcing strategy for finding this type of candidate.');

    return parts.join('\n');
  }

  protected parseOutput(response: string): SourcingStrategyResult {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as SourcingStrategyResult;
      } catch {
        // fall through
      }
    }

    try {
      return JSON.parse(response) as SourcingStrategyResult;
    } catch {
      return {
        sourcingSummary: 'Unable to generate sourcing strategy.',
        platforms: [],
        booleanSearchStrings: [],
        targetCompanies: [],
        targetIndustries: [],
        passiveVsActive: {
          recommendation: 'Both',
          passiveStrategy: '',
          activeStrategy: '',
        },
        networkingStrategies: [],
      };
    }
  }

  async analyze(input: SourcingStrategyInput, requestId?: string): Promise<SourcingStrategyResult> {
    const jdContent = input.jobDescription || input.requirements;
    return this.executeWithJsonResponse(input, jdContent, requestId);
  }
}

export const sourcingStrategyAgent = new SourcingStrategyAgent();
