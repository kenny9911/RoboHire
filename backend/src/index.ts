// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Now import everything else
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';
import hiringRouter from './routes/hiring.js';
import { logger } from './services/LoggerService.js';
import { documentStorage } from './services/DocumentStorageService.js';

const app = express();
const PORT = process.env.PORT || 4607;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:3607', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/v1', apiRouter);
app.use('/api/v1/hiring-requests', hiringRouter);

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
app.listen(PORT, () => {
  const logDir = logger.getLogDirectory();
  const docDir = documentStorage.getStorageDirectory();
  const docStats = documentStorage.getStats();
  const fileLogging = process.env.FILE_LOGGING !== 'false' ? 'Enabled' : 'Disabled';
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           RoboHire API Server                                    ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  🚀 Server running on: http://localhost:${PORT}                                    ║`);
  console.log(`║  🤖 LLM Provider:      ${(process.env.LLM_PROVIDER || 'openrouter').padEnd(54)}║`);
  console.log(`║  📦 LLM Model:         ${(process.env.LLM_MODEL || 'google/gemini-3-flash-preview').padEnd(54)}║`);
  console.log(`║  📝 Log Level:         ${(process.env.LOG_LEVEL || 'INFO').padEnd(54)}║`);
  console.log(`║  📁 File Logging:      ${fileLogging.padEnd(54)}║`);
  console.log(`║  📂 Log Directory:     ${logDir.padEnd(54)}║`);
  console.log(`║  📄 Document Storage:  ${docDir.padEnd(54)}║`);
  console.log(`║  📊 Cached Documents:  ${`${docStats.resumeCount} resumes, ${docStats.jdCount} JDs, ${docStats.matchResultCount} matches`.padEnd(54)}║`);
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
    cachedResumes: docStats.resumeCount,
    cachedJDs: docStats.jdCount,
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('SERVER', 'Shutting down gracefully...');
  logger.printGlobalStats();
  logger.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('SERVER', 'Received SIGTERM, shutting down...');
  logger.printGlobalStats();
  logger.shutdown();
  process.exit(0);
});

export default app;
