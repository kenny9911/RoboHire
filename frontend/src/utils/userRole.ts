export type UserRole = 'user' | 'internal' | 'admin';

export function normalizeUserRole(role?: string | null): UserRole {
  if (role === 'admin' || role === 'internal') return role;
  return 'user';
}

export function getUserRoleLabel(role?: string | null): string {
  switch (normalizeUserRole(role)) {
    case 'admin':
      return 'Admin';
    case 'internal':
      return 'Internal';
    default:
      return 'User';
  }
}

export function getUserRoleBadgeClassName(role?: string | null): string {
  switch (normalizeUserRole(role)) {
    case 'admin':
      return 'bg-rose-100 text-rose-700';
    case 'internal':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}
