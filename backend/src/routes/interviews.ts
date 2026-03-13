import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { EvaluationAgent } from '../agents/EvaluationAgent.js';
import { liveKitService } from '../services/LiveKitService.js';
import '../types/auth.js';

const router = Router();

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
  const requestId = generateRequestId();
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
    const metadata = {
      interviewId: interview.id,
      instructions: config['interview.instructions'] || '',
      jobTitle: interview.jobTitle || '',
      jobDescription: interview.jobDescription || '',
      candidateName: interview.candidateName,
      resumeText: interview.resumeText || '',
      language: config['interview.language'] || 'en',
    };

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
        metadata: { ...(interview.metadata as any || {}), egressId },
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

    const updated = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        duration,
        recordingUrl: recordingUrl || interview.recordingUrl,
      },
    });

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
    if (interview.status === 'completed' || interview.status === 'cancelled') {
      return res.status(410).json({ success: false, error: 'Interview has ended' });
    }
    if (!liveKitService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'LiveKit not configured' });
    }

    const roomName = interview.roomId || `interview-${interview.id}`;

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
        status: interview.status,
      },
    });
  } catch (err: any) {
    logger.error('INTERVIEWS', 'Failed to join interview', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to join interview' });
  }
});

/**
 * POST /api/v1/interviews/:id/transcript
 * Agent posts transcript data back to the server
 */
router.post('/:id/transcript', async (req, res) => {
  try {
    const { transcript, apiKey } = req.body;

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

    await prisma.interview.update({
      where: { id: interview.id },
      data: { transcript },
    });

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
