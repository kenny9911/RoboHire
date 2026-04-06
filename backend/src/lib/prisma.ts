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

  // Keepalive is useful in production against serverless Postgres, but it can
  // generate noisy reconnect errors in local dev when the remote pooler closes
  // idle sockets. Opt into local keepalive with PRISMA_KEEPALIVE_ENABLED=true.
  if (shouldEnableKeepalive()) {
    const keepaliveMs = parseKeepaliveMs();
    setInterval(async () => {
      try {
        await client.$queryRaw`SELECT 1`;
      } catch {
        // Connection lost — Prisma will auto-reconnect on next real query.
      }
    }, keepaliveMs).unref();
  }

  return client;
}

function shouldEnableKeepalive(): boolean {
  const override = process.env.PRISMA_KEEPALIVE_ENABLED?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function parseKeepaliveMs(): number {
  const fallbackMs = 4 * 60 * 1000;
  const parsed = Number.parseInt(process.env.PRISMA_KEEPALIVE_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
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
