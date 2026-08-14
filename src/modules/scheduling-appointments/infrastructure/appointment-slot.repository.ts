import { Injectable } from '@nestjs/common';
import { AppointmentSlot, Prisma } from '@prisma/client';

export interface NewSlot {
  startAt: Date;
  endAt: Date;
}

@Injectable()
export class AppointmentSlotRepository {
  /** Part 33.8: relies on the `(doctor_clinic_affiliation_id, start_at)` unique index for idempotent re-runs. */
  async createMany(db: Prisma.TransactionClient, affiliationId: string, slots: NewSlot[]): Promise<number> {
    if (slots.length === 0) {
      return 0;
    }

    const result = await db.appointmentSlot.createMany({
      data: slots.map((slot) => ({
        doctor_clinic_affiliation_id: affiliationId,
        start_at: slot.startAt,
        end_at: slot.endAt,
        status: 'OPEN',
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  /** File 10 §2.3: only `OPEN` slots are ever returned — `HELD`/`BOOKED` are omitted, not shown-as-disabled. Public, unauthenticated endpoint — `select` only what `GetDoctorSlotsUseCase` actually returns. */
  findOpenInRange(
    db: Prisma.TransactionClient,
    affiliationId: string,
    from: Date,
    to: Date,
  ): Promise<Pick<AppointmentSlot, 'id' | 'start_at' | 'end_at'>[]> {
    return db.appointmentSlot.findMany({
      where: {
        doctor_clinic_affiliation_id: affiliationId,
        status: 'OPEN',
        start_at: { gte: from, lt: to },
      },
      select: { id: true, start_at: true, end_at: true },
      orderBy: { start_at: 'asc' },
    });
  }
}
