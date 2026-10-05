import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigModule } from '../../../shared/config/config.module';
import { OUTBOX_CONSTANTS } from '../../../shared/config/constants';
import { OutboxWorker } from '../../../shared/core/outbox/outbox.worker';
import { PrismaModule } from '../../../shared/kernel/prisma/prisma.module';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { NotificationRepository } from './notification.repository';

dotenv.config();

/** Run only against a disposable Postgres URL: verifies DB-enforced delivery invariants. */
describe('Notification delivery reliability (integration, real Postgres)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let notifications: NotificationRepository;
  const userIds: string[] = [];
  const eventIds: string[] = [];

  async function newUser(): Promise<string> {
    const user = await prisma.user.create({ data: { phone: `+2013${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}` } });
    userIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
      providers: [NotificationRepository],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    notifications = moduleRef.get(NotificationRepository);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.outboxEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await moduleRef.close();
  });

  it('deduplicates the same event/channel and exposes one inbox card across PUSH and SMS', async () => {
    const userId = await newUser();
    const sourceEventId = randomUUID();
    const common = { userId, sourceEventId, tier: 'TRANSACTIONAL' as const, templateCode: 'AppointmentConfirmed', title: 'موعد', body: 'تأكيد' };
    const first = await notifications.createOnce(prisma, { ...common, channel: 'PUSH', visibleInInbox: true });
    const replay = await notifications.createOnce(prisma, { ...common, channel: 'PUSH', visibleInInbox: true });
    const sms = await notifications.createOnce(prisma, { ...common, channel: 'SMS', visibleInInbox: false });

    expect(replay.id).toBe(first.id);
    expect(sms.id).not.toBe(first.id);
    expect(await prisma.notification.count({ where: { user_id: userId, source_event_id: sourceEventId } })).toBe(2);
    expect((await notifications.list(prisma, { userId, limit: 20 })).map((row) => row.id)).toEqual([first.id]);
  });

  it('allows one live claim, fences stale outcomes, and reclaims an expired delivery lease', async () => {
    const userId = await newUser();
    const row = await notifications.create(prisma, {
      userId, tier: 'TRANSACTIONAL', channel: 'PUSH', templateCode: 'AppointmentConfirmed', title: 'موعد', body: 'تأكيد',
    });
    const [a, b] = await Promise.all([
      notifications.claimForDelivery(prisma, row.id, 5),
      notifications.claimForDelivery(prisma, row.id, 5),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const firstLease = (a ?? b)!.lease_until!;
    await prisma.notification.update({ where: { id: row.id }, data: { lease_until: new Date(Date.now() - 1000) } });
    const reclaimed = await notifications.claimForDelivery(prisma, row.id, 5);
    expect(reclaimed?.lease_until).toBeTruthy();
    expect(await notifications.markSent(prisma, row.id, firstLease, 1)).toBe(false);
    expect(await notifications.markSent(prisma, row.id, reclaimed!.lease_until!, 1)).toBe(true);
    expect(await prisma.notification.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'SENT', accepted_device_count: 1, attempts: 2 });
  });

  it('closes an expired final claim after a worker crashes, including after a possible provider handoff', async () => {
    const userId = await newUser();
    const row = await notifications.create(prisma, {
      userId, tier: 'TRANSACTIONAL', channel: 'PUSH', templateCode: 'AppointmentConfirmed', title: 'موعد', body: 'تأكيد',
    });
    await prisma.notification.update({ where: { id: row.id }, data: { attempts: 4 } });

    const lastClaim = await notifications.claimForDelivery(prisma, row.id, 5);
    expect(lastClaim).toMatchObject({ status: 'PROCESSING', attempts: 5 });
    await prisma.notification.update({ where: { id: row.id }, data: { lease_until: new Date(Date.now() - 1000) } });

    // Retry sweep reaps exhausted expired leases, including the ambiguous
    // at-least-once window where FCM may have accepted before the crash.
    const retryable = await notifications.findRetryable(prisma, 5, 50);
    expect(retryable.some((candidate) => candidate.id === row.id)).toBe(false);
    expect(await prisma.notification.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'FAILED', attempts: 5, lease_until: null });
    expect(await notifications.claimForDelivery(prisma, row.id, 5)).toBeNull();
  });

  it('recovers a crashed outbox worker without letting its stale result overwrite the new outcome', async () => {
    const id = randomUUID();
    eventIds.push(id);
    const eventName = `NotificationReliability${id}`;
    await prisma.outboxEvent.create({
      data: { id, event_name: eventName, payload: { ok: true }, status: 'PROCESSING' },
    });
    await prisma.$executeRaw`
      UPDATE outbox_events
      SET updated_at = NOW() - make_interval(mins => ${OUTBOX_CONSTANTS.STALE_PROCESSING_MINUTES + 1}::int)
      WHERE id = ${id}::uuid`;

    const worker = new OutboxWorker(prisma);
    const handled = jest.fn().mockResolvedValue(undefined);
    worker.registerHandler({ eventName, handle: handled });
    // `drain()` claims the oldest BATCH_SIZE rows of the whole table, so rows
    // other suites left PENDING can fill the first batches (each is SKIPPED
    // for want of a handler and leaves the claim set). Keep draining until
    // this event has been claimed instead of depending on suite order.
    for (let i = 0; i < 50 && handled.mock.calls.length === 0; i += 1) {
      await worker.drain();
    }

    expect(handled).toHaveBeenCalledTimes(1);
    expect(await prisma.outboxEvent.findUnique({ where: { id } })).toMatchObject({ status: 'PROCESSED', attempts: 1 });
  });

  it('marks a stale outbox claim FAILED once its final worker attempt expired', async () => {
    const id = randomUUID();
    eventIds.push(id);
    const eventName = `NotificationReliabilityFinal${id}`;
    await prisma.outboxEvent.create({
      data: { id, event_name: eventName, payload: { ok: true }, status: 'PROCESSING', attempts: OUTBOX_CONSTANTS.MAX_ATTEMPTS },
    });
    await prisma.$executeRaw`
      UPDATE outbox_events
      SET updated_at = NOW() - make_interval(mins => ${OUTBOX_CONSTANTS.STALE_PROCESSING_MINUTES + 1}::int)
      WHERE id = ${id}::uuid`;

    const worker = new OutboxWorker(prisma);
    const handled = jest.fn().mockResolvedValue(undefined);
    worker.registerHandler({ eventName, handle: handled });
    await worker.drain();

    expect(handled).not.toHaveBeenCalled();
    expect(await prisma.outboxEvent.findUnique({ where: { id } })).toMatchObject({ status: 'FAILED', attempts: OUTBOX_CONSTANTS.MAX_ATTEMPTS });
  });
});
