/**
 * Money arithmetic for the pay-at-clinic ledger, in integer cents rather
 * than `Prisma.Decimal` or floats (File 12 Part 36.7). `domain/` stays
 * framework-free (File 12 Part 05) — no `@prisma/client` import here — and
 * no money-math precedent exists elsewhere in this codebase to follow, so
 * cents-integer math sidesteps float-precision risk without adding a
 * `decimal.js` dependency for one well-scoped need.
 */

/** Exported for `RecordProviderPayoutUseCase`/`GetProviderOutstandingBalanceUseCase` — same float-precision reasoning, reused rather than reimplemented. */
export function toCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface CommissionSplitInput {
  amount: string;
  commissionRatePercent: number;
}

export interface CommissionSplitResult {
  platformAmount: string;
  providerAmount: string;
}

/** File 11 Part 13: commission computed at capture time from the rate in effect then, never recalculated later. */
export function computeCommissionSplit(input: CommissionSplitInput): CommissionSplitResult {
  const totalCents = toCents(input.amount);
  const platformCents = Math.round((totalCents * input.commissionRatePercent) / 100);
  return { platformAmount: fromCents(platformCents), providerAmount: fromCents(totalCents - platformCents) };
}

export interface CancellationFeeSplitInput {
  capturedAmount: string;
  feePercent: number;
}

export interface CancellationFeeSplitResult {
  feeApplied: string;
  refundAmount: string;
}

/** File 11 Part 12: cancellation fee computed server-side from the captured amount, never client-trusted. */
export function computeCancellationFeeSplit(input: CancellationFeeSplitInput): CancellationFeeSplitResult {
  const totalCents = toCents(input.capturedAmount);
  const feeCents = Math.round((totalCents * input.feePercent) / 100);
  return { feeApplied: fromCents(feeCents), refundAmount: fromCents(totalCents - feeCents) };
}

export interface ProportionalReversalInput {
  originalCommission: string;
  capturedAmount: string;
  refundAmount: string;
}

/**
 * Negative — represents a reduction against the `COMMISSION_DEDUCTION` entry
 * written at capture time, proportional to how much of the captured amount
 * is being refunded (a full refund reverses the full commission; a partial
 * refund reverses the matching share).
 */
export function computeProportionalCommissionReversal(input: ProportionalReversalInput): string {
  const capturedCents = toCents(input.capturedAmount);
  if (capturedCents === 0) {
    return '0.00';
  }
  const reversalCents = Math.round((toCents(input.originalCommission) * toCents(input.refundAmount)) / capturedCents);
  return fromCents(-reversalCents);
}

export interface PartialPaymentInput {
  requestedAmount: string;
  fullAmount: string;
  minAmount: string;
}

export type PartialPaymentViolation = 'INVALID' | 'BELOW_MINIMUM' | 'EXCEEDS_FULL_AMOUNT';

/**
 * Online appointment payments may be any amount from the minimum up to the
 * full consult fee. The effective minimum is `min(minAmount, fullAmount)` so
 * a doctor whose fee is below the configured minimum (e.g. 40 vs 50) can
 * still be paid in full — otherwise no amount would ever be valid. Returns
 * the violation, or `null` when valid. Cents math, same as the rest of this
 * file; the caller (never the client) supplies `fullAmount`.
 */
export function findPartialPaymentViolation(input: PartialPaymentInput): PartialPaymentViolation | null {
  if (!/^\d+(\.\d{1,2})?$/.test(input.requestedAmount.trim())) {
    return 'INVALID';
  }
  const requested = toCents(input.requestedAmount);
  const full = toCents(input.fullAmount);
  const effectiveMin = Math.min(toCents(input.minAmount), full);

  if (requested <= 0) {
    return 'INVALID';
  }
  if (requested < effectiveMin) {
    return 'BELOW_MINIMUM';
  }
  if (requested > full) {
    return 'EXCEEDS_FULL_AMOUNT';
  }
  return null;
}

/** `fullAmount - paidAmount`, never negative. */
export function computeRemainingBalance(fullAmount: string, paidAmount: string): string {
  return fromCents(Math.max(0, toCents(fullAmount) - toCents(paidAmount)));
}

export interface LedgerEntryForBalance {
  entryType: 'EARNING' | 'COMMISSION_DEDUCTION' | 'PAYOUT' | 'ADJUSTMENT';
  amount: string;
  relatedPaymentIntentId: string | null;
}

/**
 * Outstanding balance MedSuper currently owes a provider — `EARNING`
 * direction only. Deliberately excludes `COMMISSION_DEDUCTION` (the opposite
 * direction: the provider owes MedSuper a commission from a
 * pay-at-clinic/pay-at-lab payment) — netting the two together would let a
 * pay-at-clinic commission silently reduce what we say we owe the doctor
 * from an unrelated online payment.
 *
 * The tricky part: `ProcessCancellationRefundUseCase` writes an `ADJUSTMENT`
 * row for BOTH a `COMMISSION_DEDUCTION` reversal (pay-at-clinic cancellation)
 * and an `EARNING` reversal (online/wallet cancellation) — `entryType` alone
 * can't tell them apart, there's no sub-discriminator column. So an
 * `ADJUSTMENT` only counts here when its `relatedPaymentIntentId` matches a
 * payment intent that also has an `EARNING` row for this same provider —
 * otherwise it's reversing a `COMMISSION_DEDUCTION` and must be ignored.
 */
export function computeOutstandingEarningBalance(entries: LedgerEntryForBalance[]): string {
  const earningIntentIds = new Set(
    entries.filter((entry) => entry.entryType === 'EARNING' && entry.relatedPaymentIntentId).map((entry) => entry.relatedPaymentIntentId),
  );

  const totalCents = entries.reduce((sum, entry) => {
    if (entry.entryType === 'EARNING' || entry.entryType === 'PAYOUT') {
      return sum + toCents(entry.amount);
    }
    if (entry.entryType === 'ADJUSTMENT' && entry.relatedPaymentIntentId && earningIntentIds.has(entry.relatedPaymentIntentId)) {
      return sum + toCents(entry.amount);
    }
    return sum;
  }, 0);

  return fromCents(totalCents);
}
