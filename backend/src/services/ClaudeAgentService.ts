/**
 * Claude Agent Service for Agent Alex — Anthropic SDK integration.
 * Provides streaming chat with tool use, complexity-based model routing,
 * and web search capabilities.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AppConfigStatus,
  ChatStreamEvent,
  ConfigReason,
  HiringRequirements,
  HistoryMessage,
} from '../types/agentAlex.js';
import { buildSystemPrompt } from './agentAlexSystemPrompt.js';
import { isWebSearchEnabled, searchWeb } from './WebSearchService.js';
import { logger } from './LoggerService.js';

/* ── Models ───────────────────────────────────────────────────────────── */

export const CLAUDE_MODELS = {
  opus: process.env.AGENT_ALEX_CLAUDE_OPUS_MODEL || 'claude-opus-4-6-20250408',
  sonnet: process.env.AGENT_ALEX_CLAUDE_SONNET_MODEL || 'claude-sonnet-4-6-20250408',
} as const;

/* ── Client ───────────────────────────────────────────────────────────── */

function getAnthropicApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

const PLACEHOLDER_API_KEYS = new Set([
  'YOUR_ANTHROPIC_API_KEY',
  'ANTHROPIC_API_KEY',
  'sk-ant-xxx',
]);

function createAnthropicClient(): Anthropic {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });
}

/* ── Config status ────────────────────────────────────────────────────── */

function getConfigReason(): ConfigReason | null {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return 'missing_api_key';
  if (PLACEHOLDER_API_KEYS.has(apiKey)) return 'placeholder_api_key';
  return null;
}

export function getClaudeConfigStatus(): AppConfigStatus {
  const reason = getConfigReason();
  return reason
    ? { configured: false, reason, provider: 'claude', webSearchEnabled: isWebSearchEnabled() }
    : { configured: true, provider: 'claude', webSearchEnabled: isWebSearchEnabled() };
}

/* ── Error handling ───────────────────────────────────────────────────── */

export function getUserFacingClaudeError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof Anthropic.AuthenticationError) {
    return { code: 'auth_error', message: 'Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your environment.', status: 401 };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { code: 'rate_limit', message: 'Rate limit exceeded. Please wait a moment and try again.', status: 429 };
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 529) {
      return { code: 'overloaded', message: 'Claude is temporarily overloaded. Please try again shortly.', status: 503 };
    }
    return { code: 'api_error', message: error.message || 'An error occurred with the Claude API.', status: error.status || 500 };
  }
  if (error instanceof Error) {
    return { code: 'internal_error', message: error.message, status: 500 };
  }
  return { code: 'unknown_error', message: 'An unexpected error occurred.', status: 500 };
}

/* ── Complexity router ────────────────────────────────────────────────── */

const SIMPLE_PATTERNS = [
  /^[\s]*[好的对嗯是哦哈行嘻OK ok Ok oK yes no Yes No sure Sure 谢谢 谢了 thanks Thanks got it Got it 继续 next 没问题 可以 好嘞 好吧 明白 了解 知道了 收到 go ahead]+[\s!！。.？?]*$/i,
  /^.{0,12}$/,
];

const COMPLEX_SIGNALS = [
  /薪[资酬]|salary|compensation|package|待遇|年薪/i,
  /市场|market|行情|趋势|trend|竞争|竞品/i,
  /分析|analyz|strateg|方案|规划|plan/i,
  /JD|job\s*description|职位描述|岗位描述/i,
  /面试.*流程|interview.*process|评估.*标准/i,
  /拆分|split|restructur|重新定义|redefine/i,
  /建议.*薪|suggest.*salary|benchmark/i,
];

function classifyComplexity(message: string, history: HistoryMessage[]): 'simple' | 'complex' {
  const userMessageCount = history.filter((h) => h.role === 'user').length;
  if (userMessageCount === 0) return 'complex'; // First real message

  const trimmed = message.trim();
  if (SIMPLE_PATTERNS.some((p) => p.test(trimmed))) return 'simple';
  if (COMPLEX_SIGNALS.some((p) => p.test(trimmed))) return 'complex';
  if (trimmed.length > 80) return 'complex'; // Long messages usually need depth

  return 'complex'; // Conservative: default to Opus
}

/* ── Tool definitions ─────────────────────────────────────────────────── */

function buildTools(webSearchEnabled: boolean): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [
    {
      name: 'update_hiring_requirements',
      description: 'Update the live hiring requirements specification. Call this frequently as you gather information.',
      input_schema: {
        type: 'object' as const,
        properties: {
          jobTitle: { type: 'string', description: 'Job title' },
          department: { type: 'string', description: 'Department or team' },
          reportingLine: { type: 'string', description: 'Reports to' },
          roleType: { type: 'string', description: 'Full-time, part-time, contract, freelance' },
          headcount: { type: 'string', description: 'Number of positions' },
          primaryResponsibilities: { type: 'array', items: { type: 'string' }, description: 'Core responsibilities' },
          secondaryResponsibilities: { type: 'array', items: { type: 'string' }, description: 'Secondary duties' },
          hardSkills: { type: 'array', items: { type: 'string' }, description: 'Must-have technical skills' },
          softSkills: { type: 'array', items: { type: 'string' }, description: 'Must-have soft skills' },
          yearsOfExperience: { type: 'string', description: 'Required experience level' },
          education: { type: 'string', description: 'Education requirement' },
          industryExperience: { type: 'string', description: 'Industry background' },
          preferredQualifications: { type: 'array', items: { type: 'string' }, description: 'Nice-to-have qualifications' },
          salaryRange: { type: 'string', description: 'Compensation range' },
          equityBonus: { type: 'string', description: 'Equity or bonus structure' },
          benefits: { type: 'array', items: { type: 'string' }, description: 'Benefits offered' },
          workLocation: { type: 'string', description: 'Remote, hybrid, or on-site' },
          geographicRestrictions: { type: 'string', description: 'Location constraints' },
          startDate: { type: 'string', description: 'Target start date' },
          travelRequirements: { type: 'string', description: 'Travel expectations' },
          interviewStages: { type: 'array', items: { type: 'string' }, description: 'Interview process steps' },
          keyStakeholders: { type: 'array', items: { type: 'string' }, description: 'Decision makers' },
          timelineExpectations: { type: 'string', description: 'Hiring timeline' },
          teamCulture: { type: 'string', description: 'Team culture description' },
          reasonForOpening: { type: 'string', description: 'Why this role is open' },
          dealBreakers: { type: 'array', items: { type: 'string' }, description: 'Absolute disqualifiers' },
        },
      },
    },
    {
      name: 'suggest_next_steps',
      description: 'Provide 2-3 short actionable suggestion chips for the user. Call after EVERY response.',
      input_schema: {
        type: 'object' as const,
        properties: {
          suggestions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Short suggestion texts (max 20 CJK chars or 8 English words each)',
          },
        },
        required: ['suggestions'],
      },
    },
    {
      name: 'start_candidate_search',
      description: 'Search the RoboHire talent pool for matching candidates. Only call when the user explicitly wants to find candidates and the specification has at least a job title and some skills.',
      input_schema: {
        type: 'object' as const,
        properties: {
          searchCriteria: {
            type: 'object',
            description: 'Current hiring requirements to match against',
          },
          source: {
            type: 'string',
            enum: ['talent_pool', 'upload'],
            description: 'Where to search for candidates',
          },
        },
        required: ['searchCriteria'],
      },
    },
  ];

  if (webSearchEnabled) {
    tools.push({
      name: 'web_search',
      description: 'Search the web for real-time market data, salary benchmarks, industry trends, company information, or competitive intelligence. Use when current data would strengthen your advice.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'Search query — be specific (e.g. "AI engineer salary Beijing 2025" not just "salary")',
          },
        },
        required: ['query'],
      },
    });
  }

  return tools;
}

/* ── History normalization ────────────────────────────────────────────── */

function normalizeHistoryForClaude(history: HistoryMessage[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const h of history) {
    const role: 'user' | 'assistant' = h.role === 'model' ? 'assistant' : 'user';
    const text = h.text?.trim();
    if (!text) continue;

    // Merge consecutive same-role messages
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${text}`;
    } else {
      messages.push({ role, content: text });
    }
  }

  // Claude requires the first message to be from user
  if (messages.length > 0 && messages[0].role === 'assistant') {
    messages.shift();
  }

  // Ensure strict alternation: if two same-role messages remain, merge them
  const alternating: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    const last = alternating[alternating.length - 1];
    if (last && last.role === msg.role) {
      last.content = `${last.content}\n\n${msg.content}`;
    } else {
      alternating.push({ ...msg });
    }
  }

  return alternating;
}

/* ── Usage metrics ────────────────────────────────────────────────────── */

export interface ClaudeUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  durationMs: number;
}

/* ── Main streaming function ──────────────────────────────────────────── */

interface StreamChatOptions {
  history: HistoryMessage[];
  message: string;
  locale?: string;
  onEvent: (event: ChatStreamEvent) => void;
  onSearchRequested?: (criteria: Partial<HiringRequirements>, source: string) => Promise<string>;
}

export async function streamClaudeChatResponse({
  history,
  message,
  locale,
  onEvent,
  onSearchRequested,
}: StreamChatOptions): Promise<ClaudeUsageMetrics> {
  const startTime = Date.now();
  const client = createAnthropicClient();
  const webSearchEnabled = isWebSearchEnabled();

  // Complexity-based model routing
  const complexity = classifyComplexity(message, history);
  const modelId = complexity === 'simple' ? CLAUDE_MODELS.sonnet : CLAUDE_MODELS.opus;

  logger.info('CLAUDE_AGENT', 'Chat request', {
    complexity,
    model: modelId,
    historyLength: history.length,
    messageLength: message.length,
    locale,
    webSearchEnabled,
  });

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    locale,
    webSearchEnabled,
    provider: 'claude',
  });

  // Build tools
  const tools = buildTools(webSearchEnabled);

  // Normalize history and append current message
  const claudeMessages: Anthropic.MessageParam[] = normalizeHistoryForClaude(history);
  claudeMessages.push({ role: 'user', content: message });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let hasMoreTurns = true;
  let turnIndex = 0;

  while (hasMoreTurns) {
    hasMoreTurns = false;
    turnIndex++;
    const turnStart = Date.now();

    // Collect the full response to handle tool use
    let accumulatedText = '';
    const toolUseBlocks: Array<{ id: string; name: string; input: any }> = [];
    let currentToolUse: { id: string; name: string; inputJson: string } | null = null;

    logger.info('CLAUDE_AGENT', `LLM call — turn ${turnIndex}`, {
      model: modelId,
      messageCount: claudeMessages.length,
      toolCount: tools.length,
    });

    let stream: ReturnType<typeof client.messages.stream>;
    try {
      stream = client.messages.stream({
        model: modelId,
        max_tokens: 4096,
        system: systemPrompt,
        messages: claudeMessages,
        tools,
      });
    } catch (err) {
      logger.error('CLAUDE_AGENT', `LLM call failed — turn ${turnIndex}`, {
        model: modelId,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - turnStart,
      });
      throw err;
    }

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start': {
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: '',
              };
            }
            break;
          }

          case 'content_block_delta': {
            if (event.delta.type === 'text_delta') {
              accumulatedText += event.delta.text;
              onEvent({ type: 'text-delta', text: event.delta.text });
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              currentToolUse.inputJson += event.delta.partial_json;
            }
            break;
          }

          case 'content_block_stop': {
            if (currentToolUse) {
              let input: any = {};
              try {
                input = JSON.parse(currentToolUse.inputJson || '{}');
              } catch { /* empty */ }
              toolUseBlocks.push({
                id: currentToolUse.id,
                name: currentToolUse.name,
                input,
              });
              currentToolUse = null;
            }
            break;
          }

          case 'message_delta': {
            const usage = (event as any).usage;
            if (usage) {
              totalOutputTokens += usage.output_tokens || 0;
            }
            break;
          }

          case 'message_start': {
            const usage = (event as any).message?.usage;
            if (usage) {
              totalInputTokens += usage.input_tokens || 0;
            }
            break;
          }
        }
      }
    } catch (err) {
      logger.error('CLAUDE_AGENT', `LLM stream error — turn ${turnIndex}`, {
        model: modelId,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - turnStart,
        accumulatedTextLength: accumulatedText.length,
      });
      throw err;
    }

    const turnDuration = Date.now() - turnStart;
    logger.info('CLAUDE_AGENT', `LLM call completed — turn ${turnIndex}`, {
      model: modelId,
      durationMs: turnDuration,
      textLength: accumulatedText.length,
      toolCallCount: toolUseBlocks.length,
      toolNames: toolUseBlocks.map((b) => b.name),
    });

    // Process tool use blocks
    if (toolUseBlocks.length > 0) {
      const assistantContent: Anthropic.ContentBlockParam[] = [];
      if (accumulatedText) {
        assistantContent.push({ type: 'text', text: accumulatedText });
      }
      for (const block of toolUseBlocks) {
        assistantContent.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
      claudeMessages.push({ role: 'assistant', content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const toolStart = Date.now();
        let resultContent = 'success';
        let toolStatus: 'success' | 'error' = 'success';

        if (block.name === 'update_hiring_requirements') {
          const fieldCount = Object.keys(block.input || {}).length;
          logger.info('CLAUDE_AGENT', 'Tool: update_hiring_requirements', {
            fieldCount,
            fields: Object.keys(block.input || {}),
          });
          onEvent({
            type: 'requirements-update',
            data: block.input as Partial<HiringRequirements>,
          });
        } else if (block.name === 'suggest_next_steps') {
          const suggestions = block.input?.suggestions as string[] | undefined;
          logger.info('CLAUDE_AGENT', 'Tool: suggest_next_steps', {
            count: suggestions?.length || 0,
            suggestions: suggestions?.slice(0, 3),
          });
          if (suggestions?.length) {
            onEvent({ type: 'suggestions', data: suggestions.slice(0, 3) });
          }
        } else if (block.name === 'start_candidate_search') {
          const criteria = block.input?.searchCriteria || {};
          const source = block.input?.source || 'talent_pool';
          logger.info('CLAUDE_AGENT', 'Tool: start_candidate_search', {
            source,
            jobTitle: criteria.jobTitle,
            skillCount: (criteria.hardSkills?.length || 0) + (criteria.softSkills?.length || 0),
          });
          if (onSearchRequested) {
            try {
              resultContent = await onSearchRequested(criteria, source);
              logger.info('CLAUDE_AGENT', 'Tool: start_candidate_search completed', {
                durationMs: Date.now() - toolStart,
                resultPreview: resultContent.substring(0, 200),
              });
            } catch (err) {
              toolStatus = 'error';
              resultContent = `Search failed: ${err instanceof Error ? err.message : String(err)}`;
              logger.error('CLAUDE_AGENT', 'Tool: start_candidate_search failed', {
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - toolStart,
              });
            }
          } else {
            resultContent = 'Search function not available in this context.';
          }
        } else if (block.name === 'web_search') {
          const query = block.input?.query as string;
          if (query) {
            logger.info('CLAUDE_AGENT', 'Tool: web_search started', { query });
            onEvent({ type: 'web-search-started', data: { query } } as ChatStreamEvent);
            try {
              const searchResult = await searchWeb(query, { maxResults: 5, searchDepth: 'basic' });
              logger.info('CLAUDE_AGENT', 'Tool: web_search completed', {
                query,
                resultCount: searchResult.results.length,
                hasAnswer: !!searchResult.answer,
                durationMs: Date.now() - toolStart,
              });
              onEvent({
                type: 'web-search-completed',
                data: { query, resultCount: searchResult.results.length },
              } as ChatStreamEvent);

              const formatted = searchResult.results
                .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
                .join('\n\n');
              resultContent = searchResult.answer
                ? `Answer: ${searchResult.answer}\n\nSources:\n${formatted}`
                : `Search results:\n${formatted}`;
            } catch (err) {
              toolStatus = 'error';
              logger.error('CLAUDE_AGENT', 'Tool: web_search failed', {
                query,
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - toolStart,
              });
              onEvent({
                type: 'web-search-completed',
                data: { query, resultCount: 0 },
              } as ChatStreamEvent);
              resultContent = `Web search failed: ${err instanceof Error ? err.message : String(err)}. Use your training knowledge instead.`;
            }
          }
        } else {
          logger.warn('CLAUDE_AGENT', `Tool: unknown tool "${block.name}"`, { toolId: block.id });
        }

        if (toolStatus === 'error') {
          logger.warn('CLAUDE_AGENT', `Tool "${block.name}" returned error`, {
            durationMs: Date.now() - toolStart,
            resultPreview: resultContent.substring(0, 200),
          });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultContent,
        });
      }

      claudeMessages.push({ role: 'user', content: toolResults });
      hasMoreTurns = true;
      accumulatedText = '';
    }
  }

  const totalDuration = Date.now() - startTime;
  logger.info('CLAUDE_AGENT', 'Chat completed', {
    model: modelId,
    complexity,
    turns: turnIndex,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    durationMs: totalDuration,
  });

  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    model: modelId,
    durationMs: totalDuration,
  };
}
