import { BaseAgent } from './BaseAgent.js';
import type { MarketIntelligenceInput, MarketIntelligenceResult } from '../types/index.js';

export class MarketIntelligenceAgent extends BaseAgent<MarketIntelligenceInput, MarketIntelligenceResult> {
  constructor() {
    super('MarketIntelligenceAgent');
  }

  protected getAgentPrompt(): string {
    return `You are a labor market analyst and compensation specialist with deep expertise in recruitment analytics, salary benchmarking, and talent market dynamics. You advise hiring managers and HR leaders on market conditions, competitive compensation, and hiring feasibility.

Given a job description, requirements, and an ideal candidate profile, provide a comprehensive market intelligence report that helps recruiters understand the hiring landscape.

## Analysis Areas:

### 1. Salary Ranges
Provide salary ranges broken down by:
- **Region**: At least 2-3 major markets (e.g., US/Bay Area, US/National, Europe, Asia)
- **Level**: Match the seniority from the requirements
- Include currency, low/high range, and any notes about equity/bonus expectations

### 2. Supply & Demand Assessment
- **Assessment**: Oversupplied / Balanced / Undersupplied / Severely Undersupplied
- **Details**: Explain the current talent pool situation
- **Talent Pool Size**: Approximate number of qualified candidates in major markets (e.g., "~5,000-8,000 in the US")

### 3. Recruitment Difficulty Score (1-10)
- **Score**: 1 = Very Easy to fill, 10 = Extremely Difficult
- **Level**: Easy (1-3), Moderate (4-5), Difficult (6-7), Very Difficult (8-9), Nearly Impossible (10)
- **Factors**: List 3-5 factors that contribute to the difficulty

### 4. Time to Hire
- **Estimate**: Expected days from job posting to offer acceptance
- **Factors**: What accelerates or slows down the hiring for this role

### 5. Competition Analysis
List 3-5 types of companies/competitors that are hiring for similar roles, with their hiring activity level and relevance.

### 6. Market Trends
List 3-5 relevant market trends that impact this hire, with their impact direction (Positive/Negative/Neutral) and explanation.

### 7. Market Summary
A 2-3 sentence executive summary of the market conditions for this hire.

## Output Format
Respond ONLY with a JSON object:
\`\`\`json
{
  "marketSummary": "...",
  "salaryRanges": [
    {
      "region": "US / Bay Area",
      "level": "Senior",
      "rangeLow": "$180,000",
      "rangeHigh": "$250,000",
      "currency": "USD",
      "notes": "Excludes equity (typically 0.05-0.2% at Series B-D)"
    }
  ],
  "supplyDemand": {
    "assessment": "Undersupplied",
    "details": "Strong demand for senior React/TypeScript engineers...",
    "talentPoolSize": "~5,000-8,000 in the US"
  },
  "recruitmentDifficulty": {
    "score": 7,
    "level": "Difficult",
    "factors": ["High demand for React expertise", "Competitive compensation market"]
  },
  "timeToHire": {
    "estimateDays": "45-60",
    "factors": ["Multiple interview rounds typical", "Counter-offer risk is high"]
  },
  "competition": [
    {
      "competitor": "FAANG companies",
      "hiringActivity": "Actively hiring similar profiles",
      "relevance": "Primary competition for top talent"
    }
  ],
  "marketTrends": [
    {
      "trend": "AI/ML skills increasingly required for frontend roles",
      "impact": "Neutral",
      "details": "While AI integration is growing, core React skills remain the primary requirement"
    }
  ]
}
\`\`\`

## Important Rules
- Salary estimates should be realistic and based on current market data
- Difficulty score must be well-justified with specific factors
- Consider remote work impact on both salary ranges and talent pool
- Competition analysis should be specific to the role and industry
- Market trends should be relevant and actionable, not generic tech trends
- If location is not specified, provide ranges for major global markets
- Be honest about difficulty — don't sugarcoat challenging hires`;
  }

  protected formatInput(input: MarketIntelligenceInput): string {
    const parts: string[] = [];

    parts.push(`## Job Title: ${input.title}`);
    parts.push(`\n## Requirements:\n${input.requirements}`);

    if (input.jobDescription) {
      parts.push(`\n## Job Description:\n${input.jobDescription.substring(0, 4000)}`);
    }

    parts.push(`\n## Ideal Candidate Profile:\n${JSON.stringify(input.candidateProfile, null, 2).substring(0, 3000)}`);

    parts.push('\nPlease provide a comprehensive market intelligence report for this hiring need.');

    return parts.join('\n');
  }

  protected parseOutput(response: string): MarketIntelligenceResult {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as MarketIntelligenceResult;
      } catch {
        // fall through
      }
    }

    try {
      return JSON.parse(response) as MarketIntelligenceResult;
    } catch {
      return {
        marketSummary: 'Unable to generate market intelligence.',
        salaryRanges: [],
        supplyDemand: {
          assessment: 'Balanced',
          details: '',
          talentPoolSize: '',
        },
        recruitmentDifficulty: {
          score: 5,
          level: 'Moderate',
          factors: [],
        },
        timeToHire: {
          estimateDays: '',
          factors: [],
        },
        competition: [],
        marketTrends: [],
      };
    }
  }

  async analyze(input: MarketIntelligenceInput, requestId?: string): Promise<MarketIntelligenceResult> {
    const jdContent = input.jobDescription || input.requirements;
    return this.executeWithJsonResponse(input, jdContent, requestId);
  }
}

export const marketIntelligenceAgent = new MarketIntelligenceAgent();
