import type { Request, Response, NextFunction } from 'express';
import authService from '../services/AuthService.js';
import type { AuthUser } from '../types/auth.js';
// Import auth types to extend Express
import '../types/auth.js';

/**
 * Authentication middleware - requires valid JWT or session token
 * Extracts token from:
 * 1. Authorization header: "Bearer <token>"
 * 2. Cookie: "session_token=<token>"
 * 3. Query parameter: "?token=<token>"
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;
    let isSessionToken = false;

    // Check Authorization header first (JWT)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Check for session token in cookie
    if (!token && req.cookies?.session_token) {
      token = req.cookies.session_token;
      isSessionToken = true;
    }

    // Check for session token in header
    if (!token && req.headers['x-session-token']) {
      token = req.headers['x-session-token'] as string;
      isSessionToken = true;
    }

    // Check query parameter (for OAuth callbacks)
    if (!token && req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    let user: AuthUser | null = null;

    if (isSessionToken) {
      // Validate session token
      const sessionUser = await authService.validateSession(token);
      if (sessionUser) {
        const { passwordHash: _, ...userWithoutPassword } = sessionUser;
        user = userWithoutPassword;
        req.sessionToken = token;
      }
    } else {
      // Validate JWT
      const payload = authService.verifyToken(token);
      if (payload) {
        user = await authService.getUserById(payload.userId);
      }
    }

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
}

/**
 * Optional authentication middleware - attaches user if token is valid, but doesn't require it
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;
    let isSessionToken = false;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Check for session token in cookie
    if (!token && req.cookies?.session_token) {
      token = req.cookies.session_token;
      isSessionToken = true;
    }

    // Check for session token in header
    if (!token && req.headers['x-session-token']) {
      token = req.headers['x-session-token'] as string;
      isSessionToken = true;
    }

    if (token) {
      let user: AuthUser | null = null;

      if (isSessionToken) {
        const sessionUser = await authService.validateSession(token);
        if (sessionUser) {
          const { passwordHash: _, ...userWithoutPassword } = sessionUser;
          user = userWithoutPassword;
          req.sessionToken = token;
        }
      } else {
        const payload = authService.verifyToken(token);
        if (payload) {
          user = await authService.getUserById(payload.userId);
        }
      }

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors, just continue without user
    console.error('Optional auth error:', error);
    next();
  }
}

/**
 * Rate limiting helper for auth endpoints
 * Simple in-memory rate limiter
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxAttempts: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);

    if (!record || record.resetAt < now) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxAttempts) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
        retryAfter,
      });
      return;
    }

    record.count++;
    next();
  };
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (record.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 60000); // Every minute
