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
Generate non-negotiable must-have criteria as a strict checklist:
- Minimum education level (e.g. "Bachelor's degree in Computer Science or related field")
- Minimum years of experience (e.g. "5+ years of professional experience in backend development")
- Must-have technical skills (e.g. "Proficiency in Python and SQL required")
- Required certifications or licenses (e.g. "CPA certification required")
- Language requirements (e.g. "Business-level English required")
- Legal/compliance requirements (e.g. "Must be authorized to work in the specified country")
- Any other absolute prerequisites

Format as a numbered list. Each item must be clear, measurable, and non-negotiable. Typically 5-8 items.

### interviewRequirements (面试要求 / Interview Requirements)
Generate a structured interview assessment plan:
- **Core Competencies to Evaluate** (4-6 items): Technical depth, problem-solving, system design, etc.
- **Technical Assessment Areas**: Specific topics/skills to test with example question themes
- **Behavioral Assessment**: Leadership scenarios, conflict resolution, teamwork situations to probe
- **Culture Fit Indicators**: Values alignment, communication style, growth mindset signals
- **Recommended Interview Format**: Suggested rounds (e.g. phone screen → technical → system design → behavioral → team fit)
- **Key Questions to Ask**: 3-5 high-signal questions specific to this role

Use markdown headers and bullet points. Be specific to the job title and level.

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
      hardRequirements: 'Generate 5-8 non-negotiable must-have requirements as a numbered list. Each must be clear, measurable, and absolute (e.g. "Bachelor\'s degree required", "5+ years experience in X").',
      interviewRequirements: 'Generate an interview assessment plan with: Core Competencies to Evaluate, Technical Assessment Areas, Behavioral Assessment scenarios, Culture Fit Indicators, Recommended Interview Format, and 3-5 Key Questions. Use ## headers and bullets.',
      evaluationRules: 'Generate a scoring rubric with: Evaluation Dimensions with percentage weights totaling 100%, a 1-5 scoring scale with descriptors, pass threshold, must-pass dimensions, red flags, strong hire indicators, and final recommendation categories (Strong Hire/Hire/Maybe/No Hire).',
    };

    if (input.action === 'enhance' && input.section && input.existingContent?.[input.section]) {
      parts.push(`\nPlease enhance the "${input.section}" section. Make it more professional, add relevant keywords, and improve clarity while preserving the original intent.`);
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
