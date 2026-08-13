import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GenerateSlotsUseCase } from '../application/generate-slots.use-case';

/**
 * File 12 Part 33.10: a thin `@Cron()` wrapper around `GenerateSlotsUseCase`,
 * declared inside `scheduling-appointments` itself (Part 04's own stated
 * example: "the hold-expiry sweep lives in `scheduling-appointments`, not a
 * generic jobs dumping ground") rather than registered on `WorkerModule`
 * like `OutboxWorker`. It is instantiated in both the API and worker
 * processes (both bootstrap `AppModule`), but the `@Cron` registration only
 * actually fires in the worker process, since only `WorkerModule` imports
 * `ScheduleModule.forRoot()` — `@nestjs/schedule`'s discovery scans the
 * whole app graph regardless of which module declared the provider.
 */
@Injectable()
export class SlotGenerationJob {
  private readonly logger = new Logger(SlotGenerationJob.name);

  constructor(private readonly generateSlots: GenerateSlotsUseCase) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async run(): Promise<void> {
    const result = await this.generateSlots.execute();
    this.logger.log(`Slot generation run: ${result.affiliationsProcessed} affiliations, ${result.slotsCreated} slots created`);
  }
}
