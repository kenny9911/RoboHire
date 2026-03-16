import { BaseAgent } from './BaseAgent.js';
import type { Message, ParsedResume, WorkExperience } from '../types/index.js';
import { logger } from '../services/LoggerService.js';
import { isParsedResumeLikelyIncomplete } from '../services/ResumeParseValidation.js';

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
    return `You are an expert multilingual resume parser. Your task is to extract ALL information from resume text into a structured JSON format, preserving every detail completely.

## CRITICAL RULES — ZERO INFORMATION LOSS:
1. Extract EVERY piece of information. Do NOT summarize, truncate, paraphrase, or omit anything.
2. Copy the EXACT original text — every bullet point, every sentence, every detail, word for word.
3. For non-English resumes (Chinese, Japanese, Korean, etc.), preserve the ORIGINAL language text verbatim. Do NOT translate or romanize.
4. Every entry (work experience, education, project, award, certification) MUST be included — do NOT skip any.
5. If a section has sub-sections or nested content (e.g., awards listed under education), extract each item into its proper category AND keep it in the parent section's achievements too.

## SECTION MAPPING — Handle all common resume section names:

**Personal Info** (基本信息, 个人信息, 联系方式, Contact):
→ name, email, phone, address, linkedin, github, portfolio
→ Also extract: age, gender, location/city (现居地), nationality, marital status, etc. into "otherSections"

**Summary / Self-evaluation** (自我评价, 个人简介, 个人总结, 求职意向, Career Objective, Profile, About Me):
→ "summary" — copy the COMPLETE text

**Skills** (专业技能, 技能, 技术栈, Skills, Technical Skills):
→ Categorize into: technical, soft, languages (programming), tools, frameworks, other
→ Preserve the FULL description of each skill category (e.g., "熟练掌握 Rust, Python" → technical: ["Rust", "Python"])
→ Also put the complete original skill description text into "otherSections.skillsRaw"

**Work Experience / Internships** (工作经历, 实习经历, 工作经验, Employment History, Experience):
→ "experience" array — one entry per position
→ 要识别公司名称，岗位，任职期间，任职地点
→ employmentType: "internship" if title/section contains 实习/Intern/インターン/Stagiaire/Praktikant; "contract" for contractor; "freelance" for freelance; "part-time" if specified; default "full-time"
→ "description": include ALL bullet points concatenated with newlines, exactly as written
→ "achievements": each bullet point as a separate array element, complete text

**Projects** (项目经历, 项目经验, 科研项目, 本科科研项目, 研究生科研项目, Research Projects, Academic Projects, Personal Projects):
→ "projects" array — one entry per project
→ Include ALL bullet points in "description", every technical detail, every result/metric
→ If a project has 关键词/Keywords, include them in "technologies"

**Education** (教育背景, 教育经历, 学历, Education):
→ "education" array — one entry per degree/institution
→ 要识别学校名称，学位，专业，在学和毕业时间，地点
→ Include: institution, degree (学士/硕士/博士/Bachelor/Master/PhD), field/major, dates, GPA/成绩/排名
→ "coursework": list ALL courses mentioned (主修课程)
→ "achievements": include ALL honors, scholarships (奖学金), rankings (排名), dean's list, etc.

**Awards / Honors** (荣誉奖项, 获奖情况, 竞赛, Awards, Honors, Competitions):
→ "awards" array — one entry per award
→ Include: name, issuer/organization, date, full description
→ Awards for math competitions (数学建模), hackathons, scholarships (国家奖学金, 一等奖学金) — include ALL

**Certifications / Certificates** (技能证书, 资格证书, Certifications, Licenses):
→ "certifications" array

**Languages** (语言能力, Language Skills):
→ "languages" array with proficiency (CET-4/6, IELTS, TOEFL scores, etc.)

**Publications / Patents** (发表论文, 学术成果, Publications, Patents):
→ "publications" and "patents" arrays — include complete citations

**Volunteer Work** (志愿者经历, 社会实践, Volunteer, Community Service):
→ "volunteerWork" array

**Any other section** not listed above:
→ Put its COMPLETE content into "otherSections" using the original section title as the key

## OUTPUT FORMAT — Return ONLY this JSON, no other text:

\`\`\`json
{
  "name": "<full name>",
  "email": "<email or empty string>",
  "phone": "<phone number or empty string>",
  "address": "<address/location if present>",
  "linkedin": "<LinkedIn URL if present>",
  "github": "<GitHub URL if present>",
  "portfolio": "<website/portfolio URL if present>",
  "summary": "<COMPLETE self-evaluation / summary / objective — full original text>",
  "skills": {
    "technical": ["skill1", "skill2"],
    "soft": ["skill1", "skill2"],
    "languages": ["programming language1", "language2"],
    "tools": ["tool1", "tool2"],
    "frameworks": ["framework1", "framework2"],
    "other": ["other1"]
  },
  "experience": [
    {
      "company": "<company name>",
      "role": "<job title>",
      "location": "<location>",
      "startDate": "<start date>",
      "endDate": "<end date or Present/至今>",
      "duration": "<calculated duration>",
      "employmentType": "<full-time|part-time|internship|contract|freelance>",
      "description": "<ALL bullet points joined with newlines — complete text, no omissions>",
      "achievements": ["<bullet 1 complete text>", "<bullet 2 complete text>"],
      "technologies": ["tech1", "tech2"]
    }
  ],
  "projects": [
    {
      "name": "<project name>",
      "role": "<role if mentioned>",
      "date": "<date range>",
      "description": "<ALL bullet points joined with newlines — every detail preserved>",
      "technologies": ["tech1", "tech2"],
      "link": "<URL if present>"
    }
  ],
  "education": [
    {
      "institution": "<school name>",
      "degree": "<degree type, e.g. 硕士/Bachelor/PhD>",
      "field": "<major/field of study>",
      "startDate": "<start date>",
      "endDate": "<end date>",
      "gpa": "<GPA or score, e.g. 88/100 (前5%), 3.86/4.00>",
      "achievements": ["<scholarship>", "<honor>", "<ranking>"],
      "coursework": ["<course1>", "<course2>"]
    }
  ],
  "certifications": [
    {
      "name": "<cert name>",
      "issuer": "<issuer>",
      "date": "<date>",
      "expiryDate": "<expiry if applicable>",
      "credentialId": "<ID if present>"
    }
  ],
  "awards": [
    {
      "name": "<award name — full text>",
      "issuer": "<organization>",
      "date": "<date>",
      "description": "<full description including context>"
    }
  ],
  "languages": [
    {
      "language": "<language>",
      "proficiency": "<level, e.g. CET-6, IELTS 6.5, Native>"
    }
  ],
  "volunteerWork": [
    {
      "organization": "<org>",
      "role": "<role>",
      "duration": "<period>",
      "description": "<COMPLETE description>"
    }
  ],
  "publications": ["<complete citation 1>"],
  "patents": ["<complete patent info>"],
  "otherSections": {
    "<original section title>": "<COMPLETE content of that section>"
  }
}
\`\`\`

## FINAL CHECK — Before outputting, verify:
- Every section heading in the resume has its content captured somewhere in the JSON
- Every bullet point under every section is present in full
- No project, job, degree, award, or certification was skipped
- GPA, rankings, scores, and dates are all preserved
- The "description" fields contain ALL bullet points, not just the first few`;
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

    let raw: Record<string, unknown> | null = null;
    if (jsonMatch && jsonMatch[1]) {
      try {
        raw = JSON.parse(jsonMatch[1].trim());
      } catch {
        // Continue to try parsing the entire response
      }
    }

    if (!raw) {
      try {
        raw = JSON.parse(response);
      } catch {
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

    // Normalize field names — LLMs sometimes use alternative keys
    return ResumeParseAgent.normalizeFields(raw as Record<string, unknown>);
  }

  /**
   * Pick the first non-empty string value from an object by trying multiple key names.
   */
  private static pick(obj: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  /**
   * Normalize LLM output field names to canonical ParsedResume shape.
   * Handles common variations like school→institution, title→role, etc.
   */
  private static normalizeFields(raw: Record<string, unknown>): ParsedResume {
    const pick = ResumeParseAgent.pick;

    const result: ParsedResume = {
      name: pick(raw, 'name', 'candidateName', 'fullName', '姓名'),
      email: pick(raw, 'email', 'e-mail', '邮箱'),
      phone: pick(raw, 'phone', 'telephone', 'mobile', '电话', '手机'),
      address: pick(raw, 'address', 'location', '地址', '现居地'),
      linkedin: pick(raw, 'linkedin', 'linkedIn'),
      github: pick(raw, 'github', 'GitHub'),
      portfolio: pick(raw, 'portfolio', 'website', 'personalSite', '个人网站'),
      summary: pick(raw, 'summary', 'objective', 'profile', 'aboutMe', '自我评价', '个人简介', '求职意向'),
      skills: (raw.skills ?? []) as ParsedResume['skills'],
      experience: [],
      education: [],
      projects: [],
    };

    // Normalize education entries
    const eduArray = Array.isArray(raw.education) ? raw.education : [];
    result.education = eduArray.map((e: Record<string, unknown>) => ({
      institution: pick(e, 'institution', 'school', 'university', 'schoolName', 'school_name', 'college', '学校', '院校'),
      degree: pick(e, 'degree', 'degreeName', 'degreeType', '学位', '学历'),
      field: pick(e, 'field', 'major', 'fieldOfStudy', 'specialization', '专业'),
      startDate: pick(e, 'startDate', 'start_date', 'from', 'startYear'),
      endDate: pick(e, 'endDate', 'end_date', 'to', 'endYear'),
      year: pick(e, 'year', 'graduationYear'),
      gpa: pick(e, 'gpa', 'grade', 'score', '成绩', '绩点', 'GPA'),
      achievements: Array.isArray(e.achievements) ? e.achievements as string[] : [],
      coursework: Array.isArray(e.coursework) ? e.coursework as string[]
        : Array.isArray(e.courses) ? e.courses as string[] : [],
    }));

    // Normalize experience entries
    const expArray = Array.isArray(raw.experience) ? raw.experience : [];
    result.experience = expArray.map((e: Record<string, unknown>) => ({
      company: pick(e, 'company', 'companyName', 'company_name', 'employer', 'organization', '公司'),
      role: pick(e, 'role', 'title', 'jobTitle', 'job_title', 'position', '职位', '岗位'),
      location: pick(e, 'location', 'city', '地点'),
      startDate: pick(e, 'startDate', 'start_date', 'from'),
      endDate: pick(e, 'endDate', 'end_date', 'to'),
      duration: pick(e, 'duration', 'period', '时长'),
      description: pick(e, 'description', '描述'),
      achievements: Array.isArray(e.achievements) ? e.achievements as string[] : [],
      technologies: Array.isArray(e.technologies) ? e.technologies as string[] : [],
      employmentType: (pick(e, 'employmentType', 'employment_type', 'type') || undefined) as WorkExperience['employmentType'],
    }));

    // Normalize project entries
    const projArray = Array.isArray(raw.projects) ? raw.projects : [];
    result.projects = projArray.map((p: Record<string, unknown>) => ({
      name: pick(p, 'name', 'projectName', 'title', '项目名称'),
      role: pick(p, 'role', 'position', '角色'),
      date: pick(p, 'date', 'period', 'duration', 'dates'),
      description: pick(p, 'description', '描述'),
      technologies: Array.isArray(p.technologies) ? p.technologies as string[] : [],
      link: pick(p, 'link', 'url', 'links'),
    }));

    // Pass through other arrays as-is
    if (Array.isArray(raw.certifications)) result.certifications = raw.certifications as ParsedResume['certifications'];
    if (Array.isArray(raw.awards)) result.awards = raw.awards as ParsedResume['awards'];
    if (Array.isArray(raw.languages)) result.languages = raw.languages as ParsedResume['languages'];
    if (Array.isArray(raw.volunteerWork)) result.volunteerWork = raw.volunteerWork as ParsedResume['volunteerWork'];
    if (Array.isArray(raw.publications)) result.publications = raw.publications as string[];
    if (Array.isArray(raw.patents)) result.patents = raw.patents as string[];
    if (raw.otherSections && typeof raw.otherSections === 'object') {
      result.otherSections = raw.otherSections as Record<string, string>;
    }

    return result;
  }

  /**
   * Parse a resume from text
   */
  async parse(resumeText: string, requestId?: string): Promise<ParsedResume> {
    const result = await this.parseOnce(resumeText, requestId);
    const parsed = {
      ...result,
      rawText: resumeText,
    };

    if (!isParsedResumeLikelyIncomplete(parsed, resumeText)) {
      return parsed;
    }

    logger.warn('RESUME_PARSE', 'Sparse resume parse detected, retrying with stricter extraction prompt', {
      resumeLength: resumeText.length,
    }, requestId);

    const retried = await this.parseOnce(resumeText, requestId, true);
    return {
      ...retried,
      rawText: resumeText,
    };
  }

  private async parseOnce(resumeText: string, requestId?: string, retry = false): Promise<ParsedResume> {
    const systemPrompt = [
      this.buildSystemPrompt(resumeText, requestId),
      retry
        ? 'Your previous extraction missed resume sections. Re-read the entire resume text and make sure every non-education section is captured, especially skills, projects, publications, internships, contact details, and languages.'
        : '',
    ].filter(Boolean).join('\n\n');

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.formatInput({ resumeText }) },
    ];

    const response = await this.llm.chat(messages, {
      temperature: retry ? 0 : 0.1,
      maxTokens: 8000,
      requestId,
    });

    return this.parseOutput(response);
  }
}

export const resumeParseAgent = new ResumeParseAgent();
