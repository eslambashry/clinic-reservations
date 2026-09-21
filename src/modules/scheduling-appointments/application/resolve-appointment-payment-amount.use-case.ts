import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeRemainingBalance, findPartialPaymentViolation } from '../../payments/domain/payment-money.rules';
import { REGION_CONSTANTS } from '../../../shared/config/constants';
import { BusinessRuleError, DomainError } from '../../../shared/core/errors/domain-errors';
import { PolicyConfigReader } from '../../../shared/kernel/policy-config/policy-config.reader';

export interface ResolvedAppointmentPayment {
  /** What is actually charged/captured — the ONLY amount the gateway/wallet ever sees. */
  paymentAmount: string;
  /** The doctor's full consult fee, read server-side — the client never supplies it. */
  fullAmount: string;
  remainingBalance: string;
}

/**
 * Single place the "pay any amount from 50 EGP up to the consult fee" rule
 * is enforced, shared by the online (`InitiateOnlineAppointmentPaymentUseCase`)
 * and internal-wallet (`ConfirmAppointmentUseCase`) entry points. The
 * client only ever proposes `requestedAmount`; the fee and the minimum come
 * from the server. Omitted `requestedAmount` = pay in full (the behavior
 * before this feature existed), which never needs the policy read.
 */
@Injectable()
export class ResolveAppointmentPaymentAmountUseCase {
  constructor(@Inject(PolicyConfigReader) private readonly policyConfig: PolicyConfigReader) {}

  async execute(tx: Prisma.TransactionClient, input: { requestedAmount?: string; consultFee: string }): Promise<ResolvedAppointmentPayment> {
    const fullAmount = Number(input.consultFee).toFixed(2);

    if (input.requestedAmount === undefined || Number(input.requestedAmount) === Number(fullAmount)) {
      return { paymentAmount: fullAmount, fullAmount, remainingBalance: '0.00' };
    }

    const policy = await this.policyConfig.getValue<{ minAmount: string }>(
      tx,
      REGION_CONSTANTS.DEFAULT_REGION_CODE,
      'MIN_APPOINTMENT_PAYMENT',
    );
    // A missing OR malformed value (no minAmount, "abc", "0", negative, more
    // than 2 decimals) counts as not configured — never silently skips the
    // minimum check (a NaN minimum would otherwise let any amount through).
    const minAmount: unknown = policy?.minAmount;
    if (typeof minAmount !== 'string' || !/^\d+(\.\d{1,2})?$/.test(minAmount) || Number(minAmount) <= 0) {
      throw new DomainError(500, 'MIN_APPOINTMENT_PAYMENT_NOT_CONFIGURED', 'الحد الأدنى للدفع غير مُهيّأ لهذه المنطقة. تواصل مع الدعم.');
    }

    const violation = findPartialPaymentViolation({
      requestedAmount: input.requestedAmount,
      fullAmount,
      minAmount,
    });
    if (violation === 'BELOW_MINIMUM') {
      throw new BusinessRuleError('PAYMENT_AMOUNT_BELOW_MINIMUM', 'المبلغ أقل من الحد الأدنى المسموح به للدفع.', {
        minAmount,
      });
    }
    if (violation === 'EXCEEDS_FULL_AMOUNT') {
      throw new BusinessRuleError('PAYMENT_AMOUNT_EXCEEDS_FEE', 'المبلغ أكبر من قيمة الكشف.', { fullAmount });
    }
    if (violation === 'INVALID') {
      throw new BusinessRuleError('PAYMENT_AMOUNT_INVALID', 'مبلغ الدفع غير صالح.');
    }

    const paymentAmount = Number(input.requestedAmount).toFixed(2);
    return { paymentAmount, fullAmount, remainingBalance: computeRemainingBalance(fullAmount, paymentAmount) };
  }
}
