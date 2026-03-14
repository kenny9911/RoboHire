import { BaseAgent } from './BaseAgent.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface InterviewPromptInput {
  jobTitle: string;
  language: string;
  jobDescription?: string;
  requirements?: { mustHave?: string[]; niceToHave?: string[] } | null;
  hardRequirements?: string;
  qualifications?: string;
  companyName?: string;
  interviewRequirements?: string;
  evaluationRules?: string;
  resumeText?: string;
  interviewDuration?: number;
  passingScore?: number;
}

export interface InterviewPromptOutput {
  systemPrompt: string;
  questionAreas: string[];
  languageInstruction: string;
}

// Language name map for explicit instructions
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Chinese (Mandarin)',
  'zh-TW': 'Chinese (Traditional)',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
};

function getLanguageName(code: string): string {
  if (LANGUAGE_NAMES[code]) return LANGUAGE_NAMES[code];
  // Try prefix match
  const prefix = code.split('-')[0];
  return LANGUAGE_NAMES[prefix] || code;
}

// Load the rigorous interviewer template as reference
let rigorousTemplate = '';
try {
  rigorousTemplate = readFileSync(resolve(__dirname, '../prompts/rigorous-interviewer.md'), 'utf-8');
} catch {
  // Template not available — will use built-in structure
}

class InterviewPromptAgent extends BaseAgent<InterviewPromptInput, InterviewPromptOutput> {
  constructor() {
    super('InterviewPromptAgent');
  }

  protected getAgentPrompt(): string {
    return `You are an expert interview system prompt engineer. Your job is to generate a comprehensive, tailored system prompt for an AI voice interviewer agent.

The generated prompt will be used by a real-time voice AI agent (using OpenAI's GPT model) to conduct a live job interview. The prompt must be:
- Written in plain text (no markdown formatting since it's for a voice agent)
- Specific to the job, company, and requirements provided
- Include clear language directives
- Follow a structured interview flow
- Include specific technical areas to assess based on the job requirements
- Include probing techniques and red flags to watch for

IMPORTANT: Output ONLY the system prompt text. Do not include any JSON, code blocks, or meta-commentary. The entire output will be used directly as the system prompt for the interviewer agent.

Reference interview structure and best practices:
${rigorousTemplate ? rigorousTemplate.slice(0, 3000) : `
- Opening (1-2 min): greeting, candidate introduction
- Technical Deep Dive (20-25 min): job-specific technical questions
- Problem-Solving (10-15 min): scenarios, system design, algorithms
- Experience Verification (5-7 min): past projects, challenges
- Advanced Topics (5-8 min): optimization, scalability, security
- Closing (2-3 min): candidate questions, next steps
`}`;
  }

  protected formatInput(input: InterviewPromptInput): string {
    const languageName = getLanguageName(input.language);
    const parts: string[] = [];

    parts.push(`Generate a system prompt for an AI interviewer for the following position:\n`);
    parts.push(`JOB TITLE: ${input.jobTitle}`);
    parts.push(`INTERVIEW LANGUAGE: ${languageName} (code: ${input.language})`);

    if (input.interviewDuration) {
      parts.push(`INTERVIEW DURATION: ${input.interviewDuration} minutes`);
    }
    if (input.passingScore) {
      parts.push(`PASSING SCORE: ${input.passingScore}/100`);
    }

    if (input.companyName) {
      parts.push(`\nCOMPANY: ${input.companyName}`);
    }

    if (input.jobDescription) {
      parts.push(`\nJOB DESCRIPTION:\n${input.jobDescription.slice(0, 3000)}`);
    }

    if (input.requirements) {
      const reqs = input.requirements;
      if (reqs.mustHave && reqs.mustHave.length > 0) {
        parts.push(`\nMUST-HAVE REQUIREMENTS:\n${reqs.mustHave.map((r) => `- ${r}`).join('\n')}`);
      }
      if (reqs.niceToHave && reqs.niceToHave.length > 0) {
        parts.push(`\nNICE-TO-HAVE REQUIREMENTS:\n${reqs.niceToHave.map((r) => `- ${r}`).join('\n')}`);
      }
    }

    if (input.qualifications) {
      parts.push(`\nQUALIFICATIONS (任职要求):\n${input.qualifications.slice(0, 2000)}`);
    }

    if (input.hardRequirements) {
      parts.push(`\nHARD REQUIREMENTS (硬性条件 — non-negotiable):\n${input.hardRequirements.slice(0, 2000)}`);
    }

    if (input.interviewRequirements) {
      parts.push(`\nINTERVIEW REQUIREMENTS (面试要求):\n${input.interviewRequirements.slice(0, 2000)}`);
    }

    if (input.evaluationRules) {
      parts.push(`\nEVALUATION RULES (评估规则):\n${input.evaluationRules.slice(0, 2000)}`);
    }

    if (input.resumeText) {
      parts.push(`\nCANDIDATE RESUME SUMMARY:\n${input.resumeText.slice(0, 2000)}`);
    }

    parts.push(`\nIMPORTANT INSTRUCTIONS:
1. The generated prompt MUST instruct the agent to conduct the ENTIRE interview in ${languageName}.
2. All questions, responses, follow-ups, and greetings must be in ${languageName}.
3. Include specific technical questions tailored to the job requirements listed above.
4. Include red flags to probe and areas to assess based on the actual job description.
5. The prompt should be for a VOICE agent — keep responses concise and conversational.
6. Do NOT include any markdown formatting, code blocks, or special characters.
7. Ask one question at a time and wait for the candidate to respond.`);

    return parts.join('\n');
  }

  protected parseOutput(response: string): InterviewPromptOutput {
    // The response IS the system prompt — no JSON parsing needed
    const systemPrompt = response.trim();

    // Extract question areas from the prompt (best effort)
    const areaMatches = systemPrompt.match(/(?:assess|evaluate|test|cover|probe).*?(?::\s*|-\s+)(.+)/gi) || [];
    const questionAreas = areaMatches
      .slice(0, 10)
      .map((m) => m.replace(/^.*?(?::\s*|-\s+)/, '').trim())
      .filter((a) => a.length > 3 && a.length < 100);

    return {
      systemPrompt,
      questionAreas: questionAreas.length > 0 ? questionAreas : ['Technical skills', 'Problem solving', 'Experience'],
      languageInstruction: `Conduct the entire interview in ${getLanguageName('en')}`,
    };
  }
}

export const interviewPromptAgent = new InterviewPromptAgent();
export default interviewPromptAgent;
