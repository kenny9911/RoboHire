import prisma from '../lib/prisma.js';
import { logger } from './LoggerService.js';
import { TASK_TYPES } from './TaskGeneratorService.js';

/**
 * TaskExecutorService handles the automatic execution of agent tasks.
 * When a task is marked as auto-execute, this service runs the appropriate
 * backend logic (evaluation, matching, reminders, etc.).
 */
class TaskExecutorService {
  async execute(task: { id: string; type: string; interviewId?: string | null; jobId?: string | null; resumeId?: string | null }): Promise<void> {
    logger.info('TASK_EXECUTOR', `Executing agent task: ${task.type}`, { taskId: task.id });

    switch (task.type) {
      case TASK_TYPES.EVALUATE_INTERVIEW:
        await this.executeEvaluateInterview(task);
        break;

      case TASK_TYPES.RUN_MATCHING:
        await this.executeRunMatching(task);
        break;

      case TASK_TYPES.REPARSE_RESUME:
        await this.executeReparseResume(task);
        break;

      case TASK_TYPES.INTERVIEW_REMINDER:
        await this.executeInterviewReminder(task);
        break;

      case TASK_TYPES.SYNC_GOHIRE_INTERVIEWS:
        // GoHire sync is handled externally via the gohireInterviews route;
        // no autonomous execution needed — admin triggers manually or via cron
        logger.info('TASK_EXECUTOR', 'GoHire sync task acknowledged', { taskId: task.id });
        break;

      default:
        logger.warn('TASK_EXECUTOR', `Unknown agent task type: ${task.type}`, { taskId: task.id });
    }
  }

  private async executeEvaluateInterview(task: { id: string; interviewId?: string | null }): Promise<void> {
    if (!task.interviewId) {
      logger.warn('TASK_EXECUTOR', 'No interviewId for evaluate task', { taskId: task.id });
      return;
    }

    const interview = await prisma.interview.findUnique({
      where: { id: task.interviewId },
      include: { evaluation: true },
    });

    if (!interview) {
      logger.warn('TASK_EXECUTOR', 'Interview not found', { interviewId: task.interviewId });
      return;
    }

    if (interview.evaluation) {
      logger.info('TASK_EXECUTOR', 'Interview already evaluated, skipping', { interviewId: task.interviewId });
      return;
    }

    if (!interview.transcript) {
      logger.info('TASK_EXECUTOR', 'Interview has no transcript, skipping auto-eval', { interviewId: task.interviewId });
      return;
    }

    // Format transcript for EvaluationAgent
    const transcriptText = Array.isArray(interview.transcript)
      ? (interview.transcript as any[]).map((t: any) => `${t.role}: ${t.content}`).join('\n')
      : JSON.stringify(interview.transcript);

    const { EvaluationAgent } = await import('../agents/EvaluationAgent.js');
    const evaluationAgent = new EvaluationAgent();
    const evalResult = await evaluationAgent.execute(
      {
        interviewScript: transcriptText,
        jd: interview.jobDescription || '',
        resume: interview.resumeText || '',
      },
      undefined,
      `task-${task.id}`,
    );

    const overallScore = (evalResult as any)?.overallScore ?? null;
    const grade = (evalResult as any)?.grade ?? null;
    const verdict = (evalResult as any)?.verdict ?? null;
    const summary = (evalResult as any)?.summary ?? null;
    const strengths = (evalResult as any)?.strengths ?? null;
    const weaknesses = (evalResult as any)?.weaknesses ?? null;

    await prisma.interviewEvaluation.upsert({
      where: { interviewId: task.interviewId },
      update: { overallScore, grade, verdict, evaluationData: evalResult as any, summary, strengths, weaknesses },
      create: { interviewId: task.interviewId, overallScore, grade, verdict, evaluationData: evalResult as any, summary, strengths, weaknesses },
    });

    logger.info('TASK_EXECUTOR', 'Auto-evaluation completed', {
      interviewId: task.interviewId,
      candidateName: interview.candidateName,
      score: overallScore,
      verdict,
    });

    // Chain: trigger review_evaluation + hiring_decision tasks
    const { taskGenerator } = await import('./TaskGeneratorService.js');
    void taskGenerator.onEvaluationCreated(
      { interviewId: task.interviewId, overallScore, verdict, summary },
      {
        id: interview.id,
        userId: interview.userId,
        candidateName: interview.candidateName,
        jobTitle: interview.jobTitle,
        jobId: (interview as any).jobId || null,
        resumeId: (interview as any).resumeId || null,
      },
    );
  }

  private async executeRunMatching(task: { id: string; jobId?: string | null }): Promise<void> {
    if (!task.jobId) {
      logger.warn('TASK_EXECUTOR', 'No jobId for matching task', { taskId: task.id });
      return;
    }

    const job = await prisma.job.findFirst({
      where: { id: task.jobId },
    });
    if (!job || job.status !== 'open') {
      logger.info('TASK_EXECUTOR', 'Job not open, skipping auto-match', { jobId: task.jobId });
      return;
    }

    if (!job.description) {
      logger.info('TASK_EXECUTOR', 'Job has no description, skipping auto-match', { jobId: task.jobId });
      return;
    }

    // Fetch all resumes for the job owner
    const resumes = await prisma.resume.findMany({
      where: { userId: job.userId },
      select: {
        id: true,
        name: true,
        resumeText: true,
        parsedData: true,
        currentRole: true,
        experienceYears: true,
        tags: true,
        preferences: true,
      },
    });

    if (resumes.length === 0) {
      logger.info('TASK_EXECUTOR', 'No resumes available for matching', { jobId: task.jobId });
      return;
    }

    logger.info('TASK_EXECUTOR', `Auto-matching job "${job.title}" against ${resumes.length} resumes`, {
      jobId: task.jobId,
    });

    // Create a matching session
    const session = await prisma.matchingSession.create({
      data: {
        userId: job.userId,
        jobId: task.jobId,
        title: `${job.title} — Auto-match`,
        status: 'running',
        config: { resumeIds: resumes.map((r) => r.id), autoTriggered: true },
        totalResumes: resumes.length,
      },
    });

    // Build enriched resume inputs
    const enrichedResumes = resumes.map((r) => ({
      id: r.id,
      name: r.name,
      resumeText: r.resumeText || '',
      currentRole: r.currentRole,
      experienceYears: r.experienceYears,
      tags: r.tags || [],
      preferences: (r as any).preferences,
    }));

    // Build job description text
    const jobDescription = [
      job.description,
      (job as any).requirements ? `\nRequirements:\n${(job as any).requirements}` : '',
      (job as any).responsibilities ? `\nResponsibilities:\n${(job as any).responsibilities}` : '',
    ].filter(Boolean).join('\n');

    const { orchestrateMatching } = await import('./MatchOrchestratorService.js');
    const results = await orchestrateMatching(
      enrichedResumes,
      { id: task.jobId, title: job.title || '', description: jobDescription, jobMetadata: '' },
      (prefs: any) => prefs ? JSON.stringify(prefs) : '',
      {
        onScreeningStart: () => {},
        onScreeningComplete: () => {},
        onMatchStart: () => {},
        onMatchComplete: () => {},
      },
      `task-${task.id}`,
    );

    // Persist results
    let matchedCount = 0;
    let bestGrade: string | null = null;
    const gradeRank: Record<string, number> = { 'A+': 10, A: 9, 'A-': 8, 'B+': 7, B: 6, 'B-': 5, 'C+': 4, C: 3, 'C-': 2, D: 1, F: 0 };

    for (const taskResult of results) {
      if (!taskResult.matchResult) continue;
      const score = taskResult.matchResult?.overallMatchScore?.score ?? null;
      const grade = taskResult.matchResult?.overallMatchScore?.grade ?? null;

      try {
        await prisma.jobMatch.upsert({
          where: { jobId_resumeId: { jobId: task.jobId, resumeId: taskResult.resumeId } },
          update: { score, grade, matchData: taskResult.matchResult as any, status: 'new' },
          create: { jobId: task.jobId, resumeId: taskResult.resumeId, score, grade, matchData: taskResult.matchResult as any, status: 'new' },
        });
        matchedCount++;
        if (grade && (bestGrade === null || (gradeRank[grade] ?? 0) > (gradeRank[bestGrade] ?? 0))) {
          bestGrade = grade;
        }

        // Create shortlist tasks for A+/A matches
        if (grade && ['A+', 'A'].includes(grade)) {
          const { taskGenerator } = await import('./TaskGeneratorService.js');
          void taskGenerator.onHighMatchFound(
            { jobId: task.jobId, resumeId: taskResult.resumeId, score, grade },
            job.userId, taskResult.resumeName, job.title,
          );
        }
      } catch (err) {
        logger.error('TASK_EXECUTOR', `Failed to upsert match for ${taskResult.resumeId}`, { error: String(err) });
      }
    }

    // Finalize session
    const avgScore = matchedCount > 0
      ? results.reduce((sum, r) => sum + (r.matchResult?.overallMatchScore?.score ?? 0), 0) / matchedCount
      : null;

    await prisma.matchingSession.update({
      where: { id: session.id },
      data: {
        status: 'completed',
        totalMatched: matchedCount,
        totalFailed: results.length - matchedCount,
        avgScore,
        topGrade: bestGrade,
        completedAt: new Date(),
      },
    });

    logger.info('TASK_EXECUTOR', 'Auto-matching completed', {
      jobId: task.jobId,
      sessionId: session.id,
      matchedCount,
      bestGrade,
    });

    // Chain: create review_matches task
    const { taskGenerator } = await import('./TaskGeneratorService.js');
    void taskGenerator.onMatchingCompleted(
      {
        id: session.id,
        userId: job.userId,
        jobId: task.jobId,
        totalMatched: matchedCount,
        avgScore,
        topGrade: bestGrade,
      },
      job.title,
    );
  }

  private async executeReparseResume(task: { id: string; resumeId?: string | null }): Promise<void> {
    if (!task.resumeId) {
      logger.warn('TASK_EXECUTOR', 'No resumeId for reparse task', { taskId: task.id });
      return;
    }

    const resume = await prisma.resume.findUnique({
      where: { id: task.resumeId },
      select: { id: true, name: true, resumeText: true },
    });

    if (!resume) {
      logger.info('TASK_EXECUTOR', 'Resume not found', { resumeId: task.resumeId });
      return;
    }

    if (!resume.resumeText) {
      logger.info('TASK_EXECUTOR', 'No resume text available, skipping reparse', { resumeId: task.resumeId });
      return;
    }

    const { normalizeExtractedText } = await import('./ResumeParserService.js');
    const { resumeParseAgent } = await import('../agents/ResumeParseAgent.js');
    const { generateResumeSummaryHighlight } = await import('./ResumeSummaryService.js');

    const normalizedText = normalizeExtractedText(resume.resumeText);
    const parsed = await resumeParseAgent.parse(normalizedText, `task-${task.id}`);

    const name = parsed.name || resume.name || 'Unknown';
    const email = parsed.email || null;
    const phone = parsed.phone || null;
    const currentRole = parsed.experience?.[0]?.role || null;

    const { summary, highlight } = await generateResumeSummaryHighlight(parsed, `task-${task.id}`);

    await prisma.resume.update({
      where: { id: task.resumeId },
      data: {
        parsedData: JSON.parse(JSON.stringify(parsed)),
        name,
        email,
        phone,
        currentRole,
        summary: summary || null,
        highlight: highlight || null,
      },
    });

    logger.info('TASK_EXECUTOR', 'Auto-reparse completed', {
      resumeId: task.resumeId,
      name,
    });
  }

  private async executeInterviewReminder(task: { id: string; interviewId?: string | null }): Promise<void> {
    if (!task.interviewId) {
      logger.warn('TASK_EXECUTOR', 'No interviewId for reminder task', { taskId: task.id });
      return;
    }

    const interview = await prisma.interview.findUnique({
      where: { id: task.interviewId },
    });
    if (!interview || interview.status !== 'scheduled') {
      logger.info('TASK_EXECUTOR', 'Interview not scheduled, skipping reminder', { interviewId: task.interviewId });
      return;
    }

    if (!interview.candidateEmail) {
      logger.info('TASK_EXECUTOR', 'No candidate email, skipping reminder', { interviewId: task.interviewId });
      return;
    }

    // Send reminder email
    const { default: emailService } = await import('./EmailService.js');
    if (!emailService.isConfigured) {
      logger.info('TASK_EXECUTOR', 'Email not configured, skipping interview reminder', { interviewId: task.interviewId });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://robohire.io';
    const interviewUrl = interview.accessToken
      ? `${frontendUrl}/interview-room/${interview.accessToken}`
      : `${frontendUrl}/interview-room`;

    await emailService.send({
      to: interview.candidateEmail,
      subject: `Reminder: Your interview for ${interview.jobTitle || 'the position'} is coming up`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #0f172a; font-size: 20px;">Interview Reminder</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Hi ${interview.candidateName},
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            This is a friendly reminder about your upcoming AI interview for <strong>${interview.jobTitle || 'the position'}</strong>.
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Please make sure you have a quiet environment with a stable internet connection. The interview typically takes 15-30 minutes.
          </p>
          <a href="${interviewUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">Start Interview</a>
          <p style="margin-top: 24px; color: #94a3b8; font-size: 12px;">— RoboHire</p>
        </div>
      `,
    });

    logger.info('TASK_EXECUTOR', 'Interview reminder email sent', {
      interviewId: task.interviewId,
      candidateName: interview.candidateName,
      candidateEmail: interview.candidateEmail,
    });
  }
}

export const taskExecutor = new TaskExecutorService();
