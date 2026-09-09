import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { NotificationRepository } from '../infrastructure/notification.repository';

export interface MarkNotificationReadResult {
  id: string;
  status: 'READ';
}

/** File 11 Part 05.9 `PATCH /v1/notifications/{id}/read` — self-scoped; a repeat call against an already-read row is a safe no-op (File 11 Part 11), not an error. */
@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
  ) {}

  async execute(id: string, userId: string): Promise<MarkNotificationReadResult> {
    const existing = await this.notifications.findById(this.prisma, id);
    if (!existing || existing.user_id !== userId) {
      throw new NotFoundError('Notification', id);
    }

    await this.notifications.markRead(this.prisma, id, userId);
    return { id, status: 'READ' };
  }
}
