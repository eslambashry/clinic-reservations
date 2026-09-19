import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxEvent, Prisma } from '@prisma/client';
import { OUTBOX_CONSTANTS } from '../../config/constants';
import { PrismaService } from '../../kernel/prisma/prisma.service';
import { OutboxEventHandler } from './outbox-event-handler.interface';

/**
 * File 11 Part 20's drain side. Runs only in the worker process (File 12
 * Part 06) — never instantiated in the API app, so this must not be
 * provided by the shared `AppModule`, only by `WorkerModule`.
 *
 * Claims a batch with `SELECT ... FOR UPDATE SKIP LOCKED` so multiple
 * worker instances can run concurrently without double-processing the same
 * row (the same locking primitive File 11 Part 08 calls out for the
 * appointment-hold/broadcast-accept paths, applied here to the queue
 * itself). Failed events retry up to `OUTBOX_CONSTANTS.MAX_ATTEMPTS` with
 * backoff-by-poll-interval, then move to `FAILED` (Part 20's "queryable,
 * alertable" dead-letter state) instead of retrying forever.
 */
@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly handlers = new Map<string, OutboxEventHandler>();
  private draining = false;

  // Explicit @Inject avoids a `tsx`-only metadata-reflection quirk for
  // constructor injection — see the identical note on `PrismaService`'s own
  // constructor, which this class had missed (same bug class as
  // `IdempotencyInterceptor`, found and fixed alongside this).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Called from a consuming module's `onModuleInit` — see the interface doc. */
  registerHandler(handler: OutboxEventHandler): void {
    this.handlers.set(handler.eventName, handler);

    // Anything skipped for want of this exact handler can now be delivered.
    // Without this, events that arrived before the consuming module existed
    // would stay SKIPPED forever even once it does — the handler is only ever
    // registered at boot, so this is the one moment that can recover them.
    void this.prisma.outboxEvent
      .updateMany({
        where: { event_name: handler.eventName, status: 'SKIPPED' },
        data: { status: 'PENDING' },
      })
      .then(({ count }) => {
        if (count > 0) {
          this.logger.log(`Re-queued ${count} previously skipped "${handler.eventName}" event(s) now that a handler exists.`);
        }
      })
      .catch((error: unknown) => {
        // Never fail module init over this — the events stay SKIPPED and can
        // still be re-queued by hand.
        this.logger.warn(`Could not re-queue skipped "${handler.eventName}" events: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  @Interval(OUTBOX_CONSTANTS.POLL_INTERVAL_MS)
  async drain(): Promise<void> {
    // Interval fires on a fixed schedule regardless of how long the previous
    // batch took — this guards against overlapping runs stacking up.
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      const events = await this.claimBatch();
      for (const event of events) {
        await this.processOne(event);
      }
    } finally {
      this.draining = false;
    }
  }

  private async claimBatch(): Promise<OutboxEvent[]> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "outbox_events"
        WHERE "status" = 'PENDING'
        ORDER BY "created_at" ASC
        LIMIT ${OUTBOX_CONSTANTS.BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `);

      if (claimed.length === 0) {
        return [];
      }

      const ids = claimed.map((row) => row.id);
      await tx.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: { status: 'PROCESSING' },
      });

      return tx.outboxEvent.findMany({ where: { id: { in: ids } } });
    });
  }

  private async processOne(event: OutboxEvent): Promise<void> {
    const handler = this.handlers.get(event.event_name);
    if (!handler) {
      // No consumer wired up yet for this event — expected during
      // incremental build-out (e.g. Identity emits `UserRegistered` well
      // before Notifications/Phase 8 exists to consume it).
      //
      // This must NOT go back to PENDING. `claimBatch` takes the oldest
      // `BATCH_SIZE` PENDING rows, so once that many consumer-less events
      // accumulate they refill the batch on every poll and no newer event is
      // ever claimed again — the queue stalls silently and completely.
      // Observed live: ~21 such rows had stalled the queue for a full day,
      // holding back real notifications behind them.
      //
      // SKIPPED keeps the row (nothing is lost, and it can be flipped back to
      // PENDING once a consumer exists) while taking it out of the claim set.
      // It is not a failure, so `attempts` is untouched and it never reaches
      // FAILED.
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'SKIPPED' },
      });
      // `warn`, not `debug`: a permanently unconsumed event is a wiring gap
      // someone needs to see, and the previous `debug` hid exactly the
      // condition that stalled the queue.
      this.logger.warn(
        `No handler registered for outbox event "${event.event_name}" (${event.id}) — marked SKIPPED. ` +
          `Re-queue with: UPDATE outbox_events SET status='PENDING' WHERE event_name='${event.event_name}' AND status='SKIPPED';`,
      );
      return;
    }

    try {
      await handler.handle(event.payload);

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processed_at: new Date() },
      });
    } catch (error) {
      await this.recordFailure(event, error);
    }
  }

  private async recordFailure(event: OutboxEvent, error: unknown): Promise<void> {
    const attempts = event.attempts + 1;
    const exhausted = attempts >= OUTBOX_CONSTANTS.MAX_ATTEMPTS;
    const message = error instanceof Error ? error.message : String(error);

    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        attempts,
        last_error: message,
      },
    });

    this.logger.error(
      `Outbox event ${event.id} (${event.event_name}) failed on attempt ${attempts}${exhausted ? ' — moved to FAILED' : ', will retry'}: ${message}`,
    );
  }
}
