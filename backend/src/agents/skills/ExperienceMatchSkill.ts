import { BaseAgent } from '../BaseAgent.js';
import type { ExperienceMatchInput, ExperienceMatchOutput } from './types.js';

export class ExperienceMatchSkill extends BaseAgent<ExperienceMatchInput, ExperienceMatchOutput> {
  constructor() {
    super('ExperienceMatchSkill');
  }

  protected getTemperature(): number {
    return 0.1;
  }

  protected getAgentPrompt(): string {
    return `You are an expert HR analyst specializing in experience evaluation. Your task is to deeply analyze a candidate's work experience against a job description's requirements.

## Analysis Steps

1. **Resume Experience Extraction**: Extract the candidate's name, total years of experience, current/most recent role, industries worked in, and key achievements.
2. **Experience Match**: Compare the JD's required experience (years, level, domain) with the candidate's actual experience. Calculate the years gap and provide a detailed assessment.
3. **Experience Validation**: Score the experience relevance (0-100), assess relevance to the role (High/Medium/Low), identify gaps with severity (Critical/Moderate/Minor) and whether each can be addressed (Yes/No/Partially), highlight strengths with their impact on the role, and analyze career progression.
4. **Candidate Potential**: Assess growth trajectory, leadership indicators, learning agility (based on career changes, certifications, skill breadth), unique value propositions, culture fit indicators, and risk factors for long-term fit.
5. **Experience Breakdown**: Classify experience by type:
   - **Full-time**: Standard employment positions
   - **Internship**: Roles containing "Intern", "Internship", or equivalent terms in any language
   - **Contract**: "Contract", "Contractor", "Consultant" roles
   - **Total relevant**: Combined summary of all qualifying experience
   - Include a note explaining how experience types affect qualification

## Critical Rules
- **Internships do NOT count toward full-time years requirements.** If a JD requires "3+ years experience", internship months are excluded.
- Internships ARE still valuable for skill acquisition and domain familiarity.
- Be skeptical of inflated titles or vague descriptions — look for concrete evidence.
- Career gaps should be noted but not automatically penalized.

## Education Level Rules:
- If JD requires Master's (硕士/研究生) and candidate only has Bachelor's (本科/学士) → this is a hard experience/qualification gap with **Critical** severity. Flag it in experienceValidation gaps.
- If JD requires 985/211 university background and candidate's education shows "[Not in 985/211/双一流 lists]" → flag as a gap.
- Trust "[985/211/双一流]" and "[海外/International]" system-verified annotations in resume text.
- Education level mismatches indicate the candidate may lack the depth of academic training expected for the role.

## Output Format
Return ONLY valid JSON matching this structure:
\`\`\`json
{
  "resumeAnalysis": {
    "candidateName": "<extracted name>",
    "totalYearsExperience": "<X years>",
    "currentRole": "<current or most recent role>",
    "industries": ["<industry1>", "<industry2>"],
    "keyAchievements": ["<achievement1>", "<achievement2>"]
  },
  "experienceMatch": {
    "required": "<JD experience requirement>",
    "candidate": "<candidate's experience summary>",
    "yearsGap": "<+X years over / -X years under / Meets requirement>",
    "assessment": "<detailed assessment of experience fit>"
  },
  "experienceValidation": {
    "score": 0,
    "relevanceToRole": "<High|Medium|Low>",
    "gaps": [
      {"area": "<gap area>", "severity": "<Critical|Moderate|Minor>", "canBeAddressed": "<Yes|No|Partially>"}
    ],
    "strengths": [
      {"area": "<strength area>", "impact": "<how it benefits the role>"}
    ],
    "careerProgression": "<analysis of career trajectory and growth>"
  },
  "candidatePotential": {
    "growthTrajectory": "<analysis of career growth pattern>",
    "leadershipIndicators": ["<evidence of leadership>"],
    "learningAgility": "<assessment based on career changes, certifications, skill breadth>",
    "uniqueValueProps": ["<what makes this candidate stand out>"],
    "cultureFitIndicators": ["<signals about work style, values>"],
    "riskFactors": ["<potential concerns for long-term fit>"]
  },
  "experienceBreakdown": {
    "fullTimeExperience": "<X years Y months of full-time work>",
    "internshipExperience": "<X months of internship experience>",
    "contractExperience": "<X months of contract work, if any>",
    "totalRelevantExperience": "<summary combining all relevant experience>",
    "note": "<how experience types affect qualification for this specific role>"
  }
}
\`\`\`

Be thorough and evidence-based. Distinguish between verified accomplishments and unsubstantiated claims.`;
  }

  protected formatInput(input: ExperienceMatchInput): string {
    let prompt = `## Resume:\n${input.resume}\n\n## Job Description:\n${input.jd}`;

    if (input.jobMetadata) {
      prompt += `\n\n## Job Metadata:\n${input.jobMetadata}`;
    }

    prompt += '\n\nAnalyze the experience match between this resume and job description.';
    return prompt;
  }

  protected parseOutput(response: string): ExperienceMatchOutput {
    try {
      const jsonFenceMatch = response.match(/```json\s*([\s\S]*?)```/);
      if (jsonFenceMatch) {
        return JSON.parse(jsonFenceMatch[1].trim()) as ExperienceMatchOutput;
      }

      const codeFenceMatch = response.match(/```\s*([\s\S]*?)```/);
      if (codeFenceMatch) {
        return JSON.parse(codeFenceMatch[1].trim()) as ExperienceMatchOutput;
      }

      const firstBrace = response.indexOf('{');
      const lastBrace = response.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(response.slice(firstBrace, lastBrace + 1)) as ExperienceMatchOutput;
      }

      return JSON.parse(response) as ExperienceMatchOutput;
    } catch {
      return {
        resumeAnalysis: {
          candidateName: 'Unknown',
          totalYearsExperience: 'Unknown',
          currentRole: 'Unknown',
          industries: [],
          keyAchievements: [],
        },
        experienceMatch: {
          required: 'Unknown',
          candidate: 'Unknown',
          yearsGap: 'Unknown',
          assessment: 'Unable to analyze',
        },
        experienceValidation: {
          score: 0,
          relevanceToRole: 'Unknown',
          gaps: [],
          strengths: [],
          careerProgression: 'Unable to analyze',
        },
        candidatePotential: {
          growthTrajectory: 'Unable to analyze',
          leadershipIndicators: [],
          learningAgility: 'Unable to analyze',
          uniqueValueProps: [],
          cultureFitIndicators: [],
          riskFactors: [],
        },
        experienceBreakdown: {
          fullTimeExperience: 'Unknown',
          internshipExperience: 'Unknown',
          contractExperience: 'Unknown',
          totalRelevantExperience: 'Unknown',
          note: 'Unable to analyze',
        },
      };
    }
  }

  /**
   * Analyze experience match between a resume and job description
   */
  async analyze(
    input: ExperienceMatchInput,
    requestId?: string,
    locale?: string,
    model?: string,
  ): Promise<ExperienceMatchOutput> {
    return this.execute(input, input.jd, requestId, locale, model);
  }
}

export const experienceMatchSkill = new ExperienceMatchSkill();
