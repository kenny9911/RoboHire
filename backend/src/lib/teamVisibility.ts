import prisma from './prisma.js';

export interface VisibilityScope {
  userIds: string[];
  isAdmin: boolean;
}

/**
 * Compute the set of user IDs whose data the current user can see.
 * - Admin: sees everything (isAdmin = true, empty userIds)
 * - Team member with teamView=true: sees own + all teammates' data
 * - Team member with teamView=false: sees only own data
 * - No team: sees only own data
 */
export async function getVisibilityScope(user: {
  id: string;
  role?: string;
  teamId?: string | null;
}, teamView = true): Promise<VisibilityScope> {
  if (user.role === 'admin') {
    return { userIds: [], isAdmin: true };
  }

  if (!user.teamId || !teamView) {
    return { userIds: [user.id], isAdmin: false };
  }

  const teammates = await prisma.user.findMany({
    where: { teamId: user.teamId },
    select: { id: true },
  });

  return {
    userIds: teammates.map((t) => t.id),
    isAdmin: false,
  };
}

/**
 * Build a Prisma `where` filter for userId based on visibility scope.
 * For admin: returns {} (no filter).
 * For single user: returns { userId: "xxx" }.
 * For team: returns { userId: { in: [...] } }.
 */
export function buildUserIdFilter(scope: VisibilityScope): Record<string, unknown> {
  if (scope.isAdmin) return {};
  if (scope.userIds.length === 1) return { userId: scope.userIds[0] };
  return { userId: { in: scope.userIds } };
}

/**
 * For admin users, optionally narrow the visibility to a specific user or team.
 * Non-admin users always get their standard visibility filter.
 */
export async function buildAdminOverrideFilter(
  scope: VisibilityScope,
  filterUserId?: string,
  filterTeamId?: string,
): Promise<Record<string, unknown>> {
  if (!scope.isAdmin) return buildUserIdFilter(scope);

  if (filterUserId) return { userId: filterUserId };

  if (filterTeamId) {
    const members = await prisma.user.findMany({
      where: { teamId: filterTeamId },
      select: { id: true },
    });
    const ids = members.map((m) => m.id);
    if (ids.length === 0) return { userId: '__none__' };
    if (ids.length === 1) return { userId: ids[0] };
    return { userId: { in: ids } };
  }

  return {};
}
