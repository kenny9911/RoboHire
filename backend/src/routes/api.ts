import { Router, Request, Response } from 'express';
import multer from 'multer';
import { resumeMatchAgent } from '../agents/ResumeMatchAgent.js';
import { inviteAgent } from '../agents/InviteAgent.js';
import { resumeParseAgent } from '../agents/ResumeParseAgent.js';
import { jdParseAgent } from '../agents/JDParseAgent.js';
import { evaluationAgent } from '../agents/EvaluationAgent.js';
import { pdfService } from '../services/PDFService.js';
import { logger } from '../services/LoggerService.js';
import { documentStorage } from '../services/DocumentStorageService.js';
import { requireAuth, requireScopes } from '../middleware/auth.js';
import { trackUsage } from '../middleware/usageTracker.js';
import { apiRateLimit } from '../middleware/rateLimiter.js';
import {
  MatchResumeRequest,
  InviteCandidateRequest,
  EvaluateInterviewRequest,
  APIResponse,
} from '../types/index.js';

const router = Router();

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * POST /api/v1/match-resume
 * Match a resume against a job description
 */
router.post('/match-resume', requireAuth, requireScopes('write'), apiRateLimit(), trackUsage, async (req: Request, res: Response) => {
  const requestId = req.requestId!;
  logger.startRequest(requestId, '/api/v1/match-resume', 'POST');

  try {
    const { resume, jd } = req.body as MatchResumeRequest;

    // Step 1: Validate input
    const validateStep = logger.startStep(requestId, 'Validate input');
    if (!resume || !jd) {
      logger.endStep(requestId, validateStep, 'failed');
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Both resume and jd fields are required',
        requestId,
      } as APIResponse<null>);
    }
    logger.endStep(requestId, validateStep, 'completed', {
      resumeLength: resume.length,
      jdLength: jd.length,
    });

    // Step 2: Execute agent
    const result = await resumeMatchAgent.match(resume, jd, requestId);

    // Step 3: Save match result
    const saveStep = logger.startStep(requestId, 'Save match result');
    const stored = documentStorage.saveMatchResult(result, requestId);
    logger.endStep(requestId, saveStep, 'completed', {
      filename: stored.savedFilename,
      candidateName: stored.candidateName,
      jobTitle: stored.jobTitle,
    });

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: result,
      requestId,
      savedAs: stored.savedFilename,
    });
  } catch (error) {
    logger.error('API', 'match-resume failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      requestId,
    } as APIResponse<null>);
  }
});

/**
 * POST /api/v1/invite-candidate
 * Send interview invitation via RoboHire 一键邀约 API
 */
router.post('/invite-candidate', requireAuth, requireScopes('write'), apiRateLimit(), trackUsage, async (req: Request, res: Response) => {
  const requestId = req.requestId!;
  logger.startRequest(requestId, '/api/v1/invite-candidate', 'POST');

  try {
    const { resume, jd, recruiter_email, interviewer_requirement } = req.body as InviteCandidateRequest;

    // Step 1: Validate input
    const validateStep = logger.startStep(requestId, 'Validate input');
    if (!resume || !jd) {
      logger.endStep(requestId, validateStep, 'failed');
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Both resume and jd fields are required',
        requestId,
      } as APIResponse<null>);
    }
    logger.endStep(requestId, validateStep, 'completed', {
      resumeLength: resume.length,
      jdLength: jd.length,
      hasRecruiterEmail: !!recruiter_email,
      hasInterviewerRequirement: !!interviewer_requirement,
    });

    // Step 2: Call RoboHire 一键邀约 API
    const result = await inviteAgent.generateInvitation(
      resume,
      jd,
      requestId,
      recruiter_email,
      interviewer_requirement
    );

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: result,
      requestId,
    });
  } catch (error) {
    logger.error('API', 'invite-candidate failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      requestId,
    } as APIResponse<null>);
  }
});

/**
 * POST /api/v1/parse-resume
 * Parse a resume PDF and extract structured data
 */
router.post('/parse-resume', requireAuth, requireScopes('write'), apiRateLimit(), trackUsage, upload.single('file'), async (req: Request, res: Response) => {
  const requestId = req.requestId!;
  logger.startRequest(requestId, '/api/v1/parse-resume', 'POST');

  try {
    // Step 1: Validate file
    const validateStep = logger.startStep(requestId, 'Validate file upload');
    if (!req.file) {
      logger.endStep(requestId, validateStep, 'failed');
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'PDF file is required',
        requestId,
      } as APIResponse<null>);
    }
    logger.endStep(requestId, validateStep, 'completed', {
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });

    // Step 2: Extract text from PDF
    const pdfStep = logger.startStep(requestId, 'Extract text from PDF');
    const pdfStartTime = Date.now();
    const text = await pdfService.extractText(req.file.buffer);
    const pdfDuration = Date.now() - pdfStartTime;

    if (!text || text.trim().length === 0) {
      logger.endStep(requestId, pdfStep, 'failed');
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Could not extract text from PDF. The file may be empty or corrupted.',
        requestId,
      } as APIResponse<null>);
    }
    
    logger.logPDFParse(requestId, req.file.size, text.length, pdfDuration);
    logger.endStep(requestId, pdfStep, 'completed', {
      extractedChars: text.length,
    });

    // Step 3: Check if resume already exists in storage
    const cacheStep = logger.startStep(requestId, 'Check document cache');
    const existingResume = documentStorage.findExistingResume(text);
    
    if (existingResume) {
      logger.endStep(requestId, cacheStep, 'completed', { cached: true, id: existingResume.id });
      logger.endRequest(requestId, 'success', 200);
      return res.json({
        success: true,
        data: existingResume.data,
        cached: true,
        documentId: existingResume.id,
        requestId,
      });
    }
    logger.endStep(requestId, cacheStep, 'completed', { cached: false });

    // Step 4: Parse the resume text with LLM
    const result = await resumeParseAgent.parse(text, requestId);

    // Step 5: Save parsed resume to storage
    const saveStep = logger.startStep(requestId, 'Save to document storage');
    const stored = documentStorage.saveResume(text, result, req.file.originalname, requestId);
    logger.endStep(requestId, saveStep, 'completed', { id: stored.id, filename: stored.savedFilename });

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: result,
      cached: false,
      documentId: stored.id,
      savedAs: stored.savedFilename,
      requestId,
    });
  } catch (error) {
    logger.error('API', 'parse-resume failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      requestId,
    } as APIResponse<null>);
  }
});

/**
 * POST /api/v1/parse-jd
 * Parse a job description PDF and extract structured data
 */
router.post('/parse-jd', requireAuth, requireScopes('write'), apiRateLimit(), trackUsage, upload.single('file'), async (req: Request, res: Response) => {
  const requestId = req.requestId!;
  logger.startRequest(requestId, '/api/v1/parse-jd', 'POST');

  try {
    // Step 1: Validate file
    const validateStep = logger.startStep(requestId, 'Validate file upload');
    if (!req.file) {
      logger.endStep(requestId, validateStep, 'failed');
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'PDF file is required',
        requestId,
      } as APIResponse<null>);
    }
    logger.endStep(requestId, validateStep, 'completed', {
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });

    // Step 2: Extract text from PDF
    const pdfStep = logger.startStep(requestId, 'Extract text from PDF');
    const pdfStartTime = Date.now();
    const text = await pdfService.extractText(req.file.buffer);
    const pdfDuration = Date.now() - pdfStartTime;

    if (!text || text.trim().length === 0) {
      logger.endStep(requestId, pdfStep, 'failed');
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Could not extract text from PDF. The file may be empty or corrupted.',
        requestId,
      } as APIResponse<null>);
    }
    
    logger.logPDFParse(requestId, req.file.size, text.length, pdfDuration);
    logger.endStep(requestId, pdfStep, 'completed', {
      extractedChars: text.length,
    });

    // Step 3: Check if JD already exists in storage
    const cacheStep = logger.startStep(requestId, 'Check document cache');
    const existingJD = documentStorage.findExistingJD(text);
    
    if (existingJD) {
      logger.endStep(requestId, cacheStep, 'completed', { cached: true, id: existingJD.id });
      logger.endRequest(requestId, 'success', 200);
      return res.json({
        success: true,
        data: existingJD.data,
        cached: true,
        documentId: existingJD.id,
        requestId,
      });
    }
    logger.endStep(requestId, cacheStep, 'completed', { cached: false });

    // Step 4: Parse the JD text with LLM
    const result = await jdParseAgent.parse(text, requestId);

    // Step 5: Save parsed JD to storage
    const saveStep = logger.startStep(requestId, 'Save to document storage');
    const stored = documentStorage.saveJD(text, result, req.file.originalname, requestId);
    logger.endStep(requestId, saveStep, 'completed', { id: stored.id, filename: stored.savedFilename });

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: result,
      cached: false,
      documentId: stored.id,
      savedAs: stored.savedFilename,
      requestId,
    });
  } catch (error) {
    logger.error('API', 'parse-jd failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      requestId,
    } as APIResponse<null>);
  }
});

/**
 * POST /api/v1/evaluate-interview
 * Evaluate an interview transcript
 * Optional: include_cheating_detection (boolean) - Run cheating detection analysis
 * Optional: user_instructions (string) - Special instructions for evaluation
 */
router.post('/evaluate-interview', requireAuth, requireScopes('write'), apiRateLimit(), trackUsage, async (req: Request, res: Response) => {
  const requestId = req.requestId!;
  logger.startRequest(requestId, '/api/v1/evaluate-interview', 'POST');

  try {
    const { 
      resume, 
      jd, 
      interviewScript,
      includeCheatingDetection,
      userInstructions 
    } = req.body as EvaluateInterviewRequest;

    // Step 1: Validate input
    const validateStep = logger.startStep(requestId, 'Validate input');
    if (!resume || !jd || !interviewScript) {
      logger.endStep(requestId, validateStep, 'failed');
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'resume, jd, and interviewScript fields are all required',
        requestId,
      } as APIResponse<null>);
    }
    logger.endStep(requestId, validateStep, 'completed', {
      resumeLength: resume.length,
      jdLength: jd.length,
      scriptLength: interviewScript.length,
      includeCheatingDetection: !!includeCheatingDetection,
      hasUserInstructions: !!userInstructions,
    });

    // Step 2: Execute agent with optional cheating detection
    const result = await evaluationAgent.evaluate(
      resume, 
      jd, 
      interviewScript,
      {
        includeCheatingDetection: !!includeCheatingDetection,
        userInstructions,
      },
      requestId
    );

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: result,
      requestId,
      cheatingDetectionIncluded: !!includeCheatingDetection,
    });
  } catch (error) {
    logger.error('API', 'evaluate-interview failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      requestId,
    } as APIResponse<null>);
  }
});

/**
 * GET /api/v1/health
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  const stats = logger.getGlobalStats();
  return res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      provider: process.env.LLM_PROVIDER || 'openrouter',
      model: process.env.LLM_MODEL || 'google/gemini-3-flash-preview',
      stats: {
        totalRequests: stats.totalRequests,
        totalLLMCalls: stats.totalLLMCalls,
        totalTokens: stats.totalTokens,
        totalCost: `$${stats.totalCost.toFixed(4)}`,
      },
    },
  });
});

/**
 * GET /api/v1/stats
 * Get detailed usage statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  const stats = logger.getGlobalStats();
  logger.printGlobalStats();
  return res.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/v1/documents
 * List all stored parsed documents and match results
 */
router.get('/documents', (_req: Request, res: Response) => {
  try {
    const stats = documentStorage.getStats();
    const jds = documentStorage.listJDs();
    const resumes = documentStorage.listResumes();
    const matchResults = documentStorage.listMatchResults();
    
    return res.json({
      success: true,
      data: {
        stats,
        jds: jds.map(jd => ({
          id: jd.id,
          hash: jd.hash,
          originalFilename: jd.originalFilename,
          savedFilename: jd.savedFilename,
          parsedAt: jd.parsedAt,
          title: jd.data.title,
          company: jd.data.company,
          preview: jd.rawTextPreview,
        })),
        resumes: resumes.map(r => ({
          id: r.id,
          hash: r.hash,
          originalFilename: r.originalFilename,
          savedFilename: r.savedFilename,
          parsedAt: r.parsedAt,
          name: r.data.name,
          email: r.data.email,
          preview: r.rawTextPreview,
        })),
        matchResults: matchResults.map(m => ({
          id: m.id,
          savedFilename: m.savedFilename,
          matchedAt: m.matchedAt,
          candidateName: m.candidateName,
          jobTitle: m.jobTitle,
          overallScore: m.overallScore,
          grade: m.grade,
          recommendation: m.recommendation,
          requestId: m.requestId,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list documents',
    });
  }
});

/**
 * GET /api/v1/logs
 * Get log file information
 */
router.get('/logs', async (_req: Request, res: Response) => {
  try {
    const fs = await import('fs');
    const logPaths = logger.getLogFilePaths();
    const logDir = logger.getLogDirectory();
    
    const getFileInfo = (filePath: string) => {
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          return {
            path: filePath,
            exists: true,
            size: stats.size,
            sizeFormatted: stats.size < 1024 
              ? `${stats.size} B` 
              : stats.size < 1024 * 1024 
                ? `${(stats.size / 1024).toFixed(2)} KB`
                : `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
            lastModified: stats.mtime.toISOString(),
          };
        }
        return { path: filePath, exists: false };
      } catch {
        return { path: filePath, exists: false, error: 'Unable to read file info' };
      }
    };

    return res.json({
      success: true,
      data: {
        logDirectory: logDir,
        fileLoggingEnabled: process.env.FILE_LOGGING !== 'false',
        files: {
          all: getFileInfo(logPaths.all),
          error: getFileInfo(logPaths.error),
          llm: getFileInfo(logPaths.llm),
          requests: getFileInfo(logPaths.requests),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get log info',
    });
  }
});

export default router;
