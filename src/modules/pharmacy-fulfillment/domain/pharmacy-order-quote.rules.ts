import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';

/**
 * 2026-08-29 decision (File 12 Part 39 follow-up): the quote is a single
 * flat total the pharmacist types after reading the prescription image —
 * `medsuper-pharmacy-dashboard`'s "this console holds no drug data" product
 * decision took priority over the original item-by-item quote contract
 * (File 10 lines 191-195), which required a `unitPrice` per
 * `PharmacyOrderItem`. The current workflow sends only the price and an
 * optional note; fulfillment timing is represented by order status updates.
 */
export function assertValidFlatQuoteInput(input: { totalPrice: string }): void {
  if (!(Number(input.totalPrice) > 0)) {
    throw new BusinessRuleError('INVALID_TOTAL_PRICE', 'الإجمالي يجب أن يكون أكبر من صفر.');
  }
}
