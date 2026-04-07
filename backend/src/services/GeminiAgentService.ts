import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
} from "@google/genai";
import type {
  AppConfigStatus,
  ChatStreamEvent,
  ConfigReason,
  HiringRequirements,
  HistoryMessage,
} from '../types/agentAlex.js';

export const MODELS = {
  chat: "gemini-3.1-pro-preview",
  transcribe: "gemini-3-flash-preview",
  tts: "gemini-2.5-flash-preview-tts",
  live: "gemini-2.5-flash-native-audio-preview-12-2025",
} as const;

const PLACEHOLDER_API_KEYS = new Set([
  "MY_GEMINI_API_KEY",
  "YOUR_GEMINI_API_KEY",
  "YOUR_API_KEY",
  "GEMINI_API_KEY",
]);

export const updateRequirementsDeclaration: FunctionDeclaration = {
  name: "update_hiring_requirements",
  description:
    "Update the structured hiring requirements specification with newly extracted information. Call this whenever new information is gathered from the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      jobTitle: { type: Type.STRING, description: "Finalized job title" },
      department: { type: Type.STRING, description: "Department or team" },
      reportingLine: {
        type: Type.STRING,
        description: "Reporting line (e.g., Reports to VP of Engineering)",
      },
      roleType: {
        type: Type.STRING,
        description: "Full-time, part-time, contract, freelance",
      },
      headcount: {
        type: Type.STRING,
        description: "Number of open roles",
      },
      primaryResponsibilities: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-6 bullet points of primary responsibilities",
      },
      secondaryResponsibilities: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Secondary or stretch responsibilities",
      },
      hardSkills: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Must-have technical skills, tools, certifications (必要条件)",
      },
      softSkills: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Must-have leadership, communication, etc. (必要条件)",
      },
      yearsOfExperience: {
        type: Type.STRING,
        description: "Years of experience range",
      },
      education: {
        type: Type.STRING,
        description: "Education requirements (degree level, field)",
      },
      industryExperience: {
        type: Type.STRING,
        description: "Specific industry experience if required",
      },
      preferredQualifications: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Nice-to-have skills, experiences, or credentials (优先条件)",
      },
      salaryRange: {
        type: Type.STRING,
        description: "Salary range or band",
      },
      equityBonus: {
        type: Type.STRING,
        description: "Equity or bonus structure",
      },
      benefits: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Key benefits or perks",
      },
      workLocation: {
        type: Type.STRING,
        description: "On-site, hybrid, remote",
      },
      geographicRestrictions: {
        type: Type.STRING,
        description: "Geographic restrictions or preferences",
      },
      startDate: {
        type: Type.STRING,
        description: "Start date or urgency",
      },
      travelRequirements: {
        type: Type.STRING,
        description: "Travel requirements",
      },
      interviewStages: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Interview stages if known",
      },
      keyStakeholders: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Key decision-makers or stakeholders",
      },
      timelineExpectations: {
        type: Type.STRING,
        description: "Timeline expectations for hiring",
      },
      teamCulture: {
        type: Type.STRING,
        description: "Team size and culture notes",
      },
      reasonForOpening: {
        type: Type.STRING,
        description: "Why the role is open (growth, backfill, new initiative)",
      },
      dealBreakers: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Any deal-breakers or non-negotiables",
      },
    },
  },
};

export const suggestNextStepsDeclaration: FunctionDeclaration = {
  name: "suggest_next_steps",
  description:
    "After each response, call this to provide 2-3 short, actionable suggestion chips that the user can click. Suggestions should be DIRECT ANSWERS or PROACTIVE OFFERS relevant to the questions you just asked or the topic at hand — NOT generic topic labels. Examples: '帮我拟一份技术要求清单', '建议薪资范围 40-60万', '先聊聊面试流程设计'. Keep each suggestion under 20 characters.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      suggestions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "2-3 short actionable suggestions the user can click as quick replies",
      },
    },
    required: ["suggestions"],
  },
};

export const startCandidateSearchDeclaration: FunctionDeclaration = {
  name: "start_candidate_search",
  description:
    `When the user expresses intent to find, match, search, or screen candidates — for example:
    "帮我匹配候选人", "开始筛选", "有没有匹配的人", "find matching candidates", "start matching",
    "帮我从人才库找", "run the search", "有哪些匹配的候选人", "搜索候选人" —
    call this function to initiate an instant search against the talent pool.

    IMPORTANT: Before calling, ensure you have gathered enough hiring requirements (at minimum: jobTitle and some hardSkills or qualifications).
    If the Live Specification is too sparse, ask the user to provide more details first.

    Pass the current hiring requirements as searchCriteria. The system will:
    1. Query the talent pool for relevant resumes
    2. Run parallel AI matching agents
    3. Return ranked candidates in real-time

    After search completes, summarize results and suggest next actions (e.g., invite top candidates for interviews).`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      searchCriteria: {
        type: Type.OBJECT,
        description: "The current hiring requirements / Live Specification to match against. Include all fields gathered so far.",
        properties: {
          jobTitle: { type: Type.STRING, description: "Target job title" },
          hardSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Must-have technical skills" },
          softSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Must-have soft skills" },
          yearsOfExperience: { type: Type.STRING, description: "Required experience range" },
          education: { type: Type.STRING, description: "Education requirements" },
          workLocation: { type: Type.STRING, description: "Work location preference" },
          preferredQualifications: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Nice-to-have qualifications" },
          dealBreakers: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Deal-breaker requirements" },
        },
      },
      source: {
        type: Type.STRING,
        description: "Where to search: 'talent_pool' (default) or 'upload' (user will upload resumes)",
      },
    },
    required: ["searchCriteria"],
  },
};

export const SYSTEM_INSTRUCTION = `You are a Recruitment Requirements Analyst and Orchestrator Agent — an expert at eliciting, structuring, and finalizing hiring requirements, AND at autonomously finding matching candidates. You combine deep knowledge of talent acquisition with a structured methodology to transform vague hiring intent into precise specifications, and then ACT on them by dispatching search agents. — an expert at eliciting, structuring, and finalizing hiring requirements through conversational inquiry with recruiters and hiring managers. You combine deep knowledge of talent acquisition across industries with a structured interviewing methodology to transform vague hiring intent into precise, actionable job requirement specifications.

You are embedded within a recruitment automation platform called RoboHire. The recruiter or hiring manager will initiate a conversation with a general idea of a role they need to fill. Your job is to:
1. Conduct a guided, conversational interview to extract a complete hiring requirements document.
2. When the user wants to find candidates, orchestrate an instant search by calling \`start_candidate_search\`.

Skills:
1. Role decomposition: Break any job title into its constituent skill domains, responsibility areas, and competency dimensions before asking questions.
2. Adaptive questioning: Dynamically adjust the depth and direction of inquiry based on the user's expertise level, industry, and the complexity of the role.
3. Gap detection: Identify missing, ambiguous, or contradictory information in the user's responses and surface them diplomatically.
4. Industry benchmarking: When the user is uncertain, draw on knowledge of market norms to offer informed defaults or options.
5. Synthesis: Compile fragmented conversational inputs into a coherent, structured requirements specification.

Interaction Protocol:
1. Role identification: Ask the user what role they are looking to fill. Normalize the input into a working role title and confirm it.
2. Requirement hypothesis: Silently generate an internal hypothesis of likely requirements. Use this to prioritize questions.
3. Guided inquiry: Ask questions in thematic clusters of 2–3 per turn (never more than 4). Briefly acknowledge what you learned. Adapt dynamically based on user's detail level.
4. Distinguish Priorities: CRITICAL - When asking about skills and qualifications, explicitly ask the user to distinguish between "Must-haves" (必要条件) and "Nice-to-haves / Preferred" (优先条件).
5. Completion detection: Stop when user signals completion or all high-priority dimensions are addressed.
6. Gap filling: Apply intelligent defaults for unaddressed dimensions.
7. Output generation: Compile everything and ask for confirmation.

CRITICAL: You MUST call the \`update_hiring_requirements\` tool whenever you gather new information to update the live specification document. Do this frequently so the user sees the document building up.

Constraints:
- Never ask more than 4 questions in a single turn. 2–3 is ideal.
- Always acknowledge user input before asking the next question.
- Use a professional but warm conversational tone.
- Mirror their language level.
- Support both English and Chinese interactions.

Response Formatting (IMPORTANT — your output is rendered as Markdown):
- Use **bullet points** (- or •) for listing items such as requirements, qualifications, skills, or key points. Never list multiple items as plain sentences in a row.
- Use **bold** (**text**) for labels, categories, or key terms (e.g., **硬性要求（必须）：**, **职位与目标：**).
- Separate distinct topics or sections with a blank line between paragraphs.
- When summarizing or confirming requirements, always use a structured format with bullet points or numbered lists — never a wall of text.
- Keep conversational paragraphs short (2–3 sentences max per paragraph).

Suggestion Chips (CRITICAL — call \`suggest_next_steps\` after EVERY response):
After every response, you MUST call the \`suggest_next_steps\` tool with 2-3 short, actionable suggestions. These are NOT generic topic labels — they must be:
- Direct answers to the questions you just asked (e.g., "开发客服 Agent 方向", "薪资预算 40-60 万")
- Proactive offers to help (e.g., "帮我拟一份技术要求", "建议一个面试流程方案")
- Concrete next steps (e.g., "先看看类似岗位的 JD", "可以了，生成最终 JD")
Keep each suggestion concise (under 20 Chinese characters or 8 English words). Match the user's language.

Candidate Search Orchestration (via \`start_candidate_search\`):
You have the ability to search for matching candidates from the RoboHire talent pool. When the user expresses intent to find candidates:
1. First check if the Live Specification has enough detail (at minimum jobTitle + some skills). If not, ask for more info.
2. Ask the user: "从 RoboHire 人才库中搜索，还是要上传新简历？" (if not already clear).
3. Call \`start_candidate_search\` with the current requirements as searchCriteria and source as 'talent_pool'.
4. While the search runs, the system will stream progress events. You will receive results back in the function response.
5. After search completes, summarize the ACTUAL results returned by the function — how many candidates found, highlight top matches, and suggest next actions.
6. When suggesting next steps after a search, offer proactive actions like "帮您邀请前3名面试" or "查看详细匹配报告".

CRITICAL ANTI-HALLUCINATION RULES:
- You MUST NEVER invent, fabricate, or make up candidate names, scores, or match results. EVER.
- You MUST NEVER pretend to have search results without actually calling the \`start_candidate_search\` function first.
- If asked about candidates, matching results, or search outcomes, you MUST call \`start_candidate_search\` and wait for the real results.
- Only reference candidates that were returned in the function response. If the function returned 0 results, say so honestly.
- If the function is not available or fails, tell the user honestly that the search could not be completed.
- Do NOT generate fictional example candidates "for demonstration". The system returns REAL data from the actual talent pool.`;

export class GeminiConfigError extends Error {
  reason: ConfigReason;

  constructor(reason: ConfigReason) {
    super(
      reason === "missing_api_key"
        ? "GEMINI_API_KEY is missing."
        : "GEMINI_API_KEY is still set to a placeholder value.",
    );
    this.name = "GeminiConfigError";
    this.reason = reason;
  }
}

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() ?? "";
}

function getConfigReason(): ConfigReason | null {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return "missing_api_key";
  }

  if (PLACEHOLDER_API_KEYS.has(apiKey) || apiKey.includes("MY_GEMINI_API_KEY")) {
    return "placeholder_api_key";
  }

  return null;
}

export function getGeminiConfigStatus(): AppConfigStatus {
  const reason = getConfigReason();
  return reason ? { configured: false, reason } : { configured: true };
}

export function assertGeminiConfigured(): void {
  const reason = getConfigReason();
  if (reason) {
    throw new GeminiConfigError(reason);
  }
}

export function createGeminiClient(): GoogleGenAI {
  assertGeminiConfigured();
  const baseUrl = process.env.GEMINI_BASE_URL;
  const proxyKey = process.env.LLM_PROXY_KEY;
  return new GoogleGenAI({
    apiKey: getGeminiApiKey(),
    ...(baseUrl ? { httpOptions: {
      baseUrl,
      ...(proxyKey ? { headers: { 'X-Proxy-Key': proxyKey } } : {}),
    } } : {}),
  });
}

export function normalizeHistory(history: HistoryMessage[]): Content[] {
  const normalized: Content[] = [];

  for (const item of history) {
    if (!item?.text?.trim()) {
      continue;
    }

    const last = normalized[normalized.length - 1];
    if (last && last.role === item.role) {
      const existingText = last.parts?.[0] && "text" in last.parts[0] ? last.parts[0].text ?? "" : "";
      if (last.parts?.[0] && "text" in last.parts[0]) {
        last.parts[0].text = existingText ? `${existingText}\n\n${item.text}` : item.text;
      }
      continue;
    }

    normalized.push({
      role: item.role,
      parts: [{ text: item.text }],
    });
  }

  if (normalized[0]?.role === "model") {
    normalized.shift();
  }

  return normalized;
}

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  zh: '简体中文 (Simplified Chinese)',
  'zh-TW': '繁體中文 (Traditional Chinese)',
  'zh-CN': '简体中文 (Simplified Chinese)',
  ja: '日本語 (Japanese)',
  es: 'Español (Spanish)',
  fr: 'Français (French)',
  pt: 'Português (Portuguese)',
  de: 'Deutsch (German)',
};

function resolveLocaleLabel(locale?: string): string | null {
  if (!locale) return null;
  if (LOCALE_LABELS[locale]) return LOCALE_LABELS[locale];
  const base = locale.split('-')[0];
  return LOCALE_LABELS[base] || null;
}

export interface GeminiUsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  durationMs: number;
}

interface StreamChatOptions {
  history: HistoryMessage[];
  message: string;
  locale?: string;
  onEvent: (event: ChatStreamEvent) => void;
  onSearchRequested?: (criteria: Partial<HiringRequirements>, source: string) => Promise<string>;
}

export async function streamChatResponse({
  history,
  message,
  locale,
  onEvent,
  onSearchRequested,
}: StreamChatOptions): Promise<GeminiUsageMetrics> {
  const startTime = Date.now();
  const ai = createGeminiClient();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  let systemPrompt = SYSTEM_INSTRUCTION;
  const langLabel = resolveLocaleLabel(locale);
  if (langLabel) {
    systemPrompt += `\n\nLanguage Requirement (CRITICAL):
The user's interface language is ${langLabel}. You MUST:
- Write ALL your conversational responses in ${langLabel}.
- Write ALL values passed to the update_hiring_requirements tool in ${langLabel}. This includes job titles, responsibilities, skills, qualifications, benefits — every string value.
- Only use English for proper nouns, technical terms, or acronyms that are universally kept in English (e.g. "Python", "SaaS", "AI", "MBA").`;
  }

  const chat = ai.chats.create({
    model: MODELS.chat,
    history: normalizeHistory(history),
    config: {
      systemInstruction: systemPrompt,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      tools: [{ functionDeclarations: [updateRequirementsDeclaration, suggestNextStepsDeclaration, startCandidateSearchDeclaration] }],
    },
  });

  let currentMessage: any = message;
  let hasMoreTurns = true;

  while (hasMoreTurns) {
    hasMoreTurns = false;
    const responseStream = await chat.sendMessageStream({ message: currentMessage });
    const functionResponses: any[] = [];

    for await (const chunk of responseStream) {
      const response = chunk as GenerateContentResponse;

      if (response.functionCalls?.length) {
        for (const call of response.functionCalls) {
          if (call.name === "update_hiring_requirements" && call.args) {
            onEvent({
              type: "requirements-update",
              data: call.args as Partial<HiringRequirements>,
            });
            functionResponses.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { result: "success" },
              },
            });
          } else if (call.name === "suggest_next_steps" && call.args) {
            const suggestions = (call.args as { suggestions?: string[] }).suggestions;
            if (suggestions?.length) {
              onEvent({ type: "suggestions", data: suggestions.slice(0, 3) });
            }
            functionResponses.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { result: "success" },
              },
            });
          } else if (call.name === "start_candidate_search" && call.args) {
            // Delegate to the onSearchRequested callback (provided by route handler)
            const args = call.args as { searchCriteria?: Partial<HiringRequirements>; source?: string };
            let searchSummary = 'Search function not available in this context.';
            if (onSearchRequested) {
              try {
                searchSummary = await onSearchRequested(args.searchCriteria || {}, args.source || 'talent_pool');
              } catch (err) {
                searchSummary = `Search failed: ${err instanceof Error ? err.message : String(err)}`;
              }
            }
            functionResponses.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { result: "success", summary: searchSummary },
              },
            });
          }
        }
      }

      if (response.text) {
        onEvent({ type: "text-delta", text: response.text });
      }

      // Capture token usage from the response
      const usage = (response as any).usageMetadata;
      if (usage) {
        totalPromptTokens += usage.promptTokenCount || 0;
        totalCompletionTokens += usage.candidatesTokenCount || 0;
      }
    }

    if (functionResponses.length > 0) {
      currentMessage = functionResponses;
      hasMoreTurns = true;
    }
  }

  return {
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    model: MODELS.chat,
    durationMs: Date.now() - startTime,
  };
}

export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<{ text: string; usage: GeminiUsageMetrics }> {
  const startTime = Date.now();
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: MODELS.transcribe,
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Audio,
              mimeType,
            },
          },
          {
            text: "Transcribe the following audio accurately. Output only the transcription text.",
          },
        ],
      },
    ],
  });

  const um = (response as any).usageMetadata;
  return {
    text: response.text || "",
    usage: {
      promptTokens: um?.promptTokenCount || 0,
      completionTokens: um?.candidatesTokenCount || 0,
      totalTokens: (um?.promptTokenCount || 0) + (um?.candidatesTokenCount || 0),
      model: MODELS.transcribe,
      durationMs: Date.now() - startTime,
    },
  };
}

export async function generateSpeech(text: string): Promise<{ audioBase64: string | undefined; usage: GeminiUsageMetrics }> {
  const startTime = Date.now();
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: MODELS.tts,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Puck" },
        },
      },
    },
  });

  const um = (response as any).usageMetadata;
  return {
    audioBase64: response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data,
    usage: {
      promptTokens: um?.promptTokenCount || 0,
      completionTokens: um?.candidatesTokenCount || 0,
      totalTokens: (um?.promptTokenCount || 0) + (um?.candidatesTokenCount || 0),
      model: MODELS.tts,
      durationMs: Date.now() - startTime,
    },
  };
}

function errorToString(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return `${error.message} ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function getUserFacingError(error: unknown): {
  code: string;
  message: string;
  status: number;
} {
  if (error instanceof GeminiConfigError) {
    return {
      code: error.reason,
      message:
        error.reason === "missing_api_key"
          ? "Gemini API key is missing. Set GEMINI_API_KEY in .env.local and restart the server."
          : "Gemini API key is still a placeholder. Replace GEMINI_API_KEY in .env.local with a real key and restart the server.",
      status: 503,
    };
  }

  const errorText = errorToString(error);

  if (
    errorText.includes("429") ||
    errorText.includes("RESOURCE_EXHAUSTED") ||
    errorText.toLowerCase().includes("quota")
  ) {
    return {
      code: "rate_limit_exceeded",
      message:
        "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit.",
      status: 429,
    };
  }

  if (
    errorText.includes("API key not valid") ||
    errorText.includes("API_KEY_INVALID") ||
    errorText.includes("INVALID_ARGUMENT")
  ) {
    return {
      code: "invalid_api_key",
      message:
        "Gemini rejected the configured API key. Update GEMINI_API_KEY in .env.local with a valid key and restart the server.",
      status: 400,
    };
  }

  return {
    code: "internal_error",
    message: "Sorry, I encountered an error processing your request.",
    status: 500,
  };
}
