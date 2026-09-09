import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GenerateSlotsUseCase } from '../modules/scheduling-appointments/application/generate-slots.use-case';

/**
 * Dev-only manual trigger for `GenerateSlotsUseCase` — normally only runs
 * via `SlotGenerationJob`'s `@Cron(EVERY_DAY_AT_1AM)` in the worker process
 * (File 12 Part 33.10), so a freshly-seeded DB has `schedule_templates` but
 * zero `appointment_slots` until that cron actually fires. This boots the
 * same Nest DI graph the cron uses and calls it once, immediately, so local
 * testing doesn't have to wait for 1am.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(GenerateSlotsUseCase).execute();
    console.log(`✅ Slot generation: ${result.affiliationsProcessed} affiliation(s) processed, ${result.slotsCreated} slot(s) created`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('❌ Slot generation failed:', error);
  process.exit(1);
});
