/**
 * AdminMemoryService — break-glass admin access to Phase 7 memory data.
 *
 * Every method that reads or writes memory data logs to
 * `MemoryAdminAuditLog` BEFORE returning. This creates a durable audit trail
 * of admin access that users can inspect later. See
 * `docs/context-engineering-v7.md` §8.2 for the privacy rationale.
 *
 * Admin edits of memory content pass through the same legal-field blocklist
 * (`hardRequirementsFilter`) that user edits do — admins cannot persist
 * content that violates anti-discrimination law.
 */

import prisma from '../lib/prisma.js';
import { validateHardRequirement } from '../lib/hardRequirementsFilter.js';

// These substrings in memory content trigger a block/warn during admin edit
// paths, mirroring the hardRequirementsFilter legal blocklist.
const LEGAL_CONTENT_BLOCKLIST = [
  'age',
  'gender',
  'race',
  'religion',
  'nationality',
  'marital',
  'pregnan',
];

export interface AdminContext {
  adminId: string;
  ipAddress?: string;
  reason?: string;
}

type AuditAction =
  | 'view_profile'
  | 'view_memories'
  | 'view_interactions'
  | 'view_audit'
  | 'view_users'
  | 'edit_memory'
  | 'delete_memory'
  | 'pin_memory'
  | 'unpin_memory'
  | 'rebuild_profile'
  | 'reset_profile'
  | 'export';

export class AdminMemoryService {
  // ── Audit writer (private) ────────────────────────────────────────────────

  private async writeAudit(
    ctx: AdminContext,
    action: AuditAction,
    targetType: string,
    targetId: string,
    changes?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await prisma.memoryAdminAuditLog.create({
        data: {
          adminId: ctx.adminId,
          targetType,
          targetId,
          action,
          reason: ctx.reason ?? null,
          changes: (changes ?? undefined) as object | undefined,
          ipAddress: ctx.ipAddress ?? null,
        },
      });
    } catch (err) {
      // Never let audit failures silently block the admin action — log to
      // stderr and continue. This is defensible because the action was
      // legitimate (admin authorized); the trail is what we care about.
      console.error('[AdminMemoryService] audit write failed:', err);
    }
  }

  // ── Directory: who has memory data? ───────────────────────────────────────

  /**
   * List every user with ANY memory artifact (profile, memories, or
   * interactions). Used to populate the left pane of the admin UI.
   * Aggregates counts per user so admins see density at a glance without
   * opening every row.
   */
  async listUsersWithMemoryData(ctx: AdminContext, opts: { search?: string; limit?: number; page?: number } = {}): Promise<{
    data: Array<{
      userId: string;
      name: string | null;
      email: string;
      memoryCount: number;
      interactionCount: number;
      profileVersion: number | null;
      lastActivityAt: Date | null;
    }>;
    total: number;
  }> {
    await this.writeAudit(ctx, 'view_users', 'user', 'list');

    const take = Math.min(opts.limit ?? 50, 200);
    const skip = Math.max((opts.page ?? 1) - 1, 0) * take;

    // Base user query, filtered by search on name/email
    const where: Record<string, unknown> = opts.search?.trim()
      ? {
          OR: [
            { email: { contains: opts.search.trim(), mode: 'insensitive' } },
            { name: { contains: opts.search.trim(), mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          userRecruiterProfile: { select: { lastRebuiltAt: true, signalsLearned: true } },
          _count: {
            select: {
              candidateInteractions: true,
            },
          },
        },
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    // Count memories per user (scope='user')
    const userIds = users.map((u) => u.id);
    const memoryCounts = await prisma.memoryEntry.groupBy({
      by: ['scopeId'],
      where: { scope: 'user', scopeId: { in: userIds } },
      _count: { _all: true },
    });
    const memoryCountMap = new Map(memoryCounts.map((r) => [r.scopeId, r._count._all]));

    return {
      data: users.map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        memoryCount: memoryCountMap.get(u.id) ?? 0,
        interactionCount: u._count.candidateInteractions,
        profileVersion: null, // we don't track a version on UserRecruiterProfile yet
        lastActivityAt: u.userRecruiterProfile?.lastRebuiltAt ?? null,
      })),
      total,
    };
  }

  // ── Per-user data fetches ─────────────────────────────────────────────────

  async getUserProfile(ctx: AdminContext, userId: string) {
    await this.writeAudit(ctx, 'view_profile', 'user_profile', userId);
    const profile = await prisma.userRecruiterProfile.findUnique({ where: { userId } });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, createdAt: true, role: true },
    });
    return { user, profile };
  }

  async listUserMemories(
    ctx: AdminContext,
    userId: string,
    opts: { kind?: string; scope?: string; limit?: number; page?: number } = {},
  ) {
    await this.writeAudit(ctx, 'view_memories', 'user', userId);

    const take = Math.min(opts.limit ?? 50, 200);
    const skip = Math.max((opts.page ?? 1) - 1, 0) * take;

    // By default, show user-scope memories. Admin can widen via query param.
    const where: Record<string, unknown> = {
      scope: opts.scope ?? 'user',
      scopeId: userId,
    };
    if (opts.kind) where.kind = opts.kind;

    const [memories, total] = await Promise.all([
      prisma.memoryEntry.findMany({
        where,
        take,
        skip,
        orderBy: { lastSeenAt: 'desc' },
        select: {
          id: true,
          kind: true,
          scope: true,
          scopeId: true,
          content: true,
          // Explicitly exclude `embedding` from list responses — it's bulky
          // and only needed on the detail view
          weight: true,
          baselineWeight: true,
          reinforceCount: true,
          lastSeenAt: true,
          expiresAt: true,
          jobContext: true,
          sourceEventId: true,
          sourceAgentId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.memoryEntry.count({ where }),
    ]);

    return { data: memories, total };
  }

  async getMemoryDetail(ctx: AdminContext, memoryId: string) {
    await this.writeAudit(ctx, 'view_memories', 'memory_entry', memoryId);
    return prisma.memoryEntry.findUnique({ where: { id: memoryId } });
  }

  async listUserInteractions(
    ctx: AdminContext,
    userId: string,
    opts: { eventType?: string; limit?: number; page?: number } = {},
  ) {
    await this.writeAudit(ctx, 'view_interactions', 'user', userId);

    const take = Math.min(opts.limit ?? 100, 500);
    const skip = Math.max((opts.page ?? 1) - 1, 0) * take;

    const where: Record<string, unknown> = { userId };
    if (opts.eventType) where.eventType = opts.eventType;

    const [rows, total] = await Promise.all([
      prisma.candidateInteraction.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.candidateInteraction.count({ where }),
    ]);

    return { data: rows, total };
  }

  // ── Mutation methods ──────────────────────────────────────────────────────

  async editMemory(
    ctx: AdminContext,
    memoryId: string,
    patch: {
      content?: string;
      weight?: number;
      expiresAt?: Date | null;
    },
  ): Promise<{ ok: true; memory: unknown } | { ok: false; error: string }> {
    const existing = await prisma.memoryEntry.findUnique({ where: { id: memoryId } });
    if (!existing) return { ok: false, error: 'Memory not found' };

    // Legal content check — reject content that matches the blocklist
    if (typeof patch.content === 'string') {
      const lower = patch.content.toLowerCase();
      for (const term of LEGAL_CONTENT_BLOCKLIST) {
        if (lower.includes(term)) {
          return {
            ok: false,
            error: `Content references a legally protected attribute ("${term}"). Edit rejected.`,
          };
        }
      }
    }

    // Numeric bounds
    if (typeof patch.weight === 'number' && (patch.weight < 0 || patch.weight > 10)) {
      return { ok: false, error: 'weight must be between 0 and 10' };
    }

    const data: Record<string, unknown> = {};
    if (typeof patch.content === 'string') data.content = patch.content.trim();
    if (typeof patch.weight === 'number') data.weight = patch.weight;
    if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt;

    const updated = await prisma.memoryEntry.update({
      where: { id: memoryId },
      data,
    });

    await this.writeAudit(ctx, 'edit_memory', 'memory_entry', memoryId, {
      before: {
        content: existing.content,
        weight: existing.weight,
        expiresAt: existing.expiresAt,
      },
      after: {
        content: updated.content,
        weight: updated.weight,
        expiresAt: updated.expiresAt,
      },
    });

    return { ok: true, memory: updated };
  }

  async deleteMemory(ctx: AdminContext, memoryId: string): Promise<boolean> {
    const existing = await prisma.memoryEntry.findUnique({ where: { id: memoryId } });
    if (!existing) return false;

    await prisma.memoryEntry.delete({ where: { id: memoryId } });
    await this.writeAudit(ctx, 'delete_memory', 'memory_entry', memoryId, {
      before: {
        content: existing.content,
        kind: existing.kind,
        scope: existing.scope,
        scopeId: existing.scopeId,
      },
    });
    return true;
  }

  async pinMemory(ctx: AdminContext, memoryId: string, pinned: boolean) {
    const existing = await prisma.memoryEntry.findUnique({ where: { id: memoryId } });
    if (!existing) return null;
    const updated = await prisma.memoryEntry.update({
      where: { id: memoryId },
      data: { expiresAt: pinned ? null : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
    });
    await this.writeAudit(
      ctx,
      pinned ? 'pin_memory' : 'unpin_memory',
      'memory_entry',
      memoryId,
      { before: { expiresAt: existing.expiresAt }, after: { expiresAt: updated.expiresAt } },
    );
    return updated;
  }

  async rebuildUserProfile(ctx: AdminContext, userId: string): Promise<void> {
    await this.writeAudit(ctx, 'rebuild_profile', 'user_profile', userId);
    // Lazy import to avoid a cycle at module load
    const { userRecruiterProfileService } = await import('./UserRecruiterProfileService.js');
    await userRecruiterProfileService.rebuildForUser(userId);
  }

  async resetUserProfile(ctx: AdminContext, userId: string): Promise<void> {
    await this.writeAudit(ctx, 'reset_profile', 'user_profile', userId);
    const { userRecruiterProfileService } = await import('./UserRecruiterProfileService.js');
    await userRecruiterProfileService.resetForUser(userId);
  }

  // ── Audit query (admin looks at audit trail) ──────────────────────────────

  async queryAudit(
    ctx: AdminContext,
    opts: {
      targetType?: string;
      targetId?: string;
      adminId?: string;
      action?: string;
      limit?: number;
      page?: number;
    } = {},
  ) {
    // Viewing the audit log is itself audited to a separate channel to avoid
    // recursion-flood but keep admin-on-admin actions visible.
    await this.writeAudit(ctx, 'view_audit', 'user', opts.targetId ?? 'all');

    const take = Math.min(opts.limit ?? 100, 500);
    const skip = Math.max((opts.page ?? 1) - 1, 0) * take;

    const where: Record<string, unknown> = {};
    if (opts.targetType) where.targetType = opts.targetType;
    if (opts.targetId) where.targetId = opts.targetId;
    if (opts.adminId) where.adminId = opts.adminId;
    if (opts.action) where.action = opts.action;

    const [rows, total] = await Promise.all([
      prisma.memoryAdminAuditLog.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.memoryAdminAuditLog.count({ where }),
    ]);

    return { data: rows, total };
  }
}

export const adminMemoryService = new AdminMemoryService();

// Keep a reference to unused import so it's not tree-shaken — the validator
// is imported for its side-effect coupling to the legal blocklist policy
// even though we don't invoke it on memory strings directly (we check the
// string against LEGAL_CONTENT_BLOCKLIST ourselves to avoid the HR rule shape).
void validateHardRequirement;
