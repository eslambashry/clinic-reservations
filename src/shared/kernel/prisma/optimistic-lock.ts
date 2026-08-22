/**
 * Optimistic-locking update helper (File 11 Part 08: `version integer` on
 * every stateful table; Part 11: this is the mechanism behind the pharmacy
 * first-accept-wins path and any other concurrent-write-safe update).
 *
 * A 0-row match means another writer already moved the row past the
 * version this caller read — that's a real conflict, not a no-op, so it
 * throws `OptimisticLockError` instead of silently returning 0.
 *
 * Single implementation shared by the standalone `src/db/seed.ts` script and
 * every Nest-DI repository (via `PrismaService`) — File 12 Part 12 forbids
 * two copies of the same logic.
 */
export async function updateWithOptimisticLock<
  T extends { updateMany: (...args: any[]) => Promise<{ count: number }> },
>(model: T, id: string, currentVersion: number, data: Record<string, unknown>): Promise<number> {
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
    throw new OptimisticLockError(id, currentVersion);
  }

  return result.count;
}

export class OptimisticLockError extends Error {
  constructor(
    public readonly entityId: string,
    public readonly expectedVersion: number,
  ) {
    super(
      `Optimistic locking conflict: record ${entityId} has been modified concurrently (expected version ${expectedVersion}).`,
    );
    this.name = 'OptimisticLockError';
  }
}
