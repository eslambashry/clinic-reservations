import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { computeCancellationFeeSplit, computeProportionalCommissionReversal } from '../domain/payment-money.rules';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { ProviderLedgerRepository } from '../infrastructure/provider-ledger.repository';
import { RefundRepository } from '../infrastructure/refund.repository';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';

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
 *
 * File 12 Part 50.7: when the intent being refunded was paid with
 * `INTERNAL_WALLET`, the refund credits the wallet back — through a new
 * `WalletTransaction` (type `REFUND`), never by writing `Wallet.balance`
 * directly — in the same transaction. For every other method (pay-at-clinic,
 * card, Fawry, mobile wallet) this only records the `Refund` row exactly as
 * before; an actual gateway refund call for those methods is a genuine
 * product decision this repository doesn't define anywhere (no refund
 * endpoint/business rule exists for online gateway methods yet), so it is
 * deliberately NOT invented here — see `README.md`'s "Known limitations."
 */
@Injectable()
export class ProcessCancellationRefundUseCase {
  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(RefundRepository) private readonly refunds: RefundRepository,
    @Inject(ProviderLedgerRepository) private readonly ledger: ProviderLedgerRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: ProcessCancellationRefundInput): Promise<ProcessCancellationRefundResult> {
    const intent = await this.paymentIntents.findById(tx, input.paymentIntentId);
    if (!intent) {
      throw new NotFoundError('PaymentIntent', input.paymentIntentId);
    }
    if (intent.status !== 'CAPTURED') {
      throw new BusinessRuleError('PAYMENT_INTENT_NOT_REFUNDABLE', 'لا يمكن استرداد مبلغ لم يتم تحصيله.', {
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
      throw new ConflictError('PAYMENT_INTENT_STATE_CHANGED', 'تم تعديل عملية الدفع من جهة أخرى. حدّث الصفحة ثم أعد المحاولة.', {
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

    if (intent.method === 'INTERNAL_WALLET' && parseFloat(refundAmount) > 0) {
      const walletTransaction = await this.walletTransactions.findByPaymentIntentId(tx, intent.id);
      if (walletTransaction) {
        const wallet = await this.wallets.credit(tx, walletTransaction.wallet_id, refundAmount);
        await this.walletTransactions.create(tx, {
          walletId: wallet.id,
          type: 'REFUND',
          status: 'COMPLETED',
          amount: refundAmount,
          resultingBalance: wallet.balance.toFixed(2),
          paymentIntentId: intent.id,
          appointmentId: walletTransaction.appointment_id ?? undefined,
        });
      }
    }

    await this.outbox.emit(tx, 'RefundIssued', { paymentIntentId: intent.id, refundAmount, feeApplied });

    return { refundAmount, feeApplied };
  }
}
