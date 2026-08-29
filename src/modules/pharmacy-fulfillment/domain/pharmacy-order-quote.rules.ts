import { PharmacyOrderItemStatus } from '@prisma/client';
import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';

export interface QuotedItem {
  status: PharmacyOrderItemStatus;
  /** The drug code this item will actually be dispensed as — the substitute's code for `SUBSTITUTED`, the original for everything else. */
  effectiveDrugCode: string;
}

/**
 * File 10 line 193's example shows `unitPrice` present on every item, but
 * that only makes sense for a dispensable one — an `UNAVAILABLE` item has
 * nothing to price. Interpreted here as: required for `AVAILABLE`/
 * `SUBSTITUTED`, irrelevant (and ignored) for `UNAVAILABLE`.
 */
export function assertValidQuoteItemInput(item: { status: PharmacyOrderItemStatus; substituteDrugCode?: string; unitPrice?: string }): void {
  if (item.status !== 'UNAVAILABLE' && !item.unitPrice) {
    throw new BusinessRuleError('UNIT_PRICE_REQUIRED', `unitPrice is required for a ${item.status} item.`);
  }
  if (item.status === 'SUBSTITUTED' && !item.substituteDrugCode) {
    throw new BusinessRuleError('SUBSTITUTE_DRUG_CODE_REQUIRED', 'substituteDrugCode is required for a SUBSTITUTED item.');
  }
}

/**
 * File 10 lines 191-195: `/quote`'s documented response only ever names
 * `ACCEPTED`/`SUBSTITUTION_PROPOSED` — never `REJECTED`. So "pharmacist
 * rejects the whole order outright" (`UNDER_REVIEW --> REJECTED`, File 11
 * Part 14) has no path through this endpoint; the all-unavailable case is a
 * business-rule error instead, same "left unproduced" precedent already
 * used for other diagram states with no documented trigger (Part 35.1).
 */
export function resolveQuoteOutcome(items: { status: PharmacyOrderItemStatus }[]): 'ACCEPTED' | 'SUBSTITUTION_PROPOSED' {
  if (items.every((item) => item.status === 'UNAVAILABLE')) {
    throw new BusinessRuleError('NO_ITEMS_AVAILABLE', 'None of this order\'s items are available — nothing can be fulfilled.');
  }
  return items.some((item) => item.status === 'SUBSTITUTED') ? 'SUBSTITUTION_PROPOSED' : 'ACCEPTED';
}

/**
 * File 10 line 541: a pharmacy-side re-confirmation, distinct from Phase
 * 6's review-time check (`prescriptions/domain/prescription-review.rules.ts`)
 * — the dispensing branch must explicitly confirm before quoting a
 * controlled substance, whether it's the prescription's original drug or
 * one the pharmacist is proposing as a substitute.
 */
export function requiresControlledSubstanceConfirmationForQuote(items: QuotedItem[], controlledByCode: Map<string, boolean>): boolean {
  return items.some((item) => item.status !== 'UNAVAILABLE' && (controlledByCode.get(item.effectiveDrugCode) ?? false));
}

/**
 * Shared by the quote response's `totalPrice` and the approve step's
 * payment-capture amount (File 12 Part 39) — both must compute the same
 * number from the same source (the persisted `PharmacyOrderItem` rows'
 * `unitPrice`/`quantity`), never two independent calculations that could
 * silently drift apart. `UNAVAILABLE` items contribute nothing.
 */
export function computeOrderTotal(items: { status: PharmacyOrderItemStatus; unitPrice: string | null; quantity: number }[]): string {
  let total = 0;
  for (const item of items) {
    if (item.status !== 'UNAVAILABLE' && item.unitPrice) {
      total += Number(item.unitPrice) * item.quantity;
    }
  }
  return total.toFixed(2);
}
