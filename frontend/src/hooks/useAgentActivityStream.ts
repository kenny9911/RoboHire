import { useEffect, useState } from 'react';
import { API_BASE } from '../config';
import type { RunActivity } from './useAgentRunStream';

/**
 * Subscribes to the per-agent SSE activity stream. Replays the most recent
 * 50 events on connect, then prepends new events as they arrive on the
 * AgentActivityLogger bus. Used by the Activity tab in the workbench drawer.
 *
 * Returns the rolling event list (oldest→newest, capped at MAX_BUFFER) plus
 * the agent's display name (delivered once on the `meta` SSE event).
 */
const MAX_BUFFER = 500;

export interface ActivityStreamState {
  events: RunActivity[];
  agentName: string | null;
  status: 'connecting' | 'streaming' | 'error';
}

export function useAgentActivityStream(agentId: string | null): ActivityStreamState {
  const [state, setState] = useState<ActivityStreamState>({
    events: [],
    agentName: null,
    status: 'connecting',
  });

  useEffect(() => {
    if (!agentId) return;
    setState({ events: [], agentName: null, status: 'connecting' });

    const token = localStorage.getItem('auth_token');
    const base = API_BASE || window.location.origin;
    const url = new URL(`/api/v1/agents/${agentId}/activity/stream`, base);
    if (token) url.searchParams.set('token', token);

    const es = new EventSource(url.toString(), { withCredentials: true });

    es.addEventListener('meta', (ev) => {
      try {
        const meta = JSON.parse((ev as MessageEvent).data) as { agentName: string };
        setState((prev) => ({ ...prev, agentName: meta.agentName }));
      } catch {
        /* ignore */
      }
    });

    es.addEventListener('activity', (ev) => {
      try {
        const activity = JSON.parse((ev as MessageEvent).data) as RunActivity;
        setState((prev) => {
          // Dedupe by id (replay history can overlap with live events).
          if (prev.events.some((e) => e.id === activity.id)) return prev;
          const next = [...prev.events, activity];
          if (next.length > MAX_BUFFER) next.splice(0, next.length - MAX_BUFFER);
          return { ...prev, status: 'streaming', events: next };
        });
      } catch {
        /* ignore */
      }
    });

    es.onerror = () => {
      setState((prev) => ({ ...prev, status: 'error' }));
    };

    return () => es.close();
  }, [agentId]);

  return state;
}
