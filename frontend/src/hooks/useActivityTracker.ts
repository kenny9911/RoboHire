import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

interface ActivityEvent {
  sessionId: string;
  eventType: 'page_view' | 'click';
  path: string;
  element?: string;
  elementTag?: string;
  timestamp: number;
}

const SESSION_ID = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH_SIZE = 50;

let eventQueue: ActivityEvent[] = [];

function flush() {
  if (eventQueue.length === 0) return;
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  const batch = eventQueue.splice(0, MAX_BATCH_SIZE);
  const payload = JSON.stringify({ events: batch });
  const url = `${API_BASE}/api/v1/activity/track`;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Re-queue on failure (best effort)
    eventQueue.unshift(...batch);
  });
}

function enqueue(event: Omit<ActivityEvent, 'sessionId' | 'timestamp'>) {
  eventQueue.push({
    ...event,
    sessionId: SESSION_ID,
    timestamp: Date.now(),
  });
  if (eventQueue.length >= MAX_BATCH_SIZE) flush();
}

export function useActivityTracker() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track page views on route change
  useEffect(() => {
    if (!isAuthenticated) return;
    enqueue({ eventType: 'page_view', path: location.pathname });
  }, [location.pathname, isAuthenticated]);

  // Set up flush interval and click listener
  useEffect(() => {
    if (!isAuthenticated) return;

    intervalRef.current = setInterval(flush, FLUSH_INTERVAL_MS);

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const trackable = target.closest('button, a, [data-track]') as HTMLElement | null;
      if (!trackable) return;

      const element =
        trackable.getAttribute('data-track') ||
        trackable.textContent?.trim().slice(0, 80) ||
        trackable.tagName;

      enqueue({
        eventType: 'click',
        path: location.pathname,
        element,
        elementTag: trackable.tagName,
      });
    };

    document.addEventListener('click', handleClick, true);

    const handleUnload = () => flush();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('beforeunload', handleUnload);
      flush();
    };
  }, [isAuthenticated, location.pathname]);
}
