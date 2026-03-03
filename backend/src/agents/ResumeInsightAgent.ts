import { BaseAgent } from './BaseAgent.js';
import type { ResumeInsightInput, ResumeInsight } from '../types/index.js';

export class ResumeInsightAgent extends BaseAgent<ResumeInsightInput, ResumeInsight> {
  constructor() {
    super('ResumeInsightAgent');
  }

  protected getAgentPrompt(): string {
    return `You are a senior talent analyst and career strategist with deep expertise in recruitment, compensation benchmarking, and labor market analysis.

Given a parsed resume, produce a comprehensive candidate intelligence report.

## Analysis Areas:

### 1. Career Trajectory
- Analyze role progression across positions (title seniority, company prestige, scope growth)
- Classify direction: Upward, Lateral, Declining, Early Career, or Career Change
- Identify key career transitions and their significance
- Assess progression rate (e.g., "Fast — promoted every 1.5 years")

### 2. Salary Estimate
- Estimate a realistic salary range based on skills, experience years, industry, role level, and geographic signals
- State confidence level (High if strong signals, Low if ambiguous)
- List the factors that influenced your estimate
- Provide brief market context

### 3. Market Competitiveness (0-100)
- Score how in-demand this profile is in the current job market
- Identify which skills are rare/hot vs. commodity
- Note relevant market trends affecting this candidate's value
- Levels: 80-100 Highly Sought-After, 60-79 Competitive, 40-59 Average, 0-39 Below Average

### 4. Strengths & Development Areas
- Identify 3-5 core strengths with evidence from the resume and their business impact
- Identify 2-4 development areas with current level assessment and actionable recommendations

### 5. Culture Fit Indicators
- Infer work style preferences (collaborative, autonomous, startup-oriented, corporate, etc.)
- Infer values from career choices and achievements
- Suggest environment preferences
- Assess management style (hands-on, strategic, mentoring, etc.)

### 6. Red Flags
- Job hopping (3+ roles under 18 months each)
- Unexplained employment gaps > 6 months
- Declining career trajectory
- Inconsistencies (e.g., junior title but claiming to lead large teams)
- Buzzword stuffing without concrete evidence
- Rate severity: High, Medium, Low
- Always provide mitigating factors if any

### 7. Recommended Roles (3-5)
- Suggest specific role types and industries where this person would excel
- Include seniority level and reasoning

### 8. Executive Summary
- 2-3 sentences capturing the candidate's overall profile and market position

Respond ONLY with a JSON object in this exact format:
\`\`\`json
{
  "executiveSummary": "...",
  "careerTrajectory": {
    "direction": "Upward|Lateral|Declining|Early Career|Career Change",
    "analysis": "...",
    "keyTransitions": ["transition 1", "transition 2"],
    "progressionRate": "..."
  },
  "salaryEstimate": {
    "rangeLow": "$XXX,XXX",
    "rangeHigh": "$XXX,XXX",
    "currency": "USD",
    "confidence": "High|Medium|Low",
    "factors": ["factor 1", "factor 2"],
    "marketContext": "..."
  },
  "marketCompetitiveness": {
    "score": 75,
    "level": "Highly Sought-After|Competitive|Average|Below Average",
    "inDemandSkills": ["skill1"],
    "rareSkills": ["skill1"],
    "commoditySkills": ["skill1"],
    "marketTrends": "..."
  },
  "strengthsAndDevelopment": {
    "coreStrengths": [
      { "strength": "...", "evidence": "...", "impact": "..." }
    ],
    "developmentAreas": [
      { "area": "...", "currentLevel": "...", "recommendation": "..." }
    ]
  },
  "cultureFitIndicators": {
    "workStyle": ["collaborative", "autonomous"],
    "values": ["innovation", "impact"],
    "environmentPreferences": ["startup", "fast-paced"],
    "managementStyle": "..."
  },
  "redFlags": [
    { "flag": "...", "severity": "High|Medium|Low", "details": "...", "mitigatingFactors": "..." }
  ],
  "recommendedRoles": [
    { "roleType": "...", "industry": "...", "seniorityLevel": "...", "fitReason": "..." }
  ]
}
\`\`\``;
  }

  protected formatInput(input: ResumeInsightInput): string {
    const resume = input.parsedResume;
    const parts: string[] = ['## Parsed Resume Data:'];

    if (resume.name) parts.push(`**Name:** ${resume.name}`);
    if (resume.summary) parts.push(`**Summary:** ${resume.summary}`);

    if (resume.experience && Array.isArray(resume.experience) && resume.experience.length > 0) {
      parts.push('\n**Work Experience:**');
      for (const exp of resume.experience) {
        const e = exp as unknown as Record<string, unknown>;
        parts.push(`- ${e.role || 'Role'} at ${e.company || 'Company'} (${e.startDate || '?'} — ${e.endDate || '?'})`);
        if (e.description) parts.push(`  ${String(e.description).substring(0, 500)}`);
        if (Array.isArray(e.achievements) && e.achievements.length > 0) {
          parts.push(`  Achievements: ${(e.achievements as string[]).join('; ').substring(0, 500)}`);
        }
      }
    }

    if (resume.education && Array.isArray(resume.education) && resume.education.length > 0) {
      parts.push('\n**Education:**');
      for (const edu of resume.education) {
        const e = edu as unknown as Record<string, unknown>;
        parts.push(`- ${e.degree || ''} in ${e.field || ''} at ${e.institution || ''} (${e.endDate || ''})`);
      }
    }

    if (resume.skills) {
      const skills = resume.skills as Record<string, unknown>;
      const allSkills: string[] = [];
      for (const category of ['technical', 'soft', 'tools', 'frameworks', 'languages', 'other']) {
        if (Array.isArray(skills[category])) {
          allSkills.push(...(skills[category] as string[]));
        }
      }
      if (Array.isArray(resume.skills)) {
        allSkills.push(...(resume.skills as string[]));
      }
      if (allSkills.length > 0) {
        parts.push(`\n**Skills:** ${allSkills.join(', ')}`);
      }
    }

    if (resume.certifications && Array.isArray(resume.certifications) && resume.certifications.length > 0) {
      parts.push(`\n**Certifications:** ${(resume.certifications as unknown as Array<Record<string, unknown>>).map(c => c.name || c).join(', ')}`);
    }

    parts.push('\n## Full Resume Text (for additional context):');
    parts.push(input.resumeText.substring(0, 8000));

    parts.push('\nPlease analyze this candidate and provide your comprehensive intelligence report.');

    return parts.join('\n');
  }

  protected parseOutput(response: string): ResumeInsight {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as ResumeInsight;
      } catch {
        // fall through
      }
    }

    try {
      return JSON.parse(response) as ResumeInsight;
    } catch {
      return {
        executiveSummary: 'Unable to generate insights for this resume.',
        careerTrajectory: { direction: 'Early Career', analysis: '', keyTransitions: [], progressionRate: '' },
        salaryEstimate: { rangeLow: '', rangeHigh: '', currency: 'USD', confidence: 'Low', factors: [], marketContext: '' },
        marketCompetitiveness: { score: 0, level: 'Average', inDemandSkills: [], rareSkills: [], commoditySkills: [], marketTrends: '' },
        strengthsAndDevelopment: { coreStrengths: [], developmentAreas: [] },
        cultureFitIndicators: { workStyle: [], values: [], environmentPreferences: [], managementStyle: '' },
        redFlags: [],
        recommendedRoles: [],
      };
    }
  }

  async analyze(parsedResume: ResumeInsightInput['parsedResume'], resumeText: string, requestId?: string): Promise<ResumeInsight> {
    return this.executeWithJsonResponse({ parsedResume, resumeText }, resumeText, requestId);
  }
}

export const resumeInsightAgent = new ResumeInsightAgent();
