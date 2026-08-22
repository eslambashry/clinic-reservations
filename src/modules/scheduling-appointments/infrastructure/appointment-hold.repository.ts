import { Injectable } from '@nestjs/common';
import { AppointmentHold, Prisma } from '@prisma/client';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewHold {
  slotId: string;
  patientId: string;
  expiresAt: Date;
  /** File 12 Part 35.13: set when this hold was created by `POST .../reschedule`, so confirm can propagate it onto the new `Appointment`. */
  rescheduledFromAppointmentId?: string;
}

@Injectable()
export class AppointmentHoldRepository {
  create(db: Prisma.TransactionClient, input: NewHold): Promise<AppointmentHold> {
    return db.appointmentHold.create({
      data: {
        slot_id: input.slotId,
        patient_id: input.patientId,
        expires_at: input.expiresAt,
        rescheduled_from_appointment_id: input.rescheduledFromAppointmentId,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<AppointmentHold | null> {
    return db.appointmentHold.findUnique({ where: { id } });
  }

  /**
   * File 12 Part 35.5 / File 10 §3.5.3: re-checks `ACTIVE` + not expired
   * inside the same conditional update that converts the hold — closes the
   * hold-expiry-vs-confirm race without a raw `SELECT ... FOR UPDATE`. A
   * 0-row result means the hold was already expired or already converted by
   * a concurrent confirm; both are the caller's `HOLD_EXPIRED` case.
   */
  async markConverted(db: Prisma.TransactionClient, id: string, currentVersion: number, now: Date): Promise<void> {
    const result = await db.appointmentHold.updateMany({
      where: { id, version: currentVersion, status: 'ACTIVE', expires_at: { gt: now } },
      data: { status: 'CONVERTED', version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new OptimisticLockError(id, currentVersion);
    }
  }

  /** File 12 Part 35.9: candidate discovery for the hold-expiry reaper — a plain read, the actual state change is per-item in `markExpired`. */
  findActiveExpired(db: Prisma.TransactionClient, now: Date): Promise<AppointmentHold[]> {
    return db.appointmentHold.findMany({ where: { status: 'ACTIVE', expires_at: { lte: now } } });
  }

  /** File 12 Part 35.9: per-hold conditional expire — `false` means it was already converted/expired by something else since `findActiveExpired` ran (mirrors Part 33.12's per-item isolation, not an error). */
  async markExpired(db: Prisma.TransactionClient, id: string, now: Date): Promise<boolean> {
    const result = await db.appointmentHold.updateMany({ where: { id, status: 'ACTIVE', expires_at: { lte: now } }, data: { status: 'EXPIRED' } });
    return result.count === 1;
  }
}
