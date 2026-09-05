import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PAYMENT_GATEWAY, PaymentGatewayPort } from './ports/payment-gateway.port';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { RefundRepository } from '../infrastructure/refund.repository';

export interface HandleLatePaymentAfterExpiryInput {
  paymentIntentId: string;
  /** `PaymentAttempt.gateway_reference` — needed to call the gateway's own refund API. */
  gatewayReference: string;
}

/**
 * File 12 Part 50.6 — the business requirement to "handle the race
 * condition where a payment success webhook arrives around or after
 * expiration" and to "not blindly confirm an appointment that has already
 * legitimately expired and been released." By the time this runs, the
 * caller (the webhook use-case) has already determined the hold is no
 * longer convertible (expired/already converted by someone else) — so the
 * slot may already belong to a different patient. The only correct move is:
 * record that the gateway genuinely captured the money (so it's never
 * silently lost from our books), then immediately reverse it — a real
 * gateway refund call, best-effort, with the fact recorded either way so
 * Ops can follow up manually if the gateway call itself fails. This never
 * touches the appointment/hold/slot — those are already final by the time
 * this runs.
 */
@Injectable()
export class HandleLatePaymentAfterExpiryUseCase {
  private readonly logger = new Logger(HandleLatePaymentAfterExpiryUseCase.name);

  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(RefundRepository) private readonly refunds: RefundRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: HandleLatePaymentAfterExpiryInput): Promise<void> {
    const intent = await this.paymentIntents.findById(tx, input.paymentIntentId);
    if (!intent || intent.status !== 'CREATED') {
      // Already handled (a duplicate late webhook) or in some other
      // terminal state — nothing more to do safely.
      return;
    }

    const captured = await this.paymentIntents.markCaptured(tx, intent.id, intent.version);
    if (!captured) {
      return;
    }

    let gatewayRefundReference: string | undefined;
    try {
      const result = await this.gateway.refund(input.gatewayReference, intent.amount.toString());
      gatewayRefundReference = result.gatewayRefundReference;
    } catch (error) {
      this.logger.error(
        { err: error, paymentIntentId: intent.id },
        'Auto-refund gateway call failed for a payment that arrived after its hold expired — needs manual Ops follow-up',
      );
    }

    const capturedIntent = await this.paymentIntents.findById(tx, intent.id);
    await this.paymentIntents.markRefunded(tx, capturedIntent!.id, capturedIntent!.version, 'REFUNDED');
    await this.refunds.create(tx, {
      paymentIntentId: intent.id,
      amount: intent.amount.toString(),
      reason: 'HOLD_EXPIRED_BEFORE_PAYMENT_CONFIRMED',
      status: gatewayRefundReference ? 'COMPLETED' : 'PROCESSING',
    });

    await this.outbox.emit(tx, 'PaymentAutoRefunded', {
      paymentIntentId: intent.id,
      amount: intent.amount.toString(),
      reason: 'HOLD_EXPIRED_BEFORE_PAYMENT_CONFIRMED',
      requiresManualFollowUp: !gatewayRefundReference,
    });
  }
}
