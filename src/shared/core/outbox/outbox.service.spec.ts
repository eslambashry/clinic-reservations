import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  it('writes an outbox row via the given tx', async () => {
    const tx = { outboxEvent: { create: jest.fn() } } as any;
    await new OutboxService().emit(tx, 'evt', { x: 1 });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: { event_name: 'evt', payload: { x: 1 } } });
  });
});
