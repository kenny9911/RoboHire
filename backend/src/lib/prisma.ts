import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: ensureConnectionParams(process.env.DATABASE_URL || ''),
      },
    },
  });
}

function ensureConnectionParams(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', '15');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '15');
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '5');
    return u.toString();
  } catch {
    return url;
  }
}

export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
