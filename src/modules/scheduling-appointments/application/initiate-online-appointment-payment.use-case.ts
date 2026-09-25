import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import {
  InitiateOnlinePaymentUseCase,
  OnlinePaymentMethod,
} from '../../payments/application/initiate-online-payment.use-case';
import {
  PaymentBillingInfo,
  PaymentCustomerInfo,
  PaymentPhoneInfo,
} from '../../payments/application/ports/payment-gateway.port';
import { GetAffiliationBillingInfoUseCase } from '../../provider-directory/application/get-affiliation-billing-info.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { onlinePaymentHoldExpiresAt } from '../domain/appointment-lifecycle.rules';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';
import { ResolveAppointmentPaymentAmountUseCase } from './resolve-appointment-payment-amount.use-case';

export interface InitiateOnlineAppointmentPaymentInput {
  method: OnlinePaymentMethod;
  customer: PaymentPhoneInfo;
  billingData?: PaymentBillingInfo;
  /** Optional partial amount (>= configured minimum, <= consult fee). Omitted = pay in full. Validated server-side against the real fee. */
  paymentAmount?: string;
  walletProvider?: 'VODAFONE_CASH' | 'ETISALAT_CASH' | 'ORANGE_CASH';
  walletMobileNumber?: string;
}

export interface InitiateOnlineAppointmentPaymentResult {
  paymentIntentId: string;
  method: OnlinePaymentMethod;
  redirectUrl?: string;
  referenceCode?: string;
  expiresAt: string;
  /**
   * What the gateway will actually charge, e.g. `"50.00"`. On a retry this is
   * the FIRST attempt's amount (a different `paymentAmount` sent again is
   * ignored), so the app must show this value, not the one it sent.
   */
  amount: string;
  currency: string;
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
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ResolveAppointmentPaymentAmountUseCase) private readonly resolvePaymentAmount: ResolveAppointmentPaymentAmountUseCase,
  ) {}

  async execute(
    holdId: string,
    input: InitiateOnlineAppointmentPaymentInput,
    actor: AccessTokenPayload,
  ): Promise<InitiateOnlineAppointmentPaymentResult> {
    // File 12 Part 51 follow-up: the gateway call (`callGateway` below) is a
    // live network round trip — Fawry alone is four sequential HTTP calls —
    // that can comfortably exceed Prisma's ~5s interactive-transaction
    // timeout. It must run OUTSIDE any `$transaction`, never inside one, so
    // this is deliberately three phases (prepare / call gateway / complete)
    // instead of the single transaction this used to be.
    const { hold, prepared, expiresAt } = await this.prisma.$transaction(async (tx) => {
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

      // File 12 Part 51: calculated ONCE and reused for every deadline this
      // call touches — the hold's own extended expiry AND the gateway's
      // best-effort `expiresAt` — never two independently-computed times
      // that could drift apart. On a retry, the hold was already extended
      // at first-initiate time, so its existing `expires_at` IS that same
      // original deadline, reused rather than recalculated from "now".
      const expiresAt = isRetry ? hold.expires_at : onlinePaymentHoldExpiresAt(new Date(), input.method);

      // Server-side validation against the real fee; the gateway only ever
      // sees `paymentAmount`. On a retry `prepare()` keeps the stored
      // intent's amount regardless of what is sent again.
      const resolved = await this.resolvePaymentAmount.execute(tx, {
        requestedAmount: input.paymentAmount,
        consultFee: billing.consultFee,
      });

      // Appointment Fawry checkout collects only the patient's phone. Names
      // and email are neither accepted from that client payload nor forwarded
      // to Fawry; Paymob methods still require explicit billing data.
      const billingData = input.method === 'FAWRY' ? undefined : input.billingData;
      if (input.method !== 'FAWRY' && !billingData) {
        throw new DomainError(
          400,
          'PAYMENT_BILLING_DATA_REQUIRED',
          'بيانات الفوترة مطلوبة لطريقة الدفع المحددة.',
        );
      }
      const customer: PaymentCustomerInfo = {
        firstName: billingData?.firstName ?? '',
        lastName: billingData?.lastName ?? '',
        email: billingData?.email ?? '',
        phone: input.customer.phone,
      };

      const prepared = await this.initiatePayment.prepare(tx, {
        payerUserId: actor.sub,
        payableType: 'APPOINTMENT',
        payableId: appointmentId,
        amount: resolved.paymentAmount,
        fullAmount: resolved.fullAmount,
        currency: billing.currency,
        method: input.method,
        idempotencyKey: `hold:${hold.id}`,
        customer,
        walletProvider: input.walletProvider,
        walletMobileNumber: input.walletMobileNumber,
        existingPaymentIntentId: hold.payment_intent_id ?? undefined,
        expiresAt,
      });

      if (!isRetry) {
        const linked = await this.holds.linkOnlinePayment(tx, hold.id, hold.version, prepared.paymentIntentId, expiresAt);
        if (!linked) {
          // Lost a race against the expiry sweep between the check above and
          // here — throwing rolls back this whole transaction, so the
          // `PaymentIntent`/`PaymentAttempt` just created roll back with it
          // and there is nothing dangling left to cancel (no gateway call
          // has happened yet at this point).
          throw holdExpired(holdId);
        }
      }

      return { hold, prepared, expiresAt };
    });

    let gatewayResult;
    try {
      gatewayResult = await this.initiatePayment.callGateway(prepared);
    } catch (error) {
      await this.prisma.$transaction((tx) => this.initiatePayment.completeFailure(tx, prepared.paymentAttemptId));
      throw error;
    }

    return this.prisma.$transaction(async (tx) => {
      await this.initiatePayment.completeSuccess(tx, prepared.paymentAttemptId, gatewayResult.metadata);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment_hold.initiate_online_payment',
        resourceType: 'appointment_hold',
        resourceId: hold.id,
      });

      await this.outbox.emit(tx, 'OnlineAppointmentPaymentInitiated', {
        holdId: hold.id,
        paymentIntentId: prepared.paymentIntentId,
        method: input.method,
        patientId: actor.sub,
      });

      return {
        paymentIntentId: prepared.paymentIntentId,
        method: prepared.method,
        redirectUrl: gatewayResult.redirectUrl,
        referenceCode: gatewayResult.referenceCode,
        expiresAt: expiresAt.toISOString(),
        amount: prepared.gatewayInput.amount,
        currency: prepared.gatewayInput.currency,
      };
    });
  }
}
