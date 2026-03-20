import { BaseAgent } from '../BaseAgent.js';
import type { SkillMatchInput, SkillMatchOutput } from './types.js';

export class SkillMatchSkill extends BaseAgent<SkillMatchInput, SkillMatchOutput> {
  constructor() {
    super('SkillMatchSkill');
  }

  protected getAgentPrompt(): string {
    return `You are an expert technical recruiter specializing in skills analysis. Your task is to deeply analyze skill alignment between a candidate's resume and a job description.

## Analysis Steps

1. **Resume Skills Extraction**: Extract technical skills, soft skills, certifications, and education level from the resume.
2. **JD Requirements Extraction**: Identify the job title, seniority level, required years, must-have skills, nice-to-have skills, industry focus, and key responsibilities.
3. **Must-Have Analysis**: For each must-have skill/experience/qualification, evaluate whether the candidate meets it. Assign severity levels:
   - **Dealbreaker**: Absolutely required, no substitute accepted
   - **Critical**: Strongly required, partial evidence may mitigate
   - **Significant**: Important but compensable with related experience
4. **Nice-to-Have Analysis**: Evaluate bonus skills, experiences, and qualifications. Identify competitive advantages.
5. **Skill Match Matrix**: List matched vs missing skills with proficiency levels (Beginner/Intermediate/Advanced/Expert) and evidence from the resume.
6. **Skill Match Scoring**: Provide an overall score (0-100) with breakdown:
   - mustHaveScore: percentage of must-haves met, penalized by severity of gaps
   - niceToHaveScore: percentage of nice-to-haves met
   - depthOfExpertise: how deeply the candidate has applied these skills
7. **Transferable Skills**: Identify related/adjacent skills and score them at 60-80% of exact match value (e.g., React ~ Vue.js, AWS ~ GCP).
8. **Hard Requirement Gaps**: List each unmet hard requirement with severity (dealbreaker/critical/significant) and what the candidate has instead.
9. **Credibility Flags**: Note red flags (bloating, vague claims, inconsistencies) and positive indicators (metrics, concrete achievements, specific technologies).

## Disqualification Rules
- Missing ANY must-have with severity "Dealbreaker" -> set mustHaveAnalysis.disqualified = true
- If mustHaveScore <= 25 -> disqualified = true
- List all disqualification reasons

## Education & University Tier Rules (CRITICAL):
- If JD requires Master's (硕士) and candidate only has Bachelor's (本科) → **Dealbreaker** — add to missingQualifications with severity "Dealbreaker"
- If JD requires 985/211 university and candidate's university is not 985/211 → **Dealbreaker**
- Look for "[985/211/双一流]" system-verified annotations in resume text — always trust these
- "[Not in 985/211/双一流 lists]" means the university does NOT qualify for 985/211 requirements
- "[海外/International]" satisfies 985/211 requirements as overseas education equivalent
- "本硕要求985、211" → BOTH undergraduate AND graduate institutions must qualify
- Education dealbreakers are absolute — no amount of skill strength compensates

## Output Format
Return ONLY valid JSON matching this structure:
\`\`\`json
{
  "resumeAnalysis": {
    "technicalSkills": ["..."],
    "softSkills": ["..."],
    "certifications": ["..."],
    "educationLevel": "<highest degree>"
  },
  "jdAnalysis": {
    "jobTitle": "<title>",
    "seniorityLevel": "<Junior/Mid/Senior/Lead/Principal>",
    "requiredYearsExperience": "<X+ years>",
    "mustHaveSkills": ["..."],
    "niceToHaveSkills": ["..."],
    "industryFocus": "<industry>",
    "keyResponsibilities": ["..."]
  },
  "mustHaveAnalysis": {
    "extractedMustHaves": {
      "skills": [{"skill": "<name>", "reason": "<why must-have>", "explicitlyStated": true}],
      "experiences": [{"experience": "<req>", "reason": "<why>", "minimumYears": "<X years>"}],
      "qualifications": [{"qualification": "<name>", "reason": "<why>"}]
    },
    "candidateEvaluation": {
      "meetsAllMustHaves": false,
      "matchedSkills": [{"skill": "<name>", "candidateEvidence": "<evidence>", "proficiency": "<level>"}],
      "missingSkills": [{"skill": "<name>", "severity": "<Dealbreaker|Critical|Significant>", "canBeLearnedQuickly": false, "alternativeEvidence": "<any>"}],
      "matchedExperiences": [{"experience": "<exp>", "candidateEvidence": "<evidence>", "exceeds": false}],
      "missingExperiences": [{"experience": "<exp>", "severity": "<level>", "gap": "<what's missing>", "partiallyMet": "<any partial>"}],
      "matchedQualifications": ["..."],
      "missingQualifications": [{"qualification": "<name>", "severity": "<level>", "alternative": "<any>"}]
    },
    "mustHaveScore": 0,
    "disqualified": false,
    "disqualificationReasons": [],
    "gapAnalysis": "<comprehensive gap analysis>"
  },
  "niceToHaveAnalysis": {
    "extractedNiceToHaves": {
      "skills": [{"skill": "<name>", "valueAdd": "<benefit>"}],
      "experiences": [{"experience": "<exp>", "valueAdd": "<benefit>"}],
      "qualifications": [{"qualification": "<name>", "valueAdd": "<benefit>"}]
    },
    "candidateEvaluation": {
      "matchedSkills": ["..."],
      "matchedExperiences": ["..."],
      "matchedQualifications": ["..."],
      "bonusSkills": ["..."]
    },
    "niceToHaveScore": 0,
    "competitiveAdvantage": "<how nice-to-haves make candidate stand out>"
  },
  "skillMatch": {
    "matchedMustHave": [{"skill": "<name>", "proficiencyLevel": "<level>", "evidenceFromResume": "<evidence>"}],
    "missingMustHave": [{"skill": "<name>", "importance": "<Critical|High|Medium>", "mitigationPossibility": "<explanation>"}],
    "matchedNiceToHave": ["..."],
    "missingNiceToHave": ["..."],
    "additionalRelevantSkills": ["..."]
  },
  "skillMatchScore": {
    "score": 0,
    "breakdown": {"mustHaveScore": 0, "niceToHaveScore": 0, "depthOfExpertise": 0},
    "skillApplicationAnalysis": "<how well skills are applied in experience>",
    "credibilityFlags": {
      "hasRedFlags": false,
      "concerns": ["..."],
      "positiveIndicators": ["..."]
    }
  },
  "transferableSkills": [
    {"required": "<JD skill>", "candidateHas": "<adjacent skill>", "relevance": "<why transferable>", "valueFactor": 70}
  ],
  "hardRequirementGaps": [
    {"requirement": "<hard req>", "severity": "dealbreaker|critical|significant", "candidateStatus": "<what candidate has>", "impact": "<impact on assessment>"}
  ]
}
\`\`\`

Be objective and evidence-based. Do not inflate scores for vague claims. Score transferable skills at 60-80% of exact match value.`;
  }

  protected formatInput(input: SkillMatchInput): string {
    let prompt = `## Resume:\n${input.resume}\n\n## Job Description:\n${input.jd}`;

    if (input.jobMetadata) {
      prompt += `\n\n## Job Metadata:\n${input.jobMetadata}`;
    }

    prompt += '\n\nAnalyze the skill match between this resume and job description.';
    return prompt;
  }

  protected parseOutput(response: string): SkillMatchOutput {
    try {
      const jsonFenceMatch = response.match(/```json\s*([\s\S]*?)```/);
      if (jsonFenceMatch) {
        return JSON.parse(jsonFenceMatch[1].trim()) as SkillMatchOutput;
      }

      const codeFenceMatch = response.match(/```\s*([\s\S]*?)```/);
      if (codeFenceMatch) {
        return JSON.parse(codeFenceMatch[1].trim()) as SkillMatchOutput;
      }

      const firstBrace = response.indexOf('{');
      const lastBrace = response.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(response.slice(firstBrace, lastBrace + 1)) as SkillMatchOutput;
      }

      return JSON.parse(response) as SkillMatchOutput;
    } catch {
      return {
        resumeAnalysis: {
          technicalSkills: [],
          softSkills: [],
          certifications: [],
          educationLevel: 'Unknown',
        },
        jdAnalysis: {
          jobTitle: 'Unknown',
          seniorityLevel: 'Unknown',
          requiredYearsExperience: 'Unknown',
          mustHaveSkills: [],
          niceToHaveSkills: [],
          industryFocus: 'Unknown',
          keyResponsibilities: [],
        },
        mustHaveAnalysis: {
          extractedMustHaves: {
            skills: [],
            experiences: [],
            qualifications: [],
          },
          candidateEvaluation: {
            meetsAllMustHaves: false,
            matchedSkills: [],
            missingSkills: [],
            matchedExperiences: [],
            missingExperiences: [],
            matchedQualifications: [],
            missingQualifications: [],
          },
          mustHaveScore: 0,
          disqualified: false,
          disqualificationReasons: [],
          gapAnalysis: 'Unable to analyze',
        },
        niceToHaveAnalysis: {
          extractedNiceToHaves: {
            skills: [],
            experiences: [],
            qualifications: [],
          },
          candidateEvaluation: {
            matchedSkills: [],
            matchedExperiences: [],
            matchedQualifications: [],
            bonusSkills: [],
          },
          niceToHaveScore: 0,
          competitiveAdvantage: 'Unable to analyze',
        },
        skillMatch: {
          matchedMustHave: [],
          missingMustHave: [],
          matchedNiceToHave: [],
          missingNiceToHave: [],
          additionalRelevantSkills: [],
        },
        skillMatchScore: {
          score: 0,
          breakdown: { mustHaveScore: 0, niceToHaveScore: 0, depthOfExpertise: 0 },
          skillApplicationAnalysis: 'Unable to analyze',
          credibilityFlags: { hasRedFlags: false, concerns: [], positiveIndicators: [] },
        },
        transferableSkills: [],
        hardRequirementGaps: [],
      };
    }
  }

  /**
   * Analyze skill match between a resume and job description
   */
  async analyze(
    input: SkillMatchInput,
    requestId?: string,
    locale?: string,
    model?: string,
  ): Promise<SkillMatchOutput> {
    return this.execute(input, input.jd, requestId, locale, model);
  }
}

export const skillMatchSkill = new SkillMatchSkill();
