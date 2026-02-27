import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import prisma from '../lib/prisma.js';

// User type matching Prisma schema
export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  company: string | null;
  avatar: string | null;
  role: string;
  provider: string | null;
  providerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Subscription
  stripeCustomerId: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  subscriptionId: string | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  interviewsUsed: number;
  resumeMatchesUsed: number;
  topUpBalance: number;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

// Public user type (without password hash)
export type PublicUser = Omit<User, 'passwordHash'>;

// Types
export interface SignupData {
  email: string;
  password: string;
  name?: string;
  company?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface OAuthProfile {
  provider: 'google' | 'github' | 'linkedin';
  providerId: string;
  email: string;
  name?: string;
  avatar?: string;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
  sessionToken: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const JWT_EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN || '604800', 10); // 7 days
const SESSION_EXPIRES_IN = parseInt(process.env.SESSION_EXPIRES_IN || '2592000', 10); // 30 days
const SALT_ROUNDS = 12;

// Demo account for testing without database
const DEMO_USER: PublicUser = {
  id: 'demo-user-id',
  email: 'demo@robohire.io',
  name: 'Demo User',
  company: 'RoboHire Demo',
  avatar: null,
  role: 'user',
  provider: 'email',
  providerId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  stripeCustomerId: null,
  subscriptionTier: 'free',
  subscriptionStatus: 'active',
  subscriptionId: null,
  currentPeriodEnd: null,
  trialEnd: null,
  interviewsUsed: 0,
  resumeMatchesUsed: 0,
  topUpBalance: 0,
};
const DEMO_PASSWORD = 'demo1234';

class AuthService {
  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT token
   */
  generateToken(user: User): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * Verify a JWT token
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as TokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Generate a random session token
   */
  generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Create a session for a user
   */
  async createSession(userId: string): Promise<Session> {
    const token = this.generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRES_IN * 1000);

    return prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }

  /**
   * Validate a session token and return the user
   */
  async validateSession(sessionToken: string): Promise<User | null> {
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    // Check if session has expired
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    return session.user;
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionToken: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { token: sessionToken },
    });
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllSessions(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId },
    });
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    return result.count;
  }

  /**
   * Sign up a new user with email and password
   */
  async signup(data: SignupData): Promise<AuthResult> {
    const { email, password, name, company } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Create user
    const passwordHash = await this.hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        company,
        provider: 'email',
      },
    });

    // Create session
    const session = await this.createSession(user.id);

    // Generate JWT
    const token = this.generateToken(user);

    // Remove passwordHash from response
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
      sessionToken: session.token,
    };
  }

  /**
   * Log in a user with email and password
   */
  async login(data: LoginData): Promise<AuthResult> {
    const { email, password } = data;

    // Find user in database
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
    } catch (dbError) {
      // Database not available, allow demo user fallback
      if (email.toLowerCase() === DEMO_USER.email && password === DEMO_PASSWORD) {
        const token = this.generateToken({ ...DEMO_USER, passwordHash: null } as any);
        const sessionToken = this.generateSessionToken();
        return { user: DEMO_USER, token, sessionToken };
      }
      throw new Error('Invalid email or password');
    }

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user has a password (might be OAuth user)
    if (!user.passwordHash) {
      throw new Error('This account uses social login. Please sign in with Google, GitHub, or LinkedIn.');
    }

    // Verify password
    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Create session
    const session = await this.createSession(user.id);

    // Generate JWT
    const token = this.generateToken(user as any);

    // Remove passwordHash from response
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword as PublicUser,
      token,
      sessionToken: session.token,
    };
  }

  /**
   * Sign in or sign up with OAuth
   */
  async oauthLogin(profile: OAuthProfile): Promise<AuthResult> {
    const { provider, providerId, email, name, avatar } = profile;

    // Try to find existing user by provider ID
    let user = await prisma.user.findFirst({
      where: {
        provider,
        providerId,
      },
    });

    // If not found, try to find by email
    if (!user && email) {
      user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      // If user exists with different provider, link the account
      if (user && !user.providerId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            provider,
            providerId,
            avatar: avatar || user.avatar,
            name: name || user.name,
          },
        });
      }
    }

    // If still not found, create new user
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name,
          avatar,
          provider,
          providerId,
        },
      });
    }

    // Create session
    const session = await this.createSession(user.id);

    // Generate JWT
    const token = this.generateToken(user);

    // Remove passwordHash from response
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
      sessionToken: session.token,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<PublicUser | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        // Fallback to demo user if DB has no match
        if (id === DEMO_USER.id) return DEMO_USER;
        return null;
      }

      const { passwordHash: _, ...userWithoutPassword } = user;
      return userWithoutPassword as PublicUser;
    } catch {
      // Database not available, fallback to demo user
      if (id === DEMO_USER.id) return DEMO_USER;
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: { name?: string; company?: string; avatar?: string }
  ): Promise<PublicUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new Error('Cannot change password for this account');
    }

    const isValid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const passwordHash = await this.hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate all other sessions
    await this.invalidateAllSessions(userId);
  }
}

export const authService = new AuthService();
export default authService;
