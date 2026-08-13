import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppModule } from './app.module';
import { OutboxWorker } from './shared/core/outbox/outbox.worker';

/**
 * Worker-only wrapper around the shared `AppModule` (File 12 Part 06).
 * `ScheduleModule`/`OutboxWorker` (and future `@Cron` sweep jobs — hold
 * expiry, no-show, prescription-upload cleanup, settlement batch, File 11
 * Part 27) live here specifically so the API process never instantiates
 * them — one codebase, but only one process actually runs the crons.
 */
@Module({
  imports: [AppModule, ScheduleModule.forRoot()],
  providers: [OutboxWorker],
})
export class WorkerModule {}
