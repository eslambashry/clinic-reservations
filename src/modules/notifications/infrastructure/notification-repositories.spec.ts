import { NotificationRepository } from './notification.repository';
import { NotificationPreferenceRepository } from './notification-preference.repository';
import { LoggingSmsSender } from './logging-sms-sender';
import { NotificationRetryJob } from './notification-retry.job';

function makeDb(): any {
  const models: Record<string, any> = {};
  return new Proxy({}, {
    get: (_t, k: string) => {
      if (k.startsWith('$')) {
        return (models[k] ??= jest.fn().mockResolvedValue([]));
      }
      return (models[k] ??= new Proxy({}, { get: (m: any, j: string) => (m[j] ??= jest.fn().mockResolvedValue({ count: 1 })) }));
    },
  });
}

const base = { userId: 'u1', tier: 'TRANSACTIONAL' as const, channel: 'PUSH', templateCode: 'T', title: 't', body: 'b' };

describe('NotificationRepository', () => {
  const repo = new NotificationRepository();

  it('create defaults visibleInInbox to true and respects explicit false', async () => {
    const db = makeDb();
    await repo.create(db, base);
    expect(db.notification.create.mock.calls[0][0].data.visible_in_inbox).toBe(true);
    await repo.create(db, { ...base, visibleInInbox: false });
    expect(db.notification.create.mock.calls[1][0].data.visible_in_inbox).toBe(false);
  });

  it('createOnce falls back to create without sourceEventId', async () => {
    const db = makeDb();
    await repo.createOnce(db, base);
    expect(db.notification.create).toHaveBeenCalled();
    expect(db.notification.upsert).not.toHaveBeenCalled();
  });

  it('createOnce upserts idempotently with sourceEventId', async () => {
    const db = makeDb();
    await repo.createOnce(db, { ...base, sourceEventId: 'e1' });
    await repo.createOnce(db, { ...base, sourceEventId: 'e1', visibleInInbox: false });
    const arg = db.notification.upsert.mock.calls[0][0];
    expect(arg.where.source_event_id_user_id_channel).toEqual({ source_event_id: 'e1', user_id: 'u1', channel: 'PUSH' });
    expect(arg.create.visible_in_inbox).toBe(true);
    expect(db.notification.upsert.mock.calls[1][0].create.visible_in_inbox).toBe(false);
  });

  it('claimForDelivery returns the row when claimed, null otherwise', async () => {
    const db = makeDb();
    db.notification.findUnique.mockResolvedValue({ id: 'n' });
    expect(await repo.claimForDelivery(db, 'n', 3)).toEqual({ id: 'n' });
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    expect(await repo.claimForDelivery(db, 'n', 3)).toBeNull();
  });

  it.each([
    ['markSent', (d: any) => repo.markSent(d, 'n', new Date()), (d: any) => repo.markSent(d, 'n', new Date(), 2)],
    ['markFailed', (d: any) => repo.markFailed(d, 'n', new Date()), (d: any) => repo.markFailed(d, 'n', new Date(), ['t'], 2)],
    ['markUndeliverable', (d: any) => repo.markUndeliverable(d, 'n', new Date(), 3), (d: any) => repo.markUndeliverable(d, 'n', new Date(), 3)],
  ])('%s returns true on fenced success (defaults) and false when fenced out', async (_n, a, b) => {
    const db = makeDb();
    expect(await a(db)).toBe(true);
    expect(await b(db)).toBe(true);
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    expect(await a(db)).toBe(false);
  });

  it('findRetryable sweeps expired leases then queries', async () => {
    const db = makeDb();
    db.notification.findMany.mockResolvedValue([{ id: 'x' }]);
    expect(await repo.findRetryable(db, 3, 10)).toEqual([{ id: 'x' }]);
    expect(db.notification.updateMany).toHaveBeenCalled();
    expect(db.notification.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('findById and markRead', async () => {
    const db = makeDb();
    await repo.findById(db, 'n');
    expect(db.notification.findUnique).toHaveBeenCalledWith({ where: { id: 'n' } });
    expect(await repo.markRead(db, 'n', 'u')).toBe(true);
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    expect(await repo.markRead(db, 'n', 'u')).toBe(false);
  });

  it('list applies unreadOnly and cursor filters only when given', async () => {
    const db = makeDb();
    await repo.list(db, { userId: 'u', limit: 5 });
    const plain = db.notification.findMany.mock.calls[0][0].where;
    expect(plain.read_at).toBeUndefined();
    expect(plain.OR).toBeUndefined();
    await repo.list(db, { userId: 'u', limit: 5, unreadOnly: true, cursor: { createdAt: '2026-01-01T00:00:00Z', id: 'c' } });
    const full = db.notification.findMany.mock.calls[1][0].where;
    expect(full.read_at).toBeNull();
    expect(full.OR).toHaveLength(2);
  });
});

describe('NotificationPreferenceRepository', () => {
  it('lists and upserts', async () => {
    const db = makeDb();
    const repo = new NotificationPreferenceRepository();
    await repo.listForUser(db, 'u');
    expect(db.notificationPreference.findMany).toHaveBeenCalledWith({ where: { user_id: 'u' } });
    await repo.upsert(db, { userId: 'u', tier: 'TRANSACTIONAL', channel: 'PUSH', enabled: false });
    expect(db.notificationPreference.upsert.mock.calls[0][0].update).toEqual({ enabled: false });
  });
});

describe('LoggingSmsSender', () => {
  it('always reports channel unavailable', async () => {
    await expect(new LoggingSmsSender().send('1', 'm')).rejects.toThrow();
  });
});

describe('NotificationRetryJob', () => {
  it('logs only when something was retried', async () => {
    const uc = { execute: jest.fn().mockResolvedValueOnce({ retried: 2 }).mockResolvedValueOnce({ retried: 0 }) };
    const job = new NotificationRetryJob(uc as any);
    const log = jest.spyOn((job as any).logger, 'log').mockImplementation();
    await job.run();
    expect(log).toHaveBeenCalledTimes(1);
    await job.run();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
