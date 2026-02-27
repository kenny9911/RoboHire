import type { Request, Response, NextFunction } from 'express';
import authService from '../services/AuthService.js';
import prisma from '../lib/prisma.js';
import type { AuthUser, ApiKeyScope } from '../types/auth.js';
// Import auth types to extend Express
import '../types/auth.js';

/**
 * Validate an API key and return the associated user
 */
async function validateApiKey(apiKey: string): Promise<{
  user: AuthUser | null;
  apiKeyId: string | null;
  scopes: ApiKeyScope[] | null;
}> {
  try {
    const keyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            company: true,
            avatar: true,
            role: true,
            provider: true,
            providerId: true,
            createdAt: true,
            updatedAt: true,
            stripeCustomerId: true,
            subscriptionTier: true,
            subscriptionStatus: true,
            subscriptionId: true,
            currentPeriodEnd: true,
            trialEnd: true,
            interviewsUsed: true,
            resumeMatchesUsed: true,
            topUpBalance: true,
          },
        },
      },
    });

    if (!keyRecord) {
      return { user: null, apiKeyId: null, scopes: null };
    }

    // Check if key is active
    if (!keyRecord.isActive) {
      return { user: null, apiKeyId: null, scopes: null };
    }

    // Check if key has expired
    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return { user: null, apiKeyId: null, scopes: null };
    }

    // Update lastUsedAt (async, don't wait)
    prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch(err => console.error('Failed to update API key lastUsedAt:', err));

    return {
      user: keyRecord.user,
      apiKeyId: keyRecord.id,
      scopes: keyRecord.scopes as ApiKeyScope[],
    };
  } catch (error) {
    console.error('API key validation error:', error);
    return { user: null, apiKeyId: null, scopes: null };
  }
}

/**
 * Authentication middleware - requires valid JWT, session token, or API key
 * Extracts token from:
 * 1. Authorization header: "Bearer <token>" (JWT or API key starting with "rh_")
 * 2. X-API-Key header: "<api_key>"
 * 3. Cookie: "session_token=<token>"
 * 4. X-Session-Token header: "<session_token>"
 * 5. Query parameter: "?token=<token>"
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;
    let isSessionToken = false;
    let isApiKey = false;

    // Check X-API-Key header first (API key)
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string' && apiKeyHeader.startsWith('rh_')) {
      token = apiKeyHeader;
      isApiKey = true;
    }

    // Check Authorization header (JWT or API key)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const bearerToken = authHeader.slice(7);
        if (bearerToken.startsWith('rh_')) {
          token = bearerToken;
          isApiKey = true;
        } else {
          token = bearerToken;
        }
      }
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

    if (isApiKey) {
      // Validate API key
      const { user: apiKeyUser, apiKeyId, scopes } = await validateApiKey(token);
      if (apiKeyUser) {
        user = apiKeyUser;
        req.apiKeyId = apiKeyId || undefined;
        req.apiKeyScopes = scopes || undefined;
      }
    } else if (isSessionToken) {
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
    let isApiKey = false;

    // Check X-API-Key header first (API key)
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string' && apiKeyHeader.startsWith('rh_')) {
      token = apiKeyHeader;
      isApiKey = true;
    }

    // Check Authorization header (JWT or API key)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const bearerToken = authHeader.slice(7);
        if (bearerToken.startsWith('rh_')) {
          token = bearerToken;
          isApiKey = true;
        } else {
          token = bearerToken;
        }
      }
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

      if (isApiKey) {
        // Validate API key
        const { user: apiKeyUser, apiKeyId, scopes } = await validateApiKey(token);
        if (apiKeyUser) {
          user = apiKeyUser;
          req.apiKeyId = apiKeyId || undefined;
          req.apiKeyScopes = scopes || undefined;
        }
      } else if (isSessionToken) {
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
 * Middleware to require specific API key scopes
 */
export function requireScopes(...requiredScopes: ApiKeyScope[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // If not using API key auth, allow (JWT/session users have full access)
    if (!req.apiKeyId) {
      next();
      return;
    }

    // Check if API key has all required scopes
    const userScopes = req.apiKeyScopes || [];
    const hasAllScopes = requiredScopes.every(scope => userScopes.includes(scope));

    if (!hasAllScopes) {
      res.status(403).json({
        success: false,
        error: `API key missing required scopes: ${requiredScopes.join(', ')}`,
        code: 'INSUFFICIENT_SCOPES',
      });
      return;
    }

    next();
  };
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
