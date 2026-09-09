import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * File 11 Part 11: "insert into `webhook_events` (unique `idempotency_key`)
 * *before* any side effect runs; a unique-constraint failure means 'already
 * processed,' not an error to surface." Shared/cross-cutting infra rather
 * than owned by `payments` specifically (same reasoning as
 * `PolicyConfigReader`/`OutboxService`, File 12 Part 36.1) — any future
 * webhook-receiving module (delivery couriers, a lab results feed, ...)
 * reuses this exact table/mechanism instead of inventing its own.
 */
@Injectable()
export class WebhookEventRepository {
  /**
   * Returns `true` if this is the first time this `idempotencyKey` has been
   * seen (the caller should proceed to process the event); `false` means a
   * P2002 unique-constraint violation — an already-recorded delivery, which
   * the caller must treat as a safe no-op, never an error.
   */
  async tryRecordFirstDelivery(
    db: Prisma.TransactionClient,
    input: { provider: string; eventType: string; payload: Prisma.InputJsonValue; idempotencyKey: string; signatureVerified: boolean },
  ): Promise<boolean> {
    try {
      await db.webhookEvent.create({
        data: {
          provider: input.provider,
          event_type: input.eventType,
          payload: input.payload,
          idempotency_key: input.idempotencyKey,
          signature_verified: input.signatureVerified,
          processed_at: new Date(),
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}
