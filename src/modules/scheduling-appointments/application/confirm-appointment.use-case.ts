import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { CapturePayAtClinicPaymentUseCase } from '../../payments/application/capture-pay-at-clinic-payment.use-case';
import { GetAffiliationBillingInfoUseCase } from '../../provider-directory/application/get-affiliation-billing-info.use-case';
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
 * converting it (Part 35.5), flip the slot `HELD→BOOKED`, capture a
 * pay-at-clinic payment (Part 36) for the affiliation's consult fee, then
 * create the `Appointment` (Part 35.1 — this is where the row is born, not
 * at hold time) straight to `CONFIRMED` with `payment_intent_id` populated.
 */
@Injectable()
export class ConfirmAppointmentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentHoldRepository) private readonly holds: AppointmentHoldRepository,
    @Inject(AppointmentSlotRepository) private readonly slots: AppointmentSlotRepository,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(GetAffiliationBillingInfoUseCase) private readonly affiliationBilling: GetAffiliationBillingInfoUseCase,
    @Inject(CapturePayAtClinicPaymentUseCase) private readonly paymentsCapture: CapturePayAtClinicPaymentUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(holdId: string, input: ConfirmAppointmentInput, actor: AccessTokenPayload): Promise<ConfirmAppointmentResult> {
    if (input.paymentMethod === 'ONLINE') {
      throw new DomainError(422, 'PAYMENT_METHOD_NOT_SUPPORTED', 'Online payment is not yet available (File 12 Part 35.4).');
    }

    // Explicit timeout (Prisma's default is 5000ms): this transaction now
    // does ~13 sequential round trips (hold/slot checks, payment capture's
    // intent/rate/splits/ledger writes, appointment create, audit, outbox)
    // that must stay atomic together (File 11 Part 11) — under this
    // environment's real network latency to Postgres, the default window
    // was intermittently too tight and caused flaky P2028 timeouts.
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

      // Pre-generated so the same UUID can be used as PaymentIntent.payable_id
      // before the Appointment row exists — breaks the circular reference
      // between the two rows (File 12 Part 36.4).
      const appointmentId = randomUUID();

      const billing = await this.affiliationBilling.execute(tx, slot.doctor_clinic_affiliation_id);

      // idempotencyKey: hold:${hold.id}, not the (still-unwired) client
      // Idempotency-Key header — safe/unique because holds.markConverted's
      // optimistic lock above already guarantees this code path runs at
      // most once per hold; a retried client call fails earlier, at
      // HOLD_EXPIRED (File 12 Part 36.5).
      const capture = await this.paymentsCapture.execute(tx, {
        payerUserId: actor.sub,
        payableType: 'APPOINTMENT',
        payableId: appointmentId,
        amount: billing.consultFee,
        currency: billing.currency,
        providerType: 'DOCTOR',
        providerId: billing.doctorId,
        idempotencyKey: `hold:${hold.id}`,
      });

      const appointment = await this.appointments.create(tx, {
        id: appointmentId,
        slotId: slot.id,
        patientId: actor.sub,
        doctorClinicAffiliationId: slot.doctor_clinic_affiliation_id,
        rescheduledFromAppointmentId: hold.rescheduled_from_appointment_id ?? undefined,
        paymentIntentId: capture.paymentIntentId,
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
    }, { timeout: 15000 });
  }
}
