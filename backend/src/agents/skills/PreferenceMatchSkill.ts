import { BaseAgent } from '../BaseAgent.js';
import type { PreferenceMatchInput, PreferenceMatchOutput } from './types.js';

export class PreferenceMatchSkill extends BaseAgent<PreferenceMatchInput, PreferenceMatchOutput> {
  constructor() {
    super('PreferenceMatchSkill');
  }

  protected getTemperature(): number {
    return 0.1;
  }

  protected getAgentPrompt(): string {
    return `You are an expert recruitment advisor specializing in preference alignment and interview preparation. Your task is to analyze how well a candidate's preferences match a job's attributes, and generate tailored interview questions.

## Analysis Steps

### 1. Preference Alignment
Evaluate each dimension (score 0-100 each):
- **Location Fit**: Do candidate's preferred locations overlap with job location? Remote preference vs on-site requirement?
- **Work Type Fit**: Does candidate's preferred work arrangement (full-time, part-time, remote, hybrid, contract) match the job?
- **Salary Fit**: Do salary expectations overlap with the offered range? Score 100 if ranges overlap, 50 if close, 0 if far apart.
- **Job Type Fit**: Does candidate's preferred role type match the job's department and title?
- **Company Type Fit**: Does candidate's preferred company type (startup, enterprise, agency, etc.) match?

If no candidate preferences are provided, set all scores to 100 and overallAssessment to "No candidate preferences on file". If a specific dimension has no data, score it 100 (neutral). Include warnings for significant mismatches.

### 2. Interview Questions
Generate questions in 6 categories. Each category contains areas with specific questions:
- **technical**: Domain-specific technical assessment questions
- **behavioral**: STAR-format behavioral competency questions
- **experienceValidation**: Questions to verify resume claims are genuine
- **situational**: Hypothetical role-specific scenario questions
- **cultureFit**: Questions assessing work style and values alignment
- **redFlagProbing**: Questions to investigate gaps, inconsistencies, or concerns

Each question entry must include: question, purpose, lookFor (array), followUps (array), difficulty (Basic/Intermediate/Advanced/Expert), timeEstimate.

### 3. Areas to Probe Deeper
Identify areas needing further investigation with priority (Critical/High/Medium/Low), reason, sub-areas (name, specificConcerns, validationQuestions, greenFlags, redFlags), and a suggested approach.

### 4. Recommendations
- **forRecruiter**: Actionable insights for the hiring decision
- **forCandidate**: Areas the candidate could improve
- **interviewQuestions**: Simple list of key questions (legacy format)

### 5. Overall Fit
- **interviewFocus**: Top areas to focus on during the interview
- **suggestedRole**: If better suited for a different level or role

## Output Format
Return ONLY valid JSON matching this structure:
\`\`\`json
{
  "preferenceAlignment": {
    "overallScore": 0,
    "locationFit": {"score": 0, "assessment": "<explanation>"},
    "workTypeFit": {"score": 0, "assessment": "<explanation>"},
    "salaryFit": {"score": 0, "assessment": "<explanation>"},
    "jobTypeFit": {"score": 0, "assessment": "<explanation>"},
    "companyTypeFit": {"score": 0, "assessment": "<explanation>"},
    "overallAssessment": "<1-2 sentence summary>",
    "warnings": ["<specific mismatches worth flagging>"]
  },
  "suggestedInterviewQuestions": {
    "technical": [
      {
        "area": "<technical domain>",
        "questions": [
          {
            "question": "<specific question>",
            "purpose": "<what it validates>",
            "lookFor": ["<expected elements>"],
            "followUps": ["<probe deeper>"],
            "difficulty": "Intermediate",
            "timeEstimate": "5-10 minutes"
          }
        ]
      }
    ],
    "behavioral": [{"area": "<competency>", "questions": [{"question": "...", "purpose": "...", "lookFor": [], "followUps": [], "difficulty": "Intermediate", "timeEstimate": "5 minutes"}]}],
    "experienceValidation": [{"area": "<claim to verify>", "questions": [{"question": "...", "purpose": "...", "lookFor": [], "followUps": [], "difficulty": "Intermediate", "timeEstimate": "5 minutes"}]}],
    "situational": [{"area": "<scenario>", "questions": [{"question": "...", "purpose": "...", "lookFor": [], "followUps": [], "difficulty": "Intermediate", "timeEstimate": "5 minutes"}]}],
    "cultureFit": [{"area": "<cultural aspect>", "questions": [{"question": "...", "purpose": "...", "lookFor": [], "followUps": [], "difficulty": "Basic", "timeEstimate": "5 minutes"}]}],
    "redFlagProbing": [{"area": "<concern>", "questions": [{"question": "...", "purpose": "...", "lookFor": [], "followUps": [], "difficulty": "Advanced", "timeEstimate": "5 minutes"}]}]
  },
  "areasToProbeDeeper": [
    {
      "area": "<main area>",
      "priority": "High",
      "reason": "<why it needs probing>",
      "subAreas": [
        {
          "name": "<sub-area>",
          "specificConcerns": ["<what needs validation>"],
          "validationQuestions": ["<direct questions>"],
          "greenFlags": ["<reassuring answers>"],
          "redFlags": ["<concerning answers>"]
        }
      ],
      "suggestedApproach": "<how to approach this area>"
    }
  ],
  "recommendations": {
    "forRecruiter": ["<actionable insights>"],
    "forCandidate": ["<improvement areas>"],
    "interviewQuestions": ["<simple key questions list>"]
  },
  "overallFit": {
    "interviewFocus": ["<top focus areas>"],
    "suggestedRole": "<alternative role if applicable>"
  }
}
\`\`\`

Tailor all questions to the specific candidate and role. Generic questions are unhelpful — reference actual resume content and JD requirements.`;
  }

  protected formatInput(input: PreferenceMatchInput): string {
    let prompt = `## Resume:\n${input.resume}\n\n## Job Description:\n${input.jd}`;

    if (input.candidatePreferences) {
      prompt += `\n\n## Candidate Preferences:\n${input.candidatePreferences}`;
    }

    if (input.jobMetadata) {
      prompt += `\n\n## Job Metadata:\n${input.jobMetadata}`;
    }

    prompt += '\n\nAnalyze preference alignment and generate interview preparation materials.';
    return prompt;
  }

  protected parseOutput(response: string): PreferenceMatchOutput {
    try {
      const jsonFenceMatch = response.match(/```json\s*([\s\S]*?)```/);
      if (jsonFenceMatch) {
        return JSON.parse(jsonFenceMatch[1].trim()) as PreferenceMatchOutput;
      }

      const codeFenceMatch = response.match(/```\s*([\s\S]*?)```/);
      if (codeFenceMatch) {
        return JSON.parse(codeFenceMatch[1].trim()) as PreferenceMatchOutput;
      }

      const firstBrace = response.indexOf('{');
      const lastBrace = response.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(response.slice(firstBrace, lastBrace + 1)) as PreferenceMatchOutput;
      }

      return JSON.parse(response) as PreferenceMatchOutput;
    } catch {
      return {
        preferenceAlignment: {
          overallScore: 100,
          locationFit: { score: 100, assessment: 'Unable to assess' },
          workTypeFit: { score: 100, assessment: 'Unable to assess' },
          salaryFit: { score: 100, assessment: 'Unable to assess' },
          jobTypeFit: { score: 100, assessment: 'Unable to assess' },
          companyTypeFit: { score: 100, assessment: 'Unable to assess' },
          overallAssessment: 'Unable to assess preference alignment',
          warnings: [],
        },
        suggestedInterviewQuestions: {
          technical: [],
          behavioral: [],
          experienceValidation: [],
          situational: [],
          cultureFit: [],
          redFlagProbing: [],
        },
        areasToProbeDeeper: [],
        recommendations: {
          forRecruiter: ['Unable to generate recommendations - parsing failed'],
          forCandidate: [],
          interviewQuestions: [],
        },
        overallFit: {
          interviewFocus: [],
          suggestedRole: '',
        },
      };
    }
  }

  /**
   * Analyze preference alignment and generate interview preparation materials
   */
  async analyze(
    input: PreferenceMatchInput,
    requestId?: string,
    locale?: string,
    model?: string,
  ): Promise<PreferenceMatchOutput> {
    return this.execute(input, input.jd, requestId, locale, model);
  }
}

export const preferenceMatchSkill = new PreferenceMatchSkill();
