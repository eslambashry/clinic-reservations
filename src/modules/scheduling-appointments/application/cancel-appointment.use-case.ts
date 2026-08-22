import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { ProcessCancellationRefundUseCase } from '../../payments/application/process-cancellation-refund.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { DomainError, BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { REGION_CONSTANTS } from '../../../shared/config/constants';
import { PolicyConfigReader } from '../../../shared/kernel/policy-config/policy-config.reader';
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
 * 35.7-35.8/36: patient-only in this increment (clinic-staff cancel
 * deferred, Part 35.8). Only a `CONFIRMED` appointment is cancellable.
 * `feeApplied`/`refundAmount` are now computed for real (Part 36) from the
 * flat `CANCELLATION_TIER` policy against the appointment's captured
 * payment — provider-initiated cancellations always waive the fee entirely
 * (File 11 line 475). Appointments with no `payment_intent_id` (pre-Phase-5
 * rows, or any future path that legitimately produces one) fall through to
 * `0`/`0` rather than erroring.
 */
@Injectable()
export class CancelAppointmentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(AppointmentSlotRepository) private readonly slots: AppointmentSlotRepository,
    @Inject(PolicyConfigReader) private readonly policyConfig: PolicyConfigReader,
    @Inject(ProcessCancellationRefundUseCase) private readonly refund: ProcessCancellationRefundUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(appointmentId: string, input: CancelAppointmentInput, actor: AccessTokenPayload): Promise<CancelAppointmentResult> {
    // Explicit timeout (Prisma's default is 5000ms) — same reasoning as
    // ConfirmAppointmentUseCase: this transaction now also runs the refund
    // use-case's several sequential writes when a payment was captured.
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

      let refundAmount = 0;
      let feeApplied = 0;
      if (appointment.payment_intent_id) {
        // Provider-initiated cancellation is always a full refund, no fee
        // tier applies (File 11 line 475) — bypasses the CANCELLATION_TIER
        // read entirely rather than reading then overriding it.
        const feePercent = input.reason === 'PROVIDER_REQUEST' ? 0 : await this.readCancellationFeePercent(tx);
        const result = await this.refund.execute(tx, { paymentIntentId: appointment.payment_intent_id, feePercent });
        refundAmount = Number(result.refundAmount);
        feeApplied = Number(result.feeApplied);
      }

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

      return { status: 'CANCELLED' as const, refundAmount, feeApplied };
    }, { timeout: 15000 });
  }

  private async readCancellationFeePercent(tx: Prisma.TransactionClient): Promise<number> {
    const value = await this.policyConfig.getValue<{ feePercent: number }>(
      tx,
      REGION_CONSTANTS.DEFAULT_REGION_CODE,
      'CANCELLATION_TIER',
    );
    if (value === null) {
      throw new DomainError(500, 'CANCELLATION_TIER_NOT_CONFIGURED', 'No CANCELLATION_TIER policy_config is set for this region.');
    }
    return value.feePercent;
  }
}
