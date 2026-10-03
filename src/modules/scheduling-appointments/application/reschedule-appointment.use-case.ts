import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { holdExpiresAt } from '../domain/appointment-lifecycle.rules';
import { slotAlreadyStarted, translateCreateHoldError } from './create-hold.use-case';
import { GetAffiliationBillingInfoUseCase } from '../../provider-directory/application/get-affiliation-billing-info.use-case';
import { ListAssistantUserIdsForBranchUseCase } from '../../provider-directory/application/list-assistant-user-ids-for-branch.use-case';
import { isAppointmentInScope, ResolveAppointmentScopeUseCase } from './resolve-appointment-scope.use-case';
import { assertBookingChangeAllowed } from './booking-change.guard';
import { isBeforeAppointmentStart } from '../domain/visit-status.rules';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface RescheduleAppointmentInput {
  newSlotId: string;
}

/** The move is already complete for both patient and provider (File 12 Part 49.9): no hold to confirm, no new payment. */
export interface RescheduleAppointmentConfirmedResult {
  status: 'CONFIRMED';
  appointmentId: string;
  slotId: string;
  previousAppointmentId: string;
}

export type RescheduleAppointmentResult = RescheduleAppointmentConfirmedResult;

/**
 * File 10 §2.3 `POST /v1/appointments/{appointmentId}/reschedule` (patient)
 * and `POST /v1/doctors/me/appointments/{appointmentId}/reschedule`
 * (provider) — one use-case, two routes, per File 12 Part 35.10-35.13 and
 * Part 49.9.
 *
 * Shared spine, in one transaction: release the old slot, claim the new one,
 * create an `AppointmentHold` carrying `rescheduledFromAppointmentId`, mark
 * the old appointment `RESCHEDULED`. The new slot must belong to the **same
 * affiliation** — a different doctor or branch is not a reschedule and is
 * rejected as a 404 (Part 35.11), which also means a doctor can never move a
 * patient onto another provider's calendar.
 *
 * Patient and provider take the SAME path: the hold is converted inside the
 * same transaction, producing the new `CONFIRMED` appointment immediately.
 * This is not a bypass of the hold/confirm rules — every guard still runs, in
 * order (`markHeld` -> `markConverted` -> `markBooked`). What it skips is the
 * client round-trip and, crucially, a second payment: the consult fee was
 * captured at the original confirm and `payment_intent_id` /
 * `remaining_balance` carry over to the new row, so a later cancellation
 * refunds the right intent. Handing the patient a 5-minute hold + payment
 * screen (the old behaviour) double-charged wallet/Fawry payments, wrote a
 * second ledger entry, and left the patient with NO appointment if the hold
 * expired (the old row is already `RESCHEDULED`).
 *
 * The hold is always owned by `appointment.patient_id`, never by the actor
 * (correct on the provider path; on the patient path they are the same user).
 */
@Injectable()
export class RescheduleAppointmentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(AppointmentSlotRepository) private readonly slots: AppointmentSlotRepository,
    @Inject(AppointmentHoldRepository) private readonly holds: AppointmentHoldRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ResolveAppointmentScopeUseCase) private readonly appointmentScope: ResolveAppointmentScopeUseCase,
    @Inject(GetAffiliationBillingInfoUseCase) private readonly affiliationBilling: GetAffiliationBillingInfoUseCase,
    @Inject(ListAssistantUserIdsForBranchUseCase) private readonly assistantUserIds: ListAssistantUserIdsForBranchUseCase,
  ) {}

  async execute(appointmentId: string, input: RescheduleAppointmentInput, actor: AccessTokenPayload): Promise<RescheduleAppointmentResult> {
    const scope = await this.appointmentScope.execute(actor);

    return this.prisma.$transaction(
      async (tx) => {
        const appointment = await this.appointments.findById(tx, appointmentId);
        if (!appointment || !isAppointmentInScope(appointment, scope)) {
          throw new NotFoundError('Appointment', appointmentId);
        }
        if (appointment.status !== 'CONFIRMED') {
          throw new BusinessRuleError('APPOINTMENT_NOT_RESCHEDULABLE', 'لا يمكن تغيير هذا الموعد إلا وهو مؤكّد.', {
            status: appointment.status,
          });
        }
        // PM-APPT-01/02 (PM-APPT-05: assistants may reschedule within these rules).
        const startsAfter = await assertBookingChangeAllowed(tx, this.slots, appointment, scope);

        const newSlot = await this.slots.findById(tx, input.newSlotId);
        if (!newSlot || newSlot.doctor_clinic_affiliation_id !== appointment.doctor_clinic_affiliation_id) {
          // File 12 Part 35.11: a different affiliation isn't a "reschedule" — existence-hiding 404, same pattern as CreateHoldUseCase.
          throw new NotFoundError('AppointmentSlot', input.newSlotId);
        }
        // LR-015: a patient cannot move onto a slot that has already started.
        if (scope.kind === 'PATIENT' && !isBeforeAppointmentStart(newSlot.start_at, startsAfter ?? new Date())) {
          throw slotAlreadyStarted(newSlot.id);
        }

        const rescheduled = await this.appointments.markRescheduled(tx, appointment.id, appointment.version, startsAfter);
        if (!rescheduled) {
          throw new ConflictError('APPOINTMENT_STATE_CHANGED', 'تم تعديل هذا الموعد من جهة أخرى. حدّث الصفحة ثم أعد المحاولة.', { appointmentId });
        }

        await this.slots.releaseBooked(tx, appointment.slot_id);

        const claimed = await this.slots.markHeld(tx, newSlot.id);
        if (!claimed) {
          throw new ConflictError('SLOT_ALREADY_BOOKED', 'لم يعد هذا الموعد متاحًا. اختر موعدًا آخر.', { slotId: newSlot.id });
        }

        const expiresAt = holdExpiresAt(new Date());
        const hold = await this.holds
          .create(tx, {
            slotId: newSlot.id,
            // The appointment's patient, never the actor — see the class doc.
            patientId: appointment.patient_id,
            expiresAt,
            rescheduledFromAppointmentId: appointment.id,
          })
          .catch((error: unknown) => {
            throw translateCreateHoldError(error, newSlot.id);
          });

        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action:
            scope.kind === 'DOCTOR'
              ? 'scheduling_appointments.appointment.reschedule_by_provider'
              : 'scheduling_appointments.appointment.reschedule',
          resourceType: 'appointment',
          resourceId: appointment.id,
          subjectPatientId: appointment.patient_id,
        });

        // --- Complete the hold in this same transaction (patient and provider). ---
        try {
          await this.holds.markConverted(tx, hold.id, hold.version, new Date());
        } catch (error) {
          if (error instanceof OptimisticLockError) {
            // Unreachable in practice — the hold was created two statements
            // ago inside this transaction, so nothing else can have seen it.
            // Surfaced as a conflict rather than a 500 if it ever happens.
            throw new ConflictError('HOLD_STATE_CHANGED', 'تم تعديل الحجز المؤقت البديل من جهة أخرى. حدّث الصفحة ثم أعد المحاولة.', {
              holdId: hold.id,
            });
          }
          throw error;
        }

        const slotBooked = await this.slots.markBooked(tx, newSlot.id);
        if (!slotBooked) {
          throw new ConflictError('SLOT_ALREADY_BOOKED', 'لم يعد هذا الموعد متاحًا. اختر موعدًا آخر.', { slotId: newSlot.id });
        }

        const replacement = await this.appointments.create(tx, {
          slotId: newSlot.id,
          patientId: appointment.patient_id,
          doctorClinicAffiliationId: appointment.doctor_clinic_affiliation_id,
          rescheduledFromAppointmentId: appointment.id,
          // Carried over rather than re-captured: the consult fee was already
          // taken at the original confirm (Part 36), and the live appointment
          // has to keep pointing at that intent so a later cancellation
          // refunds it. `PaymentIntent.payable_id` still names the original
          // appointment — the money trail is the chain of
          // `rescheduled_from_appointment_id` links, not a re-pointed FK.
          paymentIntentId: appointment.payment_intent_id ?? undefined,
          // Same reasoning: the unpaid part of the fee travels with the intent it belongs to.
          remainingBalance: appointment.remaining_balance?.toFixed(2),
        });

        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action: 'scheduling_appointments.appointment.confirm',
          resourceType: 'appointment',
          resourceId: replacement.id,
          subjectPatientId: appointment.patient_id,
        });

        if (scope.kind === 'DOCTOR') {
          await this.outbox.emit(tx, 'AppointmentRescheduledByProvider', {
            appointmentId: replacement.id,
            previousAppointmentId: appointment.id,
            slotId: newSlot.id,
            previousSlotId: appointment.slot_id,
            patientId: appointment.patient_id,
            doctorClinicAffiliationId: appointment.doctor_clinic_affiliation_id,
          });
        } else {
          // Patient-initiated: tell the patient it is confirmed and fan out to
          // the doctor/assistants exactly like a confirm-of-a-reschedule-hold.
          const billing = await this.affiliationBilling.execute(tx, appointment.doctor_clinic_affiliation_id);
          await this.outbox.emit(tx, 'AppointmentConfirmed', {
            appointmentId: replacement.id,
            slotId: newSlot.id,
            patientId: appointment.patient_id,
          });
          await this.outbox.emit(tx, 'AppointmentRescheduledForDoctor', {
            appointmentId: replacement.id,
            doctorUserId: billing.doctorUserId,
          });
          const assistantIds = await this.assistantUserIds.execute(tx, billing.clinicBranchId);
          for (const assistantUserId of assistantIds) {
            await this.outbox.emit(tx, 'AppointmentRescheduledForAssistant', {
              appointmentId: replacement.id,
              assistantUserId,
            });
          }
        }

        return {
          status: 'CONFIRMED' as const,
          appointmentId: replacement.id,
          slotId: newSlot.id,
          previousAppointmentId: appointment.id,
        };
      },
      { timeout: 15000 },
    );
  }
}
