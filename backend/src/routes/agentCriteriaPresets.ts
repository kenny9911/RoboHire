/**
 * AgentCriteriaPreset CRUD — reusable evaluation criteria sets.
 *
 * Mounted at /api/v1/agents/criteria-presets. Users own their private presets;
 * admins can mark a preset scope='shared' to make it visible workspace-wide.
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

interface StoredCriterion {
  id: string;
  text: string;
  pinned: boolean;
  bucket: 'most' | 'least';
}

function validateCriteria(value: unknown): StoredCriterion[] | null {
  if (!Array.isArray(value)) return null;
  const out: StoredCriterion[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const c = item as Partial<StoredCriterion>;
    if (typeof c.id !== 'string' || typeof c.text !== 'string' || typeof c.pinned !== 'boolean') return null;
    if (c.bucket !== 'most' && c.bucket !== 'least') return null;
    out.push({ id: c.id, text: c.text, pinned: c.pinned, bucket: c.bucket });
  }
  return out;
}

// ── List ─ visible = own presets + all shared presets ──────────────────────

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const presets = await prisma.agentCriteriaPreset.findMany({
      where: {
        OR: [{ userId }, { scope: 'shared' }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    res.json({ data: presets });
  } catch (err) {
    console.error('Failed to list criteria presets:', err);
    res.status(500).json({ error: 'Failed to list presets' });
  }
});

// ── Create ─────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, criteria, scope } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const validated = validateCriteria(criteria);
    if (!validated) {
      return res.status(400).json({ error: 'criteria must be an array of { id, text, pinned, bucket }' });
    }

    // Only admins can create shared presets.
    let resolvedScope: 'private' | 'shared' = 'private';
    if (scope === 'shared') {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can create shared presets' });
      }
      resolvedScope = 'shared';
    }

    const preset = await prisma.agentCriteriaPreset.create({
      data: {
        userId: req.user!.id,
        name: name.trim(),
        criteria: validated as unknown as object,
        scope: resolvedScope,
      },
    });
    res.status(201).json({ data: preset });
  } catch (err) {
    console.error('Failed to create criteria preset:', err);
    res.status(500).json({ error: 'Failed to create preset' });
  }
});

// ── Delete — owner or admin only ───────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const preset = await prisma.agentCriteriaPreset.findUnique({ where: { id: req.params.id } });
    if (!preset) return res.status(404).json({ error: 'Preset not found' });

    const isOwner = preset.userId === req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this preset' });
    }

    await prisma.agentCriteriaPreset.delete({ where: { id: preset.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete criteria preset:', err);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

export default router;
