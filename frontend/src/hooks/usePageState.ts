import { useState, useEffect, useRef } from 'react';

/**
 * Module-level cache that persists across component mounts/unmounts
 * within the same SPA session. Cleared on full page reload.
 */
const cache = new Map<string, unknown>();

/**
 * Like useState, but persists the value in an in-memory cache keyed by `key`.
 * When the component remounts, it restores the cached value instead of using initialState.
 */
export function usePageState<T>(key: string, initialState: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const cached = cache.get(key);
    return cached !== undefined ? (cached as T) : initialState;
  });

  // Keep cache in sync with state changes
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    cache.set(key, state);
  }, [key, state]);

  return [state, setState];
}

/** Check if a cache entry exists (useful for skipping fetches). */
export function hasPageCache(key: string): boolean {
  return cache.has(key);
}
