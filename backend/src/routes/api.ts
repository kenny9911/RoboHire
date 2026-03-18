import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { resumeMatchAgent } from '../agents/ResumeMatchAgent.js';
import { inviteAgent } from '../agents/InviteAgent.js';
import { resumeParseAgent } from '../agents/ResumeParseAgent.js';
import { jdParseAgent } from '../agents/JDParseAgent.js';
import { evaluationAgent } from '../agents/EvaluationAgent.js';
import { resumeFormatAgent } from '../agents/ResumeFormatAgent.js';
import { jdFormatAgent } from '../agents/JDFormatAgent.js';
import { pdfService } from '../services/PDFService.js';
import { documentParsingService, DocumentParsingService } from '../services/DocumentParsingService.js';
import { logger } from '../services/LoggerService.js';
import { documentStorage } from '../services/DocumentStorageService.js';
import { getOrParseResume, computeResumeHash } from '../services/ResumeParsingCache.js';
import { requireAuth, requireScopes, optionalAuth } from '../middleware/auth.js';
import { trackUsage } from '../middleware/usageTracker.js';
import { apiRateLimit } from '../middleware/rateLimiter.js';
import { checkUsageLimit, checkBatchUsage } from '../middleware/usageMeter.js';
import prisma from '../lib/prisma.js';
import {
  MatchResumeRequest,
  InviteCandidateRequest,
  EvaluateInterviewRequest,
  APIResponse,
} from '../types/index.js';

function computeContentHash(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

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

// Multer for multi-format uploads (PDF, DOCX, XLSX, TXT)
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (DocumentParsingService.isAcceptedUpload(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Accepted: PDF, DOCX, XLSX, TXT, MD, JSON'));
    }
  },
});

/**
 * POST /api/v1/match-resume
 * Match a resume against a job description
 */
router.post('/match-resume', requireAuth, requireScopes('write'), apiRateLimit(), checkUsageLimit('match'), trackUsage, async (req: Request, res: Response) => {
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
    const result = await resumeMatchAgent.match({ resume, jd }, requestId);

    // Step 3: Save match result
    const saveStep = logger.startStep(requestId, 'Save match result');
    const stored = documentStorage.saveMatchResult(result, requestId);
    logger.endStep(requestId, saveStep, 'completed', {
      filename: stored.savedFilename,
      candidateName: stored.candidateName,
      jobTitle: stored.jobTitle,
    });

    req.payloadCapture = {
      requestPayload: {
        resumePreview: resume.slice(0, 10000),
        resumeLength: resume.length,
        jdPreview: jd.slice(0, 10000),
        jdLength: jd.length,
      },
      responsePayload: result as unknown as Record<string, unknown>,
    };

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
router.post('/invite-candidate', requireAuth, requireScopes('write'), apiRateLimit(), checkUsageLimit('interview'), trackUsage, async (req: Request, res: Response) => {
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

    req.payloadCapture = {
      requestPayload: {
        resumePreview: resume.slice(0, 10000),
        resumeLength: resume.length,
        jdPreview: jd.slice(0, 10000),
        jdLength: jd.length,
        recruiter_email: recruiter_email || null,
        interviewer_requirement: interviewer_requirement || null,
      },
      responsePayload: result as unknown as Record<string, unknown>,
    };

    // Step 3: Persist resume, hiring request, and invitation to database
    let resumeId: string | undefined;
    let hiringRequestId: string | undefined;
    let interviewAccessToken: string | undefined;
    if (req.user?.id) {
      try {
        const userId = req.user.id;
        const persistStep = logger.startStep(requestId, 'Persist invitation data');

        // Parse resume with AI (DB cache first, then LLM)
        const { parsedData: parsed } = await getOrParseResume(resume, userId, requestId);

        // Upsert Resume record (dedup by content hash)
        const contentHash = computeContentHash(resume);
        const resumeRecord = await prisma.resume.upsert({
          where: { userId_contentHash: { userId, contentHash } },
          create: {
            userId,
            name: parsed.name || result.name || 'Unknown',
            email: parsed.email || result.email || null,
            phone: parsed.phone || null,
            currentRole: (parsed.experience as Array<{ role?: string }>)?.[0]?.role || null,
            resumeText: resume,
            parsedData: JSON.parse(JSON.stringify(parsed)),
            contentHash,
            source: 'quick-invite',
          },
          update: {},
        });
        resumeId = resumeRecord.id;

        // Find or create HiringRequest from JD (dedup by exact JD content)
        let hiringRequest = await prisma.hiringRequest.findFirst({
          where: { userId, jobDescription: jd.trim() },
          select: { id: true, title: true },
        });
        if (!hiringRequest) {
          hiringRequest = await prisma.hiringRequest.create({
            data: {
              userId,
              title: result.job_title || 'Quick Invite Position',
              requirements: jd.trim(),
              jobDescription: jd.trim(),
            },
            select: { id: true, title: true },
          });
        }
        hiringRequestId = hiringRequest.id;

        // Upsert ResumeJobFit with invited status
        await prisma.resumeJobFit.upsert({
          where: {
            resumeId_hiringRequestId: {
              resumeId: resumeRecord.id,
              hiringRequestId: hiringRequest.id,
            },
          },
          create: {
            resumeId: resumeRecord.id,
            hiringRequestId: hiringRequest.id,
            pipelineStatus: 'invited',
            invitedAt: new Date(),
            inviteData: JSON.parse(JSON.stringify(result)),
          },
          update: {
            pipelineStatus: 'invited',
            invitedAt: new Date(),
            inviteData: JSON.parse(JSON.stringify(result)),
          },
        });

        const accessToken = crypto.randomBytes(32).toString('hex');
        interviewAccessToken = accessToken;

        // Create Interview record linked to resume & hiring request
        await prisma.interview.create({
          data: {
            userId,
            hiringRequestId: hiringRequest.id,
            resumeId: resumeRecord.id,
            candidateName: parsed.name || result.name || 'Unknown',
            candidateEmail: parsed.email || result.email || null,
            jobTitle: result.job_title || hiringRequest.title || 'Interview',
            status: 'scheduled',
            type: 'ai_video',
            accessToken,
            gohireUserId: result.user_id != null ? String(result.user_id) : null,
            metadata: {
              inviteData: JSON.parse(JSON.stringify(result)),
              loginUrl: result.login_url,
              qrcodeUrl: result.qrcode_url,
            },
          },
        });

        logger.endStep(requestId, persistStep, 'completed', {
          resumeId: resumeRecord.id,
          hiringRequestId: hiringRequest.id,
        });
      } catch (persistError) {
        // Log but don't fail the invitation — persistence is best-effort
        logger.error('API', 'invite-candidate persistence failed', {
          error: persistError instanceof Error ? persistError.message : String(persistError),
        }, requestId);
      }
    }

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: { ...result, resumeId, hiringRequestId, accessToken: interviewAccessToken },
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
router.post('/parse-resume', requireAuth, requireScopes('write'), apiRateLimit(), upload.single('file'), async (req: Request, res: Response) => {
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
    const text = await pdfService.extractText(req.file.buffer, requestId);
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

    // Step 3: Check DB cache first, then parse via LLM if needed
    const cacheStep = logger.startStep(requestId, 'Check DB resume cache');
    const userId = req.user?.id || null;
    const { parsedData: result, cached } = await getOrParseResume(text, userId, requestId);
    logger.endStep(requestId, cacheStep, 'completed', { cached });

    // Step 4: Save to file-based storage as well (for backward compat)
    let documentId: string | undefined;
    let savedAs: string | undefined;
    if (!cached) {
      const saveStep = logger.startStep(requestId, 'Save to document storage');
      const stored = documentStorage.saveResume(text, result, req.file.originalname, requestId);
      documentId = stored.id;
      savedAs = stored.savedFilename;
      logger.endStep(requestId, saveStep, 'completed', { id: stored.id, filename: stored.savedFilename });
    }

    req.payloadCapture = {
      requestPayload: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        extractedTextPreview: text.slice(0, 10000),
        extractedTextLength: text.length,
        cached,
      },
      responsePayload: result as unknown as Record<string, unknown>,
    };

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: result,
      cached,
      ...(documentId && { documentId }),
      ...(savedAs && { savedAs }),
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
 * Parse a job description document and extract structured data
 */
router.post('/parse-jd', requireAuth, requireScopes('write'), apiRateLimit(), uploadDoc.single('file'), async (req: Request, res: Response) => {
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
        error: 'A job description file is required. Accepted formats: PDF, DOCX, TXT, MD, JSON, XLSX',
        requestId,
      } as APIResponse<null>);
    }
    logger.endStep(requestId, validateStep, 'completed', {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimetype: req.file.mimetype,
    });

    // Step 2: Extract text from document
    const extractStep = logger.startStep(requestId, 'Extract text from document');
    const extractStartTime = Date.now();
    const format = documentParsingService.detectFormat(req.file.mimetype, req.file.originalname);
    const text = await documentParsingService.extractText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      requestId,
    );
    const extractDuration = Date.now() - extractStartTime;

    if (!text || text.trim().length === 0) {
      logger.endStep(requestId, extractStep, 'failed');
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Could not extract text from the uploaded file. The document may be empty, corrupted, or use an unsupported legacy format.',
        requestId,
      } as APIResponse<null>);
    }

    if (format === 'pdf') {
      logger.logPDFParse(requestId, req.file.size, text.length, extractDuration);
    }
    logger.endStep(requestId, extractStep, 'completed', {
      format,
      extractedChars: text.length,
    });

    // Step 3: Check if JD already exists in storage
    const cacheStep = logger.startStep(requestId, 'Check document cache');
    const existingJD = documentStorage.findExistingJD(text);
    
    if (existingJD) {
      logger.endStep(requestId, cacheStep, 'completed', { cached: true, id: existingJD.id });
      req.payloadCapture = {
        requestPayload: {
          fileName: req.file!.originalname,
          fileType: format,
          fileSize: req.file!.size,
          extractedTextPreview: text.slice(0, 10000),
          extractedTextLength: text.length,
          cached: true,
        },
        responsePayload: existingJD.data as unknown as Record<string, unknown>,
      };
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

    req.payloadCapture = {
      requestPayload: {
        fileName: req.file!.originalname,
        fileType: format,
        fileSize: req.file!.size,
        extractedTextPreview: text.slice(0, 10000),
        extractedTextLength: text.length,
        cached: false,
      },
      responsePayload: result as unknown as Record<string, unknown>,
    };

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

    req.payloadCapture = {
      requestPayload: {
        resumePreview: resume.slice(0, 10000),
        resumeLength: resume.length,
        jdPreview: jd.slice(0, 10000),
        jdLength: jd.length,
        interviewScriptPreview: interviewScript.slice(0, 10000),
        interviewScriptLength: interviewScript.length,
        includeCheatingDetection: !!includeCheatingDetection,
        hasUserInstructions: !!userInstructions,
      },
      responsePayload: result as unknown as Record<string, unknown>,
    };

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

/**
 * POST /api/v1/batch-invite
 * Send interview invitations to multiple candidates at once.
 * Each resume counts as one interview usage.
 * Accepts JSON body: { resumes: string[], jd: string, recruiter_email?, interviewer_requirement? }
 */
router.post('/batch-invite', requireAuth, requireScopes('write'), apiRateLimit(), trackUsage, async (req: Request, res: Response) => {
  const requestId = req.requestId!;
  logger.startRequest(requestId, '/api/v1/batch-invite', 'POST');

  try {
    const { resumes, jd, recruiter_email, interviewer_requirement } = req.body as {
      resumes: string[];
      jd: string;
      recruiter_email?: string;
      interviewer_requirement?: string;
    };

    if (!resumes || !Array.isArray(resumes) || resumes.length === 0 || !jd) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'resumes (array of strings) and jd fields are required',
        requestId,
      });
    }

    if (resumes.length > 50) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 resumes per batch',
        requestId,
      });
    }

    // Filter valid resumes first so we only bill for non-empty entries
    const validResumes = resumes.map((r, i) => ({ text: r, index: i })).filter(r => r.text && r.text.trim());
    if (validResumes.length === 0) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'All resumes are empty',
        requestId,
      });
    }

    // Check and deduct usage for all valid resumes upfront
    const usageCheck = await checkBatchUsage(req.user!.id, 'interview', validResumes.length);
    if (!usageCheck.ok) {
      logger.endRequest(requestId, 'error', 402);
      return res.status(402).json({
        success: false,
        error: usageCheck.error,
        code: usageCheck.code,
        details: usageCheck.details,
        requestId,
      });
    }

    (req as any).usageBilling = {
      source: usageCheck.topUpUnits > 0 ? 'topup' : 'plan',
      action: 'interview',
      count: validResumes.length,
      planUnits: usageCheck.planUnits,
      topUpUnits: usageCheck.topUpUnits,
      topUpCost: usageCheck.topUpCost,
    };

    // Process each resume
    const results: Array<{ index: number; success: boolean; data?: any; error?: string }> = [];

    // Mark empty resumes as failed
    for (let i = 0; i < resumes.length; i++) {
      if (!resumes[i] || !resumes[i].trim()) {
        results.push({ index: i, success: false, error: 'Empty resume text' });
      }
    }

    for (const { text, index } of validResumes) {
      try {
        const result = await inviteAgent.generateInvitation(
          text,
          jd,
          `${requestId}_${index}`,
          recruiter_email,
          interviewer_requirement
        );
        results.push({ index, success: true, data: result });
      } catch (error) {
        results.push({
          index,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send invitation',
        });
      }
    }

    // Sort by index for consistent output
    results.sort((a, b) => a.index - b.index);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: {
        total: resumes.length,
        sent: successCount,
        failed: failCount,
        billing: {
          charged: validResumes.length,
          planUnits: usageCheck.planUnits,
          topUpUnits: usageCheck.topUpUnits,
          topUpCost: usageCheck.topUpCost,
        },
        results,
      },
      requestId,
    });
  } catch (error) {
    logger.error('API', 'batch-invite failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      requestId,
    });
  }
});

/**
 * POST /api/v1/parse-resume-pdf
 * Upload a resume file (PDF, DOCX, XLSX, TXT), extract text, and return it.
 * Used by the Quick Invite flow to extract resume text from uploaded files.
 */
router.post('/parse-resume-pdf', requireAuth, requireScopes('read'), apiRateLimit(), uploadDoc.single('file'), async (req: Request, res: Response) => {
  const requestId = req.requestId!;
  logger.startRequest(requestId, '/api/v1/parse-resume-pdf', 'POST');

  try {
    if (!req.file) {
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'File is required (PDF, DOCX, XLSX, TXT)',
        requestId,
      });
    }

    const text = await documentParsingService.extractText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      requestId,
    );

    if (!text || !text.trim()) {
      logger.endRequest(requestId, 'error', 422);
      return res.status(422).json({
        success: false,
        error: 'Could not extract text from file',
        requestId,
      });
    }

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: {
        text,
        fileName: req.file.originalname,
        size: req.file.size,
      },
      requestId,
    });
  } catch (error) {
    logger.error('API', 'parse-resume-pdf failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      requestId,
    });
  }
});

/**
 * POST /api/v1/extract-document
 * Upload a document (PDF, DOCX, XLSX, TXT), extract text and return it.
 * Uses LLM vision as primary extraction for PDFs, with thorough logging at every step.
 */
router.post('/extract-document', optionalAuth, apiRateLimit(), uploadDoc.single('file'), async (req: Request, res: Response) => {
  const requestId = req.requestId!;
  logger.startRequest(requestId, '/api/v1/extract-document', 'POST');

  try {
    if (!req.file) {
      logger.warn('EXTRACT_DOC', 'No file in request', {}, requestId);
      logger.endRequest(requestId, 'error', 400);
      return res.status(400).json({
        success: false,
        error: 'File is required. Accepted formats: PDF, DOCX, XLSX, TXT, MD, JSON',
        requestId,
      });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const format = documentParsingService.detectFormat(mimetype, originalname);

    logger.info('EXTRACT_DOC', 'File received', {
      fileName: originalname,
      mimetype,
      format,
      sizeBytes: size,
      sizeKB: Math.round(size / 1024),
    }, requestId);

    const startTime = Date.now();
    const text = await documentParsingService.extractText(buffer, mimetype, originalname, requestId);
    const elapsedMs = Date.now() - startTime;

    if (!text || !text.trim()) {
      logger.warn('EXTRACT_DOC', 'Extraction returned empty text', {
        fileName: originalname, format, elapsedMs,
      }, requestId);
      logger.endRequest(requestId, 'error', 422);
      return res.status(422).json({
        success: false,
        error: 'Could not extract text from the uploaded file',
        requestId,
      });
    }

    logger.info('EXTRACT_DOC', 'Extraction successful', {
      fileName: originalname,
      format,
      extractedChars: text.length,
      extractedLines: text.split('\n').length,
      elapsedMs,
      preview: text.substring(0, 150),
    }, requestId);

    logger.endRequest(requestId, 'success', 200);
    return res.json({
      success: true,
      data: {
        text,
        fileName: originalname,
        format,
        size,
      },
      requestId,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error('EXTRACT_DOC', 'extract-document failed', {
      error: errMsg,
      stack: errStack,
      fileName: req.file?.originalname,
      mimetype: req.file?.mimetype,
      sizeBytes: req.file?.size,
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    return res.status(500).json({
      success: false,
      error: errMsg,
      requestId,
    });
  }
});

/**
 * POST /api/v1/format-resume
 * Uses LLM to format raw resume text into a structured, professional layout
 */
router.post('/format-resume', requireAuth, requireScopes('read'), apiRateLimit(), async (req: Request, res: Response) => {
  const requestId = (req as any).requestId || `fmt-${Date.now()}`;
  logger.startRequest(requestId, '/api/v1/format-resume', 'POST');

  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      res.status(400).json({ success: false, error: 'Resume text is required (min 20 characters)' });
      return;
    }

    const formatted = await resumeFormatAgent.format(text.trim(), requestId);

    logger.endRequest(requestId, 'success', 200);
    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    logger.error('API', 'format-resume failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Resume formatting failed',
    });
  }
});

/**
 * POST /api/v1/format-jd
 * Uses LLM to format raw JD text into a structured, professional layout
 */
router.post('/format-jd', requireAuth, requireScopes('read'), apiRateLimit(), async (req: Request, res: Response) => {
  const requestId = (req as any).requestId || `fmtjd-${Date.now()}`;
  logger.startRequest(requestId, '/api/v1/format-jd', 'POST');

  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      res.status(400).json({ success: false, error: 'JD text is required (min 20 characters)' });
      return;
    }

    const formatted = await jdFormatAgent.format(text.trim(), requestId);

    logger.endRequest(requestId, 'success', 200);
    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    logger.error('API', 'format-jd failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, requestId);
    logger.endRequest(requestId, 'error', 500);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'JD formatting failed',
    });
  }
});

export default router;
