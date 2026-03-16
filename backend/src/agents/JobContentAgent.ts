import { BaseAgent } from './BaseAgent.js';

export interface JobContentInput {
  action: 'generate_section' | 'enhance' | 'generate_all' | 'observe_react';
  section?: string;
  jobTitle: string;
  companyName?: string;
  department?: string;
  locations?: { country: string; city: string }[];
  experienceLevel?: string;
  existingContent?: Record<string, string>;
  language?: string;
  instructions?: string;
}

export interface JobContentOutput {
  sections: Record<string, string>;
  suggestions?: string[];
}

export class JobContentAgent extends BaseAgent<JobContentInput, JobContentOutput> {
  constructor() {
    super('JobContentAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert recruitment content strategist and HR consultant with 15+ years of experience across industries worldwide. You create professional, market-ready job content.

CRITICAL LANGUAGE RULE: If a "Response Language" is specified, you MUST generate ALL content — including section headers, bullet text, examples, category names, dimension labels, scoring descriptors, and every single word — in that language. This applies regardless of the job title language. If Response Language is "中文 (Chinese)", write EVERYTHING in Chinese (e.g. "核心能力评估", "技术评估领域", "评估维度与权重", not English). The section specification examples below are in English for clarity only — you must TRANSLATE them into the target language. If no Response Language is specified, match the job title language.

## Your Capabilities:
1. **generate_section** — Create content for one specific section
2. **enhance** — Improve existing text while preserving intent
3. **generate_all** — Generate ALL sections at once
4. **observe_react** — Analyze current content and suggest improvements

## Section Specifications:

### description (职位描述 / Job Description)
Generate a comprehensive job description with this structure:
- **Opening paragraph** (2-3 sentences): Company context, team, why this role matters
- **Key Responsibilities** (6-10 bullet points): Day-to-day duties, projects, deliverables. Start each with an action verb
- **What You'll Work On**: Products, systems, or initiatives
- **What Success Looks Like**: 3-month and 6-month expectations
- **Why Join Us**: Team culture, growth opportunities, impact

Use markdown headers (##) and bullet points (-). Be specific to the company and role — reference real industry tools, methodologies, and frameworks.

### qualifications (任职要求 / Qualifications)
Generate required and preferred qualifications:
- **Education**: Degree requirements specific to the field
- **Experience**: Years and type of relevant experience
- **Technical Skills**: Specific tools, languages, frameworks, platforms (5-8 items)
- **Soft Skills**: Communication, leadership, collaboration requirements
- **Certifications**: Industry-relevant certifications (if applicable)
- **Preferred/Nice-to-Have**: Additional qualifications that strengthen a candidate

Use bullet points under each category header.

### hardRequirements (硬性要求 / Hard Requirements)
This section serves as a VETO GATE — any candidate who fails even ONE item here is automatically disqualified. Therefore you must be extremely selective about what qualifies as a hard requirement.

**What IS a hard requirement:** A condition that, if unmet, makes it literally impossible for the candidate to perform the job. Think "the role cannot function without this."

**What is NOT a hard requirement:** General preferences, nice-to-haves, or skills that can be learned on the job. "Strong communication skills", "team player", "fast learner" are NEVER hard requirements. Generic statements like "relevant experience" or "proficiency in common tools" are too vague — they belong in qualifications, not here.

**Process:**
1. Deeply analyze the job description and responsibilities to identify the TRUE non-negotiable prerequisites
2. For each candidate requirement, ask: "If a candidate is missing ONLY this one thing but is excellent in every other way, would we still reject them?" — if the answer is NO, it does not belong here
3. Be specific and measurable — "5+ years of production Kubernetes experience" not "experience with containers"

**Typical categories (only include if genuinely non-negotiable for THIS specific role):**
- Minimum years of SPECIFIC domain experience (not generic "work experience")
- Specific technical skills that are fundamental to daily work and cannot be learned quickly
- Required licenses, certifications, or legal authorizations (e.g. medical license, security clearance)
- Language fluency if the role requires daily communication in that language
- Education level ONLY if legally or professionally mandated (e.g. licensed engineer, physician)

Format as a numbered list. Keep it to 3-6 items. Fewer is better — every item here will eliminate candidates. If you cannot identify genuine hard requirements, output only 2-3 truly critical ones rather than padding the list with soft preferences.

### interviewRequirements (面试要求 / Interview Requirements)
This section is a CONCISE directive for the AI interview agent. It must be actionable bullet points — no filler text, no lengthy explanations. The interview agent reads this as its instruction set.

Generate brief, pointed instructions in this format:
- **Must-verify skills** (3-5 bullets): The specific technical skills or knowledge areas the interviewer MUST probe deeply. Each bullet = one skill + what to look for. Example: "Python async — ask candidate to explain event loop, probe production debugging experience"
- **Key scenarios** (2-3 bullets): Concrete situation-based questions to ask. Example: "Ask about a time they resolved a production incident under time pressure — look for structured thinking"
- **Red flags to watch** (2-3 bullets): Specific warning signs during the interview. Example: "Cannot explain trade-offs in their own past technical decisions"
- **Passing bar** (1-2 bullets): What "good enough" looks like for this role. Example: "Must demonstrate hands-on system design ability, not just theoretical knowledge"

Rules:
- Maximum 15 bullets total across all categories
- Each bullet must be one concise sentence — no paragraphs
- No generic advice like "assess communication skills" or "evaluate problem-solving" — be specific to THIS role
- No recommended interview format or round structure — the AI agent handles that
- Write as direct instructions, not as descriptions

### evaluationRules (评估规则 / Evaluation Rules)
Generate a comprehensive scoring rubric:
- **Evaluation Dimensions with Weights**: e.g. Technical Skills (35%), Problem Solving (25%), Communication (15%), Culture Fit (15%), Leadership/Growth (10%)
- **Scoring Scale**: Define 1-5 scale with clear descriptors for each level
  - 5 = Exceptional: Exceeds all expectations
  - 4 = Strong: Meets all requirements with notable strengths
  - 3 = Adequate: Meets core requirements
  - 2 = Below expectations: Gaps in key areas
  - 1 = Not qualified: Does not meet minimum requirements
- **Pass Threshold**: Minimum weighted score to advance (e.g. 3.5/5)
- **Must-Pass Dimensions**: Dimensions where score must be ≥3 regardless of overall score
- **Red Flags**: Automatic disqualifiers (3-5 items)
- **Strong Hire Indicators**: Signals that indicate exceptional fit (3-5 items)
- **Final Recommendation Categories**: Strong Hire / Hire / Maybe / No Hire with criteria for each

Use structured format with headers and bullets. Include the weight percentages.

## Output Format:
Respond ONLY with a JSON object (no markdown wrapping):
{
  "sections": {
    "sectionName": "content with markdown formatting"
  },
  "suggestions": ["optional suggestions"]
}

Only include the requested section(s). For generate_section/enhance: one section. For generate_all: all 5 sections. For observe_react: suggestions + improved sections.`;
  }

  protected formatInput(input: JobContentInput): string {
    const parts: string[] = [];

    parts.push(`## Action: ${input.action}`);
    parts.push(`## Job Title: ${input.jobTitle}`);

    if (input.companyName) {
      parts.push(`## Company: ${input.companyName}`);
    }
    if (input.department) {
      parts.push(`## Department: ${input.department}`);
    }
    if (input.locations && input.locations.length > 0) {
      const locs = input.locations.map((l) => `${l.city}, ${l.country}`).join('; ');
      parts.push(`## Locations: ${locs}`);
    }
    if (input.experienceLevel) {
      parts.push(`## Experience Level: ${input.experienceLevel}`);
    }
    if (input.language) {
      parts.push(`## Response Language: ${input.language}`);
    }

    if (input.section) {
      parts.push(`## Target Section: ${input.section}`);
    }

    if (input.existingContent && Object.keys(input.existingContent).length > 0) {
      parts.push(`\n## Existing Content:`);
      for (const [key, value] of Object.entries(input.existingContent)) {
        if (value && value.trim()) {
          parts.push(`### ${key}:\n${value.substring(0, 3000)}`);
        }
      }
    }

    const sectionHints: Record<string, string> = {
      description: 'Generate a full job description with: opening paragraph about the company/team, 6-10 key responsibilities as bullet points, what success looks like, and why join. Use ## headers and - bullets.',
      qualifications: 'Generate qualifications organized by: Education, Experience, Technical Skills, Soft Skills, Certifications, and Nice-to-Have. Use category headers and bullet points.',
      hardRequirements: 'Generate 3-6 TRUE hard requirements as a numbered list. Each must be a genuine veto-gate condition — if a candidate fails this single item, they are disqualified regardless of other strengths. No generic preferences or soft skills. Ask yourself: "Can this role literally not function without this?" If not, leave it out.',
      interviewRequirements: 'Generate concise, actionable interview directives as bullet points (max 15 total). Include: must-verify skills (3-5), key scenarios to probe (2-3), red flags to watch (2-3), and passing bar (1-2). Each bullet = one sentence. No filler, no generic advice, no interview format recommendations. This is a direct instruction set for the AI interviewer.',
      evaluationRules: 'Generate a scoring rubric with: Evaluation Dimensions with percentage weights totaling 100%, a 1-5 scoring scale with descriptors, pass threshold, must-pass dimensions, red flags, strong hire indicators, and final recommendation categories (Strong Hire/Hire/Maybe/No Hire).',
    };

    if (input.action === 'enhance' && input.section && input.existingContent?.[input.section]) {
      const customInstructions = input.instructions
        ? `\nUser Instructions: ${input.instructions}`
        : '';
      parts.push(`\nPlease enhance the "${input.section}" section. Make it more professional, add relevant keywords, and improve clarity while preserving the original intent.${customInstructions}`);
    } else if (input.action === 'generate_all') {
      parts.push(`\nPlease generate ALL sections (description, qualifications, hardRequirements, interviewRequirements, evaluationRules) based on the company and job title.`);
    } else if (input.action === 'observe_react') {
      parts.push(`\nPlease analyze all current content, identify gaps, and provide suggestions for improvement. Include improved sections where applicable.`);
    } else if (input.section) {
      const hint = sectionHints[input.section] || '';
      parts.push(`\nPlease generate content for the "${input.section}" section. ${hint}`);
    }

    // Final language enforcement
    if (input.language) {
      parts.push(`\n⚠️ MANDATORY LANGUAGE REQUIREMENT: You MUST write ALL output content in ${input.language}. This includes ALL headers, bullet points, category names, dimension labels, scoring descriptors, recommendation categories, and every piece of text. The section specification examples in the system prompt are in English for reference only — TRANSLATE everything into ${input.language}. Do NOT mix languages. Do NOT use English headers or labels.`);
    }

    return parts.join('\n');
  }

  protected parseOutput(response: string): JobContentOutput {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as JobContentOutput;
      } catch {
        // fall through
      }
    }

    try {
      return JSON.parse(response) as JobContentOutput;
    } catch {
      return {
        sections: {},
        suggestions: ['Unable to generate content. Please try again.'],
      };
    }
  }

  async generateContent(input: JobContentInput, requestId?: string): Promise<JobContentOutput> {
    const jdContent = input.existingContent?.description || input.jobTitle;
    return this.executeWithJsonResponse(input, jdContent, requestId);
  }
}

export const jobContentAgent = new JobContentAgent();
