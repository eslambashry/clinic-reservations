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
    throw new ConflictError('PHARMACY_ORDER_ALREADY_EXISTS', 'يوجد طلب صيدلية نشِط لهذه الروشتة بالفعل.');
  }
}

/** File 12 Part 39.3/44: an order needs at least one fulfillable (quantity-bearing) prescription item to be worth creating. */
export function assertHasFulfillableItems(items: unknown[]): void {
  if (items.length === 0) {
    throw new BusinessRuleError('NO_FULFILLABLE_ITEMS', 'لا توجد أصناف قابلة للصرف في هذه الروشتة.');
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
    throw new BusinessRuleError('PHARMACY_ORDER_NOT_PAID', 'لم يتم دفع هذا الطلب بعد.');
  }
}

const FULFILLED_FROM_STATUSES: PharmacyOrderStatus[] = ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

export function assertOrderIsReadyToComplete(status: PharmacyOrderStatus): void {
  if (!FULFILLED_FROM_STATUSES.includes(status)) {
    throw new BusinessRuleError('PHARMACY_ORDER_NOT_READY_TO_COMPLETE', 'هذا الطلب غير جاهز ليُسجّل كمكتمل.');
  }
}

/**
 * 2026-09-04 addition: patient-triggered `confirm-receipt`, `OUT_FOR_DELIVERY`
 * only — `READY_FOR_PICKUP` stays staff-only via `complete` (the pharmacy
 * hands the order over in person and can mark it fulfilled itself; nobody on
 * the pharmacy side is present when a home delivery actually arrives, so the
 * patient is the only party who can trigger this hop).
 */
export function assertOrderIsOutForDelivery(status: PharmacyOrderStatus): void {
  if (status !== 'OUT_FOR_DELIVERY') {
    throw new BusinessRuleError('PHARMACY_ORDER_NOT_OUT_FOR_DELIVERY', 'هذا الطلب ليس في الطريق للتوصيل حاليًا.');
  }
}
