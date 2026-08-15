import { Injectable } from '@nestjs/common';
import { Appointment, AppointmentStatus, Prisma } from '@prisma/client';

export interface NewAppointment {
  slotId: string;
  patientId: string;
  doctorClinicAffiliationId: string;
  /** File 12 Part 35.10/35.13: set when this confirm originated from a reschedule's hold. */
  rescheduledFromAppointmentId?: string;
}

const WITH_SLOT_TIMES = { slot: { select: { start_at: true, end_at: true } } } satisfies Prisma.AppointmentInclude;

/** File 12 Part 35.15/35.17: list/detail need the slot's timing to render — same module's own table, not a cross-module join (Part 33.3's rule). */
export type AppointmentWithSlotTimes = Prisma.AppointmentGetPayload<{ include: typeof WITH_SLOT_TIMES }>;

export interface ListAppointmentsForPatientParams {
  patientId: string;
  status?: AppointmentStatus;
  from?: Date;
  to?: Date;
  cursor?: { startAt: string; id: string };
  limit: number;
}

@Injectable()
export class AppointmentRepository {
  /** File 12 Part 35.1: created at confirm time, straight to `CONFIRMED` (Part 35.4 — no Payments module yet, `payment_intent_id` stays null). */
  create(db: Prisma.TransactionClient, input: NewAppointment): Promise<Appointment> {
    return db.appointment.create({
      data: {
        slot_id: input.slotId,
        patient_id: input.patientId,
        doctor_clinic_affiliation_id: input.doctorClinicAffiliationId,
        status: 'CONFIRMED',
        rescheduled_from_appointment_id: input.rescheduledFromAppointmentId,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Appointment | null> {
    return db.appointment.findUnique({ where: { id } });
  }

  /** File 12 Part 35.16: detail's "full detail" — the `Appointment` row plus its slot's timing. */
  findByIdWithSlotTimes(db: Prisma.TransactionClient, id: string): Promise<AppointmentWithSlotTimes | null> {
    return db.appointment.findUnique({ where: { id }, include: WITH_SLOT_TIMES });
  }

  /** File 12 Part 35.15: cursor-paginated on the slot's `(start_at, id)`, always scoped to one patient (Part 35.14). */
  listForPatient(db: Prisma.TransactionClient, params: ListAppointmentsForPatientParams): Promise<AppointmentWithSlotTimes[]> {
    return db.appointment.findMany({
      where: {
        patient_id: params.patientId,
        ...(params.status && { status: params.status }),
        slot: {
          ...(params.from && { start_at: { gte: params.from } }),
          ...(params.to && { start_at: { lt: params.to } }),
        },
        ...(params.cursor && {
          OR: [
            { slot: { start_at: { gt: new Date(params.cursor.startAt) } } },
            { slot: { start_at: new Date(params.cursor.startAt) }, id: { gt: params.cursor.id } },
          ],
        }),
      },
      include: WITH_SLOT_TIMES,
      orderBy: [{ slot: { start_at: 'asc' } }, { id: 'asc' }],
      take: params.limit,
    });
  }

  /** File 12 Part 35.8: version-guarded `CONFIRMED→CANCELLED`. `false` means the appointment was modified concurrently since the caller read its version. */
  async cancel(db: Prisma.TransactionClient, id: string, currentVersion: number, cancelledBy: string, cancelledReason: string): Promise<boolean> {
    const result = await db.appointment.updateMany({
      where: { id, version: currentVersion, status: 'CONFIRMED' },
      data: { status: 'CANCELLED', cancelled_by: cancelledBy, cancelled_reason: cancelledReason, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** File 12 Part 35.10: version-guarded `CONFIRMED→RESCHEDULED`, the old-appointment side of a reschedule. */
  async markRescheduled(db: Prisma.TransactionClient, id: string, currentVersion: number): Promise<boolean> {
    const result = await db.appointment.updateMany({
      where: { id, version: currentVersion, status: 'CONFIRMED' },
      data: { status: 'RESCHEDULED', version: { increment: 1 } },
    });
    return result.count === 1;
  }
}
