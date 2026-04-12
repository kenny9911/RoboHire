// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Try root .env first (local dev), then backend/.env (Render / production)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Now import everything else
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';
import hiringRouter from './routes/hiring.js';
import hiringSessionsRouter from './routes/hiringSessions.js';
import hiringChatRouter from './routes/hiringChat.js';
import apiKeysRouter from './routes/apiKeys.js';
import usageRouter from './routes/usage.js';
import demoRouter from './routes/demo.js';
import checkoutRouter from './routes/checkout.js';
import adminRouter from './routes/admin.js';
import adminAgentManagerRouter from './routes/adminAgentManager.js';
import { requireAdminOrInternal } from './middleware/admin.js';
import { requireAuth as requireAuthMiddleware } from './middleware/auth.js';
import resumesRouter from './routes/resumes.js';
import atsRouter from './routes/ats.js';
import jobsRouter from './routes/jobs.js';
import matchingRouter from './routes/matching.js';
import interviewsRouter from './routes/interviews.js';
import activityRouter from './routes/activity.js';
import agentsRouter from './routes/agents.js';
import agentCriteriaPresetsRouter from './routes/agentCriteriaPresets.js';
import userRecruiterProfileRouter from './routes/userRecruiterProfile.js';
import candidateInteractionsRouter from './routes/candidateInteractions.js';
import dashboardRouter from './routes/dashboard.js';
import gohireInterviewsRouter from './routes/gohireInterviews.js';
import teamsRouter from './routes/teams.js';
import contactsRouter from './routes/contacts.js';
import tasksRouter from './routes/tasks.js';
import agentAlexRouter from './routes/agentAlex.js';
import agentAlexSessionsRouter from './routes/agentAlexSessions.js';
import llmProxyRouter from './routes/llmProxy.js';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer } from 'node:http';
import { Modality } from '@google/genai';
import {
  MODELS,
  SYSTEM_INSTRUCTION,
  createGeminiClient,
  getGeminiConfigStatus,
  getUserFacingError,
  normalizeHistory,
  updateRequirementsDeclaration,
  suggestNextStepsDeclaration,
} from './services/GeminiAgentService.js';
import type { HistoryMessage, LiveClientMessage, LiveServerMessage } from './types/agentAlex.js';
import { attachRequestId } from './middleware/requestId.js';
import { beginRequestLogging, persistRequestAudit } from './middleware/requestAudit.js';
import prisma from './lib/prisma.js';
import { logger } from './services/LoggerService.js';
import { documentStorage } from './services/DocumentStorageService.js';
import { resumeOriginalFileStorageService } from './services/ResumeOriginalFileStorageService.js';

const app = express();
const PORT = process.env.PORT || 4607;
const frontendUrlsFromEnv = (process.env.FRONTEND_URLS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const productionOrigins = [
  process.env.FRONTEND_URL || 'https://robohire.io',
  'https://robohire.io',
  'https://www.robohire.io',
  'https://api.robohire.io',
  ...frontendUrlsFromEnv,
  // Render static sites use *.onrender.com; include previews to avoid auth breakage on Render domains.
  /^https:\/\/[a-z0-9-]+\.onrender\.com$/i,
];

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? productionOrigins
    : ['http://localhost:3607', 'http://localhost:5173'],
  credentials: true,
}));
// Stripe webhook must receive raw body BEFORE express.json() parses it
app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(attachRequestId);
app.use(beginRequestLogging);
app.use(persistRequestAudit);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/v1', apiRouter);
app.use('/api/v1/hiring-requests', hiringRouter);
app.use('/api/v1/hiring-sessions', hiringSessionsRouter);
app.use('/api/v1/hiring-chat', hiringChatRouter);
app.use('/api/v1/api-keys', apiKeysRouter);
app.use('/api/v1/usage', usageRouter);
app.use('/api/v1/request-demo', demoRouter);
app.use('/api/v1', checkoutRouter);
app.use('/api/v1/admin', adminRouter);
// Agent Manager — admin has full access, internal role has read-only access.
// Mounted at its own path (not under /admin) so the router can apply its
// own middleware stack. Individual mutating handlers stack `requireAdmin`
// inline. See docs/admin-agent-manager-prd.md §4 Phase 4.
app.use('/api/v1/agent-manager', requireAuthMiddleware, requireAdminOrInternal, adminAgentManagerRouter);
app.use('/api/v1/resumes', resumesRouter);
app.use('/api/v1/ats', atsRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/matching', matchingRouter);
app.use('/api/v1/interviews', interviewsRouter);
app.use('/api/v1/activity', activityRouter);
// Mount preset router first so /agents/criteria-presets/* paths don't collide
// with the main agents router's /:id routes.
app.use('/api/v1/agents/criteria-presets', agentCriteriaPresetsRouter);
app.use('/api/v1/agents', agentsRouter);
app.use('/api/v1/user-recruiter-profile', userRecruiterProfileRouter);
app.use('/api/v1/candidate-interactions', candidateInteractionsRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/gohire-interviews', gohireInterviewsRouter);
app.use('/api/v1/teams', teamsRouter);
app.use('/api/v1/contacts', contactsRouter);
app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1/agent-alex', agentAlexRouter);
app.use('/api/v1/llm-proxy', llmProxyRouter);
app.use('/api/v1/agent-alex/sessions', agentAlexSessionsRouter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'RoboHire API',
    version: '1.0.0',
    description: 'AI-Powered Recruitment APIs',
    endpoints: {
      auth: {
        'POST /api/auth/signup': 'Register a new user',
        'POST /api/auth/login': 'Log in with email and password',
        'POST /api/auth/logout': 'Log out the current user',
        'GET /api/auth/me': 'Get current user profile',
        'GET /api/auth/google': 'Google OAuth login',
        'GET /api/auth/github': 'GitHub OAuth login',
        'GET /api/auth/linkedin': 'LinkedIn OAuth login',
      },
      api: {
        'POST /api/v1/match-resume': 'Match a resume against a job description',
        'POST /api/v1/invite-candidate': 'Generate interview invitation email',
        'POST /api/v1/parse-resume': 'Parse resume PDF to structured data',
        'POST /api/v1/parse-jd': 'Parse job description PDF to structured data',
        'POST /api/v1/evaluate-interview': 'Evaluate interview transcript',
        'GET /api/v1/health': 'Health check endpoint',
        'GET /api/v1/stats': 'Usage statistics',
      },
    },
  });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('SERVER', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// ── Agent Alex WebSocket (live voice) ──
const httpServer = createHttpServer(app);
const agentAlexWss = new WebSocketServer({ noServer: true });

function sendWsMessage(socket: WebSocket, message: LiveServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function isHistoryMessageArray(value: unknown): value is HistoryMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item && typeof item === 'object' &&
        ('role' in item ? item.role === 'user' || item.role === 'model' : false) &&
        ('text' in item ? typeof item.text === 'string' : false),
    )
  );
}

agentAlexWss.on('connection', (socket) => {
  const configStatus = getGeminiConfigStatus();
  if (!configStatus.configured) {
    sendWsMessage(socket, {
      type: 'error',
      code: configStatus.reason || 'missing_api_key',
      message: 'Gemini API key is not configured.',
    });
    socket.close(1011, 'Gemini is not configured.');
    return;
  }

  let liveSessionPromise: Promise<any> | null = null;
  let isClosed = false;

  const closeLiveSession = async () => {
    if (isClosed) return;
    isClosed = true;
    if (liveSessionPromise) {
      try {
        const s = await liveSessionPromise;
        s.close();
      } catch { /* ignore */ }
      liveSessionPromise = null;
    }
  };

  socket.on('message', async (rawData) => {
    try {
      const message = JSON.parse(rawData.toString()) as LiveClientMessage;

      if (message.type === 'init') {
        if (!isHistoryMessageArray(message.history) || liveSessionPromise) return;

        const ai = createGeminiClient();
        liveSessionPromise = ai.live.connect({
          model: MODELS.live,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: [updateRequirementsDeclaration, suggestNextStepsDeclaration] }],
          },
          callbacks: {
            onopen: () => {
              void liveSessionPromise?.then((liveSession) => {
                const history = normalizeHistory(message.history);
                if (history.length > 0) liveSession.sendClientContent({ turns: history });
                sendWsMessage(socket, { type: 'connected' });
              });
            },
            onmessage: (event: any) => {
              for (const part of event.serverContent?.modelTurn?.parts ?? []) {
                const audioData = 'inlineData' in part ? part.inlineData?.data : undefined;
                if (audioData) sendWsMessage(socket, { type: 'audio', data: audioData });
              }
              if (event.serverContent?.interrupted) sendWsMessage(socket, { type: 'interrupted' });
              const functionCalls = event.toolCall?.functionCalls;
              if (functionCalls?.length) {
                const functionResponses: any[] = [];
                for (const call of functionCalls) {
                  if (call.name === 'update_hiring_requirements' && call.args) {
                    sendWsMessage(socket, { type: 'requirements-update', data: call.args });
                    functionResponses.push({ id: call.id, name: call.name, response: { result: 'success' } });
                  } else if (call.name === 'suggest_next_steps' && call.args) {
                    // Suggestions not used in live voice mode — acknowledge silently
                    functionResponses.push({ id: call.id, name: call.name, response: { result: 'success' } });
                  }
                }
                if (functionResponses.length > 0) {
                  void liveSessionPromise?.then((s) => s.sendToolResponse({ functionResponses }));
                }
              }
            },
            onerror: (event: any) => {
              const { code, message } = getUserFacingError(event.error || event.message);
              sendWsMessage(socket, { type: 'error', code, message });
            },
            onclose: () => { if (socket.readyState === WebSocket.OPEN) socket.close(); },
          },
        });
        await liveSessionPromise;
        return;
      }

      if (message.type === 'audio') {
        if (!liveSessionPromise || typeof message.data !== 'string') return;
        const s = await liveSessionPromise;
        s.sendRealtimeInput({ audio: { data: message.data, mimeType: 'audio/pcm;rate=16000' } });
        return;
      }

      if (message.type === 'close') {
        await closeLiveSession();
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      }
    } catch (error) {
      const { code, message } = getUserFacingError(error);
      sendWsMessage(socket, { type: 'error', code, message });
    }
  });

  socket.on('close', () => void closeLiveSession());
  socket.on('error', () => void closeLiveSession());
});

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/api/v1/agent-alex/live') {
    agentAlexWss.handleUpgrade(request, socket, head, (ws) => {
      agentAlexWss.emit('connection', ws, request);
    });
  }
});

// Start server
const server = httpServer.listen(PORT, async () => {
  const logDir = logger.getLogDirectory();
  const docDir = documentStorage.getStorageDirectory();
  const docStats = documentStorage.getStats();
  const fileLogging = process.env.FILE_LOGGING !== 'false' ? 'Enabled' : 'Disabled';
  const originalResumeStorage = resumeOriginalFileStorageService.getProviderMode();
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           RoboHire API Server                                  ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  🚀 Server running on: http://localhost:${PORT}                                   ║`);
  console.log(`║  🤖 LLM Provider:      ${(process.env.LLM_PROVIDER || 'openrouter').padEnd(56)}║`);
  console.log(`║  📦 LLM Model:         ${(process.env.LLM_MODEL || 'google/gemini-3-flash-preview').padEnd(56)}║`);
  console.log(`║  🔊 TTS Provider:      ${(process.env.TTS_PROVIDER || 'none').padEnd(56)}║`);
  console.log(`║  🎵 TTS Model:         ${(process.env.TTS_MODEL || '-').padEnd(56)}║`);
  console.log(`║  🎤 TTS Voice ID:      ${(process.env.TTS_VOICE_ID || '-').padEnd(56)}║`);
  console.log(`║  📝 Log Level:         ${(process.env.LOG_LEVEL || 'INFO').padEnd(56)}║`);
  console.log(`║  📁 File Logging:      ${fileLogging.padEnd(56)}║`);
  console.log(`║  📂 Log Directory:     ${logDir.padEnd(56)}║`);
  console.log(`║  📄 Document Storage:  ${docDir.padEnd(56)}║`);
  console.log(`║  🗂️  Resume Originals:  ${originalResumeStorage.padEnd(56)}║`);
  console.log(`║  📊 Cached Documents:  ${`${docStats.resumeCount} resumes, ${docStats.jdCount} JDs, ${docStats.matchResultCount} matches`.padEnd(56)}║`);
  console.log('╠════════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                                                    ║');
  console.log('║    POST /api/v1/match-resume      - Match resume against JD                    ║');
  console.log('║    POST /api/v1/invite-candidate  - Generate invitation email                  ║');
  console.log('║    POST /api/v1/parse-resume      - Parse resume PDF (cached)                  ║');
  console.log('║    POST /api/v1/parse-jd          - Parse JD PDF (cached)                      ║');
  console.log('║    POST /api/v1/evaluate-interview- Evaluate interview transcript              ║');
  console.log('║    GET  /api/v1/health            - Health check + stats                       ║');
  console.log('║    GET  /api/v1/stats             - Detailed usage statistics                  ║');
  console.log('║    GET  /api/v1/documents         - List cached documents                      ║');
  console.log('║    GET  /api/v1/logs              - Log file information                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  logger.info('SERVER', 'RoboHire API server started', {
    port: PORT,
    provider: process.env.LLM_PROVIDER,
    model: process.env.LLM_MODEL,
    logLevel: process.env.LOG_LEVEL || 'INFO',
    fileLogging,
    logDir,
    docDir,
    originalResumeStorage,
    cachedResumes: docStats.resumeCount,
    cachedJDs: docStats.jdCount,
  });

  // Phase 4 — start the in-process AgentScheduler after the HTTP server is up.
  // Runs a missed-run catch-up pass on boot and registers cron tasks for all
  // active scheduled agents.
  try {
    const { agentScheduler } = await import('./services/AgentSchedulerService.js');
    await agentScheduler.init();
  } catch (err) {
    logger.warn('SERVER', 'AgentScheduler init failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // admin-agent-manager-prd §5 Track A — sweep zombie AgentRun rows left
  // over from a prior process lifecycle, then start the runtime watchdog
  // cron so any future hangs are caught within ~22 minutes worst case.
  try {
    const { agentRunWatchdog } = await import('./services/AgentRunWatchdogService.js');
    const result = await agentRunWatchdog.bootSweep();
    if (result.swept > 0) {
      logger.info('SERVER', 'Boot sweep reaped zombie agent runs', { swept: result.swept });
    }
    agentRunWatchdog.start();
  } catch (err) {
    logger.warn('SERVER', 'Agent run watchdog init failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the existing RoboHire dev server with ` +
      '`npm run services:stop` and retry.',
    );
    process.exit(1);
  }

  throw error;
});

let isShuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('SERVER', `Received ${signal}, shutting down...`);
  logger.printGlobalStats();

  const forceExitTimer = setTimeout(() => {
    logger.warn('SERVER', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  // Stop the agent scheduler + run watchdog before closing the HTTP server
  // so no new runs are triggered mid-shutdown and the cron timer is cleared.
  try {
    const { agentScheduler } = await import('./services/AgentSchedulerService.js');
    agentScheduler.shutdown();
  } catch {
    /* ignore — module may not have loaded if server failed early */
  }
  try {
    const { agentRunWatchdog } = await import('./services/AgentRunWatchdogService.js');
    agentRunWatchdog.stop();
  } catch {
    /* ignore */
  }

  server.close(async () => {
    clearTimeout(forceExitTimer);

    try {
      await prisma.$disconnect();
    } catch (error) {
      logger.warn('SERVER', 'Prisma disconnect failed during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.shutdown();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

export default app;
