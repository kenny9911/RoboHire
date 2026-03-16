import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { goHireEvaluationService } from '../services/GoHireEvaluationService.js';
import { pdfService } from '../services/PDFService.js';
import { resumeParserService, normalizeExtractedText, convertStructuredToMarkdown } from '../services/ResumeParserService.js';
import OpenAI from 'openai';
import '../types/auth.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /stats — Aggregate stats for GoHire interviews.
 * Must be declared BEFORE /:id to avoid "stats" matching as an id param.
 */
router.get('/stats', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const [
      totalCount,
      withVideoCount,
      withEvaluationCount,
      dateRange,
      topRecruiters,
      topJobTitles,
    ] = await Promise.all([
      prisma.goHireInterview.count(),
      prisma.goHireInterview.count({ where: { videoUrl: { not: null } } }),
      prisma.goHireInterview.count({ where: { evaluationData: { not: Prisma.DbNull } } }),
      prisma.goHireInterview.aggregate({
        _min: { interviewDatetime: true },
        _max: { interviewDatetime: true },
      }),
      prisma.goHireInterview.groupBy({
        by: ['recruiterName', 'recruiterEmail'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.goHireInterview.groupBy({
        by: ['jobTitle'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
        where: { jobTitle: { not: null } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalCount,
        withVideoCount,
        withEvaluationCount,
        dateRange: {
          earliest: dateRange._min.interviewDatetime,
          latest: dateRange._max.interviewDatetime,
        },
        topRecruiters: topRecruiters.map((r) => ({
          recruiterName: r.recruiterName,
          recruiterEmail: r.recruiterEmail,
          count: r._count.id,
        })),
        topJobTitles: topJobTitles.map((j) => ({
          jobTitle: j.jobTitle,
          count: j._count.id,
        })),
      },
    });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to fetch stats', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to fetch interview stats' });
  }
});

/**
 * GET / — List / search GoHire interviews (paginated, summary fields only).
 */
router.get('/', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const {
      q,
      jobTitle,
      recruiterEmail,
      hasVideo,
      dateFrom,
      dateTo,
      page = '1',
      limit = '20',
      sortBy = 'interviewDatetime',
      sortOrder = 'desc',
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '20', 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (q) {
      where.OR = [
        { candidateName: { contains: q, mode: 'insensitive' } },
        { candidateEmail: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (jobTitle) {
      where.jobTitle = { contains: jobTitle, mode: 'insensitive' };
    }

    if (recruiterEmail) {
      where.recruiterEmail = { equals: recruiterEmail, mode: 'insensitive' };
    }

    if (hasVideo === 'true') {
      where.videoUrl = { not: null };
    } else if (hasVideo === 'false') {
      where.videoUrl = null;
    }

    if (dateFrom || dateTo) {
      where.interviewDatetime = {};
      if (dateFrom) where.interviewDatetime.gte = new Date(dateFrom);
      if (dateTo) where.interviewDatetime.lte = new Date(dateTo);
    }

    // Validate sortBy against allowed fields
    const allowedSortFields = [
      'interviewDatetime',
      'candidateName',
      'candidateEmail',
      'recruiterName',
      'jobTitle',
      'evaluationScore',
      'createdAt',
      'updatedAt',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy || '') ? sortBy! : 'interviewDatetime';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const [interviews, total] = await Promise.all([
      prisma.goHireInterview.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [safeSortBy]: safeSortOrder },
        select: {
          id: true,
          gohireUserId: true,
          candidateName: true,
          candidateEmail: true,
          interviewDatetime: true,
          interviewEndDatetime: true,
          duration: true,
          videoUrl: true,
          recruiterName: true,
          recruiterEmail: true,
          recruiterId: true,
          jobTitle: true,
          resumeUrl: true,
          lastLoginAt: true,
          invitedAt: true,
          evaluationScore: true,
          evaluationVerdict: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.goHireInterview.count({ where }),
    ]);

    res.json({
      success: true,
      data: interviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to list interviews', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to list interviews' });
  }
});

/**
 * POST /:id/evaluate — Generate evaluation for a GoHire interview.
 */
router.post('/:id/evaluate', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;

    const interview = await prisma.goHireInterview.findUnique({
      where: { id },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (!interview.transcript) {
      return res.status(400).json({ success: false, error: 'Interview does not have a transcript. Please add a transcript before evaluating.' });
    }

    const language = req.body.language || 'zh-CN';

    const result = await goHireEvaluationService.evaluateInterview({
      jobTitle: interview.jobTitle || '',
      jobDescription: interview.jobDescription || '',
      jobRequirements: interview.jobRequirements || '',
      transcript: interview.transcript,
      language,
      requestId,
    });

    const { evaluationData, evaluationScore, evaluationVerdict } = result;

    await prisma.goHireInterview.update({
      where: { id },
      data: {
        evaluationData: evaluationData as unknown as Prisma.InputJsonValue,
        evaluationScore,
        evaluationVerdict,
      },
    });

    logger.info('GOHIRE_INTERVIEWS', 'Interview evaluated', {
      requestId,
      id,
      evaluationScore,
      evaluationVerdict,
    });

    res.json({
      success: true,
      data: {
        evaluationData,
        evaluationScore,
        evaluationVerdict,
      },
    });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to evaluate interview', {
      requestId,
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to evaluate interview' });
  }
});

/**
 * POST /:id/transcript — Store/update transcript for a GoHire interview.
 */
router.post('/:id/transcript', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ success: false, error: 'A valid transcript string is required' });
    }

    const interview = await prisma.goHireInterview.update({
      where: { id },
      data: { transcript },
    });

    logger.info('GOHIRE_INTERVIEWS', 'Interview transcript updated', {
      requestId,
      id,
    });

    res.json({ success: true, data: interview });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    logger.error('GOHIRE_INTERVIEWS', 'Failed to update transcript', {
      requestId,
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to update transcript' });
  }
});

/**
 * POST /:id/transcribe — Fetch video from URL and transcribe using ASR_MODEL (e.g. gpt-4o-transcribe).
 */
router.post('/:id/transcribe', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;

    const interview = await prisma.goHireInterview.findUnique({
      where: { id },
      select: { id: true, videoUrl: true, candidateName: true },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (!interview.videoUrl) {
      return res.status(400).json({ success: false, error: 'No video URL available for this interview' });
    }

    const asrModel = process.env.ASR_MODEL || 'gpt-4o-transcribe';

    logger.info('GOHIRE_INTERVIEWS', 'Starting ASR transcription', {
      requestId,
      id,
      model: asrModel,
      videoUrl: interview.videoUrl.substring(0, 80),
    });

    // Fetch the video file
    const videoResponse = await fetch(interview.videoUrl);
    if (!videoResponse.ok) {
      return res.status(502).json({
        success: false,
        error: `Failed to download video: HTTP ${videoResponse.status}`,
      });
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

    // Create OpenAI client for transcription
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create a File object from the buffer for the OpenAI API
    const file = new File([videoBuffer], 'interview.mp4', { type: 'video/mp4' });

    logger.info('GOHIRE_INTERVIEWS', 'Sending to ASR', {
      requestId,
      id,
      fileSize: videoBuffer.length,
      model: asrModel,
    });

    // Call OpenAI transcription API
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: asrModel,
      response_format: 'verbose_json',
      language: 'zh',
    });

    // Build structured transcript with timestamps from segments
    const segments = (transcription as any).segments || [];
    let transcript: string;

    if (segments.length > 0) {
      // Format segments with timestamps
      const formattedSegments = segments.map((seg: any) => {
        const startMin = Math.floor(seg.start / 60);
        const startSec = Math.floor(seg.start % 60);
        const timestamp = `${String(startMin).padStart(2, '0')}:${String(startSec).padStart(2, '0')}`;
        const text = (seg.text || '').trim();
        return JSON.stringify({ timestamp, speaker: 'Unknown', text });
      });
      transcript = `[${formattedSegments.join(',\n')}]`;
    } else {
      // Fallback: use plain text
      transcript = (transcription as any).text || '';
    }

    // Save transcript to DB
    await prisma.goHireInterview.update({
      where: { id },
      data: { transcript },
    });

    logger.info('GOHIRE_INTERVIEWS', 'ASR transcription completed', {
      requestId,
      id,
      transcriptLength: transcript.length,
      segmentCount: segments.length,
    });

    res.json({
      success: true,
      data: { transcript },
    });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'ASR transcription failed', {
      requestId,
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to transcribe interview video' });
  }
});

/**
 * POST /:id/parse-resume — Fetch resume PDF from URL, parse it, and return markdown + structured data.
 */
router.post('/:id/parse-resume', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;
    const forceReparse = req.body?.force === true;

    const interview = await prisma.goHireInterview.findUnique({
      where: { id },
      select: { id: true, resumeUrl: true, parsedResumeText: true },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (!interview.resumeUrl) {
      return res.status(400).json({ success: false, error: 'No resume URL available for this interview' });
    }

    // Return cached result if available and not forcing reparse
    if (interview.parsedResumeText && !forceReparse) {
      return res.json({
        success: true,
        data: { markdown: interview.parsedResumeText, cached: true },
      });
    }

    logger.info('GOHIRE_INTERVIEWS', 'Fetching resume PDF from URL', {
      requestId,
      id,
      url: interview.resumeUrl.substring(0, 80),
    });

    // Fetch the PDF from the remote URL
    const response = await fetch(interview.resumeUrl);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Failed to download resume: HTTP ${response.status}`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    const rawText = await pdfService.extractText(buffer, requestId);
    if (!rawText || rawText.trim().length < 20) {
      return res.status(422).json({
        success: false,
        error: 'Could not extract meaningful text from the resume PDF',
      });
    }

    // Two-step parse: structured JSON → deterministic markdown (more reliable than one-shot)
    const normalizedText = normalizeExtractedText(rawText);
    const structuredData = await resumeParserService.parseResumeStructured(normalizedText, requestId);
    const markdown = convertStructuredToMarkdown(structuredData);

    // Save to DB for next time
    await prisma.goHireInterview.update({
      where: { id },
      data: { parsedResumeText: markdown },
    });

    logger.info('GOHIRE_INTERVIEWS', 'Resume parsed and cached', {
      requestId,
      id,
      markdownLength: markdown.length,
    });

    res.json({
      success: true,
      data: { markdown, cached: false },
    });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to parse resume', {
      requestId,
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to parse resume' });
  }
});

/**
 * POST /:id/load-transcript — Fetch pre-transcribed dialog from transcriptUrl and save to DB.
 */
router.post('/:id/load-transcript', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;

    const interview = await prisma.goHireInterview.findUnique({
      where: { id },
      select: { id: true, transcriptUrl: true, transcript: true },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (!interview.transcriptUrl) {
      return res.status(400).json({ success: false, error: 'No transcript URL available' });
    }

    logger.info('GOHIRE_INTERVIEWS', 'Fetching pre-transcribed dialog', {
      requestId, id, url: interview.transcriptUrl.substring(0, 80),
    });

    const response = await fetch(interview.transcriptUrl);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Failed to fetch transcript: HTTP ${response.status}`,
      });
    }

    const data = await response.json() as {
      success?: boolean;
      dialog?: Array<{
        question?: string;
        answer?: string;
        video_time?: number;
      }>;
    };

    if (!data.dialog || !Array.isArray(data.dialog) || data.dialog.length === 0) {
      return res.status(422).json({ success: false, error: 'Transcript URL returned no dialog data' });
    }

    // Convert dialog to structured segments
    const segments: Array<{ speaker: string; text: string; timestamp: string }> = [];
    for (const item of data.dialog) {
      const ts = typeof item.video_time === 'number' ? item.video_time : 0;
      const mm = Math.floor(ts / 60000);
      const ss = Math.floor((ts % 60000) / 1000);
      const timestamp = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

      if (item.question) {
        segments.push({ speaker: 'Interviewer', text: item.question, timestamp });
      }
      if (item.answer) {
        segments.push({ speaker: 'Candidate', text: item.answer, timestamp });
      }
    }

    const transcript = JSON.stringify(segments);

    await prisma.goHireInterview.update({
      where: { id },
      data: { transcript },
    });

    logger.info('GOHIRE_INTERVIEWS', 'Pre-transcribed dialog loaded', {
      requestId, id, segmentCount: segments.length,
    });

    res.json({ success: true, data: { segments, segmentCount: segments.length } });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to load transcript', {
      requestId, id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to load transcript' });
  }
});

/**
 * GET /:id — Get a single GoHire interview with full details.
 */
router.get('/:id', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;

    const interview = await prisma.goHireInterview.findUnique({
      where: { id },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    res.json({ success: true, data: interview });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to fetch interview', {
      requestId,
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to fetch interview' });
  }
});

/**
 * PATCH /:id — Update interview (transcript / evaluation fields only).
 */
router.patch('/:id', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;
    const { transcript, evaluationData, evaluationScore, evaluationVerdict } = req.body;

    // Only allow updating specific fields
    const updateData: any = {};
    if (transcript !== undefined) updateData.transcript = transcript;
    if (evaluationData !== undefined) updateData.evaluationData = evaluationData;
    if (evaluationScore !== undefined) updateData.evaluationScore = evaluationScore;
    if (evaluationVerdict !== undefined) updateData.evaluationVerdict = evaluationVerdict;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update. Allowed: transcript, evaluationData, evaluationScore, evaluationVerdict',
      });
    }

    const interview = await prisma.goHireInterview.update({
      where: { id },
      data: updateData,
    });

    logger.info('GOHIRE_INTERVIEWS', 'Interview updated', {
      requestId,
      id,
      updatedFields: Object.keys(updateData),
    });

    res.json({ success: true, data: interview });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    logger.error('GOHIRE_INTERVIEWS', 'Failed to update interview', {
      requestId,
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to update interview' });
  }
});

export default router;
