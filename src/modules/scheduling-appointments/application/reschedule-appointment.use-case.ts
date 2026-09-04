import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { holdExpiresAt } from '../domain/appointment-lifecycle.rules';
import { translateCreateHoldError } from './create-hold.use-case';
import { isAppointmentInScope, ResolveAppointmentScopeUseCase } from './resolve-appointment-scope.use-case';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface RescheduleAppointmentInput {
  newSlotId: string;
}

/** Patient-initiated: a fresh hold the patient still has to confirm (Part 35.10). */
export interface RescheduleAppointmentHeldResult {
  status: 'HELD';
  holdId: string;
  slotId: string;
  expiresAt: Date;
  previousAppointmentId: string;
}

/** Provider-initiated: the move is already complete (File 12 Part 49.9). */
export interface RescheduleAppointmentConfirmedResult {
  status: 'CONFIRMED';
  appointmentId: string;
  slotId: string;
  previousAppointmentId: string;
}

export type RescheduleAppointmentResult = RescheduleAppointmentHeldResult | RescheduleAppointmentConfirmedResult;

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
 * The two paths differ only in who completes the hold:
 *
 * - **Patient**: the hold is returned unconfirmed and the patient confirms
 *   it via `POST /v1/appointments/{holdId}/confirm`, exactly as before. This
 *   path is byte-for-byte unchanged.
 * - **Provider**: the same hold is converted inside the *same* transaction,
 *   producing the new `CONFIRMED` appointment immediately. This is not a
 *   bypass of the hold/confirm rules — every guard still runs, in order
 *   (`markHeld` -> `markConverted` -> `markBooked`), the hold row is really
 *   written and really converted. What it skips is the client round-trip,
 *   and deliberately: the hold TTL exists to reserve a slot while a
 *   *patient* decides and pays (`APPOINTMENT_CONSTANTS.HOLD_TTL_MINUTES`,
 *   5 minutes). Handing a doctor-initiated move back as a patient-owned
 *   5-minute hold would strand the patient with **no** appointment whenever
 *   they were not holding their phone at that moment — the old row is
 *   already `RESCHEDULED` and the reaper would release the new slot. There
 *   is nothing for the patient to decide or pay here: the consult fee was
 *   captured at the original confirm, and `payment_intent_id` carries over
 *   to the new row so a later cancellation still refunds the right intent.
 *
 * The hold is always owned by `appointment.patient_id`, never by the actor —
 * identical to the old behaviour on the patient path (ownership guarantees
 * they are the same user there), and correct on the provider path.
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
          throw new BusinessRuleError('APPOINTMENT_NOT_RESCHEDULABLE', 'Only a confirmed appointment can be rescheduled.', {
            status: appointment.status,
          });
        }

        const newSlot = await this.slots.findById(tx, input.newSlotId);
        if (!newSlot || newSlot.doctor_clinic_affiliation_id !== appointment.doctor_clinic_affiliation_id) {
          // File 12 Part 35.11: a different affiliation isn't a "reschedule" — existence-hiding 404, same pattern as CreateHoldUseCase.
          throw new NotFoundError('AppointmentSlot', input.newSlotId);
        }

        const rescheduled = await this.appointments.markRescheduled(tx, appointment.id, appointment.version);
        if (!rescheduled) {
          throw new ConflictError('APPOINTMENT_STATE_CHANGED', 'This appointment was modified concurrently. Reload and try again.', { appointmentId });
        }

        await this.slots.releaseBooked(tx, appointment.slot_id);

        const claimed = await this.slots.markHeld(tx, newSlot.id);
        if (!claimed) {
          throw new ConflictError('SLOT_ALREADY_BOOKED', 'This slot is no longer open.', { slotId: newSlot.id });
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

        if (scope.kind !== 'DOCTOR') {
          await this.outbox.emit(tx, 'AppointmentHeld', {
            holdId: hold.id,
            slotId: newSlot.id,
            patientId: appointment.patient_id,
            expiresAt: expiresAt.toISOString(),
            rescheduledFromAppointmentId: appointment.id,
          });

          return {
            status: 'HELD' as const,
            holdId: hold.id,
            slotId: newSlot.id,
            expiresAt,
            previousAppointmentId: appointment.id,
          };
        }

        // --- Provider path: complete the hold in this same transaction. ---
        try {
          await this.holds.markConverted(tx, hold.id, hold.version, new Date());
        } catch (error) {
          if (error instanceof OptimisticLockError) {
            // Unreachable in practice — the hold was created two statements
            // ago inside this transaction, so nothing else can have seen it.
            // Surfaced as a conflict rather than a 500 if it ever happens.
            throw new ConflictError('HOLD_STATE_CHANGED', 'The replacement hold was modified concurrently. Reload and try again.', {
              holdId: hold.id,
            });
          }
          throw error;
        }

        const slotBooked = await this.slots.markBooked(tx, newSlot.id);
        if (!slotBooked) {
          throw new ConflictError('SLOT_ALREADY_BOOKED', 'This slot is no longer open.', { slotId: newSlot.id });
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
        });

        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action: 'scheduling_appointments.appointment.confirm',
          resourceType: 'appointment',
          resourceId: replacement.id,
          subjectPatientId: appointment.patient_id,
        });

        await this.outbox.emit(tx, 'AppointmentRescheduledByProvider', {
          appointmentId: replacement.id,
          previousAppointmentId: appointment.id,
          slotId: newSlot.id,
          previousSlotId: appointment.slot_id,
          patientId: appointment.patient_id,
          doctorClinicAffiliationId: appointment.doctor_clinic_affiliation_id,
        });

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
