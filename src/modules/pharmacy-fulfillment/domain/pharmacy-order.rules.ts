import { FulfillmentType, PharmacyOrderStatus } from '@prisma/client';
import { BusinessRuleError, ConflictError } from '../../../shared/core/errors/domain-errors';

/** File 11 Part 14: an order is "done" once `REJECTED` or `FULFILLED` — any other status is still active. */
const TERMINAL_STATUSES: PharmacyOrderStatus[] = ['REJECTED', 'FULFILLED'];

export function isActiveOrderStatus(status: PharmacyOrderStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

/** File 12 Part 39: a prescription may only ever have one active `PharmacyOrder` at a time. */
export function assertNoActiveOrderExists(existing: { status: PharmacyOrderStatus } | null): void {
  if (existing && isActiveOrderStatus(existing.status)) {
    throw new ConflictError('PHARMACY_ORDER_ALREADY_EXISTS', 'This prescription already has an active pharmacy order.');
  }
}

/** File 12 Part 39.3: an order needs at least one drugCode+quantity-bearing prescription item to be worth creating. */
export function assertHasFulfillableItems(items: unknown[]): void {
  if (items.length === 0) {
    throw new BusinessRuleError('NO_FULFILLABLE_ITEMS', 'This prescription has no items a pharmacy order can be built from.');
  }
}

/**
 * 2026-08-29 addition: `fulfill`/`complete` post-payment progression.
 * `DELIVERED` is deliberately not a step here — `docs/PROPOSED_CONTRACT.md`
 * §2's own documented fallback is taken ("let `completeOrder()` accept
 * `OUT_FOR_DELIVERY` directly") rather than adding a schema enum value File
 * 12 Part 39.6 already flagged as the highest-risk item after the quote
 * narrowing itself.
 */
export function nextStatusAfterFulfill(fulfillmentType: FulfillmentType): PharmacyOrderStatus {
  return fulfillmentType === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'READY_FOR_PICKUP';
}

export function assertOrderIsPaid(status: PharmacyOrderStatus): void {
  if (status !== 'PAID') {
    throw new BusinessRuleError('PHARMACY_ORDER_NOT_PAID', 'This order has not been paid for yet.');
  }
}

const FULFILLED_FROM_STATUSES: PharmacyOrderStatus[] = ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

export function assertOrderIsReadyToComplete(status: PharmacyOrderStatus): void {
  if (!FULFILLED_FROM_STATUSES.includes(status)) {
    throw new BusinessRuleError('PHARMACY_ORDER_NOT_READY_TO_COMPLETE', 'This order is not ready to be marked complete.');
  }
}
