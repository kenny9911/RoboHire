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
import resumesRouter from './routes/resumes.js';
import atsRouter from './routes/ats.js';
import jobsRouter from './routes/jobs.js';
import matchingRouter from './routes/matching.js';
import interviewsRouter from './routes/interviews.js';
import activityRouter from './routes/activity.js';
import agentsRouter from './routes/agents.js';
import dashboardRouter from './routes/dashboard.js';
import gohireInterviewsRouter from './routes/gohireInterviews.js';
import teamsRouter from './routes/teams.js';
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
app.use('/api/v1/resumes', resumesRouter);
app.use('/api/v1/ats', atsRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/matching', matchingRouter);
app.use('/api/v1/interviews', interviewsRouter);
app.use('/api/v1/activity', activityRouter);
app.use('/api/v1/agents', agentsRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/gohire-interviews', gohireInterviewsRouter);
app.use('/api/v1/teams', teamsRouter);

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

// Start server
const server = app.listen(PORT, () => {
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
  console.log(`║  🗂️ Resume Originals:  ${originalResumeStorage.padEnd(56)}║`);
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
