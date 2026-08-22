import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';

/**
 * Provides only the write side (`OutboxService.emit()`), imported by the
 * shared `AppModule` so every domain module can emit events from within its
 * own transaction. `OutboxWorker` (the drain loop) is deliberately NOT
 * provided here — see `WorkerModule` (File 12 Part 06: worker-only crons).
 */
@Global()
@Module({
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
