import { Router, type Request, type Response } from 'express';
import {
  getGeminiConfigStatus,
  getUserFacingError,
  streamChatResponse,
  transcribeAudio,
  generateSpeech,
  type GeminiUsageMetrics,
} from '../services/GeminiAgentService.js';
import type { ChatStreamEvent, HistoryMessage } from '../types/agentAlex.js';
import { logger } from '../services/LoggerService.js';

const router = Router();

/** Log Gemini usage through the standard LoggerService so it appears in ApiRequestLog + LLMCallLog */
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
router.get('/config', (_req: Request, res: Response) => {
  res.json(getGeminiConfigStatus());
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

    const usage = await streamChatResponse({
      history,
      message,
      locale: typeof locale === 'string' ? locale : undefined,
      onEvent: writeEvent,
    });
    logGeminiUsage(req.requestId || 'unknown', '/agent-alex/chat/stream', usage);
    writeEvent({ type: 'done' });
  } catch (error) {
    const { code, message } = getUserFacingError(error);
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
    const { status, code, message } = getUserFacingError(error);
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
    const { status, code, message } = getUserFacingError(error);
    res.status(status).json({ error: { code, message } });
  }
});

export default router;
