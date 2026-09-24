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
export function assertCanCreatePharmacyOrder(items: unknown[], imageCount: number): void {
  // The pharmacy console prices from the prescription image, and OCR is
  // explicitly optional. A valid uploaded image is therefore fulfillable
  // even when no structured item was confidently extracted.
  if (items.length === 0 && imageCount === 0) {
    throw new BusinessRuleError('PRESCRIPTION_HAS_NO_CONTENT', 'أضف دواءً أو أرفق صورة للروشتة قبل إرسالها للصيدلية.');
  }
}

/**
 * `fulfill`/`complete` staff-driven progression after the pharmacy has priced
 * the order. `PAID` and `PREPARING` are accepted only for legacy rows created
 * before the current direct-from-pricing workflow.
 * `DELIVERED` is deliberately not a step here — `docs/PROPOSED_CONTRACT.md`
 * §2's own documented fallback is taken ("let `completeOrder()` accept
 * `OUT_FOR_DELIVERY` directly") rather than adding a schema enum value File
 * 12 Part 39.6 already flagged as the highest-risk item after the quote
 * narrowing itself.
 */
export function nextStatusAfterFulfill(fulfillmentType: FulfillmentType): PharmacyOrderStatus {
  return fulfillmentType === 'PICKUP' ? 'READY_FOR_PICKUP' : 'OUT_FOR_DELIVERY';
}

export function assertOrderCanBeginFulfillment(status: PharmacyOrderStatus): void {
  if (status !== 'ACCEPTED' && status !== 'PAID' && status !== 'PREPARING') {
    throw new BusinessRuleError(
      'PHARMACY_ORDER_NOT_READY_FOR_FULFILLMENT',
      'لا يمكن بدء تنفيذ هذا الطلب قبل تسعيره.',
    );
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
