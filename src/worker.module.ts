import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppModule } from './app.module';
import { OutboxWorker } from './shared/core/outbox/outbox.worker';

/**
 * Worker-only wrapper around the shared `AppModule` (File 12 Part 06).
 * `ScheduleModule`/`OutboxWorker` (and future `@Cron` sweep jobs — hold
 * expiry, no-show, prescription-upload cleanup, settlement batch, File 11
 * Part 27) live here specifically so the API process never instantiates
 * them — one codebase, but only one process actually runs the crons.
 *
 * `@Global()` + `exports: [OutboxWorker]` (File 12 Part 53): `WorkerModule`
 * imports `AppModule` (not the reverse), so without this a feature module
 * nested inside `AppModule` — e.g. `notifications`' own `onModuleInit` —
 * would have no DI path to `OutboxWorker` to call `registerHandler()` on,
 * even though it's the exact mechanism CLAUDE.md's own "Events" section
 * describes. `@Global()` makes it reachable from anywhere in this specific
 * bootstrapped tree regardless of import direction, without changing who
 * provides/owns it (still worker-process-only — the API process never
 * bootstraps `WorkerModule`, so `OutboxWorker` is simply absent there;
 * feature modules must inject it with `@Optional()` and no-op if it's
 * `undefined`, exactly like `notifications`' registrar does).
 */
@Global()
@Module({
  imports: [AppModule, ScheduleModule.forRoot()],
  providers: [OutboxWorker],
  exports: [OutboxWorker],
})
export class WorkerModule {}
