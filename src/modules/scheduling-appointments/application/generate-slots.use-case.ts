import { Inject, Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ListSchedulableAffiliationsUseCase } from '../../provider-directory/application/list-schedulable-affiliations.use-case';
import { SCHEDULING_CONSTANTS } from '../../../shared/config/constants';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { generateSlotBoundaries, isoWeekdayOf, SlotBoundary } from '../domain/slot-generation.rules';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';
import { ScheduleTemplateRepository } from '../infrastructure/schedule-template.repository';

export interface GenerateSlotsResult {
  affiliationsProcessed: number;
  slotsCreated: number;
}

/**
 * File 11 Part 12 / File 12 Part 33.9-33.12: the slot-generation job's real
 * logic — a plain injectable so tests can call `execute()` directly without
 * waiting on the `@Cron()` wrapper (`SlotGenerationJob`, Part 33.10/33.11).
 *
 * Materializes a rolling `SCHEDULING_CONSTANTS.SLOT_GENERATION_WINDOW_DAYS`
 * window of `appointment_slots` from every currently-visible affiliation's
 * `schedule_templates` (Part 33.3's cross-module read), idempotently
 * (Part 33.8's unique index + `skipDuplicates`). One affiliation's failure
 * doesn't block the rest (Part 33.12, mirrors `OutboxWorker.processOne`).
 */
@Injectable()
export class GenerateSlotsUseCase {
  private readonly logger = new Logger(GenerateSlotsUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScheduleTemplateRepository) private readonly scheduleTemplates: ScheduleTemplateRepository,
    @Inject(AppointmentSlotRepository) private readonly appointmentSlots: AppointmentSlotRepository,
    @Inject(ListSchedulableAffiliationsUseCase) private readonly listSchedulableAffiliations: ListSchedulableAffiliationsUseCase,
  ) {}

  async execute(): Promise<GenerateSlotsResult> {
    const affiliationIds = await this.scheduleTemplates.findDistinctAffiliationIds(this.prisma);
    const schedulable = await this.listSchedulableAffiliations.execute(affiliationIds);

    const windowDates = this.rollingWindowDates();

    const counts = await Promise.all(
      schedulable.map(async ({ affiliationId, timezone }) => {
        try {
          return await this.generateForAffiliation(affiliationId, timezone, windowDates);
        } catch (error) {
          this.logger.error(`Slot generation failed for affiliation ${affiliationId}`, error instanceof Error ? error.stack : error);
          return 0;
        }
      }),
    );

    return { affiliationsProcessed: schedulable.length, slotsCreated: counts.reduce((sum, count) => sum + count, 0) };
  }

  private async generateForAffiliation(affiliationId: string, timezone: string, windowDates: string[]): Promise<number> {
    const templates = await this.scheduleTemplates.findByAffiliationId(this.prisma, affiliationId);
    if (templates.length === 0) {
      return 0;
    }

    // A day that already has any slot (OPEN, HELD, or BOOKED) at all is
    // never touched again, even if the owning template was edited since —
    // otherwise a duration/buffer change would append a second, differently
    // -timed cadence of slots alongside the ones already generated for that
    // day (different `start_at`s, so the unique index doesn't catch it),
    // producing genuinely overlapping bookable slots. The new
    // duration/buffer only ever applies to a day this job hasn't reached
    // yet.
    const windowStart = DateTime.fromISO(windowDates[0], { zone: timezone }).startOf('day').toUTC().toJSDate();
    const windowEnd = DateTime.fromISO(windowDates[windowDates.length - 1], { zone: timezone })
      .plus({ days: 1 })
      .startOf('day')
      .toUTC()
      .toJSDate();
    const existingStarts = await this.appointmentSlots.findExistingStartTimes(this.prisma, affiliationId, windowStart, windowEnd);
    const datesAlreadyGenerated = new Set(existingStarts.map((start) => DateTime.fromJSDate(start, { zone: timezone }).toISODate()));

    const candidates: SlotBoundary[] = [];
    for (const dateIso of windowDates) {
      if (datesAlreadyGenerated.has(dateIso)) {
        continue;
      }
      const weekday = isoWeekdayOf(dateIso, timezone);
      for (const template of templates.filter((t) => t.weekday === weekday)) {
        candidates.push(
          ...generateSlotBoundaries(
            {
              startTime: template.start_time,
              endTime: template.end_time,
              slotDurationMinutes: template.slot_duration_minutes,
              bufferMinutes: template.buffer_minutes,
            },
            dateIso,
            timezone,
          ),
        );
      }
    }

    return this.appointmentSlots.createMany(this.prisma, affiliationId, candidates);
  }

  /** Part 33.9: `[today, today+WINDOW_DAYS)` in UTC calendar dates. */
  private rollingWindowDates(): string[] {
    const today = DateTime.utc().startOf('day');
    return Array.from({ length: SCHEDULING_CONSTANTS.SLOT_GENERATION_WINDOW_DAYS }, (_, i) => today.plus({ days: i }).toISODate() as string);
  }
}
