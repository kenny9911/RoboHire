import { useCallback, useEffect, useRef } from 'react';
import axios from '../lib/axios';

/**
 * Phase 7b — emits implicit signal events from candidate cards and the
 * profile detail view. Events are buffered locally and flushed on a 5s
 * interval or when the buffer hits 50 events, whichever comes first.
 *
 * Usage:
 *   const { trackViewed, trackExpanded, trackDwell, trackContactCopied,
 *           trackLinkClicked } = useCandidateInteractionTracker({ agentId, runId });
 *   <CandidateCard onExpand={() => trackExpanded(candidate.id)} />
 *
 * Flush semantics: best-effort. Dropped on network failure — this is
 * telemetry, not critical data. Also flushed on `beforeunload` so in-flight
 * events from a closing tab still land.
 */

type EventType = 'viewed' | 'expanded' | 'dwell' | 'contact_copied' | 'link_clicked' | 'scroll_deep';

interface Event {
  eventType: EventType;
  candidateId: string;
  agentId?: string;
  runId?: string;
  resumeId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

const MAX_BUFFER = 50;
const FLUSH_INTERVAL_MS = 5000;

export function useCandidateInteractionTracker(ctx: {
  agentId?: string;
  runId?: string | null;
}) {
  const bufferRef = useRef<Event[]>([]);
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (bufferRef.current.length === 0) return;
    flushingRef.current = true;
    const batch = bufferRef.current.splice(0, bufferRef.current.length);
    try {
      await axios.post('/api/v1/candidate-interactions', { events: batch });
    } catch {
      // Drop silently — telemetry is best-effort and we don't want to
      // back-pressure the UI on transient network errors.
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const enqueue = useCallback(
    (event: Omit<Event, 'agentId' | 'runId'>) => {
      bufferRef.current.push({
        ...event,
        agentId: ctx.agentId,
        runId: ctx.runId ?? undefined,
      });
      if (bufferRef.current.length >= MAX_BUFFER) {
        void flush();
      }
    },
    [ctx.agentId, ctx.runId, flush],
  );

  // Periodic flush
  useEffect(() => {
    const iv = setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [flush]);

  // Flush on tab close so in-flight events aren't lost
  useEffect(() => {
    const handler = () => {
      // sendBeacon would be more reliable but would require a separate
      // endpoint that accepts non-JSON. For now, fire the normal flush
      // and hope the browser allows it in time.
      void flush();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flush]);

  // Public API — one helper per event type so call sites are self-documenting
  const trackViewed = useCallback(
    (candidateId: string, resumeId?: string) => enqueue({ eventType: 'viewed', candidateId, resumeId }),
    [enqueue],
  );
  const trackExpanded = useCallback(
    (candidateId: string, resumeId?: string) => enqueue({ eventType: 'expanded', candidateId, resumeId }),
    [enqueue],
  );
  const trackDwell = useCallback(
    (candidateId: string, durationMs: number, resumeId?: string) =>
      enqueue({ eventType: 'dwell', candidateId, durationMs, resumeId }),
    [enqueue],
  );
  const trackContactCopied = useCallback(
    (candidateId: string, field: 'email' | 'phone' | 'linkedin') =>
      enqueue({ eventType: 'contact_copied', candidateId, metadata: { field } }),
    [enqueue],
  );
  const trackLinkClicked = useCallback(
    (candidateId: string, href: string) =>
      enqueue({ eventType: 'link_clicked', candidateId, metadata: { href } }),
    [enqueue],
  );
  const trackScrollDeep = useCallback(
    (candidateId: string, scrollPct: number, section?: string) =>
      enqueue({ eventType: 'scroll_deep', candidateId, metadata: { scrollPct, section } }),
    [enqueue],
  );

  return {
    trackViewed,
    trackExpanded,
    trackDwell,
    trackContactCopied,
    trackLinkClicked,
    trackScrollDeep,
    flush, // exposed for unit tests and forced-flush scenarios
  };
}
