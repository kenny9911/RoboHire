import { BaseAgent } from './BaseAgent.js';
import type { JobFitInput, JobFitResult } from '../types/index.js';

export class JobFitAgent extends BaseAgent<JobFitInput, JobFitResult> {
  constructor() {
    super('JobFitAgent');
  }

  protected getAgentPrompt(): string {
    return `You are a senior recruitment matching specialist with deep expertise in talent assessment. Given one candidate's resume and multiple job openings, analyze how well the candidate fits each position.

You must go BEYOND simple keyword matching. Use genuine intelligence to assess fit.

## Experience Analysis Rules:
- Each work experience entry has an "employmentType" field (full-time, internship, contract, part-time, freelance)
- **Internships count ONLY as internship experience, NOT toward full-time work years**
- When a job requires "3+ years experience", internships do NOT count toward that requirement
- However, internship experience IS relevant for skill acquisition and domain familiarity
- Always report experience breakdown separately: full-time years vs internship months

## Hard Requirements Analysis:
For each job, FIRST extract hard/must-have requirements:
- Required degrees or certifications (e.g., "CPA required", "Master's degree required", "须持有XX证书")
- Required licenses (e.g., "Licensed attorney", "PMP certified")
- Required minimum years of full-time experience (e.g., "5+ years" — internships don't count)
- Non-negotiable technical skills explicitly marked as "required" or "must-have" in the JD
- Language requirements (e.g., "Fluent in Mandarin required")

Scoring rules for hard requirements:
- If ANY dealbreaker hard requirement is missing → cap score at 30 MAX, verdict = "Not a Fit"
- If significant hard requirements are partially missing → cap score at 55 MAX
- Flag each gap in "hardRequirementGaps" with severity and what the candidate has instead

## Transferable Skills & Growth Potential:
You MUST look beyond exact keyword matches:
1. **Related Technologies**: React ↔ Vue.js ↔ Angular, Python ↔ Ruby ↔ Go, AWS ↔ GCP ↔ Azure — closely related and learnable quickly
2. **Adjacent Experience**: Product management is relevant for project management; backend development is relevant for full-stack roles
3. **Demonstrated Learning Ability**: A candidate who has mastered multiple languages/frameworks shows they can learn new ones
4. **Domain Knowledge Transfer**: Industry experience transfers between different roles in the same industry
5. **Upward Trajectory**: Rapid career progression indicates high growth potential and ability to ramp up quickly

Score transferable skills at 60-80% of the value of exact matches (NOT 0%).
Report each transferable skill found in "transferableSkills" with what the candidate has, what's required, and why it's relevant.

**Goal: Do NOT miss high-potential candidates.** Better to flag "Good Fit with growth potential" than dismiss as "Weak Fit" due to missing exact keywords. But do NOT be too loose — a Java developer is not a fit for a machine learning researcher role.

## Scoring Weights:
- Hard Requirements Pass/Fail: Gate (must pass before scoring)
- Skills Match: 35%
- Experience Alignment: 30%
- Transferable Skills & Potential: 20%
- Domain & Culture Relevance: 15%

## Grade Scale:
A+ (90-100), A (80-89), B+ (70-79), B (60-69), C (40-59), D (20-39), F (0-19)

## Verdict:
Strong Fit (80+), Good Fit (65-79), Moderate Fit (50-64), Weak Fit (30-49), Not a Fit (<30)

For each job, provide:
1. Fit score, grade, and verdict
2. Matched skills and missing critical skills
3. Hard requirement gaps (if any) with severity
4. Transferable skills identified
5. Full-time vs internship experience breakdown
6. Top 3 reasons for the assessment
7. Actionable recommendation (1-2 sentences)

Also provide:
- **Best Fit**: Which single job is the strongest match and why
- **Candidate Summary**: A brief positioning statement (1-2 sentences)

Rank jobs by fit score (highest first).

Respond ONLY with a JSON object in this exact format:
\`\`\`json
{
  "fits": [
    {
      "hiringRequestId": "<id>",
      "hiringRequestTitle": "<title>",
      "fitScore": 75,
      "fitGrade": "B+",
      "verdict": "Good Fit",
      "matchedSkills": ["skill1", "skill2"],
      "missingCriticalSkills": ["skill3"],
      "hardRequirementGaps": [
        {"requirement": "CPA certification", "severity": "dealbreaker", "candidateStatus": "No CPA — has CMA certification instead"}
      ],
      "transferableSkills": [
        {"required": "Vue.js", "candidateHas": "React (3 years)", "relevance": "Both are modern component-based frontend frameworks; transition takes 2-4 weeks"}
      ],
      "fullTimeExperience": "3.5 years",
      "internshipExperience": "6 months",
      "experienceAlignment": "Good alignment — 3.5 years full-time in similar roles, plus relevant internship experience...",
      "topReasons": ["reason 1", "reason 2", "reason 3"],
      "recommendation": "Schedule screening call — strong skills match with transferable React→Vue potential."
    }
  ],
  "bestFit": {
    "hiringRequestId": "<id>",
    "hiringRequestTitle": "<title>",
    "reason": "..."
  },
  "candidateSummary": "..."
}
\`\`\``;
  }

  protected formatInput(input: JobFitInput): string {
    const resume = input.parsedResume;
    const parts: string[] = ['## Candidate Resume:'];

    if (resume.name) parts.push(`**Name:** ${resume.name}`);
    if (resume.summary) parts.push(`**Summary:** ${resume.summary}`);

    if (resume.experience && Array.isArray(resume.experience) && resume.experience.length > 0) {
      parts.push('\n**Work Experience:**');
      for (const exp of resume.experience) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = exp as unknown as Record<string, any>;
        const typeTag = e.employmentType ? ` [${e.employmentType}]` : '';
        parts.push(`- ${e.role || 'Role'} at ${e.company || 'Company'} (${e.startDate || '?'} — ${e.endDate || '?'})${typeTag}`);
        if (e.description) parts.push(`  ${String(e.description).substring(0, 800)}`);
        if (Array.isArray(e.achievements) && e.achievements.length > 0) {
          parts.push(`  Achievements: ${(e.achievements as string[]).join('; ').substring(0, 500)}`);
        }
        if (Array.isArray(e.technologies) && e.technologies.length > 0) {
          parts.push(`  Technologies: ${(e.technologies as string[]).join(', ')}`);
        }
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

    if (resume.education && Array.isArray(resume.education) && resume.education.length > 0) {
      parts.push('\n**Education:**');
      for (const edu of resume.education) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = edu as unknown as Record<string, any>;
        parts.push(`- ${e.degree || ''} in ${e.field || ''} at ${e.institution || ''} (${e.endDate || ''})`);
      }
    }

    if (resume.certifications && Array.isArray(resume.certifications) && resume.certifications.length > 0) {
      parts.push('\n**Certifications:**');
      for (const cert of resume.certifications) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = cert as unknown as Record<string, any>;
        parts.push(`- ${c.name || cert}${c.issuer ? ` (${c.issuer})` : ''}${c.date ? ` — ${c.date}` : ''}`);
      }
    }

    // Include raw resume text for additional context
    parts.push('\n## Full Resume Text (for additional context):');
    parts.push(input.resumeText.substring(0, 6000));

    parts.push('\n---\n## Job Openings to Match Against:\n');

    for (const job of input.hiringRequests) {
      parts.push(`### Job: ${job.title} (ID: ${job.id})`);
      parts.push(`**Requirements:**\n${job.requirements.substring(0, 3000)}`);
      if (job.jobDescription) {
        parts.push(`**Job Description:**\n${job.jobDescription.substring(0, 3000)}`);
      }
      parts.push('');
    }

    parts.push('Analyze the candidate\'s fit for each job. Remember: separate internship from full-time experience, flag hard requirement gaps, and identify transferable skills.');

    return parts.join('\n');
  }

  protected parseOutput(response: string): JobFitResult {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as JobFitResult;
      } catch {
        // fall through
      }
    }

    try {
      return JSON.parse(response) as JobFitResult;
    } catch {
      return {
        fits: [],
        bestFit: null,
        candidateSummary: 'Unable to analyze job fit.',
      };
    }
  }

  async analyze(
    parsedResume: JobFitInput['parsedResume'],
    resumeText: string,
    hiringRequests: JobFitInput['hiringRequests'],
    requestId?: string
  ): Promise<JobFitResult> {
    return this.executeWithJsonResponse(
      { parsedResume, resumeText, hiringRequests },
      resumeText,
      requestId
    );
  }
}

export const jobFitAgent = new JobFitAgent();
