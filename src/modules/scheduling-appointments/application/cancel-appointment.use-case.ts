import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface CancelAppointmentInput {
  reason: 'PATIENT_REQUEST' | 'PROVIDER_REQUEST' | 'OTHER';
  note?: string;
}

export interface CancelAppointmentResult {
  status: 'CANCELLED';
  refundAmount: number;
  feeApplied: number;
}

/**
 * File 10 §2.3 `POST /v1/appointments/{appointmentId}/cancel` / File 12 Part
 * 35.7-35.8: patient-only in this increment (clinic-staff cancel deferred,
 * Part 35.8). Only a `CONFIRMED` appointment is cancellable; `feeApplied`
 * and `refundAmount` are always `0` — Part 35.7 explains why a real fee
 * amount isn't computed yet (no tiered policy values, no cross-module
 * consult-fee read, nothing captured to refund).
 */
@Injectable()
export class CancelAppointmentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(AppointmentSlotRepository) private readonly slots: AppointmentSlotRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(appointmentId: string, input: CancelAppointmentInput, actor: AccessTokenPayload): Promise<CancelAppointmentResult> {
    return this.prisma.$transaction(async (tx) => {
      const appointment = await this.appointments.findById(tx, appointmentId);
      if (!appointment || appointment.patient_id !== actor.sub) {
        throw new NotFoundError('Appointment', appointmentId);
      }
      if (appointment.status !== 'CONFIRMED') {
        throw new BusinessRuleError('APPOINTMENT_NOT_CANCELLABLE', 'Only a confirmed appointment can be cancelled.', {
          status: appointment.status,
        });
      }

      const cancelledReason = input.note ? `${input.reason}: ${input.note}` : input.reason;
      const cancelled = await this.appointments.cancel(tx, appointment.id, appointment.version, actor.sub, cancelledReason);
      if (!cancelled) {
        throw new ConflictError('APPOINTMENT_STATE_CHANGED', 'This appointment was modified concurrently. Reload and try again.', { appointmentId });
      }

      await this.slots.releaseBooked(tx, appointment.slot_id);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment.cancel',
        resourceType: 'appointment',
        resourceId: appointment.id,
        reasonCode: input.reason,
      });

      await this.outbox.emit(tx, 'AppointmentCancelled', {
        appointmentId: appointment.id,
        slotId: appointment.slot_id,
        patientId: actor.sub,
        reason: input.reason,
      });

      return { status: 'CANCELLED' as const, refundAmount: 0, feeApplied: 0 };
    });
  }
}
