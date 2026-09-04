import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';

/**
 * 2026-08-29 decision (File 12 Part 39 follow-up): the quote is a single
 * flat total the pharmacist types after reading the prescription image —
 * `medsuper-pharmacy-dashboard`'s "this console holds no drug data" product
 * decision took priority over the original item-by-item quote contract
 * (File 10 lines 191-195), which required a `unitPrice` per
 * `PharmacyOrderItem`. `docs/PROPOSED_CONTRACT.md` §1's bounds are
 * reused verbatim — they were already the dashboard's own validated range.
 */
export const QUOTE_ESTIMATED_READY_MINUTES_MIN = 5;
export const QUOTE_ESTIMATED_READY_MINUTES_MAX = 480;

export function assertValidFlatQuoteInput(input: { totalPrice: string; estimatedReadyMinutes: number }): void {
  if (!(Number(input.totalPrice) > 0)) {
    throw new BusinessRuleError('INVALID_TOTAL_PRICE', 'الإجمالي يجب أن يكون أكبر من صفر.');
  }
  if (
    !Number.isInteger(input.estimatedReadyMinutes) ||
    input.estimatedReadyMinutes < QUOTE_ESTIMATED_READY_MINUTES_MIN ||
    input.estimatedReadyMinutes > QUOTE_ESTIMATED_READY_MINUTES_MAX
  ) {
    throw new BusinessRuleError(
      'INVALID_ESTIMATED_READY_MINUTES',
      `مدة التجهيز المتوقّعة يجب أن تكون بين ${QUOTE_ESTIMATED_READY_MINUTES_MIN} و${QUOTE_ESTIMATED_READY_MINUTES_MAX} دقيقة.`,
    );
  }
}
