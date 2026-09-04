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

  /**
   * File 12 Part 33.16: optional `from`/`to`, default `[now, now+14days)`,
   * capped at a 14-day span (File 10 §2.3). The default lower bound is
   * `now`, not "start of today" (UTC or otherwise): the previous behavior —
   * UTC midnight — meant a branch ahead of UTC (e.g. Africa/Cairo, UTC+2)
   * had "today" start a couple of hours into what was already yesterday in
   * its own local time, and even branch-local midnight would still admit
   * *this morning's* already-elapsed slots once enough of today had
   * passed. Since nothing sweeps/expires an `OPEN` slot once its time is
   * up, either version let already-past, never-booked slots keep matching
   * the range and appear to the patient as still bookable "today." `now`
   * has no such gap and needs no timezone lookup to get right.
   */
  private resolveDateRange(from: string | undefined, to: string | undefined): { fromDate: Date; toDate: Date } {
    const now = DateTime.utc();
    const fromDt = from ? DateTime.fromISO(from, { zone: 'utc' }) : now;
    if (!fromDt.isValid) {
      throw new DomainError(400, 'INVALID_DATE_RANGE', 'تاريخ البداية غير صحيح.');
    }

    const toDt = to ? DateTime.fromISO(to, { zone: 'utc' }) : fromDt.plus({ days: 14 });
    if (!toDt.isValid) {
      throw new DomainError(400, 'INVALID_DATE_RANGE', 'تاريخ النهاية غير صحيح.');
    }

    if (toDt <= fromDt) {
      throw new DomainError(400, 'INVALID_DATE_RANGE', 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية.');
    }
    if (toDt.diff(fromDt, 'days').days > 14) {
      throw new DomainError(400, 'INVALID_DATE_RANGE', 'النطاق الزمني لا يمكن أن يتجاوز 14 يومًا.');
    }

    return { fromDate: fromDt.toJSDate(), toDate: toDt.toJSDate() };
  }
}
