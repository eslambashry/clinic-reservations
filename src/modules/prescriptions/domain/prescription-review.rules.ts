import { PrescriptionReviewDecision, PrescriptionStatus } from '@prisma/client';

export interface ReviewedItem {
  drugCode: string | null;
  isControlledSubstance: boolean;
}

/**
 * File 10 §7.3: "anything involving a controlled substance always routes to
 * UNDER_REVIEW with a mandatory pharmacist ... stamp" — the hard block this
 * enforces is that a review decision touching a controlled-substance item
 * must explicitly confirm it, never silently pass through.
 */
export function requiresControlledSubstanceConfirmation(items: ReviewedItem[]): boolean {
  return items.some((item) => item.drugCode !== null && item.isControlledSubstance);
}

/**
 * File 12 Part 37.1: the actual PrescriptionStatus enum has no
 * UNDER_REVIEW/NEEDS_CLARIFICATION value — a NEEDS_CLARIFICATION decision
 * leaves the prescription's status unchanged (still QUALITY_CHECK_PASSED,
 * awaiting a later final decision); only ACCEPTED/REJECTED actually move it.
 */
export function resolvePrescriptionStatus(
  currentStatus: PrescriptionStatus,
  decision: PrescriptionReviewDecision,
): PrescriptionStatus {
  if (decision === 'ACCEPTED') {
    return 'ACCEPTED';
  }
  if (decision === 'REJECTED') {
    return 'REJECTED';
  }
  return currentStatus;
}
