import { BaseAgent } from './BaseAgent.js';
import { ParsedJD, Message } from '../types/index.js';

interface JDParseInput {
  jdText: string;
  filename?: string;
}

/**
 * Agent for parsing job descriptions and extracting structured data
 * Extracts title, requirements, responsibilities, qualifications, etc.
 */
export class JDParseAgent extends BaseAgent<JDParseInput, ParsedJD> {
  constructor() {
    super('JDParseAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert job description parser. Your task is to extract ALL information from job description text into a structured format.

## CRITICAL INSTRUCTION - EXTRACT ONLY, NEVER INVENT:
- You are an EXTRACTOR, not a GENERATOR. Only output information that EXISTS in the provided text.
- NEVER invent, hallucinate, or make up any content — especially the job title, company name, or location.
- The job title MUST come directly from the text. If the text says "AI大模型高级标注员", the title is "AI大模型高级标注员", NOT "测试工程师" or any other title.
- You MUST extract EVERY piece of information from the job description
- Do NOT summarize or truncate any text
- Include the COMPLETE text of each requirement, responsibility, qualification, etc.
- Every bullet point, every sentence, every detail must be preserved
- Copy the EXACT text from the JD - do not paraphrase or shorten
- If there are 20 requirements listed, include ALL 20 in the output
- If a field is not present in the text, use empty string "" — NEVER guess or fabricate values

## Sections to Extract:

### Basic Information
- **title**: Exact position title
- **company**: Company name
- **department**: Department / team name
- **location**: Work location (city, region)
- **workType**: One of: remote, hybrid, onsite (lowercase)
- **employmentType**: One of: full-time, part-time, contract, internship (lowercase)
- **experienceLevel**: One of: intern, entry, mid, senior, lead, executive (lowercase)
- **education**: Minimum education requirement. One of: none, high_school, associate, bachelor, master, phd (lowercase). Infer from context if not explicitly stated.
- **headcount**: Number of positions to fill. Default 1 if not mentioned.

### Content Sections
For each content section below, produce a **complete markdown-formatted text block** preserving ALL original content. Use ## headers and - bullet points. If the section does not exist in the JD, output an empty string "".

1. **description**: Job overview/summary — opening paragraph about the company/team, what the role does, why it matters. Include any "About Us" content here. Also include 岗位亮点 (highlights) if present.
2. **responsibilities**: ALL job duties, responsibilities, and deliverables as bullet points.
   IMPORTANT: This section may appear in the JD under ANY of these synonymous headers — they ALL mean the same thing:
   工作职责 / 岗位职责 / 职位职责 / 岗位内容 / 主要职责 / 工作内容 / Job Responsibilities / Key Responsibilities / What You'll Do
   You MUST capture ALL content under any of these headers into this field. Do NOT skip any.
3. **qualifications**: ALL required skills, education, experience, certifications as bullet points.
   This section may appear as: 任职要求 / 任职资格 / 岗位要求 / 职位要求 / 招聘要求 / Requirements / Qualifications / What We Look For
4. **hardRequirements**: TRUE non-negotiable requirements only — items that if unmet make the candidate literally unable to do the job. Keep to 3-6 items as a numbered list. Do NOT include generic preferences.
5. **niceToHave**: Preferred/bonus qualifications that strengthen a candidate but are not required. Bullet points.
6. **benefits**: ALL benefits, perks, and non-salary compensation details mentioned (e.g. 岗位亮点 perks, office environment, growth opportunities). Bullet points.

### Compensation Data
Extract salary/compensation as structured data. IMPORTANT: Preserve the EXACT breakdown from the original JD.
- If the JD says "base3000+补贴600+绩效1000", do NOT combine into a total.
  Instead: salary="3000", bonus="绩效1000", other="补贴600", salaryText="base3000+补贴600+绩效1000，薪酬可达4600/月"
- If the JD says "13-18K", then: salary="13000-18000"
- **salaryText**: A human-readable text that preserves the EXACT original salary description with component breakdown. If the salary has multiple components, list each component AND show the total possible earnings.

Provide your response in the following JSON format (and ONLY this JSON format, no additional text):

\`\`\`json
{
  "title": "",
  "company": "",
  "department": "",
  "location": "",
  "workType": "",
  "employmentType": "",
  "experienceLevel": "",
  "education": "",
  "headcount": 1,
  "description": "complete markdown text of job overview/summary",
  "responsibilities": "complete markdown text of responsibilities section",
  "qualifications": "complete markdown text of qualifications section",
  "hardRequirements": "complete markdown text of hard requirements as numbered list",
  "niceToHave": "complete markdown text of preferred qualifications",
  "benefits": "complete markdown text of benefits/perks section",
  "compensation": {
    "salary": "",
    "currency": "",
    "period": "",
    "bonus": "",
    "equity": "",
    "other": "",
    "salaryText": "original salary description with full component breakdown"
  },
  "additionalInfo": {
    "<section name>": "<content of any other sections not covered above>"
  }
}
\`\`\`

REMEMBER:
- Include EVERY word, EVERY bullet point, EVERY requirement from the original JD
- Do NOT summarize, abbreviate, or paraphrase anything
- If the JD has 15 bullet points under responsibilities, ALL 15 must appear in the output
- Preserve the original wording exactly
- Output section content as complete markdown text blocks, NOT arrays
- Keep the same language as the source JD (if the JD is in Chinese, output Chinese content)`;
  }

  protected formatInput(input: JDParseInput): string {
    const filenameHint = input.filename ? `\nSource filename: ${input.filename}\n` : '';
    return `## Job Description Text:
${filenameHint}
${input.jdText}

IMPORTANT: Extract ONLY information that appears in the text above. Do NOT invent or generate any content. The job title must come directly from the document text.`;
  }

  protected parseOutput(response: string): ParsedJD {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as ParsedJD;
      } catch {
        // Continue to try parsing the entire response
      }
    }
    
    try {
      return JSON.parse(response) as ParsedJD;
    } catch {
      // Return a default structure if parsing fails
      return {
        title: '',
        company: '',
        location: '',
        requirements: [],
        responsibilities: [],
        qualifications: [],
        benefits: [],
        rawText: response,
      };
    }
  }

  /**
   * Parse a job description from text.
   * Uses low temperature (0.1) to ensure faithful extraction without hallucination.
   */
  async parse(jdText: string, requestId?: string, filename?: string): Promise<ParsedJD> {
    const systemPrompt = this.buildSystemPrompt(jdText, requestId);
    const userMessage = this.formatInput({ jdText, filename });

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const response = await this.llm.chat(messages, {
      temperature: 0.1,
      requestId,
    });

    const result = this.parseOutput(response);
    return {
      ...result,
      rawText: jdText,
    };
  }
}

export const jdParseAgent = new JDParseAgent();
