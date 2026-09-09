import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { OutboxWorker } from '../../../shared/core/outbox/outbox.worker';
import { DispatchNotificationUseCase } from '../application/dispatch-notification.use-case';
import { NOTIFICATION_TEMPLATES } from '../domain/notification-templates';

/**
 * File 12 Part 53 / CLAUDE.md's "Events" section: "a consuming module
 * registers itself via `outboxWorker.registerHandler()` from its own
 * `onModuleInit`" — this is that registration, the first real one in the
 * codebase (every event before this shipped with zero consumers).
 *
 * `OutboxWorker` is `@Optional()` because this class lives inside the
 * shared `AppModule` graph, bootstrapped by BOTH processes — `WorkerModule`
 * (worker process) now exports it `@Global()` so it resolves here, but the
 * plain API process (`main.ts`, `AppModule` alone) never provides it at
 * all, so it resolves to `undefined` there and this simply does nothing
 * (correct: the API process must never drain the outbox itself).
 */
@Injectable()
export class NotificationOutboxRegistrar implements OnModuleInit {
  constructor(
    @Optional() @Inject(OutboxWorker) private readonly outboxWorker: OutboxWorker | undefined,
    @Inject(DispatchNotificationUseCase) private readonly dispatch: DispatchNotificationUseCase,
  ) {}

  onModuleInit(): void {
    if (!this.outboxWorker) {
      return;
    }
    for (const eventName of Object.keys(NOTIFICATION_TEMPLATES)) {
      this.outboxWorker.registerHandler({
        eventName,
        handle: (payload) => this.dispatch.executeFromEvent(eventName, payload),
      });
    }
  }
}
