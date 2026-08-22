import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ResolveAffiliationForSchedulingUseCase } from '../../provider-directory/application/resolve-affiliation-for-scheduling.use-case';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface DoctorSlotView {
  slotId: string;
  startAt: string;
  endAt: string;
  status: 'OPEN';
}

export interface GetDoctorSlotsResult {
  slots: DoctorSlotView[];
}

/**
 * File 10 §2.3: `GET /v1/doctors/{doctorId}/slots`. Resolves the
 * `doctorId`+`clinicBranchId` pair through `provider-directory`'s exported
 * use-case (Part 33.3 — the visibility 404 happens there, not here), then
 * returns only `OPEN` slots in the requested UTC range.
 */
@Injectable()
export class GetDoctorSlotsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentSlotRepository) private readonly appointmentSlots: AppointmentSlotRepository,
    @Inject(ResolveAffiliationForSchedulingUseCase) private readonly resolveAffiliation: ResolveAffiliationForSchedulingUseCase,
  ) {}

  async execute(
    doctorId: string,
    clinicBranchId: string,
    from: string | undefined,
    to: string | undefined,
    callerContextType: string | undefined,
  ): Promise<GetDoctorSlotsResult> {
    const { affiliationId } = await this.resolveAffiliation.execute(doctorId, clinicBranchId, callerContextType);
    const { fromDate, toDate } = this.resolveDateRange(from, to);

    const slots = await this.appointmentSlots.findOpenInRange(this.prisma, affiliationId, fromDate, toDate);

    return {
      slots: slots.map((slot) => ({
        slotId: slot.id,
        startAt: slot.start_at.toISOString(),
        endAt: slot.end_at.toISOString(),
        status: 'OPEN',
      })),
    };
  }

  /** File 12 Part 33.16: optional `from`/`to`, default `[today, today+14days)`, capped at a 14-day span (File 10 §2.3). */
  private resolveDateRange(from: string | undefined, to: string | undefined): { fromDate: Date; toDate: Date } {
    const fromDt = from ? DateTime.fromISO(from, { zone: 'utc' }) : DateTime.utc().startOf('day');
    if (!fromDt.isValid) {
      throw new DomainError(400, 'INVALID_DATE_RANGE', 'from is not a valid ISO date.');
    }

    const toDt = to ? DateTime.fromISO(to, { zone: 'utc' }) : fromDt.plus({ days: 14 });
    if (!toDt.isValid) {
      throw new DomainError(400, 'INVALID_DATE_RANGE', 'to is not a valid ISO date.');
    }

    if (toDt <= fromDt) {
      throw new DomainError(400, 'INVALID_DATE_RANGE', 'to must be after from.');
    }
    if (toDt.diff(fromDt, 'days').days > 14) {
      throw new DomainError(400, 'INVALID_DATE_RANGE', 'The date range cannot exceed 14 days (File 10 §2.3).');
    }

    return { fromDate: fromDt.toJSDate(), toDate: toDt.toJSDate() };
  }
}
