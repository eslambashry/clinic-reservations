import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import {
  InitiateOnlinePaymentUseCase,
  OnlinePaymentMethod,
} from '../../payments/application/initiate-online-payment.use-case';
import { CancelOnlinePaymentIntentUseCase } from '../../payments/application/cancel-online-payment-intent.use-case';
import { PaymentCustomerInfo } from '../../payments/application/ports/payment-gateway.port';
import { GetAffiliationBillingInfoUseCase } from '../../provider-directory/application/get-affiliation-billing-info.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { onlinePaymentHoldExpiresAt } from '../domain/appointment-lifecycle.rules';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface InitiateOnlineAppointmentPaymentInput {
  method: OnlinePaymentMethod;
  customer: PaymentCustomerInfo;
  walletProvider?: 'VODAFONE_CASH' | 'ETISALAT_CASH' | 'ORANGE_CASH';
  walletMobileNumber?: string;
}

export interface InitiateOnlineAppointmentPaymentResult {
  paymentIntentId: string;
  method: OnlinePaymentMethod;
  redirectUrl?: string;
  referenceCode?: string;
  expiresAt: string;
}

function holdExpired(holdId: string): DomainError {
  return new DomainError(410, 'HOLD_EXPIRED', 'انتهت مهلة الحجز المؤقت أو تم استخدامه. ابدأ حجزًا جديدًا.', { holdId });
}

/**
 * File 12 Part 50.1 `POST /v1/appointments/{holdId}/payments` — the
 * CARD/FAWRY/MOBILE_WALLET counterpart to `ConfirmAppointmentUseCase`'s
 * `PAY_AT_CLINIC`/`INTERNAL_WALLET` branches. Unlike those two, this does
 * NOT create the `Appointment` row or convert the hold — that only happens
 * once a signed gateway webhook reports success
 * (`ConfirmAppointmentFromWebhookUseCase`). What this call actually does:
 * extend the hold's expiry to the method's own window (15 min Fawry / 10
 * min mobile wallet — File 12 Part 50), link it to a new (or, on retry, the
 * same still-`CREATED`) `PaymentIntent`, and hand back whatever the client
 * needs to complete payment (iframe URL / Fawry reference / wallet
 * redirect). This — `AppointmentHold.status = ACTIVE` +
 * `PaymentIntent.status = CREATED` — IS the "`PENDING_PAYMENT`" state the
 * business requirements describe; no new `AppointmentStatus` value exists
 * for it (an `Appointment` row isn't created until confirm, exactly as
 * pay-at-clinic already works — Part 36.4).
 */
@Injectable()
export class InitiateOnlineAppointmentPaymentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentHoldRepository) private readonly holds: AppointmentHoldRepository,
    @Inject(AppointmentSlotRepository) private readonly slots: AppointmentSlotRepository,
    @Inject(GetAffiliationBillingInfoUseCase) private readonly affiliationBilling: GetAffiliationBillingInfoUseCase,
    @Inject(InitiateOnlinePaymentUseCase) private readonly initiatePayment: InitiateOnlinePaymentUseCase,
    @Inject(CancelOnlinePaymentIntentUseCase) private readonly cancelOnlinePayment: CancelOnlinePaymentIntentUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(
    holdId: string,
    input: InitiateOnlineAppointmentPaymentInput,
    actor: AccessTokenPayload,
  ): Promise<InitiateOnlineAppointmentPaymentResult> {
    return this.prisma.$transaction(async (tx) => {
      const hold = await this.holds.findById(tx, holdId);
      if (!hold || hold.patient_id !== actor.sub) {
        throw new NotFoundError('AppointmentHold', holdId);
      }
      if (hold.status !== 'ACTIVE' || hold.expires_at.getTime() <= Date.now()) {
        throw holdExpired(holdId);
      }

      const slot = await this.slots.findById(tx, hold.slot_id);
      if (!slot) {
        throw new NotFoundError('AppointmentSlot', hold.slot_id);
      }
      const billing = await this.affiliationBilling.execute(tx, slot.doctor_clinic_affiliation_id);

      const isRetry = Boolean(hold.payment_intent_id);
      // Pre-generated so it can double as `PaymentIntent.payable_id` before
      // the row exists (Part 36.4's circular-FK pattern) — only used on a
      // first-time initiate; a retry reuses the existing intent's own
      // `payable_id`, already set to the appointment id chosen the first
      // time.
      const appointmentId = randomUUID();

      const initiated = await this.initiatePayment.execute(tx, {
        payerUserId: actor.sub,
        payableType: 'APPOINTMENT',
        payableId: appointmentId,
        amount: billing.consultFee,
        currency: billing.currency,
        method: input.method,
        idempotencyKey: `hold:${hold.id}`,
        customer: input.customer,
        walletProvider: input.walletProvider,
        walletMobileNumber: input.walletMobileNumber,
        existingPaymentIntentId: hold.payment_intent_id ?? undefined,
      });

      if (!isRetry) {
        const expiresAt = onlinePaymentHoldExpiresAt(new Date(), input.method);
        const linked = await this.holds.linkOnlinePayment(tx, hold.id, hold.version, initiated.paymentIntentId, expiresAt);
        if (!linked) {
          // Lost a race against the expiry sweep between the check above and
          // here — the intent we just created (and the live gateway session
          // behind it) now has no hold to belong to. Cancel it immediately
          // rather than leaving a dangling `CREATED` intent nothing can ever
          // resolve.
          await this.cancelOnlinePayment.execute(tx, initiated.paymentIntentId);
          throw holdExpired(holdId);
        }
      }

      const refreshedHold = await this.holds.findById(tx, hold.id);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment_hold.initiate_online_payment',
        resourceType: 'appointment_hold',
        resourceId: hold.id,
      });

      await this.outbox.emit(tx, 'OnlineAppointmentPaymentInitiated', {
        holdId: hold.id,
        paymentIntentId: initiated.paymentIntentId,
        method: input.method,
        patientId: actor.sub,
      });

      return {
        paymentIntentId: initiated.paymentIntentId,
        method: initiated.method,
        redirectUrl: initiated.redirectUrl,
        referenceCode: initiated.referenceCode,
        expiresAt: (refreshedHold?.expires_at ?? hold.expires_at).toISOString(),
      };
    });
  }
}
