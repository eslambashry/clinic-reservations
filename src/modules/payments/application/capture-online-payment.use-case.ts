import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProviderType } from '@prisma/client';
import { DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PolicyConfigReader } from '../../../shared/kernel/policy-config/policy-config.reader';
import { REGION_CONSTANTS } from '../../../shared/config/constants';
import { computeCommissionSplit } from '../domain/payment-money.rules';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { PaymentSplitRepository } from '../infrastructure/payment-split.repository';
import { ProviderLedgerRepository } from '../infrastructure/provider-ledger.repository';

export interface CaptureOnlinePaymentInput {
  paymentIntentId: string;
  providerType: ProviderType;
  providerId: string;
}

export interface CaptureOnlinePaymentResult {
  commissionAmount: string;
  providerAmount: string;
}

/**
 * File 12 Part 50: the webhook-driven counterpart to
 * `CapturePayAtClinicPaymentUseCase`, for a `PaymentIntent` that already
 * exists (created at `InitiateOnlinePaymentUseCase` time) rather than one
 * created here. The one substantive difference from the pay-at-clinic
 * ledger entry: `EARNING`, not `COMMISSION_DEDUCTION` — an online gateway
 * payment means the *platform* now holds the money (Paymob settles to the
 * platform's account), so the ledger has to record what the platform owes
 * the provider (an `EARNING`, paid out later), the mirror image of
 * pay-at-clinic's "provider holds the cash, owes the platform a
 * commission" (File 12 Part 36.6).
 *
 * Only ever called after the caller has independently verified (a) the
 * gateway webhook's signature and (b) — for an `APPOINTMENT` payable — that
 * the associated hold is still `ACTIVE` and unexpired, inside the SAME
 * transaction as that hold's atomic conversion (File 11 Part 11). This
 * use-case itself only re-asserts the intent's own state machine
 * (`CREATED→CAPTURED`), not the hold.
 */
@Injectable()
export class CaptureOnlinePaymentUseCase {
  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(PaymentSplitRepository) private readonly paymentSplits: PaymentSplitRepository,
    @Inject(ProviderLedgerRepository) private readonly ledger: ProviderLedgerRepository,
    @Inject(PolicyConfigReader) private readonly policyConfig: PolicyConfigReader,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: CaptureOnlinePaymentInput): Promise<CaptureOnlinePaymentResult> {
    const intent = await this.paymentIntents.findById(tx, input.paymentIntentId);
    if (!intent) {
      throw new NotFoundError('PaymentIntent', input.paymentIntentId);
    }

    const rate = await this.policyConfig.getValue<{ ratePercent: number }>(
      tx,
      REGION_CONSTANTS.DEFAULT_REGION_CODE,
      'COMMISSION_RATE',
    );
    if (rate === null) {
      throw new DomainError(500, 'COMMISSION_RATE_NOT_CONFIGURED', 'نسبة العمولة غير مُهيّأة لهذه المنطقة. تواصل مع الدعم.');
    }

    const split = computeCommissionSplit({ amount: intent.amount.toString(), commissionRatePercent: rate.ratePercent });

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

    await this.outbox.emit(tx, 'PaymentCaptured', {
      paymentIntentId: intent.id,
      payableType: intent.payable_type,
      payableId: intent.payable_id,
      amount: intent.amount.toString(),
      currency: intent.currency,
      method: intent.method,
    });

    return { commissionAmount: split.platformAmount, providerAmount: split.providerAmount };
  }
}
