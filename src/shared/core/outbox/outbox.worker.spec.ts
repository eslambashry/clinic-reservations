import { OutboxWorker } from './outbox.worker';

/**
 * Regression cover for the queue-stall bug: events with no registered handler
 * used to be put back to PENDING, so once `BATCH_SIZE` of them accumulated
 * they refilled every claim batch and no newer event was ever drained again.
 */
describe('OutboxWorker', () => {
  function setup() {
    const outboxEvent = {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = { outboxEvent } as any;
    const worker = new OutboxWorker(prisma);
    return { prisma, outboxEvent, worker };
  }

  const event = { id: 'evt-1', event_name: 'SomethingNobodyConsumes', payload: {} } as any;

  it('marks an unhandled event SKIPPED rather than returning it to the queue', async () => {
    const { outboxEvent, worker } = setup();

    await (worker as any).processOne(event);

    expect(outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'SKIPPED' },
    });
  });

  it('never puts an unhandled event back to PENDING (what stalled the queue)', async () => {
    const { outboxEvent, worker } = setup();

    await (worker as any).processOne(event);

    const wentBackToPending = outboxEvent.update.mock.calls.some(
      ([args]: [{ data?: { status?: string } }]) => args?.data?.status === 'PENDING',
    );
    expect(wentBackToPending).toBe(false);
  });

  it('does not count a missing handler as a delivery attempt', async () => {
    const { outboxEvent, worker } = setup();

    await (worker as any).processOne(event);

    const [[args]] = outboxEvent.update.mock.calls;
    expect(args.data).not.toHaveProperty('attempts');
  });

  it('re-queues previously skipped events when their handler finally registers', () => {
    const { outboxEvent, worker } = setup();

    worker.registerHandler({ eventName: 'SomethingNobodyConsumes', handle: jest.fn() });

    expect(outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { event_name: 'SomethingNobodyConsumes', status: 'SKIPPED' },
      data: { status: 'PENDING' },
    });
  });

  it('routes an event to its handler and marks it PROCESSED', async () => {
    const { outboxEvent, worker } = setup();
    const handle = jest.fn().mockResolvedValue(undefined);
    outboxEvent.updateMany.mockResolvedValue({ count: 0 });
    worker.registerHandler({ eventName: 'Consumed', handle });

    await (worker as any).processOne({ id: 'evt-2', event_name: 'Consumed', payload: { a: 1 } });

    expect(handle).toHaveBeenCalledWith({ a: 1 });
    expect(outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });
});
