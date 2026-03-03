import { BaseAgent } from './BaseAgent.js';
import type { ScreeningInput, ScreeningResult } from '../types/index.js';

export class ScreeningAgent extends BaseAgent<ScreeningInput, ScreeningResult> {
  constructor() {
    super('ScreeningAgent');
  }

  protected getAgentPrompt(): string {
    return `You are a senior recruitment screening specialist. Given ONE job opening and MULTIPLE candidate resumes, evaluate how well each candidate fits the position.

You must go BEYOND simple keyword matching. Use genuine intelligence to assess fit.

## Experience Analysis Rules:
- Distinguish full-time vs internship experience from context clues (titles containing "Intern", "实习", "インターン", "Praktikant", duration < 6 months at early career stage)
- **Internships count ONLY as internship experience, NOT toward full-time work years**
- When a job requires "3+ years experience", internships do NOT count toward that requirement
- However, internship experience IS relevant for skill acquisition and domain familiarity

## Hard Requirements Analysis:
FIRST extract hard/must-have requirements from the job:
- Required degrees or certifications (e.g., "CPA required", "Master's degree required")
- Required licenses (e.g., "Licensed attorney", "PMP certified")
- Required minimum years of full-time experience
- Non-negotiable technical skills explicitly marked as "required" or "must-have"
- Language requirements (e.g., "Fluent in Mandarin required")

Scoring rules for hard requirements:
- If ANY dealbreaker hard requirement is missing → cap score at 30 MAX, verdict = "Not a Fit"
- If significant hard requirements are partially missing → cap score at 55 MAX
- Flag each gap in "hardRequirementGaps" with severity and what the candidate has instead

## Transferable Skills & Growth Potential:
Look beyond exact keyword matches:
1. **Related Technologies**: React ↔ Vue.js ↔ Angular, Python ↔ Ruby ↔ Go, AWS ↔ GCP ↔ Azure
2. **Adjacent Experience**: Product management → project management; backend → full-stack
3. **Demonstrated Learning Ability**: Mastering multiple languages/frameworks shows adaptability
4. **Domain Knowledge Transfer**: Industry experience transfers between roles in the same industry
5. **Upward Trajectory**: Rapid career progression indicates growth potential

Score transferable skills at 60-80% of the value of exact matches.
Report each transferable skill in "transferableSkills".

## Scoring Weights:
- Hard Requirements Pass/Fail: Gate (must pass before scoring)
- Skills Match: 40%
- Experience Alignment: 35%
- Potential & Transferable Skills: 25%

## Grade Scale:
A+ (90-100), A (80-89), B+ (70-79), B (60-69), C (40-59), D (20-39), F (0-19)

## Verdict:
Strong Fit (80+), Good Fit (65-79), Moderate Fit (50-64), Weak Fit (30-49), Not a Fit (<30)

For each candidate, provide:
1. Fit score (0-100), grade, and verdict
2. Matched skills and missing critical skills
3. Hard requirement gaps (if any) with severity
4. Transferable skills identified (if any)
5. Brief experience alignment assessment
6. Top 2-3 reasons for the assessment
7. Actionable recommendation (1 sentence)

Rank candidates by fit score (highest first).

Respond ONLY with a JSON object in this exact format:
\`\`\`json
{
  "screenings": [
    {
      "resumeId": "<id from input>",
      "fitScore": 82,
      "fitGrade": "A",
      "verdict": "Strong Fit",
      "matchedSkills": ["Python", "AWS", "PostgreSQL"],
      "missingCriticalSkills": ["Kubernetes"],
      "hardRequirementGaps": [
        {"requirement": "5+ years backend", "severity": "minor", "candidateStatus": "4 years full-time + 6 months internship"}
      ],
      "transferableSkills": [
        {"required": "GCP", "candidateHas": "AWS (3 years)", "relevance": "Both major cloud platforms; concepts transfer directly"}
      ],
      "experienceAlignment": "4 years full-time backend experience, strong match for mid-level role",
      "topReasons": ["Strong Python/AWS skills match", "Relevant domain experience in fintech"],
      "recommendation": "Schedule technical screening — strong skills match with minor experience gap."
    }
  ]
}
\`\`\``;
  }

  protected formatInput(input: ScreeningInput): string {
    const parts: string[] = [];
    const job = input.hiringRequest;

    parts.push(`## Job Opening: ${job.title} (ID: ${job.id})\n`);
    parts.push(`**Requirements:**\n${job.requirements.substring(0, 4000)}\n`);
    if (job.jobDescription) {
      parts.push(`**Job Description:**\n${job.jobDescription.substring(0, 4000)}\n`);
    }

    parts.push('---\n## Candidates to Screen:\n');

    for (let i = 0; i < input.resumes.length; i++) {
      const resume = input.resumes[i];
      parts.push(`### Candidate #${i + 1} (ID: ${resume.resumeId})`);
      parts.push(`**Name:** ${resume.name}`);
      if (resume.parsedSummary) {
        parts.push(resume.parsedSummary);
      }
      parts.push(`\n**Resume Text:**`);
      parts.push(resume.resumeText.substring(0, 3000));
      parts.push('');
    }

    parts.push(`\nScreen all ${input.resumes.length} candidates against the job opening above. Remember: separate internship from full-time experience, flag hard requirement gaps, and identify transferable skills.`);

    return parts.join('\n');
  }

  protected parseOutput(response: string): ScreeningResult {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed.screenings && Array.isArray(parsed.screenings)) {
          return parsed as ScreeningResult;
        }
      } catch {
        // fall through
      }
    }

    try {
      const parsed = JSON.parse(response);
      if (parsed.screenings && Array.isArray(parsed.screenings)) {
        return parsed as ScreeningResult;
      }
    } catch {
      // fall through
    }

    return { screenings: [] };
  }

  /**
   * Screen multiple resumes against a single hiring request.
   * For efficiency, call this with batches of ~5 resumes at a time.
   */
  async screen(
    hiringRequest: ScreeningInput['hiringRequest'],
    resumes: ScreeningInput['resumes'],
    requestId?: string
  ): Promise<ScreeningResult> {
    return this.executeWithJsonResponse(
      { hiringRequest, resumes },
      hiringRequest.requirements,
      requestId
    );
  }
}

export const screeningAgent = new ScreeningAgent();
