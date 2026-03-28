import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { generateRequestId, logger } from '../services/LoggerService.js';
import { goHireEvaluationService } from '../services/GoHireEvaluationService.js';
import { resumeParserService, normalizeExtractedText, convertStructuredToMarkdown } from '../services/ResumeParserService.js';
import { documentParsingService } from '../services/DocumentParsingService.js';
import { getVisibilityScope, VisibilityScope } from '../lib/teamVisibility.js';
import OpenAI from 'openai';
import '../types/auth.js';

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

/**
 * Build a recruiterEmail filter for GoHireInterview based on visibility scope.
 * GoHireInterview has no userId — we match recruiterEmail against User.email.
 */
async function buildRecruiterEmailFilter(
  scope: VisibilityScope,
  filterUserId?: string,
  filterTeamId?: string,
): Promise<Record<string, unknown>> {
  // Admin with no filter → show all
  if (scope.isAdmin && !filterUserId && !filterTeamId) return {};

  let targetUserIds: string[];
  if (filterUserId) {
    targetUserIds = [filterUserId];
  } else if (filterTeamId) {
    const members = await prisma.user.findMany({
      where: { teamId: filterTeamId },
      select: { id: true },
    });
    targetUserIds = members.map((m) => m.id);
  } else {
    // Non-admin: use scope's visible user IDs
    targetUserIds = scope.userIds;
  }

  if (targetUserIds.length === 0) return { recruiterEmail: '__none__' };

  const users = await prisma.user.findMany({
    where: { id: { in: targetUserIds } },
    select: { email: true },
  });
  const emails = users.map((u) => u.email).filter(Boolean);
  if (emails.length === 0) return { recruiterEmail: '__none__' };
  return { recruiterEmail: { in: emails, mode: 'insensitive' } };
}

/**
 * GET /shared/:token — Public route: fetch evaluation report by share token (no auth).
 */
router.get('/shared/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const interview = await prisma.goHireInterview.findUnique({
      where: { evaluationShareToken: token },
      select: {
        id: true,
        candidateName: true,
        candidateEmail: true,
        jobTitle: true,
        interviewDatetime: true,
        duration: true,
        evaluationData: true,
        evaluationScore: true,
        evaluationVerdict: true,
      },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Report not found or link has been revoked' });
    }

    res.json({ success: true, data: interview });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to fetch shared report', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to fetch shared report' });
  }
});

// All routes below require authentication
router.use(requireAuth);

const GOHIRE_DATA_BASE = 'https://report-agent.gohire.top';
const GOHIRE_API_BASE = `${GOHIRE_DATA_BASE}/gohire-data`;

/**
 * POST /sync-from-invite — Fetch completed interview data from GoHire APIs
 * and create a GoHireInterview record for viewing in the review page.
 */
router.post('/sync-from-invite', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { gohireUserId, requestIntroductionId } = req.body;

    if (!gohireUserId) {
      return res.status(400).json({ success: false, error: 'gohireUserId is required' });
    }

    const userId = String(gohireUserId);

    // Check for existing GoHireInterview record
    const existing = await prisma.goHireInterview.findFirst({
      where: { gohireUserId: userId },
      orderBy: { interviewDatetime: 'desc' },
    });
    if (existing) {
      return res.json({ success: true, data: existing, cached: true });
    }

    logger.info('GOHIRE_SYNC', 'Fetching GoHire interview data', {
      requestId, gohireUserId: userId, requestIntroductionId,
    });

    // Try the user_id-based data APIs first, fall back to request_introduction_id-based APIs
    let detailRecord: any = null;
    let completedRecord: any = null;

    // Strategy 1: Use /gohire-data/interviews/completed + /detail with user_id
    try {
      const [completedRes, detailRes] = await Promise.all([
        fetch(`${GOHIRE_API_BASE}/interviews/completed?user_id=${userId}&page=1&page_size=20`).then(r => r.json()) as Promise<any>,
        fetch(`${GOHIRE_API_BASE}/interviews/detail?user_id=${userId}`).then(r => r.json()) as Promise<any>,
      ]);

      const completedList = completedRes?.data?.list || [];
      const detailList = detailRes?.data || [];

      if (detailList.length > 0) {
        // Match by request_introduction_id if available
        if (requestIntroductionId) {
          detailRecord = detailList.find((d: any) => d.request_introduction_id === requestIntroductionId);
          completedRecord = completedList.find((c: any) => c.request_introduction_id === requestIntroductionId);
        }
        // Fall back to latest
        if (!detailRecord) {
          detailRecord = detailList[0];
          completedRecord = completedList.find((c: any) => c.log_id === detailRecord.log_id) || completedList[0];
        }
      }
    } catch (err) {
      logger.warn('GOHIRE_SYNC', 'user_id-based API failed, trying request_introduction_id fallback', {
        requestId, error: err instanceof Error ? err.message : String(err),
      });
    }

    // Strategy 2: Fall back to /gohireApi/chat_logs + chat_dialog with request_introduction_id
    if (!detailRecord && requestIntroductionId) {
      try {
        const gohireApiBase = `${GOHIRE_DATA_BASE}/gohire-data/gohireApi`;
        const [chatLogsRes, chatDialogRes] = await Promise.all([
          fetch(`${gohireApiBase}/chat_logs?request_introduction_id=${requestIntroductionId}`).then(r => r.json()) as Promise<any>,
          fetch(`${gohireApiBase}/chat_dialog?request_introduction_id=${requestIntroductionId}`).then(r => r.json()) as Promise<any>,
        ]);

        const logEntry = chatLogsRes?.data?.[0];
        const dialog = chatDialogRes?.dialog || [];

        if (logEntry || dialog.length > 0) {
          detailRecord = {
            log_id: logEntry?.log_id || null,
            request_introduction_id: requestIntroductionId,
            video_url: logEntry?.video_url || null,
            resume_url: logEntry?.resume_url || null,
            interview_start_time: logEntry?.interview_start_time || null,
            interview_end_time: logEntry?.interview_end_time || null,
            dialog_list: dialog.map((turn: any) => ({
              question: turn.question,
              answer: turn.answer,
            })),
            report: null, // evaluation not available through this API path
          };
        }
      } catch (err) {
        logger.warn('GOHIRE_SYNC', 'request_introduction_id-based API also failed', {
          requestId, error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!detailRecord) {
      logger.info('GOHIRE_SYNC', 'GoHire interview data not ready yet', {
        requestId,
        gohireUserId: userId,
        requestIntroductionId,
        completedApiMatched: !!completedRecord,
      });

      return res.json({
        success: false,
        code: 'GOHIRE_INTERVIEW_NOT_READY',
        error: 'No completed interview found on GoHire for this user',
      });
    }

    // Map GoHire data to GoHireInterview fields
    const jobInfo = completedRecord?.job_info;
    const evaluate = detailRecord.report?.hr_interview_evaluate;
    const dialogList: Array<{ question: string; answer: string }> = detailRecord.dialog_list || [];

    // Build transcript from dialog
    const segments: Array<{ speaker: string; text: string; timestamp: string }> = [];
    for (const item of dialogList) {
      if (item.question) {
        segments.push({ speaker: 'Interviewer', text: item.question, timestamp: '' });
      }
      if (item.answer) {
        segments.push({ speaker: 'Candidate', text: item.answer, timestamp: '' });
      }
    }

    // Parse interview times
    const startTime = detailRecord.interview_start_time ? new Date(detailRecord.interview_start_time) : new Date();
    const endTime = detailRecord.interview_end_time ? new Date(detailRecord.interview_end_time) : null;
    const durationMinutes = endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 60000) : null;

    // Map decision to verdict
    let evaluationVerdict: string | null = null;
    if (evaluate?.decision_recommendations) {
      const dec = evaluate.decision_recommendations.toLowerCase();
      if (dec.includes('strongly') || dec.includes('strong')) evaluationVerdict = 'strong_hire';
      else if (dec === 'recommend' || dec === 'pass') evaluationVerdict = 'hire';
      else if (dec === 'reject') evaluationVerdict = 'no_hire';
      else evaluationVerdict = 'weak_hire';
    }

    // Extract candidate name — try multiple sources with fallback chain
    const reportJson = evaluate?.result_json_parsed;
    const candidateName =
      reportJson?.['报告元数据']?.['候选人姓名']
      || reportJson?.['报告元数据']?.['candidateName']
      || completedRecord?.user_name
      || detailRecord?.user_name
      || completedRecord?.candidate_name
      || detailRecord?.candidate_name
      || 'Unknown';

    // Extract candidate email from video_url pattern (e.g., interview_471665598@qq.com_...)
    let candidateEmail: string | null = null;
    if (detailRecord.video_url) {
      const emailMatch = detailRecord.video_url.match(/interview_([^_]+@[^_]+)_/);
      if (emailMatch) candidateEmail = emailMatch[1];
    }

    // Fall back to the original Interview record's JD if GoHire API didn't return it
    let fallbackJobDescription: string | null = null;
    let fallbackJobTitle: string | null = null;
    if (!jobInfo?.job_jd) {
      const originalInterview = await prisma.interview.findFirst({
        where: { gohireUserId: userId },
        select: { jobDescription: true, jobTitle: true, hiringRequestId: true },
        orderBy: { createdAt: 'desc' },
      });
      if (originalInterview?.jobDescription) {
        fallbackJobDescription = originalInterview.jobDescription;
        fallbackJobTitle = originalInterview.jobTitle;
      } else if (originalInterview?.hiringRequestId) {
        const hr = await prisma.hiringRequest.findUnique({
          where: { id: originalInterview.hiringRequestId },
          select: { jobDescription: true, title: true },
        });
        if (hr?.jobDescription) {
          fallbackJobDescription = hr.jobDescription;
          fallbackJobTitle = hr.title || null;
        }
      }
    }

    const created = await prisma.goHireInterview.create({
      data: {
        gohireUserId: userId,
        candidateName,
        candidateEmail,
        interviewDatetime: startTime,
        interviewEndDatetime: endTime,
        duration: durationMinutes,
        videoUrl: detailRecord.video_url || null,
        resumeUrl: detailRecord.resume_url || null,
        jobTitle: jobInfo?.job_title || fallbackJobTitle || null,
        jobDescription: jobInfo?.job_jd || fallbackJobDescription || null,
        jobRequirements: jobInfo?.interview_requirements || null,
        transcript: segments.length > 0 ? JSON.stringify(segments) : null,
        evaluationData: evaluate ? (evaluate as any) : undefined,
        evaluationScore: evaluate?.score ?? null,
        evaluationVerdict,
        recruiterEmail: req.user!.email || null,
        recruiterName: req.user!.name || null,
      },
    });

    logger.info('GOHIRE_SYNC', 'GoHireInterview record created from sync', {
      requestId,
      id: created.id,
      gohireUserId: userId,
      hasVideo: !!created.videoUrl,
      hasTranscript: segments.length > 0,
      hasEvaluation: !!evaluate,
      evaluationScore: evaluate?.score,
    });

    res.json({ success: true, data: created });
  } catch (error) {
    logger.error('GOHIRE_SYNC', 'Failed to sync GoHire interview', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to sync interview data from GoHire' });
  }
});

/**
 * POST /import-csv — Import GoHire interviews from CSV file (admin only).
 * Returns { created, updated, skipped, errors } counts plus list of duplicates for confirmation.
 */
router.post('/import-csv', requireAdmin, csvUpload.single('file'), async (req, res) => {
  const requestId = generateRequestId();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'CSV file is required' });
    }

    const overwrite = req.body.overwrite === 'true';
    const csvText = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');

    // Parse CSV — handle quoted fields with embedded newlines/commas
    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      return res.status(400).json({ success: false, error: 'CSV file has no data rows' });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1).filter(r => r.some(cell => cell.trim()));

    logger.info('GOHIRE_IMPORT', 'Starting CSV import', {
      requestId, totalRows: dataRows.length, overwrite,
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];
    const duplicates: Array<{ row: number; gohireUserId: string; candidateName: string; interviewDatetime: string; existingId: string }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // 1-indexed, header is row 1
      try {
        const record = mapCsvRow(headers, row);
        if (!record.gohireUserId) {
          errors.push({ row: rowNum, error: 'Missing gohire_user_id' });
          continue;
        }

        // Check for existing record by gohireUserId + interviewDatetime
        const existing = await prisma.goHireInterview.findFirst({
          where: {
            gohireUserId: record.gohireUserId,
            interviewDatetime: record.interviewDatetime,
          },
          select: { id: true },
        });

        if (existing) {
          if (overwrite) {
            await prisma.goHireInterview.update({
              where: { id: existing.id },
              data: record,
            });
            updated++;
          } else {
            duplicates.push({
              row: rowNum,
              gohireUserId: record.gohireUserId,
              candidateName: record.candidateName,
              interviewDatetime: record.interviewDatetime.toISOString(),
              existingId: existing.id,
            });
            skipped++;
          }
        } else {
          await prisma.goHireInterview.create({ data: record });
          created++;
        }
      } catch (err) {
        errors.push({ row: rowNum, error: err instanceof Error ? err.message : String(err) });
      }
    }

    logger.info('GOHIRE_IMPORT', 'CSV import completed', {
      requestId, created, updated, skipped, errors: errors.length, duplicates: duplicates.length,
    });

    res.json({
      success: true,
      data: { created, updated, skipped, errors, duplicates, total: dataRows.length },
    });
  } catch (error) {
    logger.error('GOHIRE_IMPORT', 'CSV import failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to import CSV' });
  }
});

/** Parse a CSV string, handling quoted fields with embedded newlines and commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        if (ch === '\r') i++; // skip \n in \r\n
      } else if (ch === '\r') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // Final field/row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Map a CSV row to GoHireInterview create data. */
function mapCsvRow(headers: string[], row: string[]): any {
  const get = (name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 && idx < row.length ? row[idx].trim() : '';
  };

  const parseDate = (val: string): Date | null => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const gohireUserId = get('gohire_user_id') || get('imgohire_user_id');
  const interviewDatetime = parseDate(get('gohire_interview_datetime'));
  const interviewEndDatetime = parseDate(get('面试结束时间'));
  const durationStr = get('面试时长');
  const duration = durationStr ? parseInt(durationStr, 10) || null : null;

  return {
    gohireUserId,
    candidateName: get('gohire_user_name') || 'Unknown',
    candidateEmail: get('用户邮箱（登录名称）') || null,
    interviewDatetime: interviewDatetime || new Date(),
    interviewEndDatetime,
    duration,
    videoUrl: get('gohire_interview_video_filepath') || null,
    recruiterName: get('gohire_recruiter_name') || null,
    recruiterEmail: get('gohire_recruiter_email') || null,
    recruiterId: get('hrid') || null,
    jobTitle: get('职位名称') || null,
    jobDescription: get('职位描述') || null,
    jobRequirements: get('任职要求') || null,
    interviewRequirements: get('面试要求') || null,
    resumeUrl: get('简历下载地址') || null,
    transcriptUrl: get('面试记录下载地址') || null,
    lastLoginAt: parseDate(get('最近登录时间')),
    invitedAt: parseDate(get('邀约时间')),
  };
}

/**
 * GET /stats — Aggregate stats for GoHire interviews.
 * Must be declared BEFORE /:id to avoid "stats" matching as an id param.
 */
router.get('/stats', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { filterUserId, filterTeamId, teamView } = req.query as Record<string, string | undefined>;
    const scope = await getVisibilityScope(req.user!, teamView === 'true');
    const visFilter = await buildRecruiterEmailFilter(scope, filterUserId, filterTeamId);

    const [
      totalCount,
      withVideoCount,
      withEvaluationCount,
      dateRange,
      topRecruiters,
      topJobTitles,
    ] = await Promise.all([
      prisma.goHireInterview.count({ where: visFilter }),
      prisma.goHireInterview.count({ where: { ...visFilter, videoUrl: { not: null } } }),
      prisma.goHireInterview.count({ where: { ...visFilter, evaluationData: { not: Prisma.DbNull } } }),
      prisma.goHireInterview.aggregate({
        where: visFilter,
        _min: { interviewDatetime: true },
        _max: { interviewDatetime: true },
      }),
      prisma.goHireInterview.groupBy({
        by: ['recruiterName', 'recruiterEmail'],
        where: visFilter,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.goHireInterview.groupBy({
        by: ['jobTitle'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
        where: { ...visFilter, jobTitle: { not: null } },
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
      hasEvaluation,
      dateFrom,
      dateTo,
      filterUserId,
      filterTeamId,
      teamView,
      gohireUserId,
      page = '1',
      limit = '20',
      sortBy = 'interviewDatetime',
      sortOrder = 'desc',
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '20', 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause with visibility filtering
    const scope = await getVisibilityScope(req.user!, teamView === 'true');
    const visFilter = await buildRecruiterEmailFilter(scope, filterUserId, filterTeamId);
    const where: any = { ...visFilter };

    if (gohireUserId) {
      where.gohireUserId = gohireUserId;
    }

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

    if (hasEvaluation === 'true') {
      where.evaluationData = { not: Prisma.DbNull };
    } else if (hasEvaluation === 'false') {
      where.evaluationData = Prisma.DbNull;
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
 * POST /:id/parse-resume — Fetch resume from URL, auto-detect file type (PDF, DOCX, DOC, MD, TXT),
 * parse it, and return markdown + structured data.
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

    logger.info('GOHIRE_INTERVIEWS', 'Fetching resume from URL', {
      requestId,
      id,
      url: interview.resumeUrl.substring(0, 80),
    });

    // Fetch the file from the remote URL
    const response = await fetch(interview.resumeUrl);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Failed to download resume: HTTP ${response.status}`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detect file type: URL extension → response Content-Type → magic bytes
    const extMimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      md: 'text/markdown',
      markdown: 'text/markdown',
      txt: 'text/plain',
    };
    const parsedUrl = new URL(interview.resumeUrl);
    const urlFilename = parsedUrl.pathname.split('/').pop() || '';
    const ext = urlFilename.includes('.') ? urlFilename.toLowerCase().split('.').pop()! : '';
    let mimetype = extMimeMap[ext] || '';

    // Fallback: check response Content-Type header
    if (!mimetype) {
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (contentType && contentType !== 'application/octet-stream') {
        mimetype = contentType;
      }
    }

    // Fallback: detect from buffer magic bytes
    if (!mimetype) {
      if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        mimetype = 'application/pdf'; // %PDF
      } else if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4B) {
        mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; // PK (ZIP/DOCX)
      } else {
        mimetype = 'text/plain'; // assume plain text
      }
    }

    const filename = decodeURIComponent(urlFilename || 'resume');
    logger.info('GOHIRE_INTERVIEWS', 'Resume file type detected', {
      requestId, ext: ext || 'none', mimetype, filename, bufferSize: buffer.length,
    });

    // Extract text using DocumentParsingService (supports PDF, DOCX, DOC, MD, TXT)
    const rawText = await documentParsingService.extractText(buffer, mimetype, filename, requestId);
    if (!rawText || rawText.trim().length < 20) {
      return res.status(422).json({
        success: false,
        error: 'Could not extract meaningful text from the resume file',
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
 * GET /:id/resume-file — Proxy the resume file from external URL for in-app viewing.
 * Returns the raw file with correct content-type so the browser can render it (PDF in iframe, etc.).
 */
router.get('/:id/resume-file', async (req, res) => {
  try {
    const { id } = req.params;
    const interview = await prisma.goHireInterview.findUnique({
      where: { id },
      select: { resumeUrl: true },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    if (!interview.resumeUrl) {
      return res.status(400).json({ success: false, error: 'No resume URL available' });
    }

    const response = await fetch(interview.resumeUrl);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Failed to fetch resume: HTTP ${response.status}`,
      });
    }

    // Determine content type from response or URL (strip query params for extension check)
    let contentType = response.headers.get('content-type') || 'application/octet-stream';
    const parsedUrl = new URL(interview.resumeUrl);
    const pathLower = parsedUrl.pathname.toLowerCase();
    if (pathLower.endsWith('.pdf')) {
      contentType = 'application/pdf';
    } else if (pathLower.endsWith('.docx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (pathLower.endsWith('.doc')) {
      contentType = 'application/msword';
    } else if (pathLower.endsWith('.md') || pathLower.endsWith('.txt')) {
      contentType = 'text/plain; charset=utf-8';
    }

    // Derive filename from URL
    const fileName = decodeURIComponent(parsedUrl.pathname.split('/').pop() || 'resume');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to proxy resume file', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to fetch resume file' });
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

    // Backfill JD from the original Interview record if missing
    if (!interview.jobDescription && interview.gohireUserId) {
      const originalInterview = await prisma.interview.findFirst({
        where: { gohireUserId: interview.gohireUserId },
        select: { jobDescription: true, jobTitle: true, hiringRequestId: true },
        orderBy: { createdAt: 'desc' },
      });
      let backfilledJd: string | null = null;
      let backfilledTitle: string | null = null;
      if (originalInterview?.jobDescription) {
        backfilledJd = originalInterview.jobDescription;
        backfilledTitle = originalInterview.jobTitle;
      } else if (originalInterview?.hiringRequestId) {
        const hr = await prisma.hiringRequest.findUnique({
          where: { id: originalInterview.hiringRequestId },
          select: { jobDescription: true, title: true },
        });
        if (hr?.jobDescription) {
          backfilledJd = hr.jobDescription;
          backfilledTitle = hr.title || null;
        }
      }
      if (backfilledJd) {
        await prisma.goHireInterview.update({
          where: { id },
          data: {
            jobDescription: backfilledJd,
            ...((!interview.jobTitle && backfilledTitle) ? { jobTitle: backfilledTitle } : {}),
          },
        });
        interview.jobDescription = backfilledJd;
        if (!interview.jobTitle && backfilledTitle) interview.jobTitle = backfilledTitle;
      }
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

/**
 * POST /:id/share — Generate a share token for public evaluation report access.
 */
router.post('/:id/share', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;
    const interview = await prisma.goHireInterview.findUnique({
      where: { id },
      select: { evaluationData: true, evaluationShareToken: true },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (!interview.evaluationData) {
      return res.status(400).json({ success: false, error: 'No evaluation data to share' });
    }

    // Reuse existing token if already shared
    const token = interview.evaluationShareToken || crypto.randomUUID();

    if (!interview.evaluationShareToken) {
      await prisma.goHireInterview.update({
        where: { id },
        data: { evaluationShareToken: token },
      });
    }

    logger.info('GOHIRE_INTERVIEWS', 'Evaluation share token generated', { requestId, id });

    res.json({ success: true, data: { token } });
  } catch (error) {
    logger.error('GOHIRE_INTERVIEWS', 'Failed to generate share token', {
      requestId,
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to generate share token' });
  }
});

/**
 * DELETE /:id/share — Revoke the share token for an evaluation report.
 */
router.delete('/:id/share', async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { id } = req.params;

    await prisma.goHireInterview.update({
      where: { id },
      data: { evaluationShareToken: null },
    });

    logger.info('GOHIRE_INTERVIEWS', 'Evaluation share token revoked', { requestId, id });

    res.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    logger.error('GOHIRE_INTERVIEWS', 'Failed to revoke share token', {
      requestId,
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to revoke share token' });
  }
});

export default router;
