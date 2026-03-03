import { BaseAgent } from './BaseAgent.js';
import { ParsedResume } from '../types/index.js';

interface ResumeParseInput {
  resumeText: string;
}

/**
 * Agent for parsing resumes and extracting structured data
 * Extracts contact info, skills, experience, education, etc.
 */
export class ResumeParseAgent extends BaseAgent<ResumeParseInput, ParsedResume> {
  constructor() {
    super('ResumeParseAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert resume parser. Your task is to extract ALL information from resume text into a structured format.

## CRITICAL INSTRUCTION - DO NOT LOSE ANY CONTENT:
- You MUST extract EVERY piece of information from the resume
- Do NOT summarize or truncate any descriptions
- Include the COMPLETE text of each job description, project description, achievement, etc.
- Every bullet point, every sentence, every detail must be preserved
- If there are multiple bullet points for a job, include ALL of them in the description
- Copy the EXACT text from the resume - do not paraphrase or shorten
- For non-English resumes (Chinese, Japanese, etc.), preserve the ORIGINAL language text exactly as-is
- Every work experience entry, every education entry, every certification, every project MUST be included — do NOT skip any
- If a field contains CJK characters, output them verbatim without translating or romanizing

Extract ALL of the following:
1. **Personal Information**: Name, email, phone, address, LinkedIn, GitHub, portfolio, etc.
2. **Professional Summary/Objective**: The COMPLETE summary text
3. **Skills**: ALL technical skills, soft skills, languages, tools, frameworks, certifications mentioned
4. **Work Experience**: COMPLETE details for EACH position including ALL responsibilities and achievements. For each position, classify the employmentType: use "internship" if the title contains "Intern", "实习", "インターン", "Stagiaire", "Praktikant", or similar, or if the role is explicitly an internship. Use "contract" for contractor/consultant roles, "freelance" for freelance work, "part-time" if specified. Default to "full-time" if unclear.
5. **Projects**: ALL projects with COMPLETE descriptions
6. **Education**: ALL education entries with complete details
7. **Certifications**: ALL certifications with dates
8. **Awards/Achievements**: ALL awards and achievements
9. **Languages**: ALL languages spoken
10. **Other Sections**: ANY other sections present (volunteer work, publications, patents, etc.)

Provide your response in the following JSON format (and ONLY this JSON format, no additional text):

\`\`\`json
{
  "name": "<full name>",
  "email": "<email address or empty string>",
  "phone": "<phone number or empty string>",
  "address": "<full address if present>",
  "linkedin": "<LinkedIn URL if present>",
  "github": "<GitHub URL if present>",
  "portfolio": "<portfolio/website URL if present>",
  "skills": {
    "technical": ["skill1", "skill2", ...],
    "soft": ["skill1", "skill2", ...],
    "languages": ["language1", "language2", ...],
    "tools": ["tool1", "tool2", ...],
    "frameworks": ["framework1", "framework2", ...],
    "other": ["other skill1", ...]
  },
  "experience": [
    {
      "company": "<company name>",
      "role": "<job title>",
      "location": "<location if mentioned>",
      "startDate": "<start date>",
      "endDate": "<end date or 'Present'>",
      "duration": "<calculated duration>",
      "employmentType": "<one of: full-time, part-time, internship, contract, freelance>",
      "description": "<COMPLETE job description - include ALL bullet points, ALL responsibilities, ALL achievements exactly as written. Do NOT summarize or truncate.>",
      "achievements": ["<achievement 1 - complete text>", "<achievement 2 - complete text>", ...],
      "technologies": ["tech1", "tech2", ...]
    }
  ],
  "projects": [
    {
      "name": "<project name>",
      "role": "<role in project if mentioned>",
      "date": "<date/duration if mentioned>",
      "description": "<COMPLETE project description - include ALL details exactly as written>",
      "technologies": ["tech1", "tech2", ...],
      "link": "<project link if present>"
    }
  ],
  "education": [
    {
      "institution": "<school/university name>",
      "degree": "<degree type>",
      "field": "<field of study/major>",
      "startDate": "<start date if present>",
      "endDate": "<graduation date>",
      "gpa": "<GPA if mentioned>",
      "achievements": ["<honors, awards, activities - complete text>"],
      "coursework": ["<relevant coursework if listed>"]
    }
  ],
  "certifications": [
    {
      "name": "<certification name>",
      "issuer": "<issuing organization>",
      "date": "<date obtained>",
      "expiryDate": "<expiry date if applicable>",
      "credentialId": "<credential ID if present>"
    }
  ],
  "awards": [
    {
      "name": "<award name>",
      "issuer": "<issuing organization>",
      "date": "<date received>",
      "description": "<description if present>"
    }
  ],
  "languages": [
    {
      "language": "<language name>",
      "proficiency": "<proficiency level>"
    }
  ],
  "volunteerWork": [
    {
      "organization": "<organization name>",
      "role": "<role>",
      "duration": "<time period>",
      "description": "<COMPLETE description>"
    }
  ],
  "publications": ["<publication 1 - complete citation>", ...],
  "patents": ["<patent 1 - complete info>", ...],
  "summary": "<COMPLETE professional summary/objective - copy the entire text exactly as written>",
  "otherSections": {
    "<section name>": "<COMPLETE content of any other sections>"
  }
}
\`\`\`

REMEMBER: Include EVERY word, EVERY bullet point, EVERY detail from the original resume. Do NOT summarize or abbreviate anything.`;
  }

  protected formatInput(input: ResumeParseInput): string {
    return `## Resume Text:
${input.resumeText}

Please parse this resume and extract structured information.`;
  }

  protected parseOutput(response: string): ParsedResume {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as ParsedResume;
      } catch {
        // Continue to try parsing the entire response
      }
    }
    
    try {
      return JSON.parse(response) as ParsedResume;
    } catch {
      // Return a default structure if parsing fails
      return {
        name: '',
        email: '',
        phone: '',
        skills: [],
        experience: [],
        education: [],
        summary: 'Unable to parse resume',
        rawText: response,
      };
    }
  }

  /**
   * Parse a resume from text
   */
  async parse(resumeText: string, requestId?: string): Promise<ParsedResume> {
    const result = await this.executeWithJsonResponse({ resumeText }, undefined, requestId);
    return {
      ...result,
      rawText: resumeText,
    };
  }
}

export const resumeParseAgent = new ResumeParseAgent();
