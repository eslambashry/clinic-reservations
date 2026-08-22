import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Singleton database client instance configured for Neon Postgres Cloud.
 *
 * App runtime queries use DATABASE_URL (pooled via PgBouncer with sslmode=require).
 * Migrations use DIRECT_URL (direct connection to Neon Postgres).
 *
 * For standalone scripts only (`db:seed`) that run outside the Nest DI
 * container — the Nest app itself (API + worker processes) uses
 * `PrismaService` (`src/shared/kernel/prisma/prisma.service.ts`) instead,
 * per File 12 Part 05.
 */
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { updateWithOptimisticLock } from '../shared/kernel/prisma/optimistic-lock';
