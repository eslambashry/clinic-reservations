import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { CaptureOnlinePaymentUseCase } from '../../payments/application/capture-online-payment.use-case';
import { FindPaymentByGatewayReferenceUseCase } from '../../payments/application/find-payment-by-gateway-reference.use-case';
import { HandleLatePaymentAfterExpiryUseCase } from '../../payments/application/handle-late-payment-after-expiry.use-case';
import { MarkOnlinePaymentFailedUseCase } from '../../payments/application/mark-online-payment-failed.use-case';
import { PAYMENT_GATEWAY, PaymentGatewayPort } from '../../payments/application/ports/payment-gateway.port';
import { ProcessWalletTopUpUseCase } from '../../payments/application/process-wallet-top-up.use-case';
import { GetAffiliationBillingInfoUseCase } from '../../provider-directory/application/get-affiliation-billing-info.use-case';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { WebhookEventRepository } from '../../../shared/core/webhooks/webhook-event.repository';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface ProcessPaymentWebhookInput {
  provider: string;
  rawBody: Record<string, unknown>;
  hmac: string | undefined;
}

export interface ProcessPaymentWebhookResult {
  handled: boolean;
}

/**
 * File 12 Part 50 `POST /v1/webhooks/payments/{provider}` (File 11 Part
 * 05.6's documented path). Hosted in `scheduling-appointments`, not
 * `payments`, even though it's conceptually "a payments webhook" — this
 * module already depends on `payments` (for pay-at-clinic capture/refund,
 * File 12 Part 36), and this handler needs BOTH sides in one transaction
 * for the `APPOINTMENT` payable case (atomically convert the hold AND
 * capture the payment — File 11 Part 11). Hosting it in `payments` instead
 * would require `payments` to depend back on `scheduling-appointments`,
 * a circular module import; this direction has zero such issue. The
 * `WALLET_TOPUP` branch doesn't need anything from this module at all — it
 * just calls straight through to `payments`' own exported use-case — but
 * both payable types share one physical webhook URL (the gateway doesn't
 * know or care which one it's paying for), so one handler has to dispatch
 * both regardless of which module hosts it.
 *
 * File 11 Part 11's webhook idempotency invariant: the `webhook_events` row
 * is inserted FIRST, inside the same transaction as everything else — a
 * unique-constraint failure (already-seen `idempotencyKey`) short-circuits
 * before any side effect, and a mid-processing failure rolls the insert
 * back too, so a genuinely-failed delivery is correctly retryable by the
 * gateway rather than permanently swallowed.
 */
@Injectable()
export class ProcessPaymentWebhookUseCase {
  private readonly logger = new Logger(ProcessPaymentWebhookUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WebhookEventRepository) private readonly webhookEvents: WebhookEventRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(FindPaymentByGatewayReferenceUseCase) private readonly findPayment: FindPaymentByGatewayReferenceUseCase,
    @Inject(CaptureOnlinePaymentUseCase) private readonly captureOnlinePayment: CaptureOnlinePaymentUseCase,
    @Inject(MarkOnlinePaymentFailedUseCase) private readonly markFailed: MarkOnlinePaymentFailedUseCase,
    @Inject(HandleLatePaymentAfterExpiryUseCase) private readonly handleLatePayment: HandleLatePaymentAfterExpiryUseCase,
    @Inject(ProcessWalletTopUpUseCase) private readonly processWalletTopUp: ProcessWalletTopUpUseCase,
    @Inject(AppointmentHoldRepository) private readonly holds: AppointmentHoldRepository,
    @Inject(AppointmentSlotRepository) private readonly slots: AppointmentSlotRepository,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(GetAffiliationBillingInfoUseCase) private readonly affiliationBilling: GetAffiliationBillingInfoUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: ProcessPaymentWebhookInput): Promise<ProcessPaymentWebhookResult> {
    // Signature verification happens before the transaction opens — an
    // unverified webhook must never even be recorded as "seen," let alone
    // acted on (File 11 Part 06 / this task's explicit "never trust a
    // frontend/unverified success flag" requirement).
    if (!this.gateway.verifyWebhookSignature(input.rawBody, input.hmac)) {
      this.logger.warn({ provider: input.provider }, 'Rejected a payment webhook with an invalid/missing signature');
      return { handled: false };
    }

    const event = this.gateway.parseWebhookEvent(input.rawBody);

    return this.prisma.$transaction(async (tx) => {
      const isFirstDelivery = await this.webhookEvents.tryRecordFirstDelivery(tx, {
        provider: input.provider,
        eventType: 'TRANSACTION',
        payload: input.rawBody as unknown as Prisma.InputJsonValue,
        idempotencyKey: event.gatewayTransactionId,
        signatureVerified: true,
      });
      if (!isFirstDelivery) {
        // Already processed by an earlier delivery of the exact same event
        // (File 11 Part 11: "a unique-constraint failure means 'already
        // processed,' not an error") — safe no-op, respond success.
        return { handled: true };
      }

      const payment = await this.findPayment.execute(tx, event.gatewayReference);
      if (!payment) {
        this.logger.warn({ gatewayReference: event.gatewayReference }, 'Payment webhook referenced an unknown attempt');
        return { handled: false };
      }

      if (payment.payableType === 'WALLET_TOPUP') {
        if (event.success) {
          await this.processWalletTopUp.execute(tx, { paymentIntentId: payment.paymentIntentId });
        } else {
          await this.markFailed.execute(tx, {
            paymentAttemptId: payment.paymentAttemptId,
            paymentIntentId: payment.paymentIntentId,
            failureCode: event.failureCode ?? 'GATEWAY_DECLINED',
          });
        }
        return { handled: true };
      }

      if (payment.payableType !== 'APPOINTMENT') {
        this.logger.warn({ payableType: payment.payableType }, 'Payment webhook for an unsupported payable type');
        return { handled: false };
      }

      if (!event.success) {
        await this.markFailed.execute(tx, {
          paymentAttemptId: payment.paymentAttemptId,
          paymentIntentId: payment.paymentIntentId,
          failureCode: event.failureCode ?? 'GATEWAY_DECLINED',
        });
        return { handled: true };
      }

      if (payment.intentStatus !== 'CREATED') {
        // Already captured/cancelled by an earlier event for this same
        // intent — nothing further to do (covers a duplicate success
        // delivery that arrives with a different `gatewayTransactionId`,
        // e.g. a gateway-side resend under a new delivery id).
        return { handled: true };
      }

      const hold = await this.holds.findByPaymentIntentId(tx, payment.paymentIntentId);
      const convertible = hold && hold.status === 'ACTIVE' && hold.expires_at.getTime() > Date.now();

      if (!convertible) {
        // File 12 Part 50.6: the hold already expired (and the slot was
        // already released, possibly to a different patient) by the time
        // this success webhook arrived. Do NOT confirm the appointment —
        // capture-then-auto-refund instead.
        await this.handleLatePayment.execute(tx, {
          paymentIntentId: payment.paymentIntentId,
          gatewayReference: event.gatewayReference,
        });
        return { handled: true };
      }

      try {
        await this.holds.markConverted(tx, hold.id, hold.version, new Date());
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          // Lost the race to the expiry sweep between the read above and
          // this conditional update — same late-payment handling.
          await this.handleLatePayment.execute(tx, {
            paymentIntentId: payment.paymentIntentId,
            gatewayReference: event.gatewayReference,
          });
          return { handled: true };
        }
        throw error;
      }

      const slot = await this.slots.findById(tx, hold.slot_id);
      if (!slot) {
        throw new Error(`AppointmentSlot ${hold.slot_id} missing for converted hold ${hold.id}`);
      }
      const slotBooked = await this.slots.markBooked(tx, slot.id);
      if (!slotBooked) {
        throw new Error(`Failed to book slot ${slot.id} for converted hold ${hold.id}`);
      }

      const billing = await this.affiliationBilling.execute(tx, slot.doctor_clinic_affiliation_id);
      await this.captureOnlinePayment.execute(tx, {
        paymentIntentId: payment.paymentIntentId,
        providerType: 'DOCTOR',
        providerId: billing.doctorId,
      });

      const appointment = await this.appointments.create(tx, {
        id: payment.payableId,
        slotId: slot.id,
        patientId: payment.payerUserId,
        doctorClinicAffiliationId: slot.doctor_clinic_affiliation_id,
        rescheduledFromAppointmentId: hold.rescheduled_from_appointment_id ?? undefined,
        paymentIntentId: payment.paymentIntentId,
      });

      await this.audit.record(tx, {
        actorUserId: payment.payerUserId,
        action: 'scheduling_appointments.appointment.confirm_via_webhook',
        resourceType: 'appointment',
        resourceId: appointment.id,
      });

      await this.outbox.emit(tx, 'AppointmentConfirmed', {
        appointmentId: appointment.id,
        slotId: slot.id,
        patientId: payment.payerUserId,
      });

      return { handled: true };
    });
  }
}
