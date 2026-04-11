import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';

export interface ParsedExperience {
  company?: string;
  role?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
  employmentType?: string;
  description?: string;
  achievements?: string[];
  technologies?: string[];
}

export interface ParsedEducation {
  institution?: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  achievements?: string[];
  coursework?: string[];
}

export interface ParsedSkills {
  technical?: string[];
  soft?: string[];
  languages?: string[];
  tools?: string[];
  frameworks?: string[];
  other?: string[];
}

export interface ParsedResumeData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  summary?: string;
  experience?: ParsedExperience[];
  education?: ParsedEducation[];
  skills?: ParsedSkills | string[];
}

export interface RunCandidateResume {
  id: string;
  name: string;
  currentRole: string | null;
  email: string | null;
  phone?: string | null;
  tags?: string[];
  summary?: string | null;
  highlight?: string | null;
  experienceYears?: string | null;
  parsedData?: ParsedResumeData | null;
}

export interface RunCandidate {
  id: string;
  agentId: string;
  runId: string | null;
  name: string;
  email: string | null;
  headline: string | null;
  matchScore: number | null;
  status: string;
  source: string | null;
  reason: string | null;
  metadata: unknown;
  resumeId: string | null;
  resume?: RunCandidateResume | null;
  createdAt: string;
}

export interface RunActivity {
  id: string;
  agentId: string;
  runId: string | null;
  candidateId: string | null;
  actor: string;
  eventType: string;
  severity: string;
  message: string | null;
  payload: unknown;
  createdAt: string;
}

export interface RunStreamState {
  status: 'idle' | 'connecting' | 'streaming' | 'ended' | 'error';
  candidates: RunCandidate[];
  activities: RunActivity[];
  endPayload: { status?: string; stats?: unknown } | null;
  error: string | null;
}

/**
 * Subscribe to an agent run's SSE stream. Replays existing history and then
 * streams new events. Auth tokens are passed via query string because
 * EventSource does not support custom headers.
 */
export function useAgentRunStream(agentId: string | null, runId: string | null): RunStreamState {
  const [state, setState] = useState<RunStreamState>({
    status: 'idle',
    candidates: [],
    activities: [],
    endPayload: null,
    error: null,
  });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!agentId || !runId) return;

    setState({ status: 'connecting', candidates: [], activities: [], endPayload: null, error: null });

    const token = localStorage.getItem('auth_token');
    const base = API_BASE || '';
    const url = new URL(`${base || window.location.origin}/api/v1/agents/${agentId}/runs/${runId}/stream`);
    if (token) url.searchParams.set('token', token);

    const es = new EventSource(url.toString(), { withCredentials: true });
    esRef.current = es;

    // Bulk replay: backend emits a single `snapshot` event with all existing
    // activities and candidates before live events begin. Replaces the
    // per-row event flood that used to trigger N re-renders.
    es.addEventListener('snapshot', (ev) => {
      try {
        const { activities, candidates } = JSON.parse((ev as MessageEvent).data) as {
          activities?: RunActivity[];
          candidates?: RunCandidate[];
        };
        setState((prev) => ({
          ...prev,
          status: 'streaming',
          activities: activities ?? [],
          candidates: candidates ?? [],
        }));
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('activity', (ev) => {
      try {
        const activity: RunActivity = JSON.parse((ev as MessageEvent).data);
        setState((prev) => ({
          ...prev,
          status: 'streaming',
          activities: [...prev.activities, activity],
        }));
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('candidate', (ev) => {
      try {
        const cand: RunCandidate = JSON.parse((ev as MessageEvent).data);
        setState((prev) => {
          // dedupe by id
          if (prev.candidates.some((c) => c.id === cand.id)) return prev;
          return {
            ...prev,
            status: 'streaming',
            candidates: [...prev.candidates, cand],
          };
        });
      } catch {
        // ignore
      }
    });

    es.addEventListener('end', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data);
        setState((prev) => ({ ...prev, status: 'ended', endPayload: payload }));
      } catch {
        setState((prev) => ({ ...prev, status: 'ended' }));
      }
      es.close();
    });

    es.onerror = () => {
      setState((prev) => {
        // If we already ended cleanly, don't flip to error
        if (prev.status === 'ended') return prev;
        return { ...prev, status: 'error', error: 'Stream disconnected' };
      });
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [agentId, runId]);

  return state;
}
