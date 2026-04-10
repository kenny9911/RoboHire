import prisma from '../lib/prisma.js';
import { logger } from './LoggerService.js';

// ── Task type definitions ──

export const TASK_TYPES = {
  // Evaluation
  EVALUATE_INTERVIEW: 'evaluate_interview',
  SYNC_GOHIRE_INTERVIEWS: 'sync_gohire_interviews',
  // Pipeline
  REVIEW_EVALUATION: 'review_evaluation',
  HIRING_DECISION: 'hiring_decision',
  REVIEW_MATCHES: 'review_matches',
  SHORTLIST_CANDIDATES: 'shortlist_candidates',
  STALE_PIPELINE: 'stale_pipeline',
  // Sourcing
  RUN_MATCHING: 'run_matching',
  REVIEW_AGENT_CANDIDATES: 'review_agent_candidates',
  // Communication
  SEND_INTERVIEW_INVITE: 'send_interview_invite',
  FOLLOW_UP_INVITATION: 'follow_up_invitation',
  INTERVIEW_REMINDER: 'interview_reminder',
  // Admin
  PUBLISH_JOB: 'publish_job',
  CLOSE_STALE_JOB: 'close_stale_job',
  REPARSE_RESUME: 'reparse_resume',
} as const;

export type TaskType = (typeof TASK_TYPES)[keyof typeof TASK_TYPES];

export const TASK_CATEGORIES: Record<TaskType, string> = {
  [TASK_TYPES.EVALUATE_INTERVIEW]: 'evaluation',
  [TASK_TYPES.SYNC_GOHIRE_INTERVIEWS]: 'evaluation',
  [TASK_TYPES.REVIEW_EVALUATION]: 'pipeline',
  [TASK_TYPES.HIRING_DECISION]: 'pipeline',
  [TASK_TYPES.REVIEW_MATCHES]: 'pipeline',
  [TASK_TYPES.SHORTLIST_CANDIDATES]: 'pipeline',
  [TASK_TYPES.STALE_PIPELINE]: 'pipeline',
  [TASK_TYPES.RUN_MATCHING]: 'sourcing',
  [TASK_TYPES.REVIEW_AGENT_CANDIDATES]: 'sourcing',
  [TASK_TYPES.SEND_INTERVIEW_INVITE]: 'communication',
  [TASK_TYPES.FOLLOW_UP_INVITATION]: 'communication',
  [TASK_TYPES.INTERVIEW_REMINDER]: 'communication',
  [TASK_TYPES.PUBLISH_JOB]: 'admin',
  [TASK_TYPES.CLOSE_STALE_JOB]: 'admin',
  [TASK_TYPES.REPARSE_RESUME]: 'admin',
};

// Default rules (used when no DB rule exists)
interface DefaultRule {
  taskType: string;
  enabled: boolean;
  assigneeType: 'human' | 'agent';
  autoExecute: boolean;
  slaHours: number | null;
  priority: string;
  escalateAfterHours: number | null;
  emailNotify: boolean;
}

const DEFAULT_RULES: DefaultRule[] = [
  { taskType: 'evaluate_interview',      enabled: true,  assigneeType: 'agent',  autoExecute: true,  slaHours: 1,    priority: 'high',     escalateAfterHours: 4,    emailNotify: false },
  { taskType: 'review_evaluation',       enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 24,   priority: 'high',     escalateAfterHours: 48,   emailNotify: true  },
  { taskType: 'hiring_decision',         enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 24,   priority: 'critical', escalateAfterHours: 48,   emailNotify: true  },
  { taskType: 'review_matches',          enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 48,   priority: 'high',     escalateAfterHours: 72,   emailNotify: false },
  { taskType: 'shortlist_candidates',    enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 24,   priority: 'high',     escalateAfterHours: 48,   emailNotify: false },
  { taskType: 'send_interview_invite',   enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 24,   priority: 'high',     escalateAfterHours: 48,   emailNotify: false },
  { taskType: 'follow_up_invitation',    enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 24,   priority: 'medium',   escalateAfterHours: 48,   emailNotify: false },
  { taskType: 'interview_reminder',      enabled: true,  assigneeType: 'agent',  autoExecute: true,  slaHours: null, priority: 'medium',   escalateAfterHours: null, emailNotify: false },
  { taskType: 'run_matching',            enabled: true,  assigneeType: 'agent',  autoExecute: true,  slaHours: 4,    priority: 'high',     escalateAfterHours: 8,    emailNotify: false },
  { taskType: 'review_agent_candidates', enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 48,   priority: 'medium',   escalateAfterHours: 72,   emailNotify: false },
  { taskType: 'publish_job',             enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 48,   priority: 'medium',   escalateAfterHours: 96,   emailNotify: false },
  { taskType: 'close_stale_job',         enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 168,  priority: 'low',      escalateAfterHours: 336,  emailNotify: false },
  { taskType: 'stale_pipeline',          enabled: true,  assigneeType: 'human',  autoExecute: false, slaHours: 72,   priority: 'low',      escalateAfterHours: 168,  emailNotify: false },
  { taskType: 'sync_gohire_interviews',  enabled: true,  assigneeType: 'agent',  autoExecute: true,  slaHours: 4,    priority: 'medium',   escalateAfterHours: null, emailNotify: false },
  { taskType: 'reparse_resume',          enabled: true,  assigneeType: 'agent',  autoExecute: true,  slaHours: 2,    priority: 'low',      escalateAfterHours: null, emailNotify: false },
];

interface CreateTaskInput {
  userId: string;
  createdById?: string | null;
  type: TaskType;
  title: string;
  description?: string;
  actionUrl?: string;
  actionLabel?: string;
  jobId?: string;
  resumeId?: string;
  interviewId?: string;
  candidateId?: string;
  matchingSessionId?: string;
  agentId?: string;
  hiringRequestId?: string;
  triggerEvent: string;
  triggerData?: any;
  isAutoGenerated?: boolean;
  priorityOverride?: string;
}

class TaskGeneratorService {
  // ── Get rule for a task type (DB override or default) ──
  async getRule(taskType: string): Promise<DefaultRule> {
    try {
      const dbRule = await prisma.taskAutomationRule.findUnique({
        where: { taskType },
      });
      if (dbRule) {
        return {
          taskType: dbRule.taskType,
          enabled: dbRule.enabled,
          assigneeType: dbRule.assigneeType as 'human' | 'agent',
          autoExecute: dbRule.autoExecute,
          slaHours: dbRule.slaHours,
          priority: dbRule.priority,
          escalateAfterHours: dbRule.escalateAfterHours,
          emailNotify: dbRule.emailNotify,
        };
      }
    } catch {
      // DB might not have the table yet; fall through to defaults
    }
    return DEFAULT_RULES.find((r) => r.taskType === taskType) || DEFAULT_RULES[0];
  }

  // ── Dedup check: skip if identical pending/in_progress task exists ──
  private async isDuplicate(input: CreateTaskInput): Promise<boolean> {
    const where: any = {
      type: input.type,
      userId: input.userId,
      status: { in: ['pending', 'in_progress'] },
    };
    if (input.interviewId) where.interviewId = input.interviewId;
    if (input.jobId) where.jobId = input.jobId;
    if (input.resumeId) where.resumeId = input.resumeId;
    if (input.matchingSessionId) where.matchingSessionId = input.matchingSessionId;
    if (input.agentId) where.agentId = input.agentId;

    const existing = await prisma.task.findFirst({ where });
    return !!existing;
  }

  // ── Create a task ──
  async createTask(input: CreateTaskInput): Promise<any | null> {
    const rule = await this.getRule(input.type);

    // Check if this task type is enabled
    if (!rule.enabled) {
      logger.debug('TASKS', `Task type ${input.type} is disabled, skipping`, { type: input.type });
      return null;
    }

    // Dedup
    if (await this.isDuplicate(input)) {
      logger.debug('TASKS', `Duplicate task skipped: ${input.type}`, { type: input.type, userId: input.userId });
      return null;
    }

    const priority = input.priorityOverride || rule.priority;
    const now = new Date();
    const slaDeadline = rule.slaHours ? new Date(now.getTime() + rule.slaHours * 60 * 60 * 1000) : null;
    const dueAt = slaDeadline;

    const task = await prisma.task.create({
      data: {
        userId: input.userId,
        createdById: input.createdById || null,
        type: input.type,
        category: TASK_CATEGORIES[input.type] || 'admin',
        assigneeType: rule.assigneeType,
        title: input.title,
        description: input.description || null,
        actionUrl: input.actionUrl || null,
        actionLabel: input.actionLabel || null,
        jobId: input.jobId || null,
        resumeId: input.resumeId || null,
        interviewId: input.interviewId || null,
        candidateId: input.candidateId || null,
        matchingSessionId: input.matchingSessionId || null,
        agentId: input.agentId || null,
        hiringRequestId: input.hiringRequestId || null,
        priority,
        dueAt,
        slaDeadline,
        status: 'pending',
        triggerEvent: input.triggerEvent,
        triggerData: input.triggerData || undefined,
        isAutoGenerated: input.isAutoGenerated ?? true,
      },
    });

    logger.info('TASKS', `Task created: ${input.type}`, {
      taskId: task.id,
      type: input.type,
      assigneeType: rule.assigneeType,
      priority,
      userId: input.userId,
    });

    // Create notification for human tasks
    if (rule.assigneeType === 'human') {
      await this.createNotification(task, 'task_created');
    }

    // If agent task and auto-execute, mark for execution
    if (rule.assigneeType === 'agent' && rule.autoExecute) {
      // Import and execute asynchronously to avoid blocking
      void this.autoExecuteTask(task);
    }

    return task;
  }

  // ── Create notification ──
  private async createNotification(task: any, type: string): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId: task.userId,
          taskId: task.id,
          type,
          title: task.title,
          message: task.description || null,
          actionUrl: task.actionUrl || null,
        },
      });
    } catch (err) {
      logger.error('TASKS', 'Failed to create notification', { taskId: task.id, error: String(err) });
    }
  }

  // ── Auto-execute agent tasks ──
  private async autoExecuteTask(task: any): Promise<void> {
    try {
      // Mark as in_progress
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'in_progress' },
      });

      // The actual execution is handled by TaskExecutorService
      // Import dynamically to avoid circular deps
      const { taskExecutor } = await import('./TaskExecutorService.js');
      await taskExecutor.execute(task);

      // Mark as auto_completed
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'auto_completed',
          completedAt: new Date(),
          completedBy: 'system',
        },
      });

      logger.info('TASKS', `Agent task auto-completed: ${task.type}`, { taskId: task.id });
    } catch (err) {
      logger.error('TASKS', `Agent task execution failed: ${task.type}`, {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Leave as in_progress so it can be retried
    }
  }

  // ── Seed default automation rules ──
  async seedDefaultRules(): Promise<void> {
    for (const rule of DEFAULT_RULES) {
      await prisma.taskAutomationRule.upsert({
        where: { taskType: rule.taskType },
        update: {},
        create: {
          taskType: rule.taskType,
          enabled: rule.enabled,
          assigneeType: rule.assigneeType,
          autoExecute: rule.autoExecute,
          slaHours: rule.slaHours,
          priority: rule.priority,
          escalateAfterHours: rule.escalateAfterHours,
          emailNotify: rule.emailNotify,
        },
      });
    }
    logger.info('TASKS', 'Default automation rules seeded');
  }

  // ── Scheduled stale checks ──
  async runStaleChecks(): Promise<void> {
    logger.info('TASKS', 'Running scheduled stale checks');

    // 1. Follow-up invitations: interviews scheduled >3 days ago, still not started
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const staleInterviews = await prisma.interview.findMany({
        where: {
          status: 'scheduled',
          createdAt: { lt: threeDaysAgo },
        },
        include: { user: { select: { id: true } } },
        take: 50,
      });

      for (const interview of staleInterviews) {
        await this.createTask({
          userId: interview.userId,
          type: TASK_TYPES.FOLLOW_UP_INVITATION,
          title: `Follow up: ${interview.candidateName} hasn't started interview`,
          description: `Interview for "${interview.jobTitle || 'Unknown Position'}" was scheduled ${Math.floor((Date.now() - interview.createdAt.getTime()) / (24 * 60 * 60 * 1000))} days ago but hasn't started.`,
          actionUrl: `/product/interview`,
          actionLabel: 'Send Reminder',
          interviewId: interview.id,
          jobId: interview.jobId || undefined,
          triggerEvent: 'stale_check_invitation',
          triggerData: { scheduledAt: interview.createdAt, candidateName: interview.candidateName },
        });
      }
    } catch (err) {
      logger.error('TASKS', 'Stale check failed: follow_up_invitation', { error: String(err) });
    }

    // 2. Stale pipeline: ResumeJobFit unchanged >7 days
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const staleFits = await prisma.resumeJobFit.findMany({
        where: {
          pipelineStatus: 'matched',
          updatedAt: { lt: sevenDaysAgo },
        },
        include: {
          resume: { select: { id: true, name: true, userId: true } },
          hiringRequest: { select: { id: true, title: true, userId: true } },
        },
        take: 50,
      });

      for (const fit of staleFits) {
        await this.createTask({
          userId: fit.hiringRequest.userId,
          type: TASK_TYPES.STALE_PIPELINE,
          title: `Stale candidate: ${fit.resume.name} in "${fit.hiringRequest.title}"`,
          description: `This candidate has been in "matched" status for over 7 days without action.`,
          actionUrl: `/product/hiring`,
          actionLabel: 'Review Pipeline',
          resumeId: fit.resumeId,
          hiringRequestId: fit.hiringRequestId,
          triggerEvent: 'stale_check_pipeline',
          triggerData: { lastUpdated: fit.updatedAt, candidateName: fit.resume.name },
        });
      }
    } catch (err) {
      logger.error('TASKS', 'Stale check failed: stale_pipeline', { error: String(err) });
    }

    // 3. Close stale jobs: open >30 days with no recent matches
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const staleJobs = await prisma.job.findMany({
        where: {
          status: 'open',
          updatedAt: { lt: thirtyDaysAgo },
        },
        take: 50,
      });

      for (const job of staleJobs) {
        await this.createTask({
          userId: job.userId,
          type: TASK_TYPES.CLOSE_STALE_JOB,
          title: `Stale job: "${job.title}" open for 30+ days`,
          description: `This job has been open with no recent activity. Consider refreshing or closing it.`,
          actionUrl: `/product/jobs/${job.id}`,
          actionLabel: 'Review Job',
          jobId: job.id,
          triggerEvent: 'stale_check_job',
          triggerData: { publishedAt: job.publishedAt, lastUpdated: job.updatedAt },
        });
      }
    } catch (err) {
      logger.error('TASKS', 'Stale check failed: close_stale_job', { error: String(err) });
    }

    // 4. Interview reminders: interviews scheduled within the next 24h that haven't been reminded
    try {
      const now = new Date();
      const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const upcomingInterviews = await prisma.interview.findMany({
        where: {
          status: 'scheduled',
          scheduledAt: { gte: now, lte: twentyFourHoursFromNow },
          candidateEmail: { not: null },
        },
        take: 50,
      });

      for (const interview of upcomingInterviews) {
        await this.createTask({
          userId: interview.userId,
          type: TASK_TYPES.INTERVIEW_REMINDER,
          title: `Interview reminder: ${interview.candidateName}`,
          description: `Interview for "${interview.jobTitle || 'Unknown Position'}" is scheduled within 24 hours. Send a reminder to the candidate.`,
          actionUrl: `/product/interview`,
          actionLabel: 'View Interview',
          interviewId: interview.id,
          jobId: interview.jobId || undefined,
          triggerEvent: 'interview_reminder_check',
          triggerData: { scheduledAt: interview.scheduledAt, candidateName: interview.candidateName },
        });
      }
    } catch (err) {
      logger.error('TASKS', 'Stale check failed: interview_reminder', { error: String(err) });
    }

    // 5. Archive completed/dismissed tasks after 7 days
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await prisma.task.updateMany({
        where: {
          status: { in: ['completed', 'dismissed', 'auto_completed'] },
          completedAt: { lt: sevenDaysAgo },
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
    } catch (err) {
      logger.error('TASKS', 'Archive cleanup failed', { error: String(err) });
    }

    logger.info('TASKS', 'Stale checks completed');
  }

  // ── Escalate overdue tasks ──
  async runEscalationChecks(): Promise<void> {
    try {
      const overdueTasks = await prisma.task.findMany({
        where: {
          status: { in: ['pending', 'in_progress'] },
          slaDeadline: { lt: new Date() },
          escalatedAt: null,
        },
        take: 100,
      });

      for (const task of overdueTasks) {
        // Escalate priority
        const escalatedPriority = task.priority === 'low' ? 'medium' :
                                  task.priority === 'medium' ? 'high' :
                                  'critical';

        await prisma.task.update({
          where: { id: task.id },
          data: {
            priority: escalatedPriority,
            escalatedAt: new Date(),
          },
        });

        // Create overdue notification
        await this.createNotification(task, 'task_overdue');

        logger.info('TASKS', `Task escalated: ${task.type}`, {
          taskId: task.id,
          oldPriority: task.priority,
          newPriority: escalatedPriority,
        });
      }
    } catch (err) {
      logger.error('TASKS', 'Escalation check failed', { error: String(err) });
    }
  }

  // ── Convenience methods for specific events ──

  async onInterviewCompleted(interview: {
    id: string;
    userId: string;
    candidateName: string;
    jobTitle?: string | null;
    jobId?: string | null;
    resumeId?: string | null;
    hiringRequestId?: string | null;
  }): Promise<void> {
    await this.createTask({
      userId: interview.userId,
      type: TASK_TYPES.EVALUATE_INTERVIEW,
      title: `Evaluate interview: ${interview.candidateName}`,
      description: `AI interview with ${interview.candidateName} for "${interview.jobTitle || 'Unknown Position'}" has completed. Run evaluation.`,
      actionUrl: `/product/evaluations`,
      actionLabel: 'Run Evaluation',
      interviewId: interview.id,
      jobId: interview.jobId || undefined,
      resumeId: interview.resumeId || undefined,
      hiringRequestId: interview.hiringRequestId || undefined,
      triggerEvent: 'interview_completed',
      triggerData: { candidateName: interview.candidateName, jobTitle: interview.jobTitle },
    });
  }

  async onEvaluationCreated(evaluation: {
    interviewId: string;
    overallScore?: number | null;
    verdict?: string | null;
    summary?: string | null;
  }, interview: {
    id: string;
    userId: string;
    candidateName: string;
    jobTitle?: string | null;
    jobId?: string | null;
    resumeId?: string | null;
  }): Promise<void> {
    const isHire = evaluation.verdict === 'strong_hire' || evaluation.verdict === 'hire';

    await this.createTask({
      userId: interview.userId,
      type: TASK_TYPES.REVIEW_EVALUATION,
      title: `Review evaluation: ${interview.candidateName} — ${evaluation.verdict || 'pending'}`,
      description: `Score: ${evaluation.overallScore ?? 'N/A'}. ${evaluation.summary || ''}`.trim(),
      actionUrl: `/product/evaluations`,
      actionLabel: 'Review Evaluation',
      interviewId: interview.id,
      jobId: interview.jobId || undefined,
      resumeId: interview.resumeId || undefined,
      triggerEvent: 'evaluation_created',
      triggerData: { score: evaluation.overallScore, verdict: evaluation.verdict },
      priorityOverride: isHire ? 'critical' : undefined,
    });

    // If strong_hire or hire, also create hiring decision task
    if (isHire) {
      await this.createTask({
        userId: interview.userId,
        type: TASK_TYPES.HIRING_DECISION,
        title: `Hiring decision: ${interview.candidateName} — ${evaluation.verdict}`,
        description: `${interview.candidateName} scored ${evaluation.overallScore} for "${interview.jobTitle || 'Unknown Position'}". Consider extending an offer.`,
        actionUrl: `/product/evaluations`,
        actionLabel: 'Make Decision',
        interviewId: interview.id,
        jobId: interview.jobId || undefined,
        resumeId: interview.resumeId || undefined,
        triggerEvent: 'evaluation_hire_candidate',
        triggerData: { score: evaluation.overallScore, verdict: evaluation.verdict },
        priorityOverride: 'critical',
      });
    }
  }

  async onMatchingCompleted(session: {
    id: string;
    userId: string;
    jobId: string;
    totalMatched: number;
    avgScore?: number | null;
    topGrade?: string | null;
  }, jobTitle?: string): Promise<void> {
    const hasTopMatches = session.topGrade && ['A+', 'A'].includes(session.topGrade);

    await this.createTask({
      userId: session.userId,
      type: TASK_TYPES.REVIEW_MATCHES,
      title: `Review matches: ${jobTitle || 'Job'} (${session.totalMatched} candidates)`,
      description: `Matching completed. Top grade: ${session.topGrade || 'N/A'}, Avg score: ${session.avgScore?.toFixed(0) || 'N/A'}.`,
      actionUrl: `/product/matching`,
      actionLabel: 'Review Matches',
      jobId: session.jobId,
      matchingSessionId: session.id,
      triggerEvent: 'matching_completed',
      triggerData: { totalMatched: session.totalMatched, avgScore: session.avgScore, topGrade: session.topGrade },
      priorityOverride: hasTopMatches ? 'high' : undefined,
    });
  }

  async onHighMatchFound(match: {
    jobId: string;
    resumeId: string;
    score?: number | null;
    grade?: string | null;
  }, userId: string, candidateName: string, jobTitle: string): Promise<void> {
    await this.createTask({
      userId,
      type: TASK_TYPES.SHORTLIST_CANDIDATES,
      title: `Shortlist: ${candidateName} (${match.grade}, ${match.score}/100)`,
      description: `Strong match for "${jobTitle}". Consider shortlisting and inviting to interview.`,
      actionUrl: `/product/jobs/${match.jobId}`,
      actionLabel: 'View Profile',
      jobId: match.jobId,
      resumeId: match.resumeId,
      triggerEvent: 'high_match_found',
      triggerData: { score: match.score, grade: match.grade, candidateName },
    });
  }

  async onCandidateShortlisted(fit: {
    resumeId: string;
    hiringRequestId: string;
  }, userId: string, candidateName: string, jobTitle: string): Promise<void> {
    await this.createTask({
      userId,
      type: TASK_TYPES.SEND_INTERVIEW_INVITE,
      title: `Send interview invite: ${candidateName}`,
      description: `${candidateName} has been shortlisted for "${jobTitle}". Send an interview invitation.`,
      actionUrl: `/product/talent`,
      actionLabel: 'Send Invite',
      resumeId: fit.resumeId,
      hiringRequestId: fit.hiringRequestId,
      triggerEvent: 'candidate_shortlisted',
      triggerData: { candidateName, jobTitle },
    });
  }

  async onJobCreated(job: { id: string; userId: string; title: string; status: string }): Promise<void> {
    if (job.status === 'draft') {
      await this.createTask({
        userId: job.userId,
        type: TASK_TYPES.PUBLISH_JOB,
        title: `Publish job: "${job.title}"`,
        description: `New job created as draft. Review and publish to start receiving candidates.`,
        actionUrl: `/product/jobs/${job.id}`,
        actionLabel: 'Review & Publish',
        jobId: job.id,
        triggerEvent: 'job_created_draft',
        triggerData: { jobTitle: job.title },
      });
    }
  }

  async onJobPublished(job: { id: string; userId: string; title: string }): Promise<void> {
    await this.createTask({
      userId: job.userId,
      type: TASK_TYPES.RUN_MATCHING,
      title: `Run matching: "${job.title}"`,
      description: `Job published. Auto-matching against candidate pool.`,
      actionUrl: `/product/matching`,
      actionLabel: 'View Matching',
      jobId: job.id,
      triggerEvent: 'job_published',
      triggerData: { jobTitle: job.title },
    });
  }

  async onAgentCandidateFound(candidate: {
    id: string;
    agentId: string;
    name: string;
    matchScore?: number | null;
  }, userId: string, agentName: string): Promise<void> {
    await this.createTask({
      userId,
      type: TASK_TYPES.REVIEW_AGENT_CANDIDATES,
      title: `Review sourced candidate: ${candidate.name}`,
      description: `Agent "${agentName}" found a new candidate. Match score: ${candidate.matchScore ?? 'N/A'}.`,
      actionUrl: `/product/agents`,
      actionLabel: 'Review Candidate',
      agentId: candidate.agentId,
      triggerEvent: 'agent_candidate_found',
      triggerData: { candidateName: candidate.name, matchScore: candidate.matchScore, agentName },
    });
  }

  async onResumeParseIncomplete(resume: { id: string; userId: string; name: string }): Promise<void> {
    await this.createTask({
      userId: resume.userId,
      type: TASK_TYPES.REPARSE_RESUME,
      title: `Reparse resume: ${resume.name}`,
      description: `Resume parse appears incomplete. Re-running parse agent.`,
      actionUrl: `/product/talent/${resume.id}`,
      actionLabel: 'View Resume',
      resumeId: resume.id,
      triggerEvent: 'resume_parse_incomplete',
      triggerData: { resumeName: resume.name },
    });
  }
}

export const taskGenerator = new TaskGeneratorService();
