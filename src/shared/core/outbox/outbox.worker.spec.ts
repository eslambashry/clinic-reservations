import { OUTBOX_CONSTANTS } from '../../config/constants';
import { OutboxWorker } from './outbox.worker';

/**
 * Regression cover for the outbox drain side:
 * - the queue-stall bug (events with no handler used to go back to PENDING
 *   and refill every claim batch forever);
 * - fenced outcome writes (every write after the claim is an `updateMany`
 *   conditioned on `status='PROCESSING'` AND the claim's `updated_at`, so a
 *   slow worker whose lease was reclaimed cannot overwrite the reclaimer);
 * - claim-time attempt accounting bounded by `MAX_ATTEMPTS`.
 */
describe('OutboxWorker', () => {
  const claimedAt = new Date('2026-10-03T10:00:00.000Z');

  function setup() {
    const outboxEvent = {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
    };
    const tx = { outboxEvent, $queryRaw: jest.fn() };
    const prisma = {
      outboxEvent,
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    } as any;
    const worker = new OutboxWorker(prisma);
    return { prisma, tx, outboxEvent, worker };
  }

  function claimed(overrides: Record<string, unknown> = {}) {
    return {
      id: 'evt-1',
      event_name: 'SomethingNobodyConsumes',
      payload: {},
      status: 'PROCESSING',
      attempts: 1,
      updated_at: claimedAt,
      ...overrides,
    } as any;
  }

  const fence = (id: string) => ({ id, status: 'PROCESSING', updated_at: claimedAt });

  describe('missing handler', () => {
    it('marks the event SKIPPED with a write fenced on the claim', async () => {
      const { outboxEvent, worker } = setup();

      await (worker as any).processOne(claimed());

      expect(outboxEvent.updateMany).toHaveBeenCalledWith({
        where: fence('evt-1'),
        data: { status: 'SKIPPED', attempts: { decrement: 1 } },
      });
    });

    it('never puts an unhandled event back to PENDING (what stalled the queue)', async () => {
      const { outboxEvent, worker } = setup();

      await (worker as any).processOne(claimed());

      const writes = [...outboxEvent.update.mock.calls, ...outboxEvent.updateMany.mock.calls];
      expect(writes.some(([args]) => args?.data?.status === 'PENDING')).toBe(false);
    });

    it('refunds the attempt the claim consumed, so SKIPPED never burns retry budget', async () => {
      const { outboxEvent, worker } = setup();

      await (worker as any).processOne(claimed({ attempts: 3 }));

      const [[args]] = outboxEvent.updateMany.mock.calls;
      expect(args.data.attempts).toEqual({ decrement: 1 });
    });

    it('re-queues previously skipped events when their handler finally registers', () => {
      const { outboxEvent, worker } = setup();

      worker.registerHandler({ eventName: 'SomethingNobodyConsumes', handle: jest.fn() });

      expect(outboxEvent.updateMany).toHaveBeenCalledWith({
        where: { event_name: 'SomethingNobodyConsumes', status: 'SKIPPED' },
        data: { status: 'PENDING' },
      });
    });

    it('does not fail handler registration when the re-queue write fails', async () => {
      const { outboxEvent, worker } = setup();
      outboxEvent.updateMany.mockRejectedValueOnce(new Error('db down'));

      expect(() => worker.registerHandler({ eventName: 'X', handle: jest.fn() })).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe('handled event', () => {
    it('passes the payload and the event id (consumers dedupe on it) and marks PROCESSED', async () => {
      const { outboxEvent, worker } = setup();
      const handle = jest.fn().mockResolvedValue(undefined);
      worker.registerHandler({ eventName: 'Consumed', handle });
      outboxEvent.updateMany.mockClear();

      await (worker as any).processOne(claimed({ id: 'evt-2', event_name: 'Consumed', payload: { a: 1 } }));

      expect(handle).toHaveBeenCalledWith({ a: 1 }, 'evt-2');
      expect(outboxEvent.updateMany).toHaveBeenCalledWith({
        where: fence('evt-2'),
        data: { status: 'PROCESSED', processed_at: expect.any(Date) },
      });
      expect(outboxEvent.update).not.toHaveBeenCalled();
    });

    it('returns a failed event to PENDING without re-counting the attempt the claim already took', async () => {
      const { outboxEvent, worker } = setup();
      worker.registerHandler({ eventName: 'Flaky', handle: jest.fn().mockRejectedValue(new Error('smtp timeout')) });
      outboxEvent.updateMany.mockClear();

      await (worker as any).processOne(claimed({ event_name: 'Flaky', attempts: 2 }));

      expect(outboxEvent.updateMany).toHaveBeenCalledWith({
        where: fence('evt-1'),
        data: { status: 'PENDING', attempts: 2, last_error: 'smtp timeout' },
      });
    });

    it('moves the event to FAILED once the claim reaches MAX_ATTEMPTS', async () => {
      const { outboxEvent, worker } = setup();
      worker.registerHandler({ eventName: 'Broken', handle: jest.fn().mockRejectedValue('boom') });
      outboxEvent.updateMany.mockClear();

      await (worker as any).processOne(claimed({ event_name: 'Broken', attempts: OUTBOX_CONSTANTS.MAX_ATTEMPTS }));

      expect(outboxEvent.updateMany).toHaveBeenCalledWith({
        where: fence('evt-1'),
        data: { status: 'FAILED', attempts: OUTBOX_CONSTANTS.MAX_ATTEMPTS, last_error: 'boom' },
      });
    });

    it('a stale worker whose lease was reclaimed changes nothing (fenced write matches 0 rows)', async () => {
      const { outboxEvent, worker } = setup();
      worker.registerHandler({ eventName: 'Slow', handle: jest.fn().mockResolvedValue(undefined) });
      outboxEvent.updateMany.mockClear();
      outboxEvent.updateMany.mockResolvedValue({ count: 0 });

      await expect((worker as any).processOne(claimed({ event_name: 'Slow' }))).resolves.toBeUndefined();

      const [[args]] = outboxEvent.updateMany.mock.calls;
      expect(args.where).toEqual(fence('evt-1'));
      expect(outboxEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('claimBatch', () => {
    it('dead-letters exhausted rows, then claims with an attempt increment and returns the claimed rows', async () => {
      const { tx, outboxEvent, worker } = setup();
      tx.$queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      outboxEvent.findMany.mockResolvedValue([claimed({ id: 'a' }), claimed({ id: 'b' })]);

      const rows = await (worker as any).claimBatch();

      const [[deadLetter], [claim]] = outboxEvent.updateMany.mock.calls;
      expect(deadLetter.where.attempts).toEqual({ gte: OUTBOX_CONSTANTS.MAX_ATTEMPTS });
      expect(deadLetter.data.status).toBe('FAILED');
      expect(claim).toEqual({
        where: { id: { in: ['a', 'b'] } },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      expect(rows.map((r: { id: string }) => r.id)).toEqual(['a', 'b']);
    });

    it('claims nothing and writes no PROCESSING rows when the queue is empty', async () => {
      const { tx, outboxEvent, worker } = setup();
      tx.$queryRaw.mockResolvedValue([]);

      await expect((worker as any).claimBatch()).resolves.toEqual([]);
      expect(outboxEvent.updateMany).toHaveBeenCalledTimes(1);
      expect(outboxEvent.findMany).not.toHaveBeenCalled();
    });
  });

  it('drain() does not overlap with a run that is still in progress', async () => {
    const { prisma, worker } = setup();
    let release!: (rows: unknown[]) => void;
    prisma.$transaction.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const first = worker.drain();
    await worker.drain();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    release([]);
    await first;
  });
});
