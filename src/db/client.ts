import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Singleton database client instance configured for Neon Postgres Cloud.
 *
 * App runtime queries use DATABASE_URL (pooled via PgBouncer with sslmode=require).
 * Migrations use DIRECT_URL (direct connection to Neon Postgres).
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

/**
 * Helper function for optimistic locking pattern.
 * Compares and increments entity version column on update.
 *
 * @param model Prisma model delegate with updateMany support
 * @param id Entity UUID
 * @param currentVersion Expected current version
 * @param data Fields to update
 * @returns Updated record count (1 if successful, 0 if version conflict occurred)
 */
export async function updateWithOptimisticLock<T extends { updateMany: Function }>(
  model: T,
  id: string,
  currentVersion: number,
  data: Record<string, any>
): Promise<number> {
  const result = await model.updateMany({
    where: {
      id,
      version: currentVersion,
    },
    data: {
      ...data,
      version: {
        increment: 1,
      },
    },
  });

  if (result.count === 0) {
    throw new Error(`Optimistic locking conflict: Record ${id} has been modified concurrently (expected version ${currentVersion}).`);
  }

  return result.count;
}
