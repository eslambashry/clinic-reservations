import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * File 11 Part 20's outbox write side: `emit()` takes the caller's own
 * transaction client (the `tx` from `prisma.$transaction(async (tx) => ...)`)
 * so the event row is written in the SAME transaction as the business
 * change — never a separate post-commit call that could fail silently and
 * desync state from the notification.
 */
@Injectable()
export class OutboxService {
  async emit(tx: Prisma.TransactionClient, eventName: string, payload: Prisma.InputJsonObject): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        event_name: eventName,
        payload,
      },
    });
  }
}
