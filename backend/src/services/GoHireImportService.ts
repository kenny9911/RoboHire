import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { generateRequestId, logger } from './LoggerService.js';
import { documentParsingService } from './DocumentParsingService.js';
import { normalizeExtractedText } from './ResumeParserService.js';
import { getOrParseResume, computeResumeHash } from './ResumeParsingCache.js';
import { generateResumeSummaryHighlight } from './ResumeSummaryService.js';
import { resumeOriginalFileStorageService } from './ResumeOriginalFileStorageService.js';
import { runConcurrent } from '../utils/concurrency.js';
import { normalizeGoHireJobTitle } from '../utils/jobTitleNormalizer.js';
import { parseSalaryFromText } from '../utils/salaryParser.js';
import { extractPreferencesFromJob, enrichPreferencesFromResume } from '../utils/preferencesExtractor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Phase1Result {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  errors: Array<{ row: number; error: string }>;
  duplicates: Array<{ row: number; gohireUserId: string; candidateName: string; interviewDatetime: string; existingId: string }>;
  usersCreated: number;
  usersLinked: number;
  jobsCreated: number;
  jobsLinked: number;
  resumesPending: number;
}

interface MappedCsvRow {
  gohireUserId: string;
  candidateName: string;
  candidateEmail: string | null;
  interviewDatetime: Date;
  interviewEndDatetime: Date | null;
  duration: number | null;
  videoUrl: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  recruiterId: string | null;
  jobTitle: string | null;
  jobDescription: string | null;
  jobRequirements: string | null;
  interviewRequirements: string | null;
  resumeUrl: string | null;
  transcriptUrl: string | null;
  lastLoginAt: Date | null;
  invitedAt: Date | null;
}

// Mime type map for resume file detection
const EXT_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
};

const RESUME_DOWNLOAD_TIMEOUT_MS = 30_000;
const RESUME_PROCESS_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// GoHireImportService
// ---------------------------------------------------------------------------

class GoHireImportService {

  /**
   * Phase 1 (synchronous): Create/link Users, Jobs, and GoHireInterview records.
   * Returns immediately with stats. Resume parsing is deferred to Phase 2.
   */
  async processPhase1Sync(
    dataRows: string[][],
    headers: string[],
    adminUserId: string,
    batchId: string,
    overwrite: boolean,
    mapCsvRow: (headers: string[], row: string[]) => MappedCsvRow,
  ): Promise<Phase1Result> {
    const requestId = generateRequestId();

    // In-memory caches to avoid repeated DB lookups within a batch
    const candidateCache = new Map<string, string | null>(); // gohireUserId → User.id
    const recruiterCache = new Map<string, string | null>(); // recruiterEmail → User.id
    const jobCache = new Map<string, string>();               // normalizedTitle → Job.id

    let created = 0, updated = 0, skipped = 0;
    let usersCreated = 0, usersLinked = 0;
    let jobsCreated = 0, jobsLinked = 0;
    let resumesPending = 0;
    const errors: Phase1Result['errors'] = [];
    const duplicates: Phase1Result['duplicates'] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // 1-indexed, header is row 1
      try {
        const record = mapCsvRow(headers, row);
        if (!record.gohireUserId) {
          errors.push({ row: rowNum, error: 'Missing gohire_user_id' });
          continue;
        }

        // ── 1. Candidate User Resolution ──
        let candidateUserId: string | null = null;
        if (record.candidateEmail) {
          candidateUserId = await this.resolveOrCreateCandidate(
            record.gohireUserId,
            record.candidateEmail,
            record.candidateName,
            candidateCache,
          );
          if (candidateUserId) {
            if (candidateCache.size <= usersCreated + usersLinked) {
              // The cache entry was just added — determine if new or existing
              // We track this inside resolveOrCreateCandidate via the _new suffix
            }
          }
        }

        // ── 2. Recruiter Linking ──
        let recruiterUserId: string | null = null;
        if (record.recruiterEmail) {
          recruiterUserId = await this.resolveRecruiter(record.recruiterEmail, recruiterCache);
        }

        // ── 3. Job Resolution ──
        let jobId: string | null = null;
        if (record.jobTitle) {
          jobId = await this.resolveOrCreateJob(
            record.jobTitle,
            record.jobDescription,
            record.jobRequirements,
            record.interviewRequirements,
            recruiterUserId || adminUserId,
            jobCache,
          );
        }

        // ── 4. GoHireInterview create/update ──
        const resumeProcessingStatus = record.resumeUrl ? 'pending' : 'skipped';
        if (resumeProcessingStatus === 'pending') resumesPending++;

        const interviewData: any = {
          ...record,
          candidateUserId,
          userId: recruiterUserId,
          jobId,
          importBatchId: batchId,
          resumeProcessingStatus,
        };

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
              data: interviewData,
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
          await prisma.goHireInterview.create({ data: interviewData });
          created++;
        }
      } catch (err) {
        errors.push({ row: rowNum, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Count users created vs linked from the cache
    for (const [key, val] of candidateCache.entries()) {
      if (val && key.endsWith('_new')) usersCreated++;
      else if (val) usersLinked++;
    }
    // Normalize counts — the _new tracking uses gohireUserId_new keys
    usersCreated = 0;
    usersLinked = 0;
    // Recount from the actual tracking
    // We'll use a simpler approach: check the _created set
    // Actually, let's fix this properly in resolveOrCreateCandidate

    // Update batch record
    await prisma.goHireImportBatch.update({
      where: { id: batchId },
      data: {
        phase1Completed: true,
        usersCreated: this._usersCreatedCount,
        usersLinked: this._usersLinkedCount,
        jobsCreated: this._jobsCreatedCount,
        jobsLinked: this._jobsLinkedCount,
        resumesPending: resumesPending,
        interviewsCreated: created,
        interviewsUpdated: updated,
        interviewsSkipped: skipped,
        errors: errors.length > 0 ? errors : undefined,
      },
    });

    logger.info('GOHIRE_IMPORT', 'Phase 1 completed', {
      requestId, batchId, created, updated, skipped,
      usersCreated: this._usersCreatedCount,
      usersLinked: this._usersLinkedCount,
      jobsCreated: this._jobsCreatedCount,
      jobsLinked: this._jobsLinkedCount,
      resumesPending,
    });

    const result: Phase1Result = {
      created, updated, skipped,
      total: dataRows.length,
      errors, duplicates,
      usersCreated: this._usersCreatedCount,
      usersLinked: this._usersLinkedCount,
      jobsCreated: this._jobsCreatedCount,
      jobsLinked: this._jobsLinkedCount,
      resumesPending,
    };

    // Reset per-batch counters
    this._usersCreatedCount = 0;
    this._usersLinkedCount = 0;
    this._jobsCreatedCount = 0;
    this._jobsLinkedCount = 0;

    return result;
  }

  /**
   * Phase 2 (async, fire-and-forget): Download and parse resumes in background.
   */
  async processPhase2Async(batchId: string): Promise<void> {
    const requestId = generateRequestId();
    logger.info('GOHIRE_IMPORT', 'Phase 2 starting — resume processing', { requestId, batchId });

    // Register batch in processing map for live tracking (same map used by stop endpoint)
    this._currentlyProcessing.set(batchId, new Map());

    // Detailed report — same structure as backfill so the frontend can render it consistently
    const report = {
      created: [] as Array<{ interviewId: string; candidateName: string; resumeId: string; resumeUrl: string | null; recruiter: string | null }>,
      skippedExisting: [] as Array<{ interviewId: string; candidateName: string; existingResumeId: string; resumeUrl: string | null; reason: string }>,
      skippedNoEmail: [] as Array<{ interviewId: string; candidateName: string; resumeUrl: string | null; reason: string }>,
      failed: [] as Array<{ interviewId: string; candidateName: string; resumeUrl: string | null; error: string }>,
    };

    try {
      const interviews = await prisma.goHireInterview.findMany({
        where: { importBatchId: batchId, resumeProcessingStatus: 'pending' },
        select: {
          id: true,
          resumeUrl: true,
          candidateUserId: true,
          candidateEmail: true,
          userId: true,
          candidateName: true,
          recruiterEmail: true,
          jobTitle: true,
          jobDescription: true,
        },
      });

      if (interviews.length === 0) {
        await prisma.goHireImportBatch.update({
          where: { id: batchId },
          data: { phase2Completed: true },
        });
        this._currentlyProcessing.delete(batchId);
        return;
      }

      // Periodic flush of the in-progress report so the frontend sees live progress
      const flushReportToDb = async () => {
        try {
          const processed = report.created.length + report.skippedExisting.length
            + report.skippedNoEmail.length + report.failed.length;
          await prisma.goHireImportBatch.update({
            where: { id: batchId },
            data: {
              resumesCreated: report.created.length,
              resumesFailed: report.failed.length,
              resumesPending: Math.max(0, interviews.length - processed),
              errors: { ...report } as any, // in-progress (no summary yet)
            },
          });
        } catch {
          // silent
        }
      };
      const flushInterval = setInterval(() => { void flushReportToDb(); }, 2000);

      const tasks = interviews.map((interview) => async () => {
        const processingMap = this._currentlyProcessing.get(batchId)!;
        processingMap.set(interview.id, { candidateName: interview.candidateName, startedAt: Date.now() });
        try {
          // Capture pre-state to know whether processOneResume created or linked
          const before = await prisma.goHireInterview.findUnique({
            where: { id: interview.id },
            select: { resumeId: true },
          });

          await this.processOneResume(interview, requestId);

          // Check post-state to determine outcome
          const after = await prisma.goHireInterview.findUnique({
            where: { id: interview.id },
            select: { resumeId: true, resumeProcessingStatus: true, resume: { select: { source: true, createdAt: true } } },
          });

          if (after?.resumeId) {
            // Was a resume linked or created? If the resume's source is gohire_import AND it was created very recently, it's "created"
            const isNewlyCreated = after.resume?.source === 'gohire_import' &&
              after.resume.createdAt && (Date.now() - after.resume.createdAt.getTime() < 2 * 60_000);

            if (before?.resumeId === after.resumeId || !isNewlyCreated) {
              // Linked to existing
              report.skippedExisting.push({
                interviewId: interview.id,
                candidateName: interview.candidateName,
                existingResumeId: after.resumeId,
                resumeUrl: interview.resumeUrl,
                reason: 'Resume already exists in Talent Hub',
              });
            } else {
              report.created.push({
                interviewId: interview.id,
                candidateName: interview.candidateName,
                resumeId: after.resumeId,
                resumeUrl: interview.resumeUrl,
                recruiter: interview.recruiterEmail,
              });
            }
          } else if (after?.resumeProcessingStatus === 'skipped') {
            report.skippedNoEmail.push({
              interviewId: interview.id,
              candidateName: interview.candidateName,
              resumeUrl: interview.resumeUrl,
              reason: 'No resume URL or candidate user',
            });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          await prisma.goHireInterview.update({
            where: { id: interview.id },
            data: {
              resumeProcessingStatus: 'failed',
              resumeProcessingError: errorMsg,
            },
          }).catch(() => {});
          logger.warn('GOHIRE_IMPORT', 'Resume processing failed', {
            requestId, interviewId: interview.id, candidateName: interview.candidateName, error: errorMsg,
          });
          report.failed.push({
            interviewId: interview.id,
            candidateName: interview.candidateName,
            resumeUrl: interview.resumeUrl,
            error: errorMsg,
          });
        } finally {
          this._currentlyProcessing.get(batchId)?.delete(interview.id);
        }
      });

      try {
        await runConcurrent(tasks, RESUME_PROCESS_CONCURRENCY);
      } finally {
        clearInterval(flushInterval);
      }

      // Build summary
      const summary = {
        total: interviews.length,
        created: report.created.length,
        skippedExisting: report.skippedExisting.length,
        skippedNoEmail: report.skippedNoEmail.length,
        failed: report.failed.length,
      };

      // Update batch with full detailed report (stored in errors JSON)
      await prisma.goHireImportBatch.update({
        where: { id: batchId },
        data: {
          phase2Completed: true,
          resumesCreated: report.created.length,
          resumesFailed: report.failed.length,
          resumesPending: 0,
          errors: { summary, ...report } as any,
        },
      });

      // Notify admin with detailed summary
      const batch = await prisma.goHireImportBatch.findUnique({
        where: { id: batchId },
        select: { adminUserId: true, fileName: true },
      });
      if (batch) {
        await prisma.notification.create({
          data: {
            userId: batch.adminUserId,
            type: 'task_completed',
            title: 'CSV Import: Resume Processing Complete',
            message: [
              `Total: ${summary.total}`,
              `Created: ${summary.created}`,
              `Already existed: ${summary.skippedExisting}`,
              `Failed: ${summary.failed}`,
            ].join(' | '),
            actionUrl: '/product/interview-hub',
          },
        });
      }

      logger.info('GOHIRE_IMPORT', 'Phase 2 completed', { requestId, batchId, ...summary });
    } catch (err) {
      logger.error('GOHIRE_IMPORT', 'Phase 2 failed', {
        requestId, batchId, error: err instanceof Error ? err.message : String(err),
      });
      await prisma.goHireImportBatch.update({
        where: { id: batchId },
        data: { phase2Completed: true, resumesFailed: -1 },
      }).catch(() => {});
    } finally {
      this._currentlyProcessing.delete(batchId);
      this._stoppingBatches.delete(batchId);
    }
  }

  /**
   * READ-ONLY scan: discover all interviews missing a Resume in TalentHub and
   * report what WOULD happen for each one (no DB writes).
   *
   * For each interview, this checks:
   *   - Does the candidate User account exist (by email)?
   *   - Does the candidate already have a Resume in TalentHub? (would be linked, not created)
   *   - Does the recruiter User exist?
   * And returns a recommended action so the admin can decide what to process.
   */
  async scanMissingResumes(): Promise<Array<{
    interviewId: string;
    gohireUserId: string;
    candidateName: string;
    candidateEmail: string | null;
    recruiterName: string | null;
    recruiterEmail: string | null;
    jobTitle: string | null;
    resumeUrl: string | null;
    interviewDatetime: string;
    interviewEndDatetime: string | null;
    durationMinutes: number | null;
    isShortInterview: boolean;
    candidateUserExists: boolean;
    candidateUserId: string | null;
    hasResumeInTalentHub: boolean;
    existingResumeId: string | null;
    recruiterUserExists: boolean;
    recruiterUserId: string | null;
    recommendedAction: 'create_new' | 'link_existing' | 'create_user_and_resume' | 'no_email' | 'no_url';
  }>> {
    // Find all interviews missing a linked Resume
    const interviews = await prisma.goHireInterview.findMany({
      where: { resumeId: null },
      select: {
        id: true,
        gohireUserId: true,
        candidateName: true,
        candidateEmail: true,
        recruiterName: true,
        recruiterEmail: true,
        jobTitle: true,
        resumeUrl: true,
        interviewDatetime: true,
        interviewEndDatetime: true,
        candidateUserId: true,
        userId: true,
      },
      orderBy: { interviewDatetime: 'desc' },
    });

    if (interviews.length === 0) return [];

    // Batch-fetch all unique candidate emails and recruiter emails to enrich
    const candidateEmails = [...new Set(interviews.map((i) => i.candidateEmail).filter(Boolean) as string[])];
    const recruiterEmails = [...new Set(interviews.map((i) => i.recruiterEmail).filter(Boolean) as string[])];

    const [candidateUsers, recruiterUsers] = await Promise.all([
      candidateEmails.length > 0
        ? prisma.user.findMany({
            where: { email: { in: candidateEmails } },
            select: { id: true, email: true },
          })
        : Promise.resolve([] as Array<{ id: string; email: string }>),
      recruiterEmails.length > 0
        ? prisma.user.findMany({
            where: { email: { in: recruiterEmails } },
            select: { id: true, email: true },
          })
        : Promise.resolve([] as Array<{ id: string; email: string }>),
    ]);

    const candidateUserByEmail = new Map(candidateUsers.map((u) => [u.email.toLowerCase(), u.id]));
    const recruiterUserByEmail = new Map(recruiterUsers.map((u) => [u.email.toLowerCase(), u.id]));

    // CANONICAL resume lookup: by Resume.email (candidate's email).
    // This catches resumes uploaded normally via TalentHub where userId=recruiter, not candidate.
    const resumesByEmail = candidateEmails.length > 0
      ? await prisma.resume.findMany({
          where: { email: { in: candidateEmails } },
          select: { id: true, email: true, userId: true },
        })
      : [];
    const resumeByEmail = new Map<string, string>();
    for (const r of resumesByEmail) {
      if (r.email) {
        const key = r.email.toLowerCase();
        if (!resumeByEmail.has(key)) resumeByEmail.set(key, r.id);
      }
    }

    // SECONDARY resume lookup: by candidateUserId (for resumes created via our pipeline)
    const existingCandidateUserIds = candidateUsers.map((u) => u.id);
    const resumesByUserId = existingCandidateUserIds.length > 0
      ? await prisma.resume.findMany({
          where: { userId: { in: existingCandidateUserIds } },
          select: { id: true, userId: true },
        })
      : [];
    const resumeByUserId = new Map<string, string>();
    for (const r of resumesByUserId) {
      if (!resumeByUserId.has(r.userId)) resumeByUserId.set(r.userId, r.id);
    }

    return interviews.map((interview) => {
      const emailLower = interview.candidateEmail?.toLowerCase() || null;
      const recruiterEmailLower = interview.recruiterEmail?.toLowerCase() || null;
      const candidateUserId = emailLower ? candidateUserByEmail.get(emailLower) || null : null;
      const recruiterUserId = recruiterEmailLower ? recruiterUserByEmail.get(recruiterEmailLower) || null : null;
      // Check by email first (canonical), then fall back to userId match
      const existingResumeId = (emailLower && resumeByEmail.get(emailLower)) ||
        (candidateUserId && resumeByUserId.get(candidateUserId)) || null;

      let recommendedAction: 'create_new' | 'link_existing' | 'create_user_and_resume' | 'no_email' | 'no_url';
      if (!interview.resumeUrl) {
        recommendedAction = 'no_url';
      } else if (!interview.candidateEmail) {
        recommendedAction = 'no_email';
      } else if (existingResumeId) {
        recommendedAction = 'link_existing';
      } else if (candidateUserId) {
        recommendedAction = 'create_new';
      } else {
        recommendedAction = 'create_user_and_resume';
      }

      // Compute duration in minutes from interviewEndDatetime - interviewDatetime
      // (the explicit `duration` field is unreliable; always use the timestamp diff)
      let durationMinutes: number | null = null;
      if (interview.interviewEndDatetime) {
        const diffMs = interview.interviewEndDatetime.getTime() - interview.interviewDatetime.getTime();
        if (diffMs > 0) durationMinutes = Math.round(diffMs / 60000);
      }
      const isShortInterview = durationMinutes !== null && durationMinutes < 9;

      return {
        interviewId: interview.id,
        gohireUserId: interview.gohireUserId,
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail,
        recruiterName: interview.recruiterName,
        recruiterEmail: interview.recruiterEmail,
        jobTitle: interview.jobTitle,
        resumeUrl: interview.resumeUrl,
        interviewDatetime: interview.interviewDatetime.toISOString(),
        interviewEndDatetime: interview.interviewEndDatetime?.toISOString() || null,
        durationMinutes,
        isShortInterview,
        candidateUserExists: !!candidateUserId,
        candidateUserId,
        hasResumeInTalentHub: !!existingResumeId,
        existingResumeId,
        recruiterUserExists: !!recruiterUserId,
        recruiterUserId,
        recommendedAction,
      };
    });
  }

  /**
   * Backfill: scan ALL GoHireInterview records that have a resumeUrl but no
   * linked Resume in TalentHub (or only the specific interviewIds passed in).
   * For each, resolve/create the candidate user, resolve the recruiter,
   * download+parse the resume, and create the Resume record.
   *
   * Returns a batchId that can be polled via GET /import-status/:batchId.
   */
  async backfillMissingResumes(
    adminUserId: string,
    interviewIds?: string[],
  ): Promise<{ batchId: string; totalToProcess: number }> {
    const requestId = generateRequestId();

    // Build the where clause — if interviewIds provided, restrict to those
    const where: any = {
      resumeUrl: { not: null },
      resumeId: null, // SAFETY: only interviews still missing a resume
    };
    if (interviewIds && interviewIds.length > 0) {
      where.id = { in: interviewIds };
    }

    const interviews = await prisma.goHireInterview.findMany({
      where,
      select: {
        id: true,
        gohireUserId: true,
        candidateName: true,
        candidateEmail: true,
        recruiterEmail: true,
        resumeUrl: true,
        candidateUserId: true,
        userId: true,
        jobTitle: true,
        jobDescription: true,
      },
    });

    if (interviews.length === 0) {
      return { batchId: '', totalToProcess: 0 };
    }

    // Create a batch to track progress
    const batch = await prisma.goHireImportBatch.create({
      data: {
        adminUserId,
        fileName: interviewIds ? 'create-selected-resumes' : 'backfill-missing-resumes',
        totalRows: interviews.length,
        phase1Completed: true, // no Phase 1 needed for backfill
        resumesPending: interviews.length,
      },
    });

    logger.info('GOHIRE_BACKFILL', 'Starting resume backfill', {
      requestId, batchId: batch.id, total: interviews.length,
      mode: interviewIds ? 'selected' : 'all',
    });

    // Run async in background — resolve users first, then process resumes
    this.runBackfill(batch.id, interviews, adminUserId, requestId).catch((err) => {
      logger.error('GOHIRE_BACKFILL', 'Backfill failed', {
        requestId, batchId: batch.id, error: err instanceof Error ? err.message : String(err),
      });
    });

    return { batchId: batch.id, totalToProcess: interviews.length };
  }

  /**
   * Internal: run the backfill in background.
   * NEVER overwrites existing resumes — only creates new ones for candidates
   * who have no resume in TalentHub yet.
   */
  private async runBackfill(
    batchId: string,
    interviews: Array<{
      id: string;
      gohireUserId: string;
      candidateName: string;
      candidateEmail: string | null;
      recruiterEmail: string | null;
      resumeUrl: string | null;
      candidateUserId: string | null;
      userId: string | null;
      jobTitle: string | null;
      jobDescription: string | null;
    }>,
    adminUserId: string,
    requestId: string,
  ): Promise<void> {
    const candidateCache = new Map<string, string | null>();
    const recruiterCache = new Map<string, string | null>();

    // Register this batch in the processing map (used by stop & status endpoints)
    this._currentlyProcessing.set(batchId, new Map());

    // Status report — separate logs for each outcome (includes resumeUrl for clickable links)
    const report = {
      created: [] as Array<{ interviewId: string; candidateName: string; resumeId: string; resumeUrl: string | null; recruiter: string | null }>,
      skippedExisting: [] as Array<{ interviewId: string; candidateName: string; existingResumeId: string; resumeUrl: string | null; reason: string }>,
      skippedNoEmail: [] as Array<{ interviewId: string; candidateName: string; resumeUrl: string | null; reason: string }>,
      failed: [] as Array<{ interviewId: string; candidateName: string; resumeUrl: string | null; error: string }>,
      notProcessed: [] as Array<{ interviewId: string; candidateName: string; resumeUrl: string | null }>, // populated if stopped
    };

    // Periodic flush of the in-progress report so the frontend sees live progress
    // (without this the counters stay at 0 until the batch finalizes).
    const flushReportToDb = async () => {
      try {
        const processed = report.created.length + report.skippedExisting.length
          + report.skippedNoEmail.length + report.failed.length + report.notProcessed.length;
        await prisma.goHireImportBatch.update({
          where: { id: batchId },
          data: {
            // Don't set phase2Completed here — only at final flush
            resumesCreated: report.created.length,
            resumesFailed: report.failed.length,
            resumesPending: Math.max(0, interviews.length - processed),
            errors: { ...report } as any, // in-progress (no summary yet)
          },
        });
      } catch {
        // silent — not critical if a single flush fails
      }
    };
    const flushInterval = setInterval(() => { void flushReportToDb(); }, 2000);

    const tasks = interviews.map((interview) => async () => {
      // Stop check — if user requested stop, skip remaining tasks
      if (this._stoppingBatches.has(batchId)) {
        report.notProcessed.push({ interviewId: interview.id, candidateName: interview.candidateName, resumeUrl: interview.resumeUrl });
        return;
      }

      // Mark this interview as "currently processing"
      const processingMap = this._currentlyProcessing.get(batchId)!;
      processingMap.set(interview.id, { candidateName: interview.candidateName, startedAt: Date.now() });

      try {
        // Step 1: Ensure candidateUserId is set
        let candidateUserId = interview.candidateUserId;
        if (!candidateUserId && interview.candidateEmail) {
          candidateUserId = await this.resolveOrCreateCandidate(
            interview.gohireUserId,
            interview.candidateEmail,
            interview.candidateName,
            candidateCache,
          );
          if (candidateUserId) {
            await prisma.goHireInterview.update({
              where: { id: interview.id },
              data: { candidateUserId },
            });
          }
        }

        if (!candidateUserId) {
          const reason = 'No candidate email — cannot create user account';
          logger.warn('GOHIRE_BACKFILL', 'Skipping — no candidate email', {
            requestId, interviewId: interview.id, candidateName: interview.candidateName,
          });
          await prisma.goHireInterview.update({
            where: { id: interview.id },
            data: { resumeProcessingStatus: 'skipped', resumeProcessingError: reason },
          });
          report.skippedNoEmail.push({ interviewId: interview.id, candidateName: interview.candidateName, resumeUrl: interview.resumeUrl, reason });
          return;
        }

        // Step 2: Ensure userId (recruiter) is set
        let recruiterUserId = interview.userId;
        if (!recruiterUserId && interview.recruiterEmail) {
          recruiterUserId = await this.resolveRecruiter(interview.recruiterEmail, recruiterCache);
          if (recruiterUserId) {
            await prisma.goHireInterview.update({
              where: { id: interview.id },
              data: { userId: recruiterUserId },
            });
          }
        }

        // Step 3: CHECK if candidate already has ANY resume in TalentHub — DO NOT OVERWRITE.
        // Look up by candidate email FIRST (canonical — catches resumes uploaded normally
        // via TalentHub UI where Resume.userId is the recruiter, not the candidate),
        // then fall back to userId match (resumes created via this pipeline).
        const existingResume = interview.candidateEmail
          ? await prisma.resume.findFirst({
              where: {
                OR: [
                  { email: interview.candidateEmail },
                  { userId: candidateUserId },
                ],
              },
              select: { id: true, name: true },
              orderBy: { createdAt: 'desc' },
            })
          : await prisma.resume.findFirst({
              where: { userId: candidateUserId },
              select: { id: true, name: true },
              orderBy: { createdAt: 'desc' },
            });

        if (existingResume) {
          // Resume already exists — just link it to the interview, do NOT overwrite
          const reason = `Resume already exists in Talent Hub (resumeId: ${existingResume.id}, name: ${existingResume.name})`;
          logger.info('GOHIRE_BACKFILL', 'Skipping — resume already exists', {
            requestId, interviewId: interview.id, candidateName: interview.candidateName,
            existingResumeId: existingResume.id,
          });
          await prisma.goHireInterview.update({
            where: { id: interview.id },
            data: {
              resumeId: existingResume.id,
              resumeProcessingStatus: 'completed',
              resumeProcessingError: null,
            },
          });
          report.skippedExisting.push({
            interviewId: interview.id,
            candidateName: interview.candidateName,
            existingResumeId: existingResume.id,
            resumeUrl: interview.resumeUrl,
            reason,
          });
          return;
        }

        // Step 4: No resume exists — download, parse, create a new one
        await this.processOneResume({
          id: interview.id,
          resumeUrl: interview.resumeUrl,
          candidateUserId,
          candidateEmail: interview.candidateEmail,
          userId: recruiterUserId,
          candidateName: interview.candidateName,
          jobTitle: interview.jobTitle,
          jobDescription: interview.jobDescription,
        }, requestId);

        // Get the newly created resumeId
        const updated = await prisma.goHireInterview.findUnique({
          where: { id: interview.id },
          select: { resumeId: true },
        });

        report.created.push({
          interviewId: interview.id,
          candidateName: interview.candidateName,
          resumeId: updated?.resumeId || 'unknown',
          resumeUrl: interview.resumeUrl,
          recruiter: interview.recruiterEmail,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await prisma.goHireInterview.update({
          where: { id: interview.id },
          data: { resumeProcessingStatus: 'failed', resumeProcessingError: errorMsg },
        }).catch(() => {});
        logger.warn('GOHIRE_BACKFILL', 'Resume backfill failed for interview', {
          requestId, interviewId: interview.id, candidateName: interview.candidateName, error: errorMsg,
        });
        report.failed.push({ interviewId: interview.id, candidateName: interview.candidateName, resumeUrl: interview.resumeUrl, error: errorMsg });
      } finally {
        // Remove from currently-processing tracking
        this._currentlyProcessing.get(batchId)?.delete(interview.id);
      }
    });

    try {
      await runConcurrent(tasks, RESUME_PROCESS_CONCURRENCY);
    } finally {
      clearInterval(flushInterval);
    }

    // Determine if stopped — if so, populate notProcessed with anything still pending
    const wasStopped = this._stoppingBatches.has(batchId);
    if (wasStopped) {
      // Any items not in any report category were skipped due to stop
      const processedIds = new Set([
        ...report.created.map((r) => r.interviewId),
        ...report.skippedExisting.map((r) => r.interviewId),
        ...report.skippedNoEmail.map((r) => r.interviewId),
        ...report.failed.map((r) => r.interviewId),
        ...report.notProcessed.map((r) => r.interviewId),
      ]);
      for (const interview of interviews) {
        if (!processedIds.has(interview.id)) {
          report.notProcessed.push({ interviewId: interview.id, candidateName: interview.candidateName, resumeUrl: interview.resumeUrl });
        }
      }
    }

    // Cleanup runtime state
    this._currentlyProcessing.delete(batchId);
    this._stoppingBatches.delete(batchId);

    // Build summary
    const summary = {
      total: interviews.length,
      created: report.created.length,
      skippedExisting: report.skippedExisting.length,
      skippedNoEmail: report.skippedNoEmail.length,
      failed: report.failed.length,
      notProcessed: report.notProcessed.length,
      stopped: wasStopped,
    };

    // Update batch with full report
    await prisma.goHireImportBatch.update({
      where: { id: batchId },
      data: {
        phase2Completed: true,
        resumesCreated: report.created.length,
        resumesFailed: report.failed.length,
        resumesPending: report.notProcessed.length,
        errors: { summary, ...report } as any,
      },
    });

    // Notify admin with summary
    await prisma.notification.create({
      data: {
        userId: adminUserId,
        type: 'task_completed',
        title: wasStopped ? 'Resume Backfill Stopped' : 'Resume Backfill Complete',
        message: [
          wasStopped ? 'STOPPED' : 'DONE',
          `Total: ${summary.total}`,
          `Created: ${summary.created}`,
          `Already existed: ${summary.skippedExisting}`,
          `No email: ${summary.skippedNoEmail}`,
          `Failed: ${summary.failed}`,
          ...(wasStopped ? [`Not processed: ${summary.notProcessed}`] : []),
        ].join(' | '),
        actionUrl: '/product/interview-hub',
      },
    });

    // Reset counters
    this._usersCreatedCount = 0;
    this._usersLinkedCount = 0;

    logger.info('GOHIRE_BACKFILL', wasStopped ? 'Backfill stopped' : 'Backfill completed', {
      requestId, batchId, ...summary,
    });
  }

  // ---------------------------------------------------------------------------
  // Backfill stop & processing state (in-memory)
  // ---------------------------------------------------------------------------

  private _stoppingBatches = new Set<string>();
  private _currentlyProcessing = new Map<string, Map<string, { candidateName: string; startedAt: number }>>();

  /**
   * Request a graceful stop for a backfill batch. Currently in-flight resumes
   * (up to RESUME_PROCESS_CONCURRENCY) will finish, but no new ones will start.
   */
  requestBackfillStop(batchId: string): boolean {
    if (!this._currentlyProcessing.has(batchId)) {
      return false; // batch not running
    }
    this._stoppingBatches.add(batchId);
    logger.info('GOHIRE_BACKFILL', 'Stop requested', { batchId });
    return true;
  }

  /**
   * Returns currently-processing items + stop status for a batch.
   */
  getBackfillRuntimeState(batchId: string): {
    isRunning: boolean;
    stopRequested: boolean;
    processing: Array<{ interviewId: string; candidateName: string; startedAt: number }>;
  } {
    const processingMap = this._currentlyProcessing.get(batchId);
    return {
      isRunning: !!processingMap,
      stopRequested: this._stoppingBatches.has(batchId),
      processing: processingMap
        ? Array.from(processingMap.entries()).map(([interviewId, info]) => ({
            interviewId,
            candidateName: info.candidateName,
            startedAt: info.startedAt,
          }))
        : [],
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _usersCreatedCount = 0;
  private _usersLinkedCount = 0;
  private _jobsCreatedCount = 0;
  private _jobsLinkedCount = 0;

  /**
   * Resolve or create a candidate user account.
   * Uses gohireUserId as the cache key to avoid redundant lookups for the same candidate.
   */
  private async resolveOrCreateCandidate(
    gohireUserId: string,
    email: string,
    name: string,
    cache: Map<string, string | null>,
  ): Promise<string | null> {
    // Check cache
    if (cache.has(gohireUserId)) {
      return cache.get(gohireUserId) || null;
    }

    try {
      // Look up by email
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      });

      if (existing) {
        cache.set(gohireUserId, existing.id);
        this._usersLinkedCount++;
        return existing.id;
      }

      // Create new candidate user
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const newUser = await prisma.user.create({
        data: {
          email,
          name: name || 'Unknown',
          passwordHash,
          role: 'user',
          provider: 'gohire_import',
          subscriptionTier: 'free',
        },
      });

      cache.set(gohireUserId, newUser.id);
      this._usersCreatedCount++;
      return newUser.id;
    } catch (err: any) {
      // Handle race condition: unique constraint on email
      if (err?.code === 'P2002') {
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existing) {
          cache.set(gohireUserId, existing.id);
          this._usersLinkedCount++;
          return existing.id;
        }
      }
      cache.set(gohireUserId, null);
      return null;
    }
  }

  /**
   * Resolve a recruiter by email. Returns null if not found (does not create).
   */
  private async resolveRecruiter(
    email: string,
    cache: Map<string, string | null>,
  ): Promise<string | null> {
    if (cache.has(email)) return cache.get(email) || null;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    cache.set(email, user?.id ?? null);
    return user?.id ?? null;
  }

  /**
   * Resolve or create a Job record. Dedup by normalized title + userId.
   */
  private async resolveOrCreateJob(
    rawTitle: string,
    description: string | null,
    requirements: string | null,
    interviewRequirements: string | null,
    ownerUserId: string,
    cache: Map<string, string>,
  ): Promise<string> {
    const normalizedTitle = normalizeGoHireJobTitle(rawTitle);
    const cacheKey = `${ownerUserId}::${normalizedTitle}`;

    if (cache.has(cacheKey)) return cache.get(cacheKey)!;

    // Look for existing job with same title owned by this user
    const existing = await prisma.job.findFirst({
      where: { title: normalizedTitle, userId: ownerUserId },
      select: { id: true },
    });

    if (existing) {
      cache.set(cacheKey, existing.id);
      this._jobsLinkedCount++;
      return existing.id;
    }

    // Parse salary from description
    const salary = description ? parseSalaryFromText(description) : null;

    const job = await prisma.job.create({
      data: {
        userId: ownerUserId,
        title: normalizedTitle,
        description: description || null,
        qualifications: requirements || null,
        interviewRequirements: interviewRequirements || null,
        salaryMin: salary?.salaryMin ?? null,
        salaryMax: salary?.salaryMax ?? null,
        salaryCurrency: salary?.salaryCurrency ?? null,
        salaryPeriod: salary?.salaryPeriod ?? null,
        salaryText: salary?.salaryText ?? null,
        status: 'open',
      },
    });

    cache.set(cacheKey, job.id);
    this._jobsCreatedCount++;
    return job.id;
  }

  /**
   * Download, parse, and create a Resume record for one GoHireInterview.
   */
  private async processOneResume(
    interview: {
      id: string;
      resumeUrl: string | null;
      candidateUserId: string | null;
      candidateEmail?: string | null;
      userId: string | null;
      candidateName: string;
      jobTitle: string | null;
      jobDescription: string | null;
    },
    requestId: string,
  ): Promise<void> {
    if (!interview.resumeUrl || !interview.candidateUserId) {
      await prisma.goHireInterview.update({
        where: { id: interview.id },
        data: { resumeProcessingStatus: 'skipped' },
      });
      return;
    }

    // SAFETY CHECK: if a resume already exists for this candidate (by email or by userId),
    // link to it and return — DO NOT overwrite. Catches resumes uploaded normally via TalentHub UI.
    const existingByEmailOrUser = interview.candidateEmail
      ? await prisma.resume.findFirst({
          where: {
            OR: [
              { email: interview.candidateEmail },
              { userId: interview.candidateUserId },
            ],
          },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        })
      : await prisma.resume.findFirst({
          where: { userId: interview.candidateUserId },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });

    if (existingByEmailOrUser) {
      logger.info('GOHIRE_IMPORT', 'processOneResume — linking existing resume', {
        requestId, interviewId: interview.id, existingResumeId: existingByEmailOrUser.id,
      });
      await prisma.goHireInterview.update({
        where: { id: interview.id },
        data: {
          resumeId: existingByEmailOrUser.id,
          resumeProcessingStatus: 'completed',
          resumeProcessingError: null,
        },
      });
      return;
    }

    // Mark as processing
    await prisma.goHireInterview.update({
      where: { id: interview.id },
      data: { resumeProcessingStatus: 'processing' },
    });

    // Download with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESUME_DOWNLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(interview.resumeUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Resume download failed: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detect file type
    const mimetype = this.detectMimetype(interview.resumeUrl, response, buffer);
    const urlFilename = new URL(interview.resumeUrl).pathname.split('/').pop() || 'resume';
    const filename = decodeURIComponent(urlFilename);

    // Extract text
    const rawText = await documentParsingService.extractText(buffer, mimetype, filename, requestId);
    if (!rawText || rawText.trim().length < 20) {
      throw new Error('Could not extract meaningful text from resume');
    }

    const normalizedText = normalizeExtractedText(rawText);
    const contentHash = computeResumeHash(normalizedText);

    // Check dedup — same resume for same user
    const existingResume = await prisma.resume.findUnique({
      where: { userId_contentHash: { userId: interview.candidateUserId, contentHash } },
      select: { id: true },
    });

    let resumeId: string;

    if (existingResume) {
      resumeId = existingResume.id;
    } else {
      // Parse via LLM
      const { parsedData } = await getOrParseResume(normalizedText, interview.candidateUserId, requestId);

      // Generate summary
      let summary: string | null = null;
      let highlight: string | null = null;
      try {
        const sh = await generateResumeSummaryHighlight(parsedData, requestId);
        summary = sh.summary;
        highlight = sh.highlight;
      } catch {
        // Non-fatal — continue without summary
      }

      // Extract preferences
      const jobPrefs = extractPreferencesFromJob({
        jobTitle: interview.jobTitle || undefined,
        jobDescription: interview.jobDescription || undefined,
      });
      const preferences = enrichPreferencesFromResume(jobPrefs, parsedData);

      // Persist the ORIGINAL PDF file so "View Original Document" works.
      // Without this, the viewer falls back to a reconstructed PDF from text (looks broken).
      let storedOriginalFile: Awaited<ReturnType<typeof resumeOriginalFileStorageService.saveFile>> = null;
      try {
        storedOriginalFile = await resumeOriginalFileStorageService.saveFile({
          buffer,
          fileName: filename,
          mimeType: mimetype,
          size: buffer.length,
          userId: interview.candidateUserId,
          requestId,
        });
      } catch (err) {
        logger.warn('GOHIRE_IMPORT', 'Failed to store original resume file (resume will still be created)', {
          requestId, interviewId: interview.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Create Resume record — link to recruiter so the candidate is associated with their recruiter.
      // Race-safe: if another concurrent task just created the same (userId, contentHash),
      // Prisma throws P2002 — we recover by fetching the row that won the race.
      try {
        const resume = await prisma.resume.create({
          data: {
            userId: interview.candidateUserId,
            recruiterUserId: interview.userId || null,
            name: parsedData?.name || interview.candidateName || 'Unknown',
            email: parsedData?.email || null,
            phone: parsedData?.phone || null,
            currentRole: parsedData?.currentRole || null,
            experienceYears: parsedData?.experienceYears || null,
            resumeText: normalizedText,
            parsedData: parsedData || undefined,
            contentHash,
            summary,
            highlight,
            source: 'gohire_import',
            preferences: preferences as any,
            fileName: filename,
            fileSize: buffer.length,
            fileType: mimetype,
            // Original file storage references — required for "View Original Document"
            originalFileProvider: storedOriginalFile?.provider || null,
            originalFileKey: storedOriginalFile?.key || null,
            originalFileName: storedOriginalFile?.fileName || null,
            originalFileMimeType: storedOriginalFile?.mimeType || null,
            originalFileSize: storedOriginalFile?.size || null,
            originalFileChecksum: storedOriginalFile?.checksum || null,
            originalFileStoredAt: storedOriginalFile?.storedAt || null,
          },
        });
        resumeId = resume.id;
      } catch (err: any) {
        // P2002 = unique constraint violation. A concurrent task just created the same resume.
        if (err?.code === 'P2002') {
          logger.info('GOHIRE_IMPORT', 'Race condition on Resume create — recovering by linking to existing row', {
            requestId, interviewId: interview.id, candidateName: interview.candidateName,
          });
          const concurrent = await prisma.resume.findUnique({
            where: { userId_contentHash: { userId: interview.candidateUserId, contentHash } },
            select: { id: true },
          });
          if (!concurrent) {
            throw err; // shouldn't happen — if P2002 fired, the row must exist
          }
          resumeId = concurrent.id;
        } else {
          throw err;
        }
      }
    }

    // Update GoHireInterview with resume link
    await prisma.goHireInterview.update({
      where: { id: interview.id },
      data: {
        resumeId,
        resumeProcessingStatus: 'completed',
        parsedResumeText: normalizedText.substring(0, 50_000), // Cache first 50k chars
      },
    });

    logger.info('GOHIRE_IMPORT', 'Resume processed', {
      requestId,
      interviewId: interview.id,
      resumeId,
      cached: !!existingResume,
    });
  }

  /**
   * Detect mimetype from URL extension → Content-Type header → magic bytes.
   */
  private detectMimetype(url: string, response: Response, buffer: Buffer): string {
    // URL extension
    const ext = url.includes('.') ? url.toLowerCase().split('.').pop()?.split('?')[0] || '' : '';
    if (EXT_MIME_MAP[ext]) return EXT_MIME_MAP[ext];

    // Content-Type header
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType && contentType !== 'application/octet-stream') return contentType;

    // Magic bytes
    if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }
    if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4B) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return 'text/plain';
  }
}

export const goHireImportService = new GoHireImportService();
