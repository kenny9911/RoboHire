import { Router } from 'express';
import type { HiringSession } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { recruitmentConsultantAgent } from '../agents/RecruitmentConsultantAgent.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import type { Message } from '../types/index.js';

const router = Router();

interface ChatRequestBody {
  message?: string;
  sessionId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
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
  };
}

const MAX_HISTORY_MESSAGES = 16;
const MAX_JOB_DESCRIPTION_CHARS = 6000;

router.post('/', optionalAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  logger.startRequest(requestId, '/api/v1/hiring-chat', 'POST');

  try {
    const { message, sessionId, history, context }: ChatRequestBody = req.body;
    const trimmedMessage = (message || '').trim();

    if (!trimmedMessage) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    let session: HiringSession | null = null;
    const userId = req.user?.id;

    if (sessionId) {
      if (!userId) {
        logger.endRequest(requestId, 'error', 401);
        return res.status(401).json({
          success: false,
          error: 'Authentication required to use a session',
        });
      }

      session = await prisma.hiringSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        logger.endRequest(requestId, 'error', 404);
        return res.status(404).json({
          success: false,
          error: 'Hiring session not found',
        });
      }
    }

    const timestamp = new Date().toISOString();
    const userMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      role: 'user' as const,
      content: trimmedMessage,
      timestamp,
    };

    const existingMessages = session ? ((session.messages as any[]) || []) : [];
    const mergedMessages = session ? [...existingMessages, userMessage] : existingMessages;

    if (session) {
      const updatedTitle = session.title || trimmedMessage.substring(0, 50) + (trimmedMessage.length > 50 ? '...' : '');
      await prisma.hiringSession.update({
        where: { id: session.id },
        data: {
          messages: mergedMessages,
          title: updatedTitle,
        },
      });
    }

    logger.info('HIRING_CHAT', 'User message received', {
      sessionId: session?.id,
      role: 'user',
      messageId: userMessage.id,
      timestamp,
      content: trimmedMessage,
      contentLength: trimmedMessage.length,
      hasSession: Boolean(session),
    }, requestId);

    const historyMessages: Message[] = (session ? mergedMessages : (history || []))
      .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string')
      .slice(-MAX_HISTORY_MESSAGES)
      .map((entry) => ({ role: entry.role, content: entry.content }));

    const cleanedContext = {
      ...context,
      jobDescription: context?.jobDescription
        ? context.jobDescription.slice(0, MAX_JOB_DESCRIPTION_CHARS)
        : undefined,
    };

    const { reply, action } = await recruitmentConsultantAgent.chat({
      history: historyMessages,
      message: trimmedMessage,
      context: cleanedContext,
      requestId,
    });

    const assistantMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      role: 'assistant' as const,
      content: reply,
      timestamp: new Date().toISOString(),
    };

    if (session) {
      await prisma.hiringSession.update({
        where: { id: session.id },
        data: {
          messages: [...mergedMessages, assistantMessage],
        },
      });
    }

    logger.info('HIRING_CHAT', 'Assistant response sent', {
      sessionId: session?.id,
      role: 'assistant',
      messageId: assistantMessage.id,
      timestamp: assistantMessage.timestamp,
      content: reply,
      contentLength: reply.length,
      action,
    }, requestId);

    logger.endRequest(requestId, 'success', 200);

    return res.json({
      success: true,
      data: {
        message: assistantMessage,
        action,
        sessionId: session?.id,
      },
    });
  } catch (error) {
    logger.error('HIRING_CHAT', 'Chat request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);

    logger.endRequest(requestId, 'error', 500);

    return res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
    });
  }
});

export default router;
