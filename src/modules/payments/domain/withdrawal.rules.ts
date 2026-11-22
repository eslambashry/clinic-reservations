import { WithdrawalPayoutMethod } from '@prisma/client';
import { PAYMENT_CONSTANTS } from '../../../shared/config/constants';

const EGYPT_MOBILE = /^(?:\+20|0)1[0125]\d{8}$/;
const IBAN = /^[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}$/;

/** Minimum withdrawal is derived from the current service fee (no separate setting): fee x multiplier. */
export function computeMinWithdrawal(serviceFeeAmount: string): string {
  return (Number(serviceFeeAmount) * PAYMENT_CONSTANTS.WITHDRAWAL_MIN_FEE_MULTIPLIER).toFixed(2);
}

/** Normalizes and validates the payout destination; returns the normalized account or `null` when malformed. */
export function normalizePayoutAccount(method: WithdrawalPayoutMethod, raw: string): string | null {
  const compact = raw.replace(/\s+/g, '');
  if (method === 'IBAN') {
    return IBAN.test(compact) ? compact.toUpperCase() : null;
  }
  return EGYPT_MOBILE.test(compact) ? compact : null;
}
