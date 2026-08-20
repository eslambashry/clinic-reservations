import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { computeCancellationFeeSplit, computeProportionalCommissionReversal } from '../domain/payment-money.rules';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { ProviderLedgerRepository } from '../infrastructure/provider-ledger.repository';
import { RefundRepository } from '../infrastructure/refund.repository';

export interface ProcessCancellationRefundInput {
  paymentIntentId: string;
  feePercent: number;
}

export interface ProcessCancellationRefundResult {
  refundAmount: string;
  feeApplied: string;
}

/**
 * File 10 §5.1: refunds always reference a `payment_intents` row; partial
 * refunds are supported. Takes `tx: Prisma.TransactionClient` explicitly for
 * the same reason as `CapturePayAtClinicPaymentUseCase` — must commit inside
 * the same transaction as `appointments.status → CANCELLED`.
 */
@Injectable()
export class ProcessCancellationRefundUseCase {
  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(RefundRepository) private readonly refunds: RefundRepository,
    @Inject(ProviderLedgerRepository) private readonly ledger: ProviderLedgerRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: ProcessCancellationRefundInput): Promise<ProcessCancellationRefundResult> {
    const intent = await this.paymentIntents.findById(tx, input.paymentIntentId);
    if (!intent) {
      throw new NotFoundError('PaymentIntent', input.paymentIntentId);
    }
    if (intent.status !== 'CAPTURED') {
      throw new BusinessRuleError('PAYMENT_INTENT_NOT_REFUNDABLE', 'Only a captured payment can be refunded.', {
        status: intent.status,
      });
    }

    const { feeApplied, refundAmount } = computeCancellationFeeSplit({
      capturedAmount: intent.amount.toString(),
      feePercent: input.feePercent,
    });
    const newStatus = feeApplied === '0.00' ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const updated = await this.paymentIntents.markRefunded(tx, intent.id, intent.version, newStatus);
    if (!updated) {
      throw new ConflictError('PAYMENT_INTENT_STATE_CHANGED', 'This payment was modified concurrently.', {
        paymentIntentId: intent.id,
      });
    }

    // Written as COMPLETED immediately, not REQUESTED/PROCESSING (File 12
    // Part 36.9) — no gateway to wait on, same reasoning as capture
    // skipping AUTHORIZED for pay-at-clinic.
    await this.refunds.create(tx, {
      paymentIntentId: intent.id,
      amount: refundAmount,
      reason: 'APPOINTMENT_CANCELLED',
      status: 'COMPLETED',
    });

    const ledgerEntries = await this.ledger.findByRelatedPaymentIntentId(tx, intent.id);
    const commissionEntry = ledgerEntries.find((entry) => entry.entry_type === 'COMMISSION_DEDUCTION');
    if (commissionEntry) {
      const reversal = computeProportionalCommissionReversal({
        originalCommission: commissionEntry.amount.toString(),
        capturedAmount: intent.amount.toString(),
        refundAmount,
      });
      await this.ledger.create(tx, {
        providerType: commissionEntry.provider_type,
        providerId: commissionEntry.provider_id,
        entryType: 'ADJUSTMENT',
        amount: reversal,
        relatedPaymentIntentId: intent.id,
      });
    }

    await this.outbox.emit(tx, 'RefundIssued', { paymentIntentId: intent.id, refundAmount, feeApplied });

    return { refundAmount, feeApplied };
  }
}
