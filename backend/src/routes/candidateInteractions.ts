/**
 * Candidate Interactions — Phase 7b
 *
 * Ingests implicit signal events from the frontend (candidate card views,
 * profile expansions, dwell time, contact copies, external link clicks).
 * Used by the Phase 7c synthesis worker to distill memories.
 *
 * Endpoint:
 *   POST /api/v1/candidate-interactions
 *     body: { events: CandidateInteractionEvent[] }
 *
 * Events are batched client-side (flush on 50 events or every 5s). Backend
 * validates the shape and bulk-inserts. Rate-limited per-user by the
 * existing in-memory rate limiter.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import '../types/auth.js';

const router = Router();

const VALID_EVENT_TYPES = [
  'viewed',
  'expanded',
  'dwell',
  'contact_copied',
  'link_clicked',
  'scroll_deep',
] as const;

interface CandidateInteractionEvent {
  eventType: (typeof VALID_EVENT_TYPES)[number];
  candidateId: string;
  agentId?: string;
  runId?: string;
  resumeId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

function validateEvent(raw: unknown): CandidateInteractionEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<CandidateInteractionEvent>;
  if (typeof e.eventType !== 'string' || !(VALID_EVENT_TYPES as readonly string[]).includes(e.eventType)) return null;
  if (typeof e.candidateId !== 'string' || !e.candidateId) return null;
  const out: CandidateInteractionEvent = {
    eventType: e.eventType as CandidateInteractionEvent['eventType'],
    candidateId: e.candidateId,
  };
  if (typeof e.agentId === 'string') out.agentId = e.agentId;
  if (typeof e.runId === 'string') out.runId = e.runId;
  if (typeof e.resumeId === 'string') out.resumeId = e.resumeId;
  if (typeof e.durationMs === 'number' && e.durationMs >= 0) out.durationMs = e.durationMs;
  if (e.metadata && typeof e.metadata === 'object') {
    out.metadata = e.metadata as Record<string, unknown>;
  }
  return out;
}

// Cap per-request to prevent a runaway client flooding the ingest endpoint.
const MAX_EVENTS_PER_BATCH = 100;

router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const body = req.body as { events?: unknown };
    if (!body.events || !Array.isArray(body.events)) {
      return res.status(400).json({ error: 'events array is required' });
    }
    if (body.events.length > MAX_EVENTS_PER_BATCH) {
      return res.status(400).json({ error: `batch exceeds max ${MAX_EVENTS_PER_BATCH} events` });
    }

    const valid: CandidateInteractionEvent[] = [];
    for (const raw of body.events) {
      const evt = validateEvent(raw);
      if (evt) valid.push(evt);
    }

    if (valid.length === 0) {
      return res.json({ data: { accepted: 0 } });
    }

    await prisma.candidateInteraction.createMany({
      data: valid.map((e) => ({
        userId,
        agentId: e.agentId ?? null,
        runId: e.runId ?? null,
        candidateId: e.candidateId,
        resumeId: e.resumeId ?? null,
        eventType: e.eventType,
        durationMs: e.durationMs ?? null,
        metadata: (e.metadata ?? undefined) as object | undefined,
      })),
      skipDuplicates: false,
    });

    res.json({ data: { accepted: valid.length } });
  } catch (err) {
    console.error('Failed to ingest candidate interactions:', err);
    res.status(500).json({ error: 'Failed to ingest interactions' });
  }
});

export default router;
