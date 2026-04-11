/**
 * Admin Memory Manager — Phase 7 break-glass access routes.
 *
 * Mounted at /api/v1/admin/memory/* under the admin router (which already
 * enforces requireAuth + requireAdmin). Every route calls into
 * AdminMemoryService, which writes a MemoryAdminAuditLog row for every
 * access before returning data.
 *
 * Reason header / body field: admins can pass `X-Memory-Access-Reason` or
 * `reason` in the request body for destructive actions. The reason is
 * captured in the audit log and surfaced in the UI.
 */

import { Router } from 'express';
import { adminMemoryService, type AdminContext } from '../services/AdminMemoryService.js';
import type { Request } from 'express';

const router = Router();

function buildCtx(req: Request): AdminContext {
  const reasonHeader = req.header('x-memory-access-reason');
  const reasonBody = typeof (req.body as { reason?: unknown })?.reason === 'string'
    ? (req.body as { reason: string }).reason
    : undefined;
  return {
    adminId: req.user!.id,
    ipAddress: req.ip || req.socket?.remoteAddress || undefined,
    reason: reasonHeader || reasonBody || undefined,
  };
}

// ── Directory ───────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const { search, limit, page } = req.query;
    const result = await adminMemoryService.listUsersWithMemoryData(buildCtx(req), {
      search: typeof search === 'string' ? search : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
    });
    res.json({ data: result.data, pagination: { total: result.total } });
  } catch (err) {
    console.error('Failed to list users with memory data:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ── Per-user fetches ────────────────────────────────────────────────────────

router.get('/users/:userId/profile', async (req, res) => {
  try {
    const result = await adminMemoryService.getUserProfile(buildCtx(req), req.params.userId);
    if (!result.user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: result });
  } catch (err) {
    console.error('Failed to get user profile:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.get('/users/:userId/memories', async (req, res) => {
  try {
    const { kind, scope, limit, page } = req.query;
    const result = await adminMemoryService.listUserMemories(buildCtx(req), req.params.userId, {
      kind: typeof kind === 'string' ? kind : undefined,
      scope: typeof scope === 'string' ? scope : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
    });
    res.json({ data: result.data, pagination: { total: result.total } });
  } catch (err) {
    console.error('Failed to list user memories:', err);
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

router.get('/users/:userId/interactions', async (req, res) => {
  try {
    const { eventType, limit, page } = req.query;
    const result = await adminMemoryService.listUserInteractions(buildCtx(req), req.params.userId, {
      eventType: typeof eventType === 'string' ? eventType : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
    });
    res.json({ data: result.data, pagination: { total: result.total } });
  } catch (err) {
    console.error('Failed to list user interactions:', err);
    res.status(500).json({ error: 'Failed to list interactions' });
  }
});

// ── Memory detail + mutations ───────────────────────────────────────────────

router.get('/memory/:id', async (req, res) => {
  try {
    const memory = await adminMemoryService.getMemoryDetail(buildCtx(req), req.params.id);
    if (!memory) return res.status(404).json({ error: 'Memory not found' });
    res.json({ data: memory });
  } catch (err) {
    console.error('Failed to load memory detail:', err);
    res.status(500).json({ error: 'Failed to load memory' });
  }
});

router.patch('/memory/:id', async (req, res) => {
  try {
    const { content, weight, expiresAt } = req.body as {
      content?: string;
      weight?: number;
      expiresAt?: string | null;
    };
    const result = await adminMemoryService.editMemory(buildCtx(req), req.params.id, {
      content,
      weight,
      expiresAt: expiresAt === null ? null : expiresAt ? new Date(expiresAt) : undefined,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.memory });
  } catch (err) {
    console.error('Failed to edit memory:', err);
    res.status(500).json({ error: 'Failed to edit memory' });
  }
});

router.delete('/memory/:id', async (req, res) => {
  try {
    const ok = await adminMemoryService.deleteMemory(buildCtx(req), req.params.id);
    if (!ok) return res.status(404).json({ error: 'Memory not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete memory:', err);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

router.post('/memory/:id/pin', async (req, res) => {
  try {
    const updated = await adminMemoryService.pinMemory(buildCtx(req), req.params.id, true);
    if (!updated) return res.status(404).json({ error: 'Memory not found' });
    res.json({ data: updated });
  } catch (err) {
    console.error('Failed to pin memory:', err);
    res.status(500).json({ error: 'Failed to pin memory' });
  }
});

router.post('/memory/:id/unpin', async (req, res) => {
  try {
    const updated = await adminMemoryService.pinMemory(buildCtx(req), req.params.id, false);
    if (!updated) return res.status(404).json({ error: 'Memory not found' });
    res.json({ data: updated });
  } catch (err) {
    console.error('Failed to unpin memory:', err);
    res.status(500).json({ error: 'Failed to unpin memory' });
  }
});

// ── User profile mutations ──────────────────────────────────────────────────

router.post('/users/:userId/profile/rebuild', async (req, res) => {
  try {
    await adminMemoryService.rebuildUserProfile(buildCtx(req), req.params.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to rebuild profile:', err);
    res.status(500).json({ error: 'Failed to rebuild profile' });
  }
});

router.delete('/users/:userId/profile', async (req, res) => {
  try {
    await adminMemoryService.resetUserProfile(buildCtx(req), req.params.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to reset profile:', err);
    res.status(500).json({ error: 'Failed to reset profile' });
  }
});

// ── Audit trail query ───────────────────────────────────────────────────────

router.get('/audit', async (req, res) => {
  try {
    const { targetType, targetId, adminId, action, limit, page } = req.query;
    const result = await adminMemoryService.queryAudit(buildCtx(req), {
      targetType: typeof targetType === 'string' ? targetType : undefined,
      targetId: typeof targetId === 'string' ? targetId : undefined,
      adminId: typeof adminId === 'string' ? adminId : undefined,
      action: typeof action === 'string' ? action : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
    });
    res.json({ data: result.data, pagination: { total: result.total } });
  } catch (err) {
    console.error('Failed to query audit log:', err);
    res.status(500).json({ error: 'Failed to query audit' });
  }
});

export default router;
