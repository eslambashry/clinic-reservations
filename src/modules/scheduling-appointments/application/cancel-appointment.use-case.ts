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
import { isAppointmentInScope, ResolveAppointmentScopeUseCase } from './resolve-appointment-scope.use-case';
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
 * File 10 §2.3 `POST /v1/appointments/{appointmentId}/cancel` (patient) and
 * `POST /v1/doctors/me/appointments/{appointmentId}/cancel` (provider) —
 * **one use-case, two routes**. File 12 Part 49.8 un-defers the provider
 * half of Part 35.8 by making ownership pluggable
 * (`ResolveAppointmentScopeUseCase`) instead of hard-coding
 * `patient_id === actor.sub`; every other rule below — cancellable-status
 * check, version-guarded transition, slot release, refund policy, audit,
 * outbox — is shared verbatim by both callers rather than reimplemented for
 * the provider path. CLINIC_STAFF stays deferred (see that use-case).
 *
 * Only a `CONFIRMED` appointment is cancellable.
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
    @Inject(ResolveAppointmentScopeUseCase) private readonly appointmentScope: ResolveAppointmentScopeUseCase,
  ) {}

  async execute(appointmentId: string, input: CancelAppointmentInput, actor: AccessTokenPayload): Promise<CancelAppointmentResult> {
    // Resolved before the transaction opens: it is an authorization lookup
    // against tables this transaction never writes (File 12 Part 49.7).
    const scope = await this.appointmentScope.execute(actor);

    // File 12 Part 49.8: a provider-initiated cancellation must say so.
    // `reason` drives the refund policy (Part 36.8 — PROVIDER_REQUEST waives
    // the fee entirely), so letting a doctor send PATIENT_REQUEST would
    // charge the patient a cancellation fee for the clinic's own decision.
    // Rejected explicitly rather than silently rewritten, so a mis-sending
    // client is fixed rather than masked.
    if (scope.kind !== 'PATIENT' && input.reason !== 'PROVIDER_REQUEST') {
      throw new BusinessRuleError(
        'CANCELLATION_REASON_NOT_PERMITTED',
        'الإلغاء من جانب مقدّم الخدمة يجب أن يكون بسبب «طلب مقدّم الخدمة».',
        { reason: input.reason },
      );
    }

    // Explicit timeout (Prisma's default is 5000ms) — same reasoning as
    // ConfirmAppointmentUseCase: this transaction now also runs the refund
    // use-case's several sequential writes when a payment was captured.
    return this.prisma.$transaction(async (tx) => {
      const appointment = await this.appointments.findById(tx, appointmentId);
      if (!appointment || !isAppointmentInScope(appointment, scope)) {
        throw new NotFoundError('Appointment', appointmentId);
      }
      if (appointment.status !== 'CONFIRMED') {
        throw new BusinessRuleError('APPOINTMENT_NOT_CANCELLABLE', 'لا يمكن إلغاء هذا الموعد إلا وهو مؤكّد.', {
          status: appointment.status,
        });
      }

      const cancelledReason = input.note ? `${input.reason}: ${input.note}` : input.reason;
      const cancelled = await this.appointments.cancel(tx, appointment.id, appointment.version, actor.sub, cancelledReason);
      if (!cancelled) {
        throw new ConflictError('APPOINTMENT_STATE_CHANGED', 'تم تعديل هذا الموعد من جهة أخرى. حدّث الصفحة ثم أعد المحاولة.', { appointmentId });
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
        // The appointment's own patient, not the actor — a doctor-initiated
        // cancellation still concerns the patient, and any consumer
        // (Notifications, Phase 8) needs to reach them, not the canceller.
        patientId: appointment.patient_id,
        reason: input.reason,
        cancelledBy: scope.kind === 'PATIENT' ? 'PATIENT' : scope.kind,
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
      throw new DomainError(500, 'CANCELLATION_TIER_NOT_CONFIGURED', 'سياسة الإلغاء غير مُهيّأة لهذه المنطقة. تواصل مع الدعم.');
    }
    return value.feePercent;
  }
}
