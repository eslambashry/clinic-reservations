import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAYMENT_CONSTANTS } from '../../../shared/config/constants';
import {
  FindStalePendingOnlinePaymentsUseCase,
  StalePendingOnlinePayment,
} from '../../payments/application/find-stale-pending-online-payments.use-case';
import { PAYMENT_GATEWAY, PaymentGatewayPort } from '../../payments/application/ports/payment-gateway.port';
import { ProcessPaymentWebhookUseCase } from './process-payment-webhook.use-case';

export type ReconcileOutcome = 'PAID' | 'FAILED' | 'PENDING' | 'NOT_FOUND' | 'SKIPPED' | 'ERROR';

const BATCH_SIZE = 50;

/**
 * Safety net for lost/late Paymob webhooks: for online CARD intents still `CREATED` for a few minutes,
 * asks Paymob (`queryTransaction`) what happened and feeds a PAID/FAILED answer through
 * `ProcessPaymentWebhookUseCase.processVerifiedEvent` - the SAME path as the webhook (amount/currency
 * check, `webhook_events` idempotency keyed by Paymob transaction id, hold/late-payment handling).
 * Racing a real webhook is safe: whichever inserts the `webhook_events` row first wins; the other is a no-op.
 * Never throws per item - a gateway error leaves the intent untouched for the next run.
 */
@Injectable()
export class ReconcilePaymobPaymentsUseCase {
  private readonly logger = new Logger(ReconcilePaymobPaymentsUseCase.name);

  constructor(
    @Inject(FindStalePendingOnlinePaymentsUseCase) private readonly findStale: FindStalePendingOnlinePaymentsUseCase,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(ProcessPaymentWebhookUseCase) private readonly processWebhook: ProcessPaymentWebhookUseCase,
  ) {}

  async execute(now: Date = new Date()): Promise<{ checked: number; paid: number; failed: number }> {
    const items = await this.findStale.execute({
      payableTypes: ['WALLET_TOPUP', 'APPOINTMENT'],
      olderThan: new Date(now.getTime() - PAYMENT_CONSTANTS.RECONCILE_AFTER_MINUTES * 60 * 1000),
      newerThan: new Date(now.getTime() - PAYMENT_CONSTANTS.RECONCILE_MAX_AGE_HOURS * 60 * 60 * 1000),
      requireInitiatedAttempt: true,
      limit: BATCH_SIZE,
    });
    const summary = { checked: items.length, paid: 0, failed: 0 };
    for (const item of items) {
      const outcome = await this.reconcileOne(item);
      if (outcome === 'PAID') summary.paid += 1;
      if (outcome === 'FAILED') summary.failed += 1;
    }
    return summary;
  }

  /** Reconciles one intent; also used by the stale top-up cleanup before it expires anything. */
  async reconcileOne(item: StalePendingOnlinePayment): Promise<ReconcileOutcome> {
    if (!item.attempt || item.attempt.status !== 'INITIATED') {
      return 'SKIPPED';
    }
    try {
      const inquiry = await this.gateway.queryTransaction(item.attempt.gatewayReference ?? item.attempt.id);
      if ((inquiry.status === 'PAID' || inquiry.status === 'FAILED') && inquiry.event) {
        await this.processWebhook.processVerifiedEvent('paymob', inquiry.rawBody ?? {}, inquiry.event);
      }
      return inquiry.status;
    } catch (error) {
      this.logger.warn({ err: error, paymentIntentId: item.paymentIntentId }, 'Paymob reconciliation failed for an intent; will retry next run');
      return 'ERROR';
    }
  }
}
