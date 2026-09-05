import { LabOrderStatus } from '@prisma/client';
import { BusinessRuleError, ConflictError } from '../../../shared/core/errors/domain-errors';
import { CustodyEventType } from './custody-action.util';

/**
 * Direct ports of `medsuper-laboratory-dashboard/src/lib/utils/custody.ts`'s
 * derivations — same logic, now evaluated over real `audit_logs` rows
 * (ordered oldest-first, matching how the mock's `custodyEvents` array is
 * appended to) instead of an in-memory array. Kept framework-free (File 12
 * Part 05) so these can be unit-tested without Prisma/Nest at all.
 */

export interface CustodyEventLike {
  type: CustodyEventType;
}

/** Index of the latest sample issue (rejection / recollection request), or -1. */
export function lastBlockingIssueIndex(events: CustodyEventLike[]): number {
  let idx = -1;
  events.forEach((e, i) => {
    if (e.type === 'SAMPLE_REJECTED' || e.type === 'RECOLLECTION_REQUESTED') idx = i;
  });
  return idx;
}

export function hasCustodyEventAfter(events: CustodyEventLike[], types: CustodyEventType[]): boolean {
  const after = lastBlockingIssueIndex(events);
  return events.some((e, i) => i > after && types.includes(e.type));
}

/** A live sample exists (collected, and not rejected/recycled since). */
export function hasLiveSample(events: CustodyEventLike[]): boolean {
  return hasCustodyEventAfter(events, ['SAMPLE_COLLECTED']);
}

/** VISIT: patient physically arrived. HOME: courier dispatched. */
export function collectionGateSatisfied(events: CustodyEventLike[], collectionType: 'VISIT' | 'HOME_COLLECTION'): boolean {
  return collectionType === 'HOME_COLLECTION' ? hasCustodyEventAfter(events, ['IN_TRANSIT']) : hasCustodyEventAfter(events, ['ARRIVAL_CONFIRMED']);
}

export function assertStatus(status: LabOrderStatus, expected: LabOrderStatus, code: string, message: string): void {
  if (status !== expected) {
    throw new BusinessRuleError(code, message);
  }
}

export function assertStatusIn(status: LabOrderStatus, expected: LabOrderStatus[], code: string, message: string): void {
  if (!expected.includes(status)) {
    throw new BusinessRuleError(code, message);
  }
}

const REJECTABLE_STATUSES: LabOrderStatus[] = ['REQUESTED', 'QUOTED', 'AWAITING_SAMPLE'];

/** Mirrors the mock's `rejectOrder` guard: blocked once analysis has started, terminal, or a live sample exists. */
export function assertOrderIsRejectable(status: LabOrderStatus, hasLive: boolean): void {
  if (!REJECTABLE_STATUSES.includes(status) || hasLive) {
    throw new BusinessRuleError('LAB_ORDER_NOT_REJECTABLE', 'انتهت المهلة التي يمكن فيها رفض هذا الطلب.');
  }
}

export function assertNoLiveSample(hasLive: boolean, code = 'LAB_ORDER_SAMPLE_ALREADY_LIVE', message = 'توجد عيّنة مرتبطة بهذا الطلب بالفعل.'): void {
  if (hasLive) {
    throw new ConflictError(code, message);
  }
}

export function assertHasLiveSample(hasLive: boolean): void {
  if (!hasLive) {
    throw new BusinessRuleError('LAB_ORDER_NO_LIVE_SAMPLE', 'لا توجد عيّنة صالحة بعد آخر رفض.');
  }
}

export function assertCollectionGateSatisfied(satisfied: boolean): void {
  if (!satisfied) {
    throw new BusinessRuleError('LAB_ORDER_COLLECTION_GATE_NOT_SATISFIED', 'سجّل وصول المريض أو أرسل المندوب قبل سحب العيّنة.');
  }
}

export function assertRecollectionRequired(required: boolean): void {
  if (!required) {
    throw new BusinessRuleError('LAB_ORDER_RECOLLECTION_NOT_REQUIRED', 'إعادة السحب متاحة فقط بعد رفض عيّنة.');
  }
}

/** Mirrors `recordResultDelivery`'s guard: every result must have gone through the human critical/non-critical call first. */
export function assertNoPendingReview(hasPending: boolean): void {
  if (hasPending) {
    throw new BusinessRuleError('LAB_ORDER_RESULTS_PENDING_REVIEW', 'حدّد الحالة الحرجة لكل نتيجة قبل توثيق التسليم.');
  }
}

export function assertFutureInstant(iso: string, code: string, message: string): void {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms <= Date.now()) {
    throw new BusinessRuleError(code, message);
  }
}
