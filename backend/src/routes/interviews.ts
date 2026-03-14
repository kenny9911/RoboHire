import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { EvaluationAgent } from '../agents/EvaluationAgent.js';
import { liveKitService } from '../services/LiveKitService.js';
import { interviewPromptAgent } from '../agents/InterviewPromptAgent.js';
import '../types/auth.js';

const router = Router();
const MIN_INTERVIEW_DURATION_SECONDS = 300; // 5 minutes — interviews shorter than this are not marked completed
const LIVEKIT_USAGE_ENDPOINT = '/api/v1/interviews/live-session';
const LIVEKIT_USAGE_MODULE = 'interview_livekit';
const LIVEKIT_USAGE_API_NAME = 'interviews_live_session';

type WorkerSessionUsagePayload = {
  llm?: {
    provider?: string;
    model?: string;
    calls?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    totalDurationMs?: number;
  };
  stt?: {
    provider?: string;
    label?: string;
    calls?: number;
    totalAudioDurationMs?: number;
    totalDurationMs?: number;
  };
  tts?: {
    provider?: string;
    label?: string;
    calls?: number;
    totalCharacters?: number;
    totalAudioDurationMs?: number;
    totalDurationMs?: number;
  };
  llmMetrics?: Array<{
    requestId?: string;
    durationMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }>;
  promptContext?: {
    instructions?: string;
    greeting?: string;
    language?: string;
    candidateName?: string;
    jobTitle?: string;
  };
};

function toSafeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeWorkerUsagePayload(raw: unknown): WorkerSessionUsagePayload | null {
  if (!isRecord(raw)) return null;

  const llm = isRecord(raw.llm)
    ? {
        provider: typeof raw.llm.provider === 'string' ? raw.llm.provider : 'openai',
        model: typeof raw.llm.model === 'string' ? raw.llm.model : 'unknown',
        calls: toSafeInt(raw.llm.calls),
        promptTokens: toSafeInt(raw.llm.promptTokens),
        completionTokens: toSafeInt(raw.llm.completionTokens),
        totalTokens: toSafeInt(raw.llm.totalTokens),
        totalDurationMs: toSafeInt(raw.llm.totalDurationMs),
      }
    : undefined;

  const stt = isRecord(raw.stt)
    ? {
        provider: typeof raw.stt.provider === 'string' ? raw.stt.provider : 'openai',
        label: typeof raw.stt.label === 'string' ? raw.stt.label : 'STT',
        calls: toSafeInt(raw.stt.calls),
        totalAudioDurationMs: toSafeInt(raw.stt.totalAudioDurationMs),
        totalDurationMs: toSafeInt(raw.stt.totalDurationMs),
      }
    : undefined;

  const tts = isRecord(raw.tts)
    ? {
        provider: typeof raw.tts.provider === 'string' ? raw.tts.provider : 'openai',
        label: typeof raw.tts.label === 'string' ? raw.tts.label : 'TTS',
        calls: toSafeInt(raw.tts.calls),
        totalCharacters: toSafeInt(raw.tts.totalCharacters),
        totalAudioDurationMs: toSafeInt(raw.tts.totalAudioDurationMs),
        totalDurationMs: toSafeInt(raw.tts.totalDurationMs),
      }
    : undefined;

  const llmMetrics = Array.isArray(raw.llmMetrics)
    ? raw.llmMetrics
        .filter(isRecord)
        .map((metric) => ({
          requestId: typeof metric.requestId === 'string' ? metric.requestId : undefined,
          durationMs: toSafeInt(metric.durationMs),
          promptTokens: toSafeInt(metric.promptTokens),
          completionTokens: toSafeInt(metric.completionTokens),
          totalTokens: toSafeInt(metric.totalTokens),
        }))
    : [];

  const promptContext = isRecord(raw.promptContext)
    ? {
        instructions: typeof raw.promptContext.instructions === 'string' ? raw.promptContext.instructions : undefined,
        greeting: typeof raw.promptContext.greeting === 'string' ? raw.promptContext.greeting : undefined,
        language: typeof raw.promptContext.language === 'string' ? raw.promptContext.language : undefined,
        candidateName: typeof raw.promptContext.candidateName === 'string' ? raw.promptContext.candidateName : undefined,
        jobTitle: typeof raw.promptContext.jobTitle === 'string' ? raw.promptContext.jobTitle : undefined,
      }
    : undefined;

  if (!llm && !stt && !tts && llmMetrics.length === 0 && !promptContext) {
    return null;
  }

  return { llm, stt, tts, llmMetrics, promptContext };
}

/**
 * Build room metadata for the LiveKit agent, incorporating per-job language,
 * job context fields, and an AI-generated interview prompt when available.
 */
async function buildRoomMetadata(
  interview: {
    id: string;
    userId: string;
    jobId?: string | null;
    candidateName: string;
    jobTitle?: string | null;
    jobDescription?: string | null;
    resumeText?: string | null;
  },
  config: Record<string, string>,
) {
  const metadata: Record<string, unknown> = {
    interviewId: interview.id,
    jobTitle: interview.jobTitle || '',
    jobDescription: interview.jobDescription || '',
    candidateName: interview.candidateName,
    resumeText: interview.resumeText || '',
    language: config['interview.language'] || 'en',
  };

  // If job is linked, pull per-job fields including language
  let job: any = null;
  if (interview.jobId) {
    job = await prisma.job.findFirst({
      where: { id: interview.jobId, userId: interview.userId },
      select: {
        interviewLanguage: true,
        interviewDuration: true,
        passingScore: true,
        companyName: true,
        qualifications: true,
        hardRequirements: true,
        requirements: true,
        interviewRequirements: true,
        evaluationRules: true,
        description: true,
        title: true,
      },
    });
    if (job) {
      if (job.interviewLanguage) metadata.language = job.interviewLanguage;
      if (job.companyName) metadata.companyName = job.companyName;
      if (!metadata.jobTitle && job.title) metadata.jobTitle = job.title;
      if (!metadata.jobDescription && job.description) metadata.jobDescription = job.description;
    }
  }

  // Generate tailored interview prompt via InterviewPromptAgent
  if (!config['interview.instructions']) {
    try {
      const promptResult = await interviewPromptAgent.execute(
        {
          jobTitle: (metadata.jobTitle as string) || 'the position',
          language: (metadata.language as string) || 'en',
          jobDescription: (metadata.jobDescription as string) || undefined,
          requirements: job?.requirements as any || undefined,
          hardRequirements: job?.hardRequirements || undefined,
          qualifications: job?.qualifications || undefined,
          companyName: (metadata.companyName as string) || undefined,
          interviewRequirements: job?.interviewRequirements || undefined,
          evaluationRules: job?.evaluationRules || undefined,
          resumeText: (metadata.resumeText as string) || undefined,
          interviewDuration: job?.interviewDuration || undefined,
          passingScore: job?.passingScore || undefined,
        },
        undefined,
        `prompt-gen-${interview.id}`,
      );
      if (promptResult?.systemPrompt) {
        metadata.instructions = promptResult.systemPrompt;
        logger.info('INTERVIEWS', 'Generated interview prompt via agent', {
          interviewId: interview.id,
          questionAreas: promptResult.questionAreas?.length ?? 0,
        });
      }
    } catch (err: any) {
      logger.warn('INTERVIEWS', `Prompt generation failed (using fallback): ${err.message}`);
    }
  } else {
    metadata.instructions = config['interview.instructions'];
  }

  return metadata;
}

async function findInterviewForJoin(joinCode: string) {
  return prisma.interview.findFirst({
    where: {
      OR: [
        { accessToken: joinCode },
        { id: joinCode },
        {
          metadata: {
            path: ['inviteData', 'request_introduction_id'],
            equals: joinCode,
          },
        },
      ],
    },
  });
}

/**
 * GET /api/v1/interviews
 * List user's interviews with optional filters
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { status, page = '1', limit = '20' } = req.query;

    const where: any = { userId };
    if (status && typeof status === 'string') {
      where.status = status;
    }

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10)));

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          evaluation: {
            select: { overallScore: true, grade: true, verdict: true },
          },
        },
      }),
      prisma.interview.count({ where }),
    ]);

    res.json({
      success: true,
      data: interviews,
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to list interviews', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to list interviews' });
  }
});

/**
 * GET /api/v1/interviews/:id
 * Get interview detail
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id, userId },
      include: { evaluation: true },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    res.json({ success: true, data: interview });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to get interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get interview' });
  }
});

/**
 * POST /api/v1/interviews
 * Create/schedule a new interview
 */
router.post('/', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const userId = req.user!.id;
    const {
      candidateName,
      candidateEmail,
      jobId,
      resumeId,
      jobTitle,
      jobDescription,
      resumeText,
      type = 'ai_video',
      scheduledAt,
    } = req.body;

    if (!candidateName) {
      return res.status(400).json({ success: false, error: 'candidateName is required' });
    }

    // If jobId provided, fetch job details
    let jd = jobDescription;
    let jt = jobTitle;
    if (jobId) {
      const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
      if (job) {
        jd = jd || job.description;
        jt = jt || job.title;
      }
    }

    // If resumeId provided, fetch resume text
    let rt = resumeText;
    if (resumeId) {
      const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
      if (resume) {
        rt = rt || resume.resumeText;
      }
    }

    const accessToken = crypto.randomBytes(32).toString('hex');

    const interview = await prisma.interview.create({
      data: {
        userId,
        jobId: jobId || null,
        resumeId: resumeId || null,
        candidateName,
        candidateEmail: candidateEmail || null,
        jobTitle: jt || null,
        jobDescription: jd || null,
        resumeText: rt || null,
        type,
        status: 'scheduled',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        accessToken,
      },
    });

    logger.info('INTERVIEWS', `Interview created for ${candidateName}`, { requestId, interviewId: interview.id });

    res.status(201).json({ success: true, data: interview });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to create interview', { requestId, error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create interview' });
  }
});

/**
 * PATCH /api/v1/interviews/:id
 * Update interview status or details
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { status, transcript, duration, recordingUrl } = req.body;

    const existing = await prisma.interview.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const data: any = {};
    if (status) {
      data.status = status;
      if (status === 'in_progress' && !existing.startedAt) data.startedAt = new Date();
      if (status === 'completed' && !existing.completedAt) data.completedAt = new Date();
    }
    if (transcript !== undefined) data.transcript = transcript;
    if (duration !== undefined) data.duration = duration;
    if (recordingUrl !== undefined) data.recordingUrl = recordingUrl;

    const updated = await prisma.interview.update({
      where: { id },
      data,
      include: { evaluation: { select: { overallScore: true, grade: true, verdict: true } } },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to update interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/evaluate
 * Run AI evaluation on a completed interview transcript
 */
router.post('/:id/evaluate', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const interview = await prisma.interview.findFirst({ where: { id, userId } });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (!interview.transcript) {
      return res.status(400).json({ success: false, error: 'No transcript to evaluate' });
    }

    const transcriptText = Array.isArray(interview.transcript)
      ? (interview.transcript as any[]).map((t: any) => `${t.role}: ${t.content}`).join('\n')
      : JSON.stringify(interview.transcript);

    const evaluationAgent = new EvaluationAgent();
    const evalResult = await evaluationAgent.execute(
      {
        interviewScript: transcriptText,
        jd: interview.jobDescription || '',
        resume: interview.resumeText || '',
      },
      undefined,
      requestId
    );

    const overallScore = (evalResult as any)?.overallScore ?? null;
    const grade = (evalResult as any)?.grade ?? null;
    const verdict = (evalResult as any)?.verdict ?? null;
    const summary = (evalResult as any)?.summary ?? null;
    const strengths = (evalResult as any)?.strengths ?? null;
    const weaknesses = (evalResult as any)?.weaknesses ?? null;

    const evaluation = await prisma.interviewEvaluation.upsert({
      where: { interviewId: id },
      update: {
        overallScore,
        grade,
        verdict,
        evaluationData: evalResult as any,
        summary,
        strengths,
        weaknesses,
      },
      create: {
        interviewId: id,
        overallScore,
        grade,
        verdict,
        evaluationData: evalResult as any,
        summary,
        strengths,
        weaknesses,
      },
    });

    logger.info('INTERVIEWS', `Evaluation completed for interview ${id}`, { requestId });

    res.json({ success: true, data: evaluation });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to evaluate interview', { requestId, error: err.message });
    res.status(500).json({ success: false, error: 'Failed to evaluate interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/start
 * Start LiveKit room + recording for an interview
 */
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    if (!liveKitService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'LiveKit not configured' });
    }
    if (interview.status === 'in_progress') {
      return res.status(400).json({ success: false, error: 'Interview already in progress' });
    }

    // Load interview config from AppConfig
    const configRows = await prisma.appConfig.findMany({
      where: { key: { startsWith: 'interview.' } },
    });
    const config: Record<string, string> = {};
    for (const row of configRows) {
      config[row.key] = row.value;
    }

    const roomName = `interview-${interview.id}`;
    const metadata = await buildRoomMetadata(interview, config);

    // Create room with agent dispatch
    const agentName = config['interview.agentName'] || 'RoboHire-1';
    await liveKitService.createRoom(interview.id, metadata, agentName);

    // Start recording
    let egressId: string | undefined;
    try {
      const egress = await liveKitService.startRecording(roomName);
      egressId = egress.egressId;
    } catch (err: any) {
      logger.warn('INTERVIEWS', `Recording start failed (non-fatal): ${err.message}`);
    }

    // Update interview record
    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'in_progress',
        roomId: roomName,
        startedAt: new Date(),
        metadata: { ...(interview.metadata as any || {}), egressId, generatedPrompt: metadata.instructions || null },
      },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to start interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to start interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/end
 * Stop recording + close LiveKit room
 */
router.post('/:id/end', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const interview = await prisma.interview.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const meta = (interview.metadata as any) || {};

    // Stop recording if active
    let recordingUrl: string | undefined;
    if (meta.egressId) {
      try {
        const egress = await liveKitService.stopRecording(meta.egressId);
        const fileResults = (egress as any).fileResults;
        if (fileResults && fileResults.length > 0) {
          recordingUrl = fileResults[0].filename || fileResults[0].location;
        }
      } catch (err: any) {
        logger.warn('INTERVIEWS', `Recording stop failed: ${err.message}`);
      }
    }

    // Delete room
    if (interview.roomId) {
      await liveKitService.deleteRoom(interview.roomId);
    }

    const startedAt = interview.startedAt || interview.createdAt;
    const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
    const tooShort = duration < MIN_INTERVIEW_DURATION_SECONDS;

    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: tooShort ? 'in_progress' : 'completed',
        completedAt: tooShort ? undefined : new Date(),
        duration,
        recordingUrl: recordingUrl || interview.recordingUrl,
      },
    });

    if (tooShort) {
      logger.warn('INTERVIEWS', `Interview too short to complete (${duration}s < ${MIN_INTERVIEW_DURATION_SECONDS}s)`, { interviewId: interview.id });
    }

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to end interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to end interview' });
  }
});

/**
 * GET /api/v1/interviews/join/:accessToken
 * Public endpoint — candidate uses accessToken or a legacy invite code to get LiveKit connection info
 */
router.get('/join/:accessToken', async (req, res) => {
  try {
    const interview = await findInterviewForJoin(req.params.accessToken);
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Invalid interview link' });
    }
    if (interview.status === 'cancelled') {
      return res.status(410).json({ success: false, error: 'Interview has been cancelled' });
    }
    if (!liveKitService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'LiveKit not configured' });
    }

    let roomName = interview.roomId || `interview-${interview.id}`;

    // Allow retaking completed / in_progress interviews — clean up old session and reset
    if (interview.status === 'completed' || interview.status === 'in_progress') {
      const oldMeta = (interview.metadata as any) || {};

      // Stop old recording if still active
      if (oldMeta.egressId) {
        try { await liveKitService.stopRecording(oldMeta.egressId); } catch { /* already stopped */ }
      }

      // Delete old room if it exists
      if (interview.roomId) {
        try { await liveKitService.deleteRoom(interview.roomId); } catch { /* already gone */ }
      }

      // Preserve non-session metadata (e.g. livekitUsage history) but clear session-specific fields
      const { egressId: _e, generatedPrompt: _g, ...preservedMeta } = oldMeta;

      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          status: 'scheduled',
          roomId: null,
          startedAt: null,
          completedAt: null,
          duration: null,
          metadata: preservedMeta,
        },
      });
      (interview as any).status = 'scheduled';
      (interview as any).roomId = null;
      logger.info('INTERVIEWS', `Interview reset for retake`, { interviewId: interview.id });
    }

    // Auto-start: create room and dispatch agent if interview hasn't been started yet
    if (interview.status === 'scheduled') {
      const configRows = await prisma.appConfig.findMany({
        where: { key: { startsWith: 'interview.' } },
      });
      const config: Record<string, string> = {};
      for (const row of configRows) {
        config[row.key] = row.value;
      }

      roomName = `interview-${interview.id}`;
      const metadata = await buildRoomMetadata(interview, config);

      const agentName = config['interview.agentName'] || 'RoboHire-1';
      await liveKitService.createRoom(interview.id, metadata, agentName);

      // Start recording (non-fatal)
      let egressId: string | undefined;
      try {
        const egress = await liveKitService.startRecording(roomName);
        egressId = egress.egressId;
      } catch (err: any) {
        logger.warn('INTERVIEWS', `Recording start failed (non-fatal): ${err.message}`);
      }

      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          status: 'in_progress',
          roomId: roomName,
          startedAt: new Date(),
          metadata: { ...(interview.metadata as any || {}), egressId, generatedPrompt: metadata.instructions || null },
        },
      });

      logger.info('INTERVIEWS', `Auto-started interview on candidate join`, { interviewId: interview.id, roomName });
    }

    // Generate participant token for the candidate
    const participantToken = await liveKitService.generateToken(
      roomName,
      `candidate-${interview.id}`,
      interview.candidateName,
    );

    res.json({
      success: true,
      data: {
        token: participantToken,
        wsUrl: liveKitService.wsUrl,
        roomName,
        candidateName: interview.candidateName,
        jobTitle: interview.jobTitle,
        interviewId: interview.id,
        status: 'in_progress',
      },
    });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to join interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to join interview' });
  }
});

/**
 * POST /api/v1/interviews/finalize/:accessToken
 * Public endpoint — candidate signals interview ended; stops recording + marks completed.
 */
router.post('/finalize/:accessToken', async (req, res) => {
  try {
    const interview = await findInterviewForJoin(req.params.accessToken);
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    if (interview.status === 'completed' || interview.status === 'cancelled') {
      return res.json({ success: true, data: { alreadyFinalized: true } });
    }

    const meta = (interview.metadata as any) || {};

    // Stop recording if active
    let recordingUrl: string | undefined;
    if (meta.egressId && liveKitService.isConfigured()) {
      try {
        const egress = await liveKitService.stopRecording(meta.egressId);
        const fileResults = (egress as any).fileResults;
        if (fileResults && fileResults.length > 0) {
          recordingUrl = fileResults[0].filename || fileResults[0].location;
        }
      } catch (err: any) {
        logger.warn('INTERVIEWS', `Recording stop failed: ${err.message}`);
      }
    }

    // Delete room
    if (interview.roomId && liveKitService.isConfigured()) {
      await liveKitService.deleteRoom(interview.roomId);
    }

    const startedAt = interview.startedAt || interview.createdAt;
    const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
    const tooShort = duration < MIN_INTERVIEW_DURATION_SECONDS;

    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: tooShort ? 'in_progress' : 'completed',
        completedAt: tooShort ? undefined : new Date(),
        duration,
        recordingUrl: recordingUrl || interview.recordingUrl || null,
      },
    });

    logger.info('INTERVIEWS', `Interview finalized via candidate disconnect${tooShort ? ' (too short, kept in_progress)' : ''}`, {
      interviewId: interview.id,
      duration,
      hasRecording: !!recordingUrl,
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to finalize interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to finalize interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/transcript
 * Agent posts transcript data back to the server
 */
router.post('/:id/transcript', async (req, res) => {
  try {
    const { transcript, apiKey, usage } = req.body;

    // Simple API key check for agent → backend communication
    const expectedKey = process.env.LIVEKIT_API_KEY;
    if (!apiKey || apiKey !== expectedKey) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const interview = await prisma.interview.findUnique({
      where: { id: req.params.id },
    });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const normalizedUsage = normalizeWorkerUsagePayload(usage);
    const existingMetadata = isRecord(interview.metadata) ? interview.metadata : {};
    const nextMetadata: Record<string, unknown> = { ...existingMetadata };

    if (normalizedUsage) {
      nextMetadata.livekitUsage = {
        llm: normalizedUsage.llm,
        stt: normalizedUsage.stt,
        tts: normalizedUsage.tts,
        llmCalls: normalizedUsage.llmMetrics?.length ?? 0,
        receivedAt: new Date().toISOString(),
      };
    }

    let livekitUsageRequestLogId: string | null = null;
    const hasLoggedUsage = typeof existingMetadata.livekitUsageLoggedAt === 'string';
    const llmTotals = normalizedUsage?.llm;
    const llmMetrics = normalizedUsage?.llmMetrics ?? [];

    if (!hasLoggedUsage && llmTotals && (llmTotals.totalTokens ?? 0) > 0) {
      const usageRequestId = `livekit-${interview.id}`;
      const llmCallCount = Math.max(llmTotals.calls ?? 0, llmMetrics.length);
      const usageCost = logger.calculateCost(
        llmTotals.model || 'default',
        llmTotals.promptTokens ?? 0,
        llmTotals.completionTokens ?? 0,
      );
      const usageDurationMs = Math.max(
        llmTotals.totalDurationMs ?? 0,
        normalizedUsage?.stt?.totalDurationMs ?? 0,
        normalizedUsage?.tts?.totalDurationMs ?? 0,
        0,
      );

      const requestLog = await prisma.apiRequestLog.create({
        data: {
          requestId: usageRequestId,
          userId: interview.userId,
          endpoint: LIVEKIT_USAGE_ENDPOINT,
          method: 'POST',
          module: LIVEKIT_USAGE_MODULE,
          apiName: LIVEKIT_USAGE_API_NAME,
          statusCode: 200,
          durationMs: usageDurationMs,
          promptTokens: llmTotals.promptTokens ?? 0,
          completionTokens: llmTotals.completionTokens ?? 0,
          totalTokens: llmTotals.totalTokens ?? 0,
          llmCalls: llmCallCount,
          cost: usageCost,
          provider: llmTotals.provider || 'openai',
          model: llmTotals.model || null,
          userAgent: 'livekit-agent',
          requestPayload: {
            interviewId: interview.id,
            candidateName: interview.candidateName,
            jobTitle: interview.jobTitle,
            usage: normalizedUsage,
          },
          responsePayload: {
            transcriptEntries: Array.isArray(transcript) ? transcript.length : null,
            source: 'livekit-worker',
          },
        },
      });

      livekitUsageRequestLogId = requestLog.id;

      if (llmMetrics.length > 0) {
        const promptMessages = normalizedUsage?.promptContext?.instructions
          ? [
              {
                role: 'system',
                content: [
                  {
                    type: 'text',
                    text: normalizedUsage.promptContext.instructions,
                  },
                ],
              },
              ...(normalizedUsage.promptContext.greeting
                ? [
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: normalizedUsage.promptContext.greeting,
                        },
                      ],
                    },
                  ]
                : []),
            ]
          : undefined;

        await prisma.lLMCallLog.createMany({
          data: llmMetrics.map((metric) => ({
            requestId: usageRequestId,
            apiRequestLogId: requestLog.id,
            userId: interview.userId,
            endpoint: LIVEKIT_USAGE_ENDPOINT,
            module: LIVEKIT_USAGE_MODULE,
            status: 'success',
            provider: llmTotals.provider || 'openai',
            model: llmTotals.model || 'unknown',
            promptTokens: metric.promptTokens ?? 0,
            completionTokens: metric.completionTokens ?? 0,
            totalTokens: metric.totalTokens ?? 0,
            cost: logger.calculateCost(
              llmTotals.model || 'default',
              metric.promptTokens ?? 0,
              metric.completionTokens ?? 0,
            ),
            durationMs: metric.durationMs ?? 0,
            requestMessages: promptMessages,
            requestOptions: normalizedUsage?.promptContext
              ? Object.fromEntries(
                  Object.entries({
                    source: 'livekit-agent',
                    language: normalizedUsage.promptContext.language,
                    candidateName: normalizedUsage.promptContext.candidateName,
                    jobTitle: normalizedUsage.promptContext.jobTitle,
                  }).filter(([, value]) => value !== undefined)
                )
              : undefined,
          })),
        });
      }

      nextMetadata.livekitUsageLoggedAt = new Date().toISOString();
      nextMetadata.livekitUsageRequestLogId = requestLog.id;

      logger.info('INTERVIEWS', 'Logged LiveKit interview usage', {
        interviewId: interview.id,
        requestLogId: requestLog.id,
        totalTokens: llmTotals.totalTokens ?? 0,
        llmCalls: llmCallCount,
      });
    }

    const updateData: Record<string, unknown> = {};
    if (transcript !== undefined) {
      updateData.transcript = transcript;
    }
    if (Object.keys(nextMetadata).length > 0 || livekitUsageRequestLogId) {
      updateData.metadata = nextMetadata;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.interview.update({
        where: { id: interview.id },
        data: updateData,
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to save transcript', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to save transcript' });
  }
});

/**
 * DELETE /api/v1/interviews/:id
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const existing = await prisma.interview.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    await prisma.interview.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to delete interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete interview' });
  }
});

export default router;
