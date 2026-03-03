import { Message } from '../types/index.js';
import { llmService } from '../services/llm/LLMService.js';
import { languageService } from '../services/LanguageService.js';
import { logger } from '../services/LoggerService.js';

export interface RecruitmentChatContext {
  role?: string;
  seniority?: string;
  industry?: string;
  location?: string;
  employmentType?: string;
  teamContext?: string;
  companyStage?: string;
  compensation?: string;
  mustHaves?: string[];
  niceToHaves?: string[];
  jobDescription?: string;
  language?: string;
}

export interface RecruitmentChatInput {
  history: Message[];
  message: string;
  context?: RecruitmentChatContext;
  requestId?: string;
}

export interface RecruitmentChatResult {
  reply: string;
  action?: 'create_request';
}

const ACTION_MARKER = '[[ACTION:CREATE_REQUEST]]';

export class RecruitmentConsultantAgent {
  private buildSystemPrompt(languageInstruction?: string, preferredLanguage?: string): string {
    const corePrompt = `You are RoboHire's Recruitment Consultant Agent — a senior recruiter with 15+ years across tech, product, sales, operations, AI, and leadership roles.

Your job is to help the user define a clear, complete hiring brief. You must be confident, practical, and concise.

Behavior guidelines:
- When a role is mentioned, infer a baseline set of responsibilities, must-have skills, and expected experience using your domain knowledge.
- Recommend improvements and industry-standard requirements tailored to the role.
- Ask targeted clarifying questions to fill gaps: seniority, scope, team context, tech stack, domain knowledge, location/remote, compensation, timeline, interview process.
- Keep the user aligned by providing a \"Summary so far\" section with bullet points.
- Separate requirements into: Must-haves, Nice-to-haves, Responsibilities, Tools/Stack, Soft skills, Success metrics.
- If a job description is provided, extract key requirements and highlight missing or ambiguous items.
- Always respond in the user's selected language. If a preferred language is provided, use it consistently even if the user's message is in another language.

Response format (keep concise):
1) Recommendations (short bullets)
2) Clarifying questions (2–5 questions)
3) Summary so far (bulleted, only what is confirmed)

If the user explicitly confirms they want to proceed (e.g., \"yes\", \"looks good\", \"create the request\", \"that's all\"), append this exact line at the end:
${ACTION_MARKER}

Do not explain the marker. Keep it on its own line.`;

    const promptParts: string[] = [];
    if (languageInstruction) {
      promptParts.push(languageInstruction);
    }
    if (preferredLanguage) {
      promptParts.push(`User selected language: ${preferredLanguage}.`);
    }

    promptParts.push(corePrompt);
    return promptParts.join('\n\n');
  }

  private buildUserMessage(message: string, context?: RecruitmentChatContext): string {
    const contextBlocks: string[] = [];

    if (context?.role) contextBlocks.push(`Role: ${context.role}`);
    if (context?.seniority) contextBlocks.push(`Seniority: ${context.seniority}`);
    if (context?.industry) contextBlocks.push(`Industry: ${context.industry}`);
    if (context?.location) contextBlocks.push(`Location: ${context.location}`);
    if (context?.employmentType) contextBlocks.push(`Employment type: ${context.employmentType}`);
    if (context?.teamContext) contextBlocks.push(`Team context: ${context.teamContext}`);
    if (context?.companyStage) contextBlocks.push(`Company stage: ${context.companyStage}`);
    if (context?.compensation) contextBlocks.push(`Compensation: ${context.compensation}`);
    if (context?.mustHaves?.length) contextBlocks.push(`Must-haves: ${context.mustHaves.join(', ')}`);
    if (context?.niceToHaves?.length) contextBlocks.push(`Nice-to-haves: ${context.niceToHaves.join(', ')}`);

    if (context?.jobDescription) {
      contextBlocks.push(`Job Description:\n${context.jobDescription}`);
    }

    if (contextBlocks.length === 0) {
      return message;
    }

    return `Context:\n${contextBlocks.join('\n')}\n\nUser message:\n${message}`;
  }

  private extractAction(response: string): { reply: string; action?: 'create_request' } {
    const actionDetected = response.includes(ACTION_MARKER);
    const cleaned = response.replace(ACTION_MARKER, '').trim();

    return {
      reply: cleaned,
      action: actionDetected ? 'create_request' : undefined,
    };
  }

  private getRoleLabel(input: RecruitmentChatInput): string {
    if (input.context?.role && input.context.role.trim()) {
      return input.context.role.trim();
    }
    if (input.message && input.message.trim()) {
      return input.message.trim();
    }
    return 'the role';
  }

  private buildFallbackReply(role: string, language: string): string {
    if (language === 'Chinese') {
      return `当前 AI 服务暂时繁忙，我先给你一个可直接用的招聘梳理草案。

1) 建议
- 明确该岗位的优先级：必须项与加分项分开写，避免候选人误判。
- 把职责写成可衡量目标（例如 3 个月内完成什么、6 个月达到什么指标）。
- 先锁定技术栈和协作方式（远程/现场、跨时区、汇报对象）。

2) 关键澄清问题
- 该岗位是中级、高级还是负责人级别？
- 必须掌握的 3-5 项核心技能是什么？
- 业务目标与入职后 90 天重点任务是什么？
- 预算薪资范围和办公地点/远程政策是什么？

3) 当前已确认
- 目标岗位：${role}
- 下一步：回复以上问题后，我可以继续生成完整招聘需求并细化 JD。`;
    }

    return `The AI provider is temporarily busy, so here is a practical draft you can use now.

1) Recommendations
- Separate true must-haves from nice-to-haves to improve candidate targeting.
- Convert responsibilities into measurable outcomes (first 90/180 days).
- Confirm stack, reporting line, and work mode (remote/hybrid/on-site) early.

2) Clarifying questions
- What seniority level is required for this role?
- What are the top 3-5 non-negotiable skills?
- What business outcomes should this hire deliver in the first 90 days?
- What are the compensation range and location constraints?

3) Summary so far
- Target role: ${role}
- Next step: share the above details and I will produce a complete hiring brief.`;
  }

  async chat(input: RecruitmentChatInput): Promise<RecruitmentChatResult> {
    const preferredLocale = input.context?.language;
    const languageSource = input.context?.jobDescription || input.message;
    const detectedLanguage = languageService.detectLanguage(languageSource);
    const preferredLanguage = preferredLocale ? languageService.getLanguageFromLocale(preferredLocale) : null;
    const resolvedLanguage = preferredLanguage || detectedLanguage;
    const languageInstruction = preferredLanguage
      ? languageService.getLanguageInstructionForLanguage(preferredLanguage)
      : languageService.getLanguageInstruction(languageSource);

    if (input.requestId) {
      logger.logLanguageDetection(input.requestId, resolvedLanguage, preferredLanguage ? 'user-selected' : 'auto');
    }

    const systemPrompt = this.buildSystemPrompt(languageInstruction, preferredLanguage || undefined);
    const userMessage = this.buildUserMessage(input.message, input.context);

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...input.history,
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await llmService.chat(messages, {
        temperature: 0.6,
        requestId: input.requestId,
      });

      return this.extractAction(response);
    } catch (error) {
      logger.error('HIRING_CHAT', 'Recruitment consultant fallback activated', {
        error: error instanceof Error ? error.message : String(error),
      }, input.requestId);

      return {
        reply: this.buildFallbackReply(this.getRoleLabel(input), resolvedLanguage),
      };
    }
  }
}

export const recruitmentConsultantAgent = new RecruitmentConsultantAgent();
