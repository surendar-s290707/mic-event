import { PrismaClient } from '@prisma/client';

/**
 * One Prisma client for the process. Creating a client per request would open
 * a new connection pool every time.
 *
 * The `globalThis` cache exists for `tsx watch`, which re-imports modules on
 * every save and would otherwise leak a pool per reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
