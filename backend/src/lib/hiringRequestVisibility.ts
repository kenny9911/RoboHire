import { Prisma } from '@prisma/client';
import { buildUserIdFilter, getVisibilityScope } from './teamVisibility.js';

interface HiringRequestAccessUser {
  id: string;
  role?: string | null;
  teamId?: string | null;
}

/**
 * Match hiring-request detail access to the same team/admin visibility model
 * used by list endpoints so shared requests do not disappear on drill-in.
 */
export async function buildHiringRequestAccessWhere(
  user: HiringRequestAccessUser,
  id?: string
): Promise<Prisma.HiringRequestWhereInput> {
  const scope = await getVisibilityScope(
    {
      id: user.id,
      role: user.role ?? undefined,
      teamId: user.teamId ?? null,
    },
    true
  );
  const visibilityFilter = buildUserIdFilter(scope) as Prisma.HiringRequestWhereInput;
  return id ? { id, ...visibilityFilter } : visibilityFilter;
}
