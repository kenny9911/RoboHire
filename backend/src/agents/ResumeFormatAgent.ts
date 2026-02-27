import { BaseAgent } from './BaseAgent.js';

interface ResumeFormatInput {
  resumeText: string;
}

interface FormattedResume {
  name: string;
  title: string;
  contact: { type: string; value: string }[];
  summary: string;
  experience: {
    company: string;
    role: string;
    period: string;
    location: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    field: string;
    period: string;
  }[];
  skills: { category: string; items: string[] }[];
  certifications: string[];
  projects: {
    name: string;
    description: string;
    technologies: string[];
  }[];
  languages: string[];
  awards: string[];
}

/**
 * Agent for formatting raw resume text into a structured, professional layout.
 * Returns structured JSON that the frontend renders with professional styling.
 */
export class ResumeFormatAgent extends BaseAgent<ResumeFormatInput, FormattedResume> {
  constructor() {
    super('ResumeFormatAgent');
  }

  protected getAgentPrompt(): string {
    return `You are a professional resume formatter. Given raw resume text (which may be messy due to PDF/DOCX extraction), produce a clean, structured JSON representation.

## CRITICAL — PRESERVE ALL ORIGINAL TEXT:
- You MUST keep EVERY word, EVERY sentence, EVERY detail from the original resume
- Do NOT summarize, shorten, paraphrase, or omit ANY content
- Do NOT merge or combine bullet points — keep each one as a separate entry
- For work experience bullets: copy the COMPLETE original text of each responsibility/achievement exactly as written. If the original has long paragraphs, keep them in full as individual bullets
- For project descriptions: include the FULL description text, do not abbreviate
- For summary: if the resume has a summary/objective section, copy it VERBATIM. Only generate one if the resume has none
- The output JSON may be large — that is expected and correct. A shorter output means you lost content

## Instructions:
- Extract and organize ALL information from the raw text
- Detect the language of the resume and keep ALL content in its original language — do NOT translate
- Clean up formatting artifacts (extra spaces, broken lines, garbled characters) but NEVER delete meaningful content
- Infer section boundaries even if headings are missing or malformed
- For work experience, organize descriptions into bullet points — but each bullet must contain the COMPLETE original text, not a shortened version
- Preserve all dates, numbers, and proper nouns exactly
- If a field cannot be determined, use an empty string or empty array

## Output JSON format (respond with ONLY this JSON, no additional text):

\`\`\`json
{
  "name": "Full Name",
  "title": "Professional Title / Current Role (infer from latest experience if not stated)",
  "contact": [
    { "type": "email", "value": "..." },
    { "type": "phone", "value": "..." },
    { "type": "location", "value": "City, Country" },
    { "type": "linkedin", "value": "..." },
    { "type": "github", "value": "..." },
    { "type": "website", "value": "..." }
  ],
  "summary": "COMPLETE professional summary/objective — copy verbatim if present, or generate 2-3 sentences from context if not",
  "experience": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "period": "YYYY.MM - YYYY.MM or Present",
      "location": "City if known",
      "bullets": [
        "COMPLETE original text of each responsibility or achievement — do NOT shorten or summarize",
        "..."
      ]
    }
  ],
  "education": [
    {
      "institution": "University / School",
      "degree": "Bachelor / Master / PhD / etc.",
      "field": "Major / Field of Study",
      "period": "YYYY - YYYY"
    }
  ],
  "skills": [
    {
      "category": "Category name (e.g. Programming Languages, Frameworks, Tools, Databases, etc.)",
      "items": ["skill1", "skill2"]
    }
  ],
  "certifications": ["Certification Name (Issuer, Year)"],
  "projects": [
    {
      "name": "Project Name",
      "description": "FULL project description — include ALL details exactly as written in the original",
      "technologies": ["tech1", "tech2"]
    }
  ],
  "languages": ["Language (Proficiency)"],
  "awards": ["Award Name (Year)"]
}
\`\`\`

## Key rules:
- PRESERVE ALL ORIGINAL TEXT — this is the #1 priority. Never delete or shorten content
- Keep content in the ORIGINAL language of the resume
- Group related skills into logical categories
- Order experience from most recent to oldest
- Each bullet point must contain the FULL original text, not a summary
- Only remove true duplicates (exact same sentence appearing twice)
- Clean up garbled characters but preserve all meaningful content`;
  }

  protected formatInput(input: ResumeFormatInput): string {
    return `## Raw Resume Text:\n${input.resumeText}\n\nPlease format this resume into structured JSON.`;
  }

  protected parseOutput(response: string): FormattedResume {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as FormattedResume;
      } catch {
        // fall through
      }
    }

    try {
      return JSON.parse(response) as FormattedResume;
    } catch {
      return {
        name: '',
        title: '',
        contact: [],
        summary: '',
        experience: [],
        education: [],
        skills: [],
        certifications: [],
        projects: [],
        languages: [],
        awards: [],
      };
    }
  }

  async format(resumeText: string, requestId?: string): Promise<FormattedResume> {
    return this.executeWithJsonResponse({ resumeText }, resumeText, requestId);
  }
}

export const resumeFormatAgent = new ResumeFormatAgent();
