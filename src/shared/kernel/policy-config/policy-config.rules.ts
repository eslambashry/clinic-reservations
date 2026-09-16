import { PolicyType } from '@prisma/client';
import { BusinessRuleError, DomainError } from '../../core/errors/domain-errors';

export interface CommissionRateValue {
  ratePercent: number;
}

export interface CancellationTierValue {
  feePercent: number;
}

export interface NotificationQuietHoursValue {
  startHour: number;
  endHour: number;
}

export type PolicyConfigValue = CommissionRateValue | CancellationTierValue | NotificationQuietHoursValue;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BusinessRuleError('POLICY_VALUE_INVALID', 'قيمة السياسة يجب أن تكون كائنًا.');
  }
  return value as Record<string, unknown>;
}

/**
 * R12 split: the request is syntactically well-formed JSON (the DTO already
 * enforced that), so a value that doesn't match its policy type is a
 * business-rule violation (422), not a 400. Extra keys are rejected rather
 * than ignored — a typo'd key silently dropped here would leave the payment
 * path reading a policy the admin believes they changed.
 */
function requireExactKeys(value: Record<string, unknown>, keys: string[]): void {
  const actual = Object.keys(value);
  const unexpected = actual.filter((key) => !keys.includes(key));
  if (unexpected.length > 0) {
    throw new BusinessRuleError('POLICY_VALUE_INVALID', `حقول غير متوقعة في قيمة السياسة: ${unexpected.join('، ')}.`);
  }
}

function requireNumberInRange(value: Record<string, unknown>, key: string, min: number, max: number, integer = false): number {
  const raw = value[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new BusinessRuleError('POLICY_VALUE_INVALID', `الحقل "${key}" يجب أن يكون رقمًا.`);
  }
  if (integer && !Number.isInteger(raw)) {
    throw new BusinessRuleError('POLICY_VALUE_INVALID', `الحقل "${key}" يجب أن يكون عددًا صحيحًا.`);
  }
  if (raw < min || raw > max) {
    throw new BusinessRuleError('POLICY_VALUE_INVALID', `الحقل "${key}" يجب أن يكون بين ${min} و${max}.`);
  }
  return raw;
}

/**
 * Shapes mirror exactly what the read path already destructures —
 * `capture-online-payment`/`capture-internal-wallet-payment`
 * (`{ ratePercent }`), `cancel-appointment` (`{ feePercent }`) and
 * `dispatch-notification` (`{ startHour, endHour }`). Validating here is what
 * keeps an admin write from breaking those reads; the reads themselves are
 * untouched.
 *
 * `endHour` is deliberately allowed to be <= `startHour`: the seeded default
 * is 22->8, a window that wraps midnight, which is the normal case for quiet
 * hours rather than an error.
 */
export function validatePolicyValue(policyType: PolicyType, rawValue: unknown): PolicyConfigValue {
  const value = asRecord(rawValue);

  switch (policyType) {
    case 'COMMISSION_RATE':
      requireExactKeys(value, ['ratePercent']);
      return { ratePercent: requireNumberInRange(value, 'ratePercent', 0, 100) };
    case 'CANCELLATION_TIER':
      requireExactKeys(value, ['feePercent']);
      return { feePercent: requireNumberInRange(value, 'feePercent', 0, 100) };
    case 'NOTIFICATION_QUIET_HOURS':
      requireExactKeys(value, ['startHour', 'endHour']);
      return {
        startHour: requireNumberInRange(value, 'startHour', 0, 23, true),
        endHour: requireNumberInRange(value, 'endHour', 0, 23, true),
      };
  }
}

/**
 * An unrecognized `:policyType` segment is a malformed request, not a rule
 * violation, so it is 400 (R12) — `DomainError` rather than a named class
 * because no 400 category exists in File 11 Part 06's generic buckets.
 */
export function parsePolicyType(raw: string): PolicyType {
  const known = Object.values(PolicyType);
  if (!known.includes(raw as PolicyType)) {
    throw new DomainError(400, 'POLICY_TYPE_INVALID', `نوع السياسة غير معروف. القيم المتاحة: ${known.join('، ')}.`);
  }
  return raw as PolicyType;
}
