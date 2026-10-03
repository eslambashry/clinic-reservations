import { Injectable } from '@nestjs/common';
import { Notification, NotificationTier, Prisma } from '@prisma/client';
import { NOTIFICATION_CONSTANTS } from '../../../shared/config/constants';

const NOTIFICATION_LEASE_MS = NOTIFICATION_CONSTANTS.DELIVERY_LEASE_MS;

export interface NewNotification {
  userId: string;
  tier: NotificationTier;
  channel: string;
  templateCode: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  sourceEventId?: string;
  visibleInInbox?: boolean;
}

export interface ListNotificationsParams {
  userId: string;
  unreadOnly?: boolean;
  cursor?: { createdAt: string; id: string };
  limit: number;
}

@Injectable()
export class NotificationRepository {
  create(db: Prisma.TransactionClient, input: NewNotification): Promise<Notification> {
    return db.notification.create({
      data: {
        user_id: input.userId,
        source_event_id: input.sourceEventId,
        visible_in_inbox: input.visibleInInbox ?? true,
        tier: input.tier,
        channel: input.channel,
        template_code: input.templateCode,
        title: input.title,
        body: input.body,
        data: input.data,
        status: 'PENDING',
      },
    });
  }

  /** Unique source event + recipient + channel is the idempotency boundary. */
  createOnce(db: Prisma.TransactionClient, input: NewNotification): Promise<Notification> {
    if (!input.sourceEventId) {
      return this.create(db, input);
    }
    return db.notification.upsert({
      where: { source_event_id_user_id_channel: { source_event_id: input.sourceEventId, user_id: input.userId, channel: input.channel } },
      create: {
        user_id: input.userId, source_event_id: input.sourceEventId, visible_in_inbox: input.visibleInInbox ?? true,
        tier: input.tier, channel: input.channel, template_code: input.templateCode,
        title: input.title, body: input.body, data: input.data, status: 'PENDING',
      },
      update: {},
    });
  }

  /**
   * Atomic claim before any external send: only one worker (dispatch or the
   * retry sweep) can move a row to PROCESSING. A lease whose worker died is
   * reclaimable after it expires; a row out of attempts never is. The
   * returned row's `lease_until` is the caller's fencing value for the
   * `mark*` writes below.
   */
  async claimForDelivery(db: Prisma.TransactionClient, id: string, maxAttempts: number): Promise<Notification | null> {
    const now = new Date();
    // A worker may have died after FCM accepted a target but before it could
    // record SENT. Its claim already consumed an attempt; once the last
    // lease expires, close the row permanently instead of stranding it in
    // PROCESSING (or handing it off forever).
    await db.notification.updateMany({
      where: { id, status: 'PROCESSING', attempts: { gte: maxAttempts }, lease_until: { lt: now } },
      data: { status: 'FAILED', lease_until: null, retry_tokens: [] },
    });
    const claimed = await db.notification.updateMany({
      where: {
        id,
        attempts: { lt: maxAttempts },
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'PROCESSING', lease_until: { lt: now } },
        ],
      },
      // Count the provider handoff attempt at claim time so a process crash
      // consumes budget just like a returned provider error.
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lease_until: new Date(now.getTime() + NOTIFICATION_LEASE_MS) },
    });
    return claimed.count === 1 ? db.notification.findUnique({ where: { id } }) : null;
  }

  /**
   * The `mark*` writes are fenced by the claim's lease: if this worker's
   * lease expired and another worker reclaimed the row, the stale worker's
   * outcome is discarded instead of overwriting the newer attempt. `false`
   * means the write was fenced out.
   */
  async markSent(db: Prisma.TransactionClient, id: string, leaseUntil: Date, acceptedDeviceCount = 0): Promise<boolean> {
    const result = await db.notification.updateMany({
      where: { id, status: 'PROCESSING', lease_until: leaseUntil },
      data: { status: 'SENT', sent_at: new Date(), lease_until: null, retry_tokens: [], accepted_device_count: { increment: acceptedDeviceCount } },
    });
    return result.count === 1;
  }

  /** Transient failure: counts one attempt and keeps only the targets worth retrying. */
  async markFailed(db: Prisma.TransactionClient, id: string, leaseUntil: Date, retryTokens: string[] = [], acceptedDeviceCount = 0): Promise<boolean> {
    const result = await db.notification.updateMany({
      where: { id, status: 'PROCESSING', lease_until: leaseUntil },
      data: { status: 'FAILED', lease_until: null, retry_tokens: retryTokens, accepted_device_count: { increment: acceptedDeviceCount } },
    });
    return result.count === 1;
  }

  /** Permanent failure (the channel cannot deliver at all): closes the row as FAILED with no attempts left, so no sweep retries it. */
  async markUndeliverable(db: Prisma.TransactionClient, id: string, leaseUntil: Date, maxAttempts: number): Promise<boolean> {
    const result = await db.notification.updateMany({
      where: { id, status: 'PROCESSING', lease_until: leaseUntil },
      data: { status: 'FAILED', attempts: maxAttempts, lease_until: null, retry_tokens: [] },
    });
    return result.count === 1;
  }

  /** `NotificationRetryJob`'s candidate query — File 11 Part 19: retried up to `maxAttempts`, then left permanently `FAILED`. */
  async findRetryable(db: Prisma.TransactionClient, maxAttempts: number, limit: number): Promise<Notification[]> {
    const now = new Date();
    await db.notification.updateMany({
      where: { status: 'PROCESSING', attempts: { gte: maxAttempts }, lease_until: { lt: now } },
      data: { status: 'FAILED', lease_until: null, retry_tokens: [] },
    });
    return db.notification.findMany({
      where: {
        attempts: { lt: maxAttempts },
        // `FAILED` is a send that was attempted and errored. `PENDING` is a
        // row `DispatchNotificationUseCase` created but deliberately did not
        // hand to the sender because quiet hours were in force — without it
        // here, a quiet-hours notification is never delivered at all, since
        // dispatch only ever runs once per event.
        OR: [
          { status: { in: ['FAILED', 'PENDING'] } },
          { status: 'PROCESSING', lease_until: { lt: now } },
        ],
      },
      orderBy: { created_at: 'asc' },
      take: limit,
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Notification | null> {
    return db.notification.findUnique({ where: { id } });
  }

  /** `false` means it wasn't this user's notification, or it was already read — either way a safe no-op from the caller's perspective (File 11 Part 11: a repeat "mark read" click is not an error). */
  async markRead(db: Prisma.TransactionClient, id: string, userId: string): Promise<boolean> {
    const result = await db.notification.updateMany({
      where: { id, user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
    return result.count === 1;
  }

  list(db: Prisma.TransactionClient, params: ListNotificationsParams): Promise<Notification[]> {
    return db.notification.findMany({
      where: {
        user_id: params.userId,
        visible_in_inbox: true,
        ...(params.unreadOnly && { read_at: null }),
        ...(params.cursor && {
          OR: [
            { created_at: { lt: new Date(params.cursor.createdAt) } },
            { created_at: new Date(params.cursor.createdAt), id: { lt: params.cursor.id } },
          ],
        }),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: params.limit,
    });
  }
}
