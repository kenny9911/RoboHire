import { llmService } from './llm/LLMService.js';

export interface ParsedJDResult {
  title: string;
  company: string;
  department: string;
  location: string;
  workType: string;
  employmentType: string;
  experienceLevel: string;
  education: string;
  headcount: number;
  description: string;
  responsibilities: string[];
  requirements: string[];
  mustHave: string[];
  niceToHave: string[];
  benefits: string[];
  compensation: {
    salary: string;
    currency: string;
    period: string;
    bonus: string;
    equity: string;
    other: string;
    salaryText: string;
  };
  rawText: string;
}

/**
 * Extract JSON from an LLM response that may be wrapped in markdown code blocks.
 */
function extractJSON(response: string): any {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                    response.match(/```\s*([\s\S]*?)\s*```/) ||
                    response.match(/(\{[\s\S]*\})/);
  if (jsonMatch?.[1]) {
    return JSON.parse(jsonMatch[1].trim());
  }
  return JSON.parse(response);
}

export class JDParserService {

  /**
   * Parse raw JD text into a structured ParsedJDResult using LLM.
   * Text should already be extracted (by DocumentParsingService or similar).
   */
  async parseJD(text: string, requestId?: string, filename?: string): Promise<ParsedJDResult> {
    const normalizedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    const fallbackTitle = filename
      ? filename.replace(/\.(pdf|txt|md|markdown|docx?)$/i, '').replace(/_JD$/i, '')
      : 'Untitled';

    const fallback: ParsedJDResult = {
      title: fallbackTitle,
      company: '',
      department: '',
      location: '',
      workType: '',
      employmentType: '',
      experienceLevel: '',
      education: '',
      headcount: 1,
      description: normalizedText || 'Failed to extract JD text.',
      responsibilities: [],
      requirements: [],
      mustHave: [],
      niceToHave: [],
      benefits: [],
      compensation: { salary: '', currency: '', period: '', bonus: '', equity: '', other: '', salaryText: '' },
      rawText: normalizedText,
    };

    if (!normalizedText || normalizedText.trim().length === 0) {
      return fallback;
    }

    const filenameHint = filename ? `\nSource filename: ${filename}` : '';

    const systemPrompt = `You are a professional Job Description parser. Parse the raw JD text into a well-structured JSON format.

## CRITICAL — EXTRACT ONLY, NEVER INVENT:
- You are an EXTRACTOR, not a GENERATOR. Only output information that EXISTS in the provided text.
- NEVER invent, hallucinate, or make up any content — especially the job title, company name, or location.
- The job title MUST come directly from the text. If the text says "AI大模型高级标注员", the title is "AI大模型高级标注员", NOT something else.
- If a field is not present in the text, use empty string "" — NEVER guess or fabricate values.

The input text may be poorly formatted - bullet points may be inline (e.g., "• item1 • item2"), sections may not have clear separators, or the text may be a continuous paragraph. Your job is to intelligently separate and structure all the content.

Return STRICT JSON (no markdown, no commentary) with this schema:
{
  "title": string (exact job title from the text),
  "company": string (company name if mentioned, otherwise ""),
  "department": string (department/team if mentioned, otherwise ""),
  "location": string (work location/city if mentioned, otherwise ""),
  "workType": string (one of: "remote", "hybrid", "onsite", or "" if not mentioned),
  "employmentType": string (one of: "full-time", "part-time", "contract", "internship", or "" if not mentioned),
  "experienceLevel": string (one of: "intern", "entry", "mid", "senior", "lead", "executive", or "" if not clear),
  "education": string (one of: "none", "high_school", "associate", "bachelor", "master", "phd", or "" if not mentioned),
  "headcount": number (number of positions, default 1),
  "description": string (job overview/summary paragraph — what the role is about, including any 岗位亮点/highlights),
  "responsibilities": string[] (EACH responsibility as a SEPARATE array item),
  "requirements": string[] (EACH requirement/qualification as a SEPARATE array item),
  "mustHave": string[] (required/must-have qualifications, EACH as a SEPARATE item),
  "niceToHave": string[] (preferred/bonus qualifications, EACH as a SEPARATE item),
  "benefits": string[] (benefits, perks, compensation details, EACH as a SEPARATE item),
  "compensation": {
    "salary": string (salary amount or range, e.g. "13000-18000" or "3000"),
    "currency": string (e.g. "CNY", "USD"),
    "period": string (e.g. "monthly", "yearly"),
    "bonus": string (bonus info, e.g. "绩效1000"),
    "equity": string (equity/stock info),
    "other": string (other compensation, e.g. "补贴600"),
    "salaryText": string (original salary description preserving full component breakdown)
  }
}

CRITICAL PARSING RULES:
1. SPLIT inline bullet points: "• item1；• item2；• item3" → SEPARATE array items
2. SPLIT semicolon-separated items: "要求1；要求2；要求3" → separate array items
3. COPY text VERBATIM from the source — do NOT rewrite, paraphrase, or summarize
4. Do NOT translate ANY text — preserve ALL words exactly as written in the original language
5. Responsibilities section may appear under ANY of these synonymous headers — they ALL mean the same thing:
   工作职责 / 岗位职责 / 职位职责 / 岗位内容 / 主要职责 / 工作内容 / Job Responsibilities / Key Responsibilities / What You'll Do
   Capture ALL content under any of these headers into "responsibilities".
6. Requirements section may appear as: 任职要求 / 任职资格 / 岗位要求 / 职位要求 / 招聘要求 / Requirements / Qualifications
7. If "必备能力" / "必须" / "Required" appears, put items in "mustHave"
8. If "加分项" / "优先" / "Preferred" / "Nice to have" appears, put items in "niceToHave"
9. If salary has components like "base3000+补贴600+绩效1000", preserve each component separately in compensation
10. Each array item should be ONE complete, meaningful requirement or responsibility
11. Remove bullet characters (•, -, *, etc.) from the start of each item

输出语言：保持原文语言不变 (Preserve original language as-is)
Output ONLY the JSON object, nothing else.`;

    try {
      const response = await llmService.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this Job Description:${filenameHint}\n\n${normalizedText}` },
        ],
        { temperature: 0.0, requestId }
      );

      const parsed = extractJSON(response);

      const comp = parsed.compensation && typeof parsed.compensation === 'object' ? parsed.compensation : {};
      return {
        title: parsed.title || fallback.title,
        company: parsed.company || '',
        department: parsed.department || '',
        location: parsed.location || '',
        workType: parsed.workType || '',
        employmentType: parsed.employmentType || '',
        experienceLevel: parsed.experienceLevel || '',
        education: parsed.education || '',
        headcount: parsed.headcount || 1,
        description: parsed.description || fallback.description,
        responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
        requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
        mustHave: Array.isArray(parsed.mustHave) ? parsed.mustHave : [],
        niceToHave: Array.isArray(parsed.niceToHave) ? parsed.niceToHave : [],
        benefits: Array.isArray(parsed.benefits) ? parsed.benefits : [],
        compensation: {
          salary: comp.salary || '',
          currency: comp.currency || '',
          period: comp.period || '',
          bonus: comp.bonus || '',
          equity: comp.equity || '',
          other: comp.other || '',
          salaryText: comp.salaryText || '',
        },
        rawText: normalizedText,
      };
    } catch (e) {
      console.warn('[JDParserService] JD parse via LLM failed, falling back to raw text:', e);
      return fallback;
    }
  }

  /**
   * Refine a parsed JD with AI to improve wording and structure.
   */
  async refineJD(jd: ParsedJDResult, requestId?: string): Promise<ParsedJDResult> {
    const systemPrompt = `You are an expert recruiter helping to polish a Job Description.

Your task is to refine and improve the JD while preserving all the original information.

Return STRICT JSON (no markdown, no commentary) with this schema:
{
  "title": string,
  "department": string,
  "description": string,
  "requirements": string[],
  "responsibilities": string[],
  "mustHave": string[],
  "niceToHave": string[]
}

REFINEMENT GUIDELINES:
- Improve clarity and professional tone
- Fix grammar and formatting issues
- Make requirements and responsibilities more specific and actionable
- Organize bullet points logically
- Keep technical terms and specific requirements intact
- Preserve the original language (Chinese stays Chinese, English stays English)
- Do NOT add new requirements or responsibilities that weren't implied in the original
- Do NOT remove any important information
Output ONLY the JSON object, nothing else.`;

    const userPrompt = `Please refine this Job Description:

Title: ${jd.title}
Department: ${jd.department}

Description:
${jd.description}

Requirements:
${jd.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Responsibilities:
${jd.responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Must-have:
${jd.mustHave.length > 0 ? jd.mustHave.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'None'}

Nice-to-have:
${jd.niceToHave.length > 0 ? jd.niceToHave.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'None'}`;

    try {
      const response = await llmService.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, requestId }
      );

      const parsed = extractJSON(response);

      return {
        ...jd,
        title: parsed.title || jd.title,
        department: parsed.department || jd.department,
        description: parsed.description || jd.description,
        requirements: Array.isArray(parsed.requirements) && parsed.requirements.length > 0
          ? parsed.requirements
          : jd.requirements,
        responsibilities: Array.isArray(parsed.responsibilities) && parsed.responsibilities.length > 0
          ? parsed.responsibilities
          : jd.responsibilities,
        mustHave: Array.isArray(parsed.mustHave) ? parsed.mustHave : jd.mustHave,
        niceToHave: Array.isArray(parsed.niceToHave) ? parsed.niceToHave : jd.niceToHave,
      };
    } catch (e) {
      console.warn('[JDParserService] JD refinement failed:', e);
      return jd;
    }
  }
}

export const jdParserService = new JDParserService();
