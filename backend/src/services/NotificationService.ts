import prisma from '../lib/prisma.js';
import { logger } from './LoggerService.js';

class NotificationService {
  // ── Get unread count for badge ──
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // ── List notifications ──
  async list(userId: string, options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}): Promise<{ notifications: any[]; total: number }> {
    const { limit = 20, offset = 0, unreadOnly = false } = options;

    const where: any = { userId };
    if (unreadOnly) where.read = false;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          task: {
            select: {
              id: true,
              type: true,
              category: true,
              priority: true,
              status: true,
              actionUrl: true,
            },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  // ── Mark as read ──
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true, readAt: new Date() },
    });
  }

  // ── Mark all as read ──
  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  // ── Send email notification for critical tasks ──
  async sendTaskEmail(task: any, userEmail: string): Promise<void> {
    try {
      const { default: emailService } = await import('./EmailService.js');

      if (!emailService.isConfigured) return;

      const priorityColors: Record<string, string> = {
        critical: '#dc2626',
        high: '#f59e0b',
        medium: '#3b82f6',
        low: '#6b7280',
      };

      const color = priorityColors[task.priority] || '#6b7280';
      const frontendUrl = process.env.FRONTEND_URL || 'https://robohire.io';
      const actionUrl = task.actionUrl ? `${frontendUrl}${task.actionUrl}` : `${frontendUrl}/product/tasks`;

      await emailService.send({
        to: userEmail,
        subject: `[RoboHire] Action Required: ${task.title}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto;">
            <div style="border-left: 4px solid ${color}; padding: 16px 20px; background: #f8fafc; border-radius: 4px; margin-bottom: 20px;">
              <span style="display: inline-block; padding: 2px 8px; background: ${color}; color: white; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 8px;">${task.priority}</span>
              <h2 style="margin: 8px 0 4px; font-size: 18px; color: #0f172a;">${task.title}</h2>
              ${task.description ? `<p style="margin: 4px 0 0; color: #475569; font-size: 14px;">${task.description}</p>` : ''}
            </div>
            ${task.slaDeadline ? `<p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">Due: ${new Date(task.slaDeadline).toLocaleString()}</p>` : ''}
            <a href="${actionUrl}" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">${task.actionLabel || 'View Task'}</a>
            <p style="margin-top: 24px; color: #94a3b8; font-size: 12px;">— RoboHire Task System</p>
          </div>
        `,
      });

      logger.info('NOTIFICATION', 'Task email sent', { taskId: task.id, to: userEmail });
    } catch (err) {
      logger.error('NOTIFICATION', 'Failed to send task email', { taskId: task.id, error: String(err) });
    }
  }
}

export const notificationService = new NotificationService();
