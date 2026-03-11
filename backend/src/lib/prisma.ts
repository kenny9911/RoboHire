import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: ensureConnectionParams(process.env.DATABASE_URL || ''),
      },
    },
  });

  // Keep connection alive with periodic pings (Neon closes idle connections)
  const KEEPALIVE_MS = 4 * 60 * 1000; // 4 minutes (Neon idle timeout is ~5 min)
  setInterval(async () => {
    try {
      await client.$queryRaw`SELECT 1`;
    } catch {
      // Connection lost — Prisma will auto-reconnect on next real query
    }
  }, KEEPALIVE_MS).unref();

  return client;
}

function ensureConnectionParams(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', '15');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '15');
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '5');
    if (!u.searchParams.has('socket_timeout')) u.searchParams.set('socket_timeout', '30');
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
