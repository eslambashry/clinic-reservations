import { Inject, Injectable } from '@nestjs/common';
import { PayableType, Prisma, ProviderType } from '@prisma/client';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PolicyConfigReader } from '../../../shared/kernel/policy-config/policy-config.reader';
import { REGION_CONSTANTS } from '../../../shared/config/constants';
import { computeCommissionSplit } from '../domain/payment-money.rules';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { PaymentSplitRepository } from '../infrastructure/payment-split.repository';
import { ProviderLedgerRepository } from '../infrastructure/provider-ledger.repository';

export interface CapturePayAtClinicPaymentInput {
  payerUserId: string;
  payableType: PayableType;
  payableId: string;
  amount: string;
  currency: string;
  providerType: ProviderType;
  providerId: string;
  idempotencyKey: string;
}

export interface CapturePayAtClinicPaymentResult {
  paymentIntentId: string;
  commissionAmount: string;
  providerAmount: string;
}

/**
 * File 10 §5.1: pay-at-clinic does not create a `payment_intents` row with a
 * real gateway reference — it creates one and immediately progresses
 * `CREATED → CAPTURED` (representing "payment obligation acknowledged," not
 * "money moved electronically"), and a `provider_ledger_entries` row
 * records the commission owed to the platform regardless.
 *
 * File 12 Part 36.3: takes `tx: Prisma.TransactionClient` explicitly instead
 * of opening its own `$transaction` — the one deliberate deviation from
 * every other exported cross-module use-case in this codebase, required
 * because `appointments.status → CONFIRMED` and `payment_intents.status →
 * CAPTURED` must commit in one transaction, never two separate commits
 * (File 11 Part 11).
 */
@Injectable()
export class CapturePayAtClinicPaymentUseCase {
  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(PaymentSplitRepository) private readonly paymentSplits: PaymentSplitRepository,
    @Inject(ProviderLedgerRepository) private readonly ledger: ProviderLedgerRepository,
    @Inject(PolicyConfigReader) private readonly policyConfig: PolicyConfigReader,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: CapturePayAtClinicPaymentInput): Promise<CapturePayAtClinicPaymentResult> {
    const intent = await this.paymentIntents.create(tx, {
      payerUserId: input.payerUserId,
      payableType: input.payableType,
      payableId: input.payableId,
      amount: input.amount,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
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

    // COMMISSION_DEDUCTION, not EARNING (File 12 Part 36.6): pay-at-clinic
    // means the provider already physically holds 100% of the cash — the
    // platform never held it — so the ledger only needs to record what the
    // provider owes the platform, not a payout the platform owes them.
    await this.ledger.create(tx, {
      providerType: input.providerType,
      providerId: input.providerId,
      entryType: 'COMMISSION_DEDUCTION',
      amount: split.platformAmount,
      relatedPaymentIntentId: intent.id,
    });

    await this.outbox.emit(tx, 'PaymentCaptured', {
      paymentIntentId: intent.id,
      payableType: input.payableType,
      payableId: input.payableId,
      amount: input.amount,
      currency: input.currency,
    });

    return { paymentIntentId: intent.id, commissionAmount: split.platformAmount, providerAmount: split.providerAmount };
  }
}
