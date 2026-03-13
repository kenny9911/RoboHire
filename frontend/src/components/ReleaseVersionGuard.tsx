import { useEffect } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const RELOAD_MARKER_KEY = 'robohire_release_reload_target';
const VERSION_QUERY_PARAM = '__rv';

interface ReleaseVersionPayload {
  version?: string;
}

async function fetchLatestReleaseVersion(signal: AbortSignal): Promise<string | null> {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-store',
    },
    signal,
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as ReleaseVersionPayload;
  return typeof payload.version === 'string' && payload.version.trim().length > 0
    ? payload.version.trim()
    : null;
}

function cleanupReloadMarkerForCurrentRelease() {
  const currentUrl = new URL(window.location.href);
  const requestedVersion = currentUrl.searchParams.get(VERSION_QUERY_PARAM);

  if (requestedVersion === __APP_RELEASE__) {
    currentUrl.searchParams.delete(VERSION_QUERY_PARAM);
    window.history.replaceState({}, document.title, currentUrl.toString());
  }

  if (sessionStorage.getItem(RELOAD_MARKER_KEY) === __APP_RELEASE__) {
    sessionStorage.removeItem(RELOAD_MARKER_KEY);
  }
}

function redirectToLatestRelease(nextVersion: string) {
  sessionStorage.setItem(RELOAD_MARKER_KEY, nextVersion);

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(VERSION_QUERY_PARAM, nextVersion);
  window.location.replace(nextUrl.toString());
}

export default function ReleaseVersionGuard() {
  useEffect(() => {
    cleanupReloadMarkerForCurrentRelease();

    let isMounted = true;

    const checkForUpdate = async () => {
      const controller = new AbortController();

      try {
        const latestVersion = await fetchLatestReleaseVersion(controller.signal);
        if (!isMounted || !latestVersion || latestVersion === __APP_RELEASE__) {
          return;
        }

        const pendingReloadTarget = sessionStorage.getItem(RELOAD_MARKER_KEY);
        if (pendingReloadTarget === latestVersion) {
          return;
        }

        redirectToLatestRelease(latestVersion);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    };

    void checkForUpdate();

    const intervalId = window.setInterval(() => {
      void checkForUpdate();
    }, CHECK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate();
      }
    };

    const handleFocus = () => {
      void checkForUpdate();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return null;
}
