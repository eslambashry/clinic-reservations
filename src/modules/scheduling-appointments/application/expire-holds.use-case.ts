import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface ExpireHoldsResult {
  expired: number;
}

/**
 * File 12 Part 35.9 — the hold-expiry reaper's real logic, a plain
 * injectable so tests can call `execute()` directly (mirrors
 * `GenerateSlotsUseCase`/`SlotGenerationJob`, Part 33.10). Per-hold
 * transaction and failure isolation, same as Part 33.12: one stuck hold
 * doesn't block the sweep.
 */
@Injectable()
export class ExpireHoldsUseCase {
  private readonly logger = new Logger(ExpireHoldsUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentHoldRepository) private readonly holds: AppointmentHoldRepository,
    @Inject(AppointmentSlotRepository) private readonly slots: AppointmentSlotRepository,
  ) {}

  async execute(): Promise<ExpireHoldsResult> {
    const now = new Date();
    const candidates = await this.holds.findActiveExpired(this.prisma, now);

    let expired = 0;
    for (const hold of candidates) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const flipped = await this.holds.markExpired(tx, hold.id, now);
          if (flipped) {
            await this.slots.markOpen(tx, hold.slot_id);
            expired += 1;
          }
        });
      } catch (error) {
        this.logger.error(`Failed to expire hold ${hold.id}`, error instanceof Error ? error.stack : error);
      }
    }

    return { expired };
  }
}
