import { Router, type Request, type Response } from 'express';
import {
  getGeminiConfigStatus,
  getUserFacingError as getGeminiError,
  streamChatResponse as streamGeminiChat,
  transcribeAudio,
  generateSpeech,
  type GeminiUsageMetrics,
} from '../services/GeminiAgentService.js';
import {
  getClaudeConfigStatus,
  getUserFacingClaudeError,
  streamClaudeChatResponse,
  type ClaudeUsageMetrics,
} from '../services/ClaudeAgentService.js';
import { isWebSearchEnabled } from '../services/WebSearchService.js';
import type { AgentAlexProvider, ChatStreamEvent, HiringRequirements, HistoryMessage } from '../types/agentAlex.js';
import { logger } from '../services/LoggerService.js';
import { executeInstantSearch } from '../services/InstantSearchMatchService.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

/* ── Provider resolution with DB cache ────────────────────────────────── */

let cachedProvider: { value: AgentAlexProvider; expiresAt: number } | null = null;

async function getActiveProvider(): Promise<AgentAlexProvider> {
  const now = Date.now();
  if (cachedProvider && cachedProvider.expiresAt > now) return cachedProvider.value;

  const envFallback = (process.env.AGENT_ALEX_PROVIDER as AgentAlexProvider) || 'gemini';
  try {
    const row = await prisma.appConfig.findUnique({ where: { key: 'agent_alex_provider' } });
    const value = (row?.value === 'claude' ? 'claude' : row?.value === 'gemini' ? 'gemini' : null)
      || envFallback;
    cachedProvider = { value, expiresAt: now + 30_000 };
    return value;
  } catch {
    // DB unavailable — cache env fallback to avoid retrying DB on every request
    cachedProvider = { value: envFallback, expiresAt: now + 10_000 };
    return envFallback;
  }
}

/* ── Usage logging ────────────────────────────────────────────────────── */

function logGeminiUsage(requestId: string, endpoint: string, usage: GeminiUsageMetrics, status: 'success' | 'error' = 'success', errorMessage?: string) {
  logger.logLLMCall({
    requestId,
    model: usage.model,
    provider: 'google-gemini',
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    duration: usage.durationMs,
    status,
    messages: undefined,
    options: { endpoint },
    responseText: undefined,
    errorMessage: errorMessage || undefined,
  });
}

function logClaudeUsage(requestId: string, endpoint: string, usage: ClaudeUsageMetrics, status: 'success' | 'error' = 'success', errorMessage?: string) {
  logger.logLLMCall({
    requestId,
    model: usage.model,
    provider: 'anthropic-claude',
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    duration: usage.durationMs,
    status,
    messages: undefined,
    options: { endpoint },
    responseText: undefined,
    errorMessage: errorMessage || undefined,
  });
}

function isHistoryMessageArray(value: unknown): value is HistoryMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        ('role' in item ? item.role === 'user' || item.role === 'model' : false) &&
        ('text' in item ? typeof item.text === 'string' : false),
    )
  );
}

// GET /api/v1/agent-alex/config
router.get('/config', async (_req: Request, res: Response) => {
  const provider = await getActiveProvider();
  const status = provider === 'claude' ? getClaudeConfigStatus() : getGeminiConfigStatus();
  res.json({
    ...status,
    provider,
    webSearchEnabled: isWebSearchEnabled(),
  });
});

// POST /api/v1/agent-alex/chat/stream
router.post('/chat/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const writeEvent = (event: ChatStreamEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const { history, message, locale } = req.body as {
      history?: unknown;
      message?: unknown;
      locale?: string;
    };

    if (!isHistoryMessageArray(history) || typeof message !== 'string' || !message.trim()) {
      writeEvent({
        type: 'error',
        code: 'invalid_request',
        message: 'Chat request must include a valid history array and a non-empty message.',
      });
      return;
    }

    const userId = req.user?.id;
    const provider = await getActiveProvider();
    const resolvedLocale = typeof locale === 'string' ? locale : undefined;

    const searchHandler = userId
      ? async (criteria: Partial<HiringRequirements>, source: string) => {
          if (source === 'upload') {
            return 'User wants to upload resumes. Please ask them to upload files.';
          }
          const result = await executeInstantSearch(
            {
              userId,
              requirements: criteria as HiringRequirements,
              requestId: req.requestId || undefined,
            },
            writeEvent,
          );
          if (result.error) return `Search failed: ${result.error}`;
          return `Search completed. Screened ${result.filteredCount} resumes from talent pool (${result.totalResumes} total). Found ${result.matchedCount} qualified candidates above threshold. Top candidate: ${result.candidates[0]?.name || 'none'} (${result.candidates[0]?.score || 0} points, ${result.candidates[0]?.grade || '-'}). Agent ID: ${result.agentId}`;
        }
      : undefined;

    logger.info('AGENT_ALEX', `Chat stream started — provider: ${provider}`, {
      requestId: req.requestId,
      provider,
      locale: resolvedLocale,
      historyLength: history.length,
      messageLength: message.length,
      userId,
    });

    if (provider === 'claude') {
      const usage = await streamClaudeChatResponse({
        history,
        message,
        locale: resolvedLocale,
        onEvent: writeEvent,
        onSearchRequested: searchHandler,
      });
      logClaudeUsage(req.requestId || 'unknown', '/agent-alex/chat/stream', usage);
      logger.info('AGENT_ALEX', 'Chat stream completed (Claude)', {
        requestId: req.requestId,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        durationMs: usage.durationMs,
      });
    } else {
      const usage = await streamGeminiChat({
        history,
        message,
        locale: resolvedLocale,
        onEvent: writeEvent,
        onSearchRequested: searchHandler,
      });
      logGeminiUsage(req.requestId || 'unknown', '/agent-alex/chat/stream', usage);
      logger.info('AGENT_ALEX', 'Chat stream completed (Gemini)', {
        requestId: req.requestId,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        durationMs: usage.durationMs,
      });
    }

    writeEvent({ type: 'done' });
  } catch (error) {
    const provider = (process.env.AGENT_ALEX_PROVIDER as AgentAlexProvider) || 'gemini';
    const errorHandler = provider === 'claude' ? getUserFacingClaudeError : getGeminiError;
    const { code, message } = errorHandler(error);
    logger.error('AGENT_ALEX', 'Chat stream failed', {
      requestId: req.requestId,
      provider,
      errorCode: code,
      errorMessage: message,
      error: error instanceof Error ? error.message : String(error),
    });
    writeEvent({ type: 'error', code, message });
  } finally {
    res.end();
  }
});

// POST /api/v1/agent-alex/transcribe
router.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType } = req.body as {
      audioBase64?: unknown;
      mimeType?: unknown;
    };

    if (typeof audioBase64 !== 'string' || typeof mimeType !== 'string') {
      res.status(400).json({
        error: {
          code: 'invalid_request',
          message: 'Transcription request must include audioBase64 and mimeType strings.',
        },
      });
      return;
    }

    const result = await transcribeAudio(audioBase64, mimeType);
    logGeminiUsage(req.requestId || 'unknown', '/agent-alex/transcribe', result.usage);
    res.json({ text: result.text });
  } catch (error) {
    const { status, code, message } = getGeminiError(error);
    res.status(status).json({ error: { code, message } });
  }
});

// POST /api/v1/agent-alex/tts
router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text } = req.body as { text?: unknown };

    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({
        error: {
          code: 'invalid_request',
          message: 'TTS request must include a non-empty text string.',
        },
      });
      return;
    }

    const result = await generateSpeech(text);
    logGeminiUsage(req.requestId || 'unknown', '/agent-alex/tts', result.usage);
    res.json({ audioBase64: result.audioBase64 });
  } catch (error) {
    const { status, code, message } = getGeminiError(error);
    res.status(status).json({ error: { code, message } });
  }
});

export default router;
