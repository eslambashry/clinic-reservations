import { Inject, Injectable } from '@nestjs/common';
import { PayableType, Prisma, ProviderType } from '@prisma/client';
import { BusinessRuleError, DomainError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PolicyConfigReader } from '../../../shared/kernel/policy-config/policy-config.reader';
import { REGION_CONSTANTS } from '../../../shared/config/constants';
import { computeCommissionSplit } from '../domain/payment-money.rules';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { PaymentSplitRepository } from '../infrastructure/payment-split.repository';
import { ProviderLedgerRepository } from '../infrastructure/provider-ledger.repository';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';

export interface CaptureInternalWalletPaymentInput {
  payerUserId: string;
  payableType: PayableType;
  payableId: string;
  amount: string;
  currency: string;
  providerType: ProviderType;
  providerId: string;
  idempotencyKey: string;
}

export interface CaptureInternalWalletPaymentResult {
  paymentIntentId: string;
  commissionAmount: string;
  providerAmount: string;
  newWalletBalance: string;
}

/**
 * File 12 Part 50.4: the `INTERNAL_WALLET` sibling of
 * `CapturePayAtClinicPaymentUseCase` — same shape (creates the intent,
 * captures it immediately, writes splits + a ledger entry, all synchronous,
 * no gateway to wait on), but debits the patient's wallet balance instead
 * of trusting a gateway or the clinic's own cash drawer. Ledger entry is
 * `EARNING` (not `COMMISSION_DEDUCTION`) for the same reason as online
 * gateway capture: the platform already holds this money (it arrived at
 * top-up time), so it owes the provider a payout rather than being owed a
 * commission.
 *
 * Takes `tx` explicitly and is called from inside
 * `ConfirmAppointmentUseCase`'s transaction exactly like its pay-at-clinic
 * sibling — the same call site's `AppointmentHold.markConverted` optimistic
 * lock (File 12 Part 36.5) is what guarantees this runs at most once per
 * hold, so double-debit-by-retry is structurally impossible without any
 * extra idempotency logic here.
 *
 * The wallet debit is the FIRST write (before the `PaymentIntent` is even
 * created): if the wallet doesn't have enough balance, nothing else in this
 * use-case — or the caller's appointment-confirmation transaction — should
 * happen. `WalletRepository.debit`'s single conditional
 * `UPDATE ... WHERE balance >= amount` is what makes this safe under
 * concurrent spending (never "read balance, check in application code,
 * write balance" — File 11 Part 11's explicit warning against exactly that
 * pattern).
 */
@Injectable()
export class CaptureInternalWalletPaymentUseCase {
  constructor(
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(PaymentSplitRepository) private readonly paymentSplits: PaymentSplitRepository,
    @Inject(ProviderLedgerRepository) private readonly ledger: ProviderLedgerRepository,
    @Inject(PolicyConfigReader) private readonly policyConfig: PolicyConfigReader,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: CaptureInternalWalletPaymentInput): Promise<CaptureInternalWalletPaymentResult> {
    const wallet = await this.wallets.getOrCreate(tx, input.payerUserId, input.currency);

    const debited = await this.wallets.debit(tx, wallet.id, input.amount);
    if (!debited) {
      throw new BusinessRuleError('INSUFFICIENT_WALLET_BALANCE', 'رصيد المحفظة غير كافٍ لإتمام هذه العملية.', {
        walletId: wallet.id,
        required: input.amount,
      });
    }

    const debitedWallet = await this.wallets.findById(tx, wallet.id);

    const intent = await this.paymentIntents.create(tx, {
      payerUserId: input.payerUserId,
      payableType: input.payableType,
      payableId: input.payableId,
      amount: input.amount,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      method: 'INTERNAL_WALLET',
    });

    const rate = await this.policyConfig.getValue<{ ratePercent: number }>(
      tx,
      REGION_CONSTANTS.DEFAULT_REGION_CODE,
      'COMMISSION_RATE',
    );
    if (rate === null) {
      throw new DomainError(500, 'COMMISSION_RATE_NOT_CONFIGURED', 'نسبة العمولة غير مُهيّأة لهذه المنطقة. تواصل مع الدعم.');
    }
    const split = computeCommissionSplit({ amount: input.amount, commissionRatePercent: rate.ratePercent });

    const captured = await this.paymentIntents.markCaptured(tx, intent.id, intent.version);
    if (!captured) {
      throw new DomainError(500, 'PAYMENT_CAPTURE_FAILED', 'تعذّر تحصيل الدفعة. أعد المحاولة.', { paymentIntentId: intent.id });
    }

    await this.paymentSplits.create(tx, {
      paymentIntentId: intent.id,
      payeeType: 'PLATFORM',
      amount: split.platformAmount,
      type: 'COMMISSION',
    });
    await this.paymentSplits.create(tx, {
      paymentIntentId: intent.id,
      payeeType: 'PROVIDER',
      payeeId: input.providerId,
      amount: split.providerAmount,
      type: 'PROVIDER_SHARE',
    });
    await this.ledger.create(tx, {
      providerType: input.providerType,
      providerId: input.providerId,
      entryType: 'EARNING',
      amount: split.providerAmount,
      relatedPaymentIntentId: intent.id,
    });

    await this.walletTransactions.create(tx, {
      walletId: wallet.id,
      type: 'APPOINTMENT_PAYMENT',
      status: 'COMPLETED',
      amount: input.amount,
      resultingBalance: debitedWallet!.balance.toFixed(2),
      paymentIntentId: intent.id,
      appointmentId: input.payableId,
    });

    await this.outbox.emit(tx, 'PaymentCaptured', {
      paymentIntentId: intent.id,
      payableType: input.payableType,
      payableId: input.payableId,
      amount: input.amount,
      currency: input.currency,
      method: 'INTERNAL_WALLET',
    });

    return {
      paymentIntentId: intent.id,
      commissionAmount: split.platformAmount,
      providerAmount: split.providerAmount,
      newWalletBalance: debitedWallet!.balance.toFixed(2),
    };
  }
}
