import { Prisma } from '@prisma/client';
import { WebhookEventRepository } from './webhook-event.repository';

const input = { provider: 'FAWRY', eventType: 'PAID', payload: { a: 1 }, idempotencyKey: 'k1', signatureVerified: true };

describe('WebhookEventRepository', () => {
  const repo = new WebhookEventRepository();

  it('returns true on first delivery', async () => {
    const db = { webhookEvent: { create: jest.fn().mockResolvedValue({}) } } as any;
    expect(await repo.tryRecordFirstDelivery(db, input)).toBe(true);
    expect(db.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: 'FAWRY', event_type: 'PAID', idempotency_key: 'k1', signature_verified: true }),
    });
  });

  it('returns false on P2002 duplicate', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const db = { webhookEvent: { create: jest.fn().mockRejectedValue(err) } } as any;
    expect(await repo.tryRecordFirstDelivery(db, input)).toBe(false);
  });

  it('rethrows other errors', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2003', clientVersion: 'x' });
    await expect(repo.tryRecordFirstDelivery({ webhookEvent: { create: jest.fn().mockRejectedValue(other) } } as any, input)).rejects.toBe(other);
    const plain = new Error('boom');
    await expect(repo.tryRecordFirstDelivery({ webhookEvent: { create: jest.fn().mockRejectedValue(plain) } } as any, input)).rejects.toBe(plain);
  });
});
