import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface ConfirmAppointmentInput {
  paymentMethod: 'PAY_AT_CLINIC' | 'ONLINE';
  paymentIntentId?: string;
}

export interface ConfirmAppointmentResult {
  appointmentId: string;
  status: 'CONFIRMED';
}

function holdExpired(holdId: string): DomainError {
  return new DomainError(410, 'HOLD_EXPIRED', 'This hold has expired or was already used. Start a new hold.', { holdId });
}

/**
 * File 10 §2.3 `POST /v1/appointments/{holdId}/confirm` / File 12 Part 35.
 * One transaction: re-check the hold is still `ACTIVE` and unexpired while
 * converting it (Part 35.5), flip the slot `HELD→BOOKED`, create the
 * `Appointment` (Part 35.1 — this is where the row is born, not at hold
 * time), straight to `CONFIRMED` (Part 35.4 — no Payments module yet).
 */
@Injectable()
export class ConfirmAppointmentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holds: AppointmentHoldRepository,
    private readonly slots: AppointmentSlotRepository,
    private readonly appointments: AppointmentRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(holdId: string, input: ConfirmAppointmentInput, actor: AccessTokenPayload): Promise<ConfirmAppointmentResult> {
    if (input.paymentMethod === 'ONLINE') {
      throw new DomainError(422, 'PAYMENT_METHOD_NOT_SUPPORTED', 'Online payment is not yet available (File 12 Part 35.4).');
    }

    return this.prisma.$transaction(async (tx) => {
      const hold = await this.holds.findById(tx, holdId);
      if (!hold || hold.patient_id !== actor.sub) {
        throw new NotFoundError('AppointmentHold', holdId);
      }

      try {
        await this.holds.markConverted(tx, hold.id, hold.version, new Date());
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          throw holdExpired(holdId);
        }
        throw error;
      }

      const slot = await this.slots.findById(tx, hold.slot_id);
      if (!slot) {
        throw new NotFoundError('AppointmentSlot', hold.slot_id);
      }

      const slotBooked = await this.slots.markBooked(tx, slot.id);
      if (!slotBooked) {
        // Defense-in-depth: markConverted above already re-checked the hold, so this shouldn't happen absent a slot/hold desync.
        throw holdExpired(holdId);
      }

      const appointment = await this.appointments.create(tx, {
        slotId: slot.id,
        patientId: actor.sub,
        doctorClinicAffiliationId: slot.doctor_clinic_affiliation_id,
        rescheduledFromAppointmentId: hold.rescheduled_from_appointment_id ?? undefined,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment.confirm',
        resourceType: 'appointment',
        resourceId: appointment.id,
      });

      await this.outbox.emit(tx, 'AppointmentConfirmed', {
        appointmentId: appointment.id,
        slotId: slot.id,
        patientId: actor.sub,
      });

      return { appointmentId: appointment.id, status: 'CONFIRMED' as const };
    });
  }
}
