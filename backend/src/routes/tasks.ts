import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getVisibilityScope, buildUserIdFilter } from '../lib/teamVisibility.js';
import { taskGenerator, TASK_TYPES } from '../services/TaskGeneratorService.js';
import { notificationService } from '../services/NotificationService.js';
import '../types/auth.js';

const router = Router();

// ─── Tasks CRUD ─────────────────────────────────────────────

/** GET /tasks — list tasks with filters and pagination */
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      status, category, priority, assigneeType, type,
      jobId, search, page = '1', limit = '20',
      includeArchived,
    } = req.query;

    const scope = await getVisibilityScope(req.user!);
    const userFilter = buildUserIdFilter(scope);

    const where: any = { ...userFilter };

    // Exclude archived by default
    if (includeArchived !== 'true') {
      where.archivedAt = null;
    }

    if (status && typeof status === 'string' && status !== 'all') {
      if (status === 'active') {
        where.status = { in: ['pending', 'in_progress'] };
      } else {
        where.status = status;
      }
    }
    if (category && typeof category === 'string' && category !== 'all') {
      where.category = category;
    }
    if (priority && typeof priority === 'string' && priority !== 'all') {
      where.priority = priority;
    }
    if (assigneeType && typeof assigneeType === 'string' && assigneeType !== 'all') {
      where.assigneeType = assigneeType;
    }
    if (type && typeof type === 'string') {
      where.type = type;
    }
    if (jobId && typeof jobId === 'string') {
      where.jobId = jobId;
    }
    if (search && typeof search === 'string') {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: [
          { priority: 'asc' }, // critical first (alphabetical: critical < high < low < medium — we'll sort in code)
          { dueAt: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        include: {
          job: { select: { id: true, title: true, status: true } },
          resume: { select: { id: true, name: true } },
          interview: { select: { id: true, candidateName: true, status: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    // Sort by priority weight
    const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    tasks.sort((a, b) => {
      const pa = priorityWeight[a.priority] ?? 2;
      const pb = priorityWeight[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      // Overdue first
      const now = Date.now();
      const aOverdue = a.slaDeadline && new Date(a.slaDeadline).getTime() < now ? 0 : 1;
      const bOverdue = b.slaDeadline && new Date(b.slaDeadline).getTime() < now ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return 0;
    });

    res.json({
      success: true,
      tasks,
      pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

/** GET /tasks/stats — task counts by status/priority/category */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const scope = await getVisibilityScope(req.user!);
    const userFilter = buildUserIdFilter(scope);
    const baseWhere = { ...userFilter, archivedAt: null };

    const [
      total, pending, inProgress, completed, dismissed, autoCompleted,
      critical, high, medium, low, overdue,
      pipeline, evaluation, sourcing, communication, admin,
    ] = await Promise.all([
      prisma.task.count({ where: baseWhere }),
      prisma.task.count({ where: { ...baseWhere, status: 'pending' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'in_progress' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'completed' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'dismissed' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'auto_completed' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, priority: 'critical' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, priority: 'high' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, priority: 'medium' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, priority: 'low' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, slaDeadline: { lt: new Date() } } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, category: 'pipeline' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, category: 'evaluation' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, category: 'sourcing' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, category: 'communication' } }),
      prisma.task.count({ where: { ...baseWhere, status: { in: ['pending', 'in_progress'] }, category: 'admin' } }),
    ]);

    const actionRequired = pending + inProgress;

    res.json({
      success: true,
      stats: {
        total, actionRequired, pending, inProgress, completed, dismissed, autoCompleted, overdue,
        byPriority: { critical, high, medium, low },
        byCategory: { pipeline, evaluation, sourcing, communication, admin },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch task stats' });
  }
});

/** GET /tasks/:id — get single task detail */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        job: { select: { id: true, title: true, status: true, department: true, location: true } },
        resume: { select: { id: true, name: true, email: true, currentRole: true, experienceYears: true, summary: true } },
        interview: {
          select: {
            id: true, candidateName: true, candidateEmail: true, status: true, jobTitle: true,
            evaluation: { select: { overallScore: true, grade: true, verdict: true, summary: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch task' });
  }
});

/** POST /tasks — create a manual task */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      title, description, type, category, assigneeType,
      priority, dueAt, actionUrl, actionLabel,
      jobId, resumeId, interviewId, assigneeId,
    } = req.body;

    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });

    const userId = assigneeId || req.user!.id;
    const taskType = type || 'publish_job'; // default type for manual tasks
    const taskCategory = category || 'admin';

    const task = await prisma.task.create({
      data: {
        userId,
        createdById: req.user!.id,
        type: taskType,
        category: taskCategory,
        assigneeType: assigneeType || 'human',
        title,
        description: description || null,
        actionUrl: actionUrl || null,
        actionLabel: actionLabel || null,
        jobId: jobId || null,
        resumeId: resumeId || null,
        interviewId: interviewId || null,
        priority: priority || 'medium',
        dueAt: dueAt ? new Date(dueAt) : null,
        slaDeadline: dueAt ? new Date(dueAt) : null,
        status: 'pending',
        triggerEvent: 'manual_creation',
        isAutoGenerated: false,
      },
    });

    // Create notification for the assignee
    await prisma.notification.create({
      data: {
        userId,
        taskId: task.id,
        type: 'task_created',
        title: task.title,
        message: task.description || null,
        actionUrl: task.actionUrl || null,
      },
    });

    res.status(201).json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

/** PATCH /tasks/:id — update task (status, priority, assignee, etc.) */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { status, priority, userId: newAssigneeId, description } = req.body;
    const updateData: any = {};

    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (newAssigneeId) updateData.userId = newAssigneeId;
    if (description !== undefined) updateData.description = description;

    if (status === 'completed' || status === 'dismissed' || status === 'auto_completed') {
      updateData.completedAt = new Date();
      updateData.completedBy = req.user!.id;
    }

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

/** PATCH /tasks/:id/complete — mark task as completed */
router.patch('/:id/complete', requireAuth, async (req, res) => {
  try {
    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        completedBy: req.user!.id,
        result: req.body.result || undefined,
      },
    });
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to complete task' });
  }
});

/** PATCH /tasks/:id/dismiss — dismiss task with reason */
router.patch('/:id/dismiss', requireAuth, async (req, res) => {
  try {
    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        status: 'dismissed',
        completedAt: new Date(),
        completedBy: req.user!.id,
        dismissReason: req.body.reason || null,
      },
    });
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to dismiss task' });
  }
});

/** POST /tasks/bulk-action — bulk complete/dismiss/reassign */
router.post('/bulk-action', requireAuth, async (req, res) => {
  try {
    const { taskIds, action, reason, assigneeId } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, error: 'taskIds array required' });
    }

    let updateData: any = {};
    if (action === 'complete') {
      updateData = { status: 'completed', completedAt: new Date(), completedBy: req.user!.id };
    } else if (action === 'dismiss') {
      updateData = { status: 'dismissed', completedAt: new Date(), completedBy: req.user!.id, dismissReason: reason || null };
    } else if (action === 'reassign' && assigneeId) {
      updateData = { userId: assigneeId };
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const result = await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: updateData,
    });

    res.json({ success: true, updated: result.count });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to perform bulk action' });
  }
});

// ─── Notifications ─────────────────────────────────────────

/** GET /tasks/notifications/list — list notifications */
router.get('/notifications/list', requireAuth, async (req, res) => {
  try {
    const { limit = '20', offset = '0', unreadOnly } = req.query;
    const result = await notificationService.list(req.user!.id, {
      limit: parseInt(limit as string, 10) || 20,
      offset: parseInt(offset as string, 10) || 0,
      unreadOnly: unreadOnly === 'true',
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

/** GET /tasks/notifications/unread-count — get unread count */
router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.id);
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
  }
});

/** PATCH /tasks/notifications/:id/read — mark notification as read */
router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await notificationService.markAsRead(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

/** POST /tasks/notifications/mark-all-read — mark all notifications as read */
router.post('/notifications/mark-all-read', requireAuth, async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.user!.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark all as read' });
  }
});

// ─── Admin: Task Automation Rules ──────────────────────────

/** GET /tasks/admin/rules — list all automation rules */
router.get('/admin/rules', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // Seed defaults if empty
    const count = await prisma.taskAutomationRule.count();
    if (count === 0) {
      await taskGenerator.seedDefaultRules();
    }

    const rules = await prisma.taskAutomationRule.findMany({
      orderBy: { taskType: 'asc' },
    });

    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch automation rules' });
  }
});

/** PATCH /tasks/admin/rules/:taskType — update a rule */
router.patch('/admin/rules/:taskType', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { enabled, assigneeType, autoExecute, slaHours, priority, escalateAfterHours, emailNotify } = req.body;
    const updateData: any = {};

    if (enabled !== undefined) updateData.enabled = enabled;
    if (assigneeType) updateData.assigneeType = assigneeType;
    if (autoExecute !== undefined) updateData.autoExecute = autoExecute;
    if (slaHours !== undefined) updateData.slaHours = slaHours;
    if (priority) updateData.priority = priority;
    if (escalateAfterHours !== undefined) updateData.escalateAfterHours = escalateAfterHours;
    if (emailNotify !== undefined) updateData.emailNotify = emailNotify;

    const rule = await prisma.taskAutomationRule.update({
      where: { taskType: req.params.taskType },
      data: updateData,
    });

    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update rule' });
  }
});

/** POST /tasks/admin/rules/reset — reset all rules to defaults */
router.post('/admin/rules/reset', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    await prisma.taskAutomationRule.deleteMany();
    await taskGenerator.seedDefaultRules();

    const rules = await prisma.taskAutomationRule.findMany({
      orderBy: { taskType: 'asc' },
    });

    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to reset rules' });
  }
});

/** POST /tasks/admin/run-stale-checks — manually trigger stale checks */
router.post('/admin/run-stale-checks', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    void taskGenerator.runStaleChecks();
    void taskGenerator.runEscalationChecks();

    res.json({ success: true, message: 'Stale checks triggered' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to trigger stale checks' });
  }
});

export default router;
