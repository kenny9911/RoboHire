import { BaseAgent } from './BaseAgent.js';
import type { JobFitInput, JobFitResult } from '../types/index.js';

export class JobFitAgent extends BaseAgent<JobFitInput, JobFitResult> {
  constructor() {
    super('JobFitAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert recruitment matching specialist. Given one candidate's resume and multiple job openings, analyze how well the candidate fits each position.

## For each job opening, evaluate:
1. **Skills Match**: Compare the candidate's skills against requirements. Identify matched and missing critical skills.
2. **Experience Alignment**: Does the candidate's experience level, industry background, and role history align?
3. **Overall Fit Score** (0-100): Weight skills match (40%), experience alignment (35%), and potential/transferability (25%).
4. **Grade**: A+ (90-100), A (80-89), B+ (70-79), B (60-69), C (40-59), D (20-39), F (0-19)
5. **Verdict**: Strong Fit (80+), Good Fit (65-79), Moderate Fit (50-64), Weak Fit (30-49), Not a Fit (<30)
6. **Top 3 reasons** for the fit/lack of fit
7. **Actionable recommendation** (1-2 sentences, e.g., "Schedule screening call — strong match on must-haves" or "Skip — missing 3 critical requirements")

## Also provide:
- **Best Fit**: Which single job is the strongest match and why
- **Candidate Summary**: A brief positioning statement for this candidate (1-2 sentences)

Rank the jobs by fit score (highest first).

Respond ONLY with a JSON object in this exact format:
\`\`\`json
{
  "fits": [
    {
      "hiringRequestId": "<id>",
      "hiringRequestTitle": "<title>",
      "fitScore": 85,
      "fitGrade": "A",
      "verdict": "Strong Fit",
      "matchedSkills": ["skill1", "skill2"],
      "missingCriticalSkills": ["skill3"],
      "experienceAlignment": "Strong alignment — 5+ years in similar roles...",
      "topReasons": ["reason 1", "reason 2", "reason 3"],
      "recommendation": "Schedule screening call — strong match on must-haves."
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
        const e = exp as unknown as Record<string, unknown>;
        parts.push(`- ${e.role || 'Role'} at ${e.company || 'Company'} (${e.startDate || '?'} — ${e.endDate || '?'})`);
        if (e.description) parts.push(`  ${String(e.description).substring(0, 300)}`);
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
        const e = edu as unknown as Record<string, unknown>;
        parts.push(`- ${e.degree || ''} in ${e.field || ''} at ${e.institution || ''}`);
      }
    }

    parts.push('\n---\n## Job Openings to Match Against:\n');

    for (const job of input.hiringRequests) {
      parts.push(`### Job: ${job.title} (ID: ${job.id})`);
      parts.push(`**Requirements:**\n${job.requirements.substring(0, 2000)}`);
      if (job.jobDescription) {
        parts.push(`**Job Description:**\n${job.jobDescription.substring(0, 2000)}`);
      }
      parts.push('');
    }

    parts.push('Please analyze the candidate\'s fit for each job opening and provide your ranked assessment.');

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
