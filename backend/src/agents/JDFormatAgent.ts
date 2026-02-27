import { BaseAgent } from './BaseAgent.js';

interface JDFormatInput {
  jdText: string;
}

interface FormattedJD {
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string;
  department: string;
  salary: string;
  overview: string;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  benefits: string[];
  skills: string[];
  about: string;
  other: { heading: string; content: string }[];
}

/**
 * Agent for formatting raw JD text into a structured, professional layout.
 * Returns structured JSON that the frontend renders with professional styling.
 */
export class JDFormatAgent extends BaseAgent<JDFormatInput, FormattedJD> {
  constructor() {
    super('JDFormatAgent');
  }

  protected getAgentPrompt(): string {
    return `You are a professional job description formatter. Given raw JD text (which may be messy due to PDF/DOCX extraction), produce a clean, structured JSON representation.

## CRITICAL — PRESERVE ALL ORIGINAL TEXT:
- You MUST keep EVERY word, EVERY sentence, EVERY detail from the original JD
- Do NOT summarize, shorten, paraphrase, or omit ANY content
- Do NOT merge or combine bullet points — keep each one as a separate entry
- For responsibilities/requirements: copy the COMPLETE original text of each item exactly as written
- If the original has long paragraphs, keep them in full
- The output JSON may be large — that is expected and correct. A shorter output means you lost content

## Instructions:
- Extract and organize ALL information from the raw text
- Detect the language of the JD and keep ALL content in its original language — do NOT translate
- Clean up formatting artifacts (extra spaces, broken lines, garbled characters) but NEVER delete meaningful content
- Infer section boundaries even if headings are missing or malformed
- Preserve all dates, numbers, company names, and proper nouns exactly
- If a field cannot be determined, use an empty string or empty array
- Any sections that don't fit standard categories should go in the "other" array

## Output JSON format (respond with ONLY this JSON, no additional text):

\`\`\`json
{
  "jobTitle": "Job Title",
  "company": "Company Name (if mentioned)",
  "location": "Location / Remote / Hybrid (if mentioned)",
  "employmentType": "Full-time / Part-time / Contract (if mentioned)",
  "department": "Department or team (if mentioned)",
  "salary": "Salary range (if mentioned)",
  "overview": "COMPLETE job overview/description paragraph — copy verbatim",
  "responsibilities": [
    "COMPLETE original text of each responsibility — do NOT shorten",
    "..."
  ],
  "requirements": [
    "COMPLETE original text of each requirement — do NOT shorten",
    "..."
  ],
  "preferredQualifications": [
    "COMPLETE text of each preferred/nice-to-have qualification",
    "..."
  ],
  "benefits": [
    "COMPLETE text of each benefit/perk",
    "..."
  ],
  "skills": ["skill1", "skill2", "..."],
  "about": "COMPLETE 'About the company' section text if present",
  "other": [
    {
      "heading": "Section heading",
      "content": "COMPLETE section content"
    }
  ]
}
\`\`\`

## Key rules:
- PRESERVE ALL ORIGINAL TEXT — this is the #1 priority. Never delete or shorten content
- Keep content in the ORIGINAL language of the JD
- Each bullet point must contain the FULL original text, not a summary
- Only remove true duplicates (exact same sentence appearing twice)
- Clean up garbled characters but preserve all meaningful content`;
  }

  protected formatInput(input: JDFormatInput): string {
    return `## Raw Job Description Text:\n${input.jdText}\n\nPlease format this job description into structured JSON.`;
  }

  protected parseOutput(response: string): FormattedJD {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as FormattedJD;
      } catch {
        // fall through
      }
    }

    try {
      return JSON.parse(response) as FormattedJD;
    } catch {
      return {
        jobTitle: '',
        company: '',
        location: '',
        employmentType: '',
        department: '',
        salary: '',
        overview: '',
        responsibilities: [],
        requirements: [],
        preferredQualifications: [],
        benefits: [],
        skills: [],
        about: '',
        other: [],
      };
    }
  }

  async format(jdText: string, requestId?: string): Promise<FormattedJD> {
    return this.executeWithJsonResponse({ jdText }, jdText, requestId);
  }
}

export const jdFormatAgent = new JDFormatAgent();
