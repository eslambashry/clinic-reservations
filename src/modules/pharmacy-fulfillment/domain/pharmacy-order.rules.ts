import { PharmacyOrderStatus } from '@prisma/client';
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
