import { Injectable } from '@nestjs/common';
import { Notification, NotificationTier, Prisma } from '@prisma/client';

export interface NewNotification {
  userId: string;
  tier: NotificationTier;
  channel: string;
  templateCode: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
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

  markSent(db: Prisma.TransactionClient, id: string): Promise<Notification> {
    return db.notification.update({ where: { id }, data: { status: 'SENT', sent_at: new Date() } });
  }

  markFailed(db: Prisma.TransactionClient, id: string): Promise<Notification> {
    return db.notification.update({ where: { id }, data: { status: 'FAILED', attempts: { increment: 1 } } });
  }

  /** `NotificationRetryJob`'s candidate query — File 11 Part 19: retried up to `maxAttempts`, then left permanently `FAILED`. */
  findRetryable(db: Prisma.TransactionClient, maxAttempts: number, limit: number): Promise<Notification[]> {
    return db.notification.findMany({
      where: { status: 'FAILED', attempts: { lt: maxAttempts } },
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
