// Auth-related type definitions

// User type for authenticated requests (public, no password hash)
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  company?: string | null;
  avatar?: string | null;
  provider?: string | null;
  providerId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// API Key scope type
export type ApiKeyScope = 'read' | 'write';

// Extend Express User type to include our properties
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name?: string | null;
      company?: string | null;
      avatar?: string | null;
      provider?: string | null;
      providerId?: string | null;
      createdAt: Date;
      updatedAt: Date;
    }
    interface Request {
      requestId?: string;
      sessionToken?: string;
      apiKeyId?: string;
      apiKeyScopes?: ApiKeyScope[];
    }
  }
}

export {};
