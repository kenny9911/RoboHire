import type { Request, Response, NextFunction } from 'express';

interface SlidingWindow {
  timestamps: number[];
}

const windows = new Map<string, SlidingWindow>();

const DEFAULT_MAX = 60;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute

/**
 * Per-API-key (or per-IP for session users) sliding-window rate limiter.
 * Sets standard X-RateLimit-* response headers on every request.
 */
export function apiRateLimit(
  maxRequests = DEFAULT_MAX,
  windowMs = DEFAULT_WINDOW_MS,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.apiKeyId ?? req.ip ?? 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;

    let window = windows.get(key);
    if (!window) {
      window = { timestamps: [] };
      windows.set(key, window);
    }

    // Drop timestamps outside the window
    window.timestamps = window.timestamps.filter((t) => t > cutoff);

    const remaining = Math.max(0, maxRequests - window.timestamps.length);
    const resetAt = Math.ceil((now + windowMs) / 1000);

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetAt));

    if (window.timestamps.length >= maxRequests) {
      const retryAfter = Math.ceil((window.timestamps[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
      return;
    }

    window.timestamps.push(now);
    next();
  };
}

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - DEFAULT_WINDOW_MS * 2;
  for (const [key, window] of windows.entries()) {
    window.timestamps = window.timestamps.filter((t) => t > cutoff);
    if (window.timestamps.length === 0) {
      windows.delete(key);
    }
  }
}, 60_000);
