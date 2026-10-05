import { Inject, Injectable } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { NotificationRepository } from '../infrastructure/notification.repository';

interface NotificationCursor {
  c: string;
  i: string;
}

export interface ListNotificationsInput {
  userId: string;
  unreadOnly?: boolean;
  cursor?: string;
  limit: number;
}

export interface ListNotificationsResult {
  notifications: Omit<Notification, 'source_event_id' | 'visible_in_inbox' | 'lease_until' | 'retry_tokens' | 'accepted_device_count'>[];
  nextCursor: string | null;
}

/** File 11 Part 05.9 `GET /v1/notifications` — cursor-paginated, self-scoped, `?unreadOnly=true` filter. */
@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
  ) {}

  async execute(input: ListNotificationsInput): Promise<ListNotificationsResult> {
    const cursor = decodeCursor<NotificationCursor>(input.cursor);
    const rows = await this.notifications.list(this.prisma, {
      userId: input.userId,
      unreadOnly: input.unreadOnly,
      cursor: cursor ? { createdAt: cursor.c, id: cursor.i } : undefined,
      limit: input.limit,
    });

    const last = rows.at(-1);
    return {
      notifications: rows.map(({ source_event_id: _source_event_id, visible_in_inbox: _visible_in_inbox, lease_until: _lease_until, retry_tokens: _retry_tokens, accepted_device_count: _accepted_device_count, ...publicRow }) => publicRow),
      nextCursor: rows.length === input.limit && last ? encodeCursor<NotificationCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
    };
  }
}
