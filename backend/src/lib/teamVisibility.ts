import prisma from './prisma.js';

export interface VisibilityScope {
  userIds: string[];
  isAdmin: boolean;
}

/**
 * Compute the set of user IDs whose data the current user can see.
 * - Admin: sees everything (isAdmin = true, empty userIds)
 * - Team member: sees own + all teammates' data
 * - No team: sees only own data
 */
export async function getVisibilityScope(user: {
  id: string;
  role?: string;
  teamId?: string | null;
}): Promise<VisibilityScope> {
  if (user.role === 'admin') {
    return { userIds: [], isAdmin: true };
  }

  if (!user.teamId) {
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
