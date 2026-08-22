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

  findById(db: Prisma.TransactionClient, id: string): Promise<AppointmentSlot | null> {
    return db.appointmentSlot.findUnique({ where: { id } });
  }

  /**
   * File 12 Part 35.2: the slot side of the hold race. A conditional
   * `UPDATE ... WHERE status='OPEN'` serializes concurrent holders under
   * `READ COMMITTED` row locking on its own — the partial unique index on
   * `appointment_holds` (Part 35.3) is the second, DB-documented layer, not
   * a substitute for this one. `false` means the slot was no longer `OPEN`.
   */
  async markHeld(db: Prisma.TransactionClient, id: string): Promise<boolean> {
    const result = await db.appointmentSlot.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'HELD', version: { increment: 1 } } });
    return result.count === 1;
  }

  /** File 12 Part 35.4: confirm's slot-side transition, guarded the same way. */
  async markBooked(db: Prisma.TransactionClient, id: string): Promise<boolean> {
    const result = await db.appointmentSlot.updateMany({ where: { id, status: 'HELD' }, data: { status: 'BOOKED', version: { increment: 1 } } });
    return result.count === 1;
  }

  /** File 12 Part 35.9: the hold-expiry reaper's release side. */
  async markOpen(db: Prisma.TransactionClient, id: string): Promise<boolean> {
    const result = await db.appointmentSlot.updateMany({ where: { id, status: 'HELD' }, data: { status: 'OPEN', version: { increment: 1 } } });
    return result.count === 1;
  }

  /** File 12 Part 35: cancel/reschedule's release side — a `BOOKED` slot going back to `OPEN`, distinct from `markOpen` (that one's `HELD→OPEN`, the reaper's case). */
  async releaseBooked(db: Prisma.TransactionClient, id: string): Promise<boolean> {
    const result = await db.appointmentSlot.updateMany({ where: { id, status: 'BOOKED' }, data: { status: 'OPEN', version: { increment: 1 } } });
    return result.count === 1;
  }
}
