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
      sessionToken?: string;
    }
  }
}

export {};
