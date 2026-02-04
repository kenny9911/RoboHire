import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import authService, { type OAuthProfile } from '../services/AuthService.js';
import { requireAuth, rateLimit } from '../middleware/auth.js';
import { logger, generateRequestId } from '../services/LoggerService.js';
// Import auth types to extend Express
import '../types/auth.js';

const router = Router();

const getClientMeta = (req: any) => {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.ip;

  return {
    ip,
    userAgent: req.headers?.['user-agent'] || 'unknown',
  };
};

// OAuth configuration
const OAUTH_CALLBACK_URL = process.env.OAUTH_CALLBACK_URL || 'http://localhost:4607';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3607';

// Initialize Passport strategies
function initializePassport() {
  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${OAUTH_CALLBACK_URL}/api/auth/google/callback`,
          scope: ['profile', 'email'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email found in Google profile'));
            }
            const oauthProfile: OAuthProfile = {
              provider: 'google',
              providerId: profile.id,
              email,
              name: profile.displayName,
              avatar: profile.photos?.[0]?.value,
            };
            const result = await authService.oauthLogin(oauthProfile);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            done(null, result as any);
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }

  // GitHub OAuth
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: `${OAUTH_CALLBACK_URL}/api/auth/github/callback`,
          scope: ['user:email'],
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;
            const oauthProfile: OAuthProfile = {
              provider: 'github',
              providerId: profile.id,
              email,
              name: profile.displayName || profile.username,
              avatar: profile.photos?.[0]?.value,
            };
            const result = await authService.oauthLogin(oauthProfile);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            done(null, result as any);
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }

  // LinkedIn OAuth
  if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    passport.use(
      new LinkedInStrategy(
        {
          clientID: process.env.LINKEDIN_CLIENT_ID,
          clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
          callbackURL: `${OAUTH_CALLBACK_URL}/api/auth/linkedin/callback`,
          scope: ['openid', 'profile', 'email'],
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email found in LinkedIn profile'));
            }
            const oauthProfile: OAuthProfile = {
              provider: 'linkedin',
              providerId: profile.id,
              email,
              name: profile.displayName,
              avatar: profile.photos?.[0]?.value,
            };
            const result = await authService.oauthLogin(oauthProfile);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            done(null, result as any);
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }
}

// Initialize passport
initializePassport();

// Rate limiting for auth endpoints: 5 attempts per minute
const authRateLimit = rateLimit(5, 60000);

/**
 * POST /api/auth/signup
 * Register a new user with email and password
 */
router.post('/signup', authRateLimit, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { email, password, name, company } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.toLowerCase() : undefined;
    const clientMeta = getClientMeta(req);

    logger.info('AUTH', 'Signup attempt', {
      email: normalizedEmail,
      ...clientMeta,
    }, requestId);

    if (!email || !password) {
      logger.warn('AUTH', 'Signup validation failed', {
        email: normalizedEmail,
        reason: 'missing_credentials',
        ...clientMeta,
      }, requestId);
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const result = await authService.signup({ email, password, name, company });

    // Set session cookie
    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
      },
    });

    logger.info('AUTH', 'Signup success', {
      userId: result.user.id,
      email: result.user.email,
      provider: result.user.provider,
      ...clientMeta,
    }, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signup failed';
    logger.warn('AUTH', 'Signup failed', {
      error: message,
      ...getClientMeta(req),
    }, requestId);
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/auth/login
 * Log in with email and password
 */
router.post('/login', authRateLimit, async (req, res) => {
  const requestId = generateRequestId();
  try {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.toLowerCase() : undefined;
    const clientMeta = getClientMeta(req);

    logger.info('AUTH', 'Login attempt', {
      email: normalizedEmail,
      ...clientMeta,
    }, requestId);

    if (!email || !password) {
      logger.warn('AUTH', 'Login validation failed', {
        email: normalizedEmail,
        reason: 'missing_credentials',
        ...clientMeta,
      }, requestId);
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const result = await authService.login({ email, password });

    // Set session cookie
    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
      },
    });

    logger.info('AUTH', 'Login success', {
      userId: result.user.id,
      email: result.user.email,
      provider: result.user.provider,
      isDemo: result.user.email === 'demo@robohire.io',
      ...clientMeta,
    }, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    logger.warn('AUTH', 'Login failed', {
      email: typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : undefined,
      error: message,
      ...getClientMeta(req),
    }, requestId);
    res.status(401).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/auth/logout
 * Log out the current user
 */
router.post('/logout', requireAuth, async (req, res) => {
  const requestId = generateRequestId();
  const clientMeta = getClientMeta(req);
  try {
    logger.info('AUTH', 'Logout attempt', {
      userId: req.user?.id,
      email: req.user?.email,
      ...clientMeta,
    }, requestId);

    if (req.sessionToken) {
      await authService.invalidateSession(req.sessionToken);
    }

    res.clearCookie('session_token');

    res.json({
      success: true,
      message: 'Logged out successfully',
    });

    logger.info('AUTH', 'Logout success', {
      userId: req.user?.id,
      email: req.user?.email,
      ...clientMeta,
    }, requestId);
  } catch (error) {
    logger.error('AUTH', 'Logout failed', {
      error: error instanceof Error ? error.message : 'Logout failed',
      userId: req.user?.id,
      email: req.user?.email,
      ...clientMeta,
    }, requestId);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
    });
  }
});

/**
 * GET /api/auth/me
 * Get the current user's profile
 */
router.get('/me', requireAuth, async (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

/**
 * PATCH /api/auth/profile
 * Update the current user's profile
 */
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const { name, company, avatar } = req.body;
    const user = await authService.updateProfile(req.user!.id, { name, company, avatar });

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change the current user's password
 */
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      });
    }

    await authService.changePassword(req.user!.id, currentPassword, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password change failed';
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

// OAuth Routes

/**
 * GET /api/auth/google
 * Redirect to Google OAuth
 */
router.get('/google', (req, res, next) => {
  const requestId = generateRequestId();
  const clientMeta = getClientMeta(req);
  logger.info('AUTH', 'OAuth start', {
    provider: 'google',
    ...clientMeta,
  }, requestId);
  if (!process.env.GOOGLE_CLIENT_ID) {
    logger.warn('AUTH', 'OAuth not configured', {
      provider: 'google',
      ...clientMeta,
    }, requestId);
    return res.redirect(`${FRONTEND_URL}/login?error=` + encodeURIComponent('Google login is not available yet. Please use email/password.'));
  }
  passport.authenticate('google', { session: false })(req, res, next);
});

/**
 * GET /api/auth/google/callback
 * Google OAuth callback
 */
router.get('/google/callback', (req, res, next) => {
  const requestId = generateRequestId();
  const clientMeta = getClientMeta(req);
  passport.authenticate('google', { session: false }, (err: Error | null, result: any) => {
    if (err || !result) {
      logger.warn('AUTH', 'OAuth failed', {
        provider: 'google',
        error: err?.message || 'OAuth failed',
        ...clientMeta,
      }, requestId);
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(err?.message || 'OAuth failed')}`);
    }

    // Set session cookie
    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    // Redirect to frontend dashboard
    res.redirect(`${FRONTEND_URL}/dashboard`);

    logger.info('AUTH', 'OAuth success', {
      provider: 'google',
      userId: result.user?.id,
      email: result.user?.email,
      ...clientMeta,
    }, requestId);
  })(req, res, next);
});

/**
 * GET /api/auth/github
 * Redirect to GitHub OAuth
 */
router.get('/github', (req, res, next) => {
  const requestId = generateRequestId();
  const clientMeta = getClientMeta(req);
  logger.info('AUTH', 'OAuth start', {
    provider: 'github',
    ...clientMeta,
  }, requestId);
  if (!process.env.GITHUB_CLIENT_ID) {
    logger.warn('AUTH', 'OAuth not configured', {
      provider: 'github',
      ...clientMeta,
    }, requestId);
    return res.redirect(`${FRONTEND_URL}/login?error=` + encodeURIComponent('GitHub login is not available yet. Please use email/password.'));
  }
  passport.authenticate('github', { session: false })(req, res, next);
});

/**
 * GET /api/auth/github/callback
 * GitHub OAuth callback
 */
router.get('/github/callback', (req, res, next) => {
  const requestId = generateRequestId();
  const clientMeta = getClientMeta(req);
  passport.authenticate('github', { session: false }, (err: Error | null, result: any) => {
    if (err || !result) {
      logger.warn('AUTH', 'OAuth failed', {
        provider: 'github',
        error: err?.message || 'OAuth failed',
        ...clientMeta,
      }, requestId);
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(err?.message || 'OAuth failed')}`);
    }

    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${FRONTEND_URL}/dashboard`);

    logger.info('AUTH', 'OAuth success', {
      provider: 'github',
      userId: result.user?.id,
      email: result.user?.email,
      ...clientMeta,
    }, requestId);
  })(req, res, next);
});

/**
 * GET /api/auth/linkedin
 * Redirect to LinkedIn OAuth
 */
router.get('/linkedin', (req, res, next) => {
  const requestId = generateRequestId();
  const clientMeta = getClientMeta(req);
  logger.info('AUTH', 'OAuth start', {
    provider: 'linkedin',
    ...clientMeta,
  }, requestId);
  if (!process.env.LINKEDIN_CLIENT_ID) {
    logger.warn('AUTH', 'OAuth not configured', {
      provider: 'linkedin',
      ...clientMeta,
    }, requestId);
    return res.redirect(`${FRONTEND_URL}/login?error=` + encodeURIComponent('LinkedIn login is not available yet. Please use email/password.'));
  }
  passport.authenticate('linkedin', { session: false })(req, res, next);
});

/**
 * GET /api/auth/linkedin/callback
 * LinkedIn OAuth callback
 */
router.get('/linkedin/callback', (req, res, next) => {
  const requestId = generateRequestId();
  const clientMeta = getClientMeta(req);
  passport.authenticate('linkedin', { session: false }, (err: Error | null, result: any) => {
    if (err || !result) {
      logger.warn('AUTH', 'OAuth failed', {
        provider: 'linkedin',
        error: err?.message || 'OAuth failed',
        ...clientMeta,
      }, requestId);
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(err?.message || 'OAuth failed')}`);
    }

    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${FRONTEND_URL}/dashboard`);

    logger.info('AUTH', 'OAuth success', {
      provider: 'linkedin',
      userId: result.user?.id,
      email: result.user?.email,
      ...clientMeta,
    }, requestId);
  })(req, res, next);
});

export default router;
