import { DomainError } from '../../../shared/core/errors/domain-errors';
import { verifyOtpCode } from './otp-code.util';
import { OTP_CONSTANTS } from './otp.constants';

/**
 * The subset of an `OtpRequest` row this check needs — kept as a narrow
 * structural type (not `@prisma/client`'s `OtpRequest`) so this stays
 * framework-free, per this module's `api/ → application/ → domain/ →
 * infrastructure/` layering (File 12 Part 05): domain code doesn't import
 * generated Prisma types or repositories.
 */
export interface OtpValidationRecord {
  id: string;
  code_hash: string;
  purpose: string;
  attempts: number;
  consumed_at: Date | null;
  expires_at: Date;
}

export interface OtpValidationInput {
  code: string;
  purpose: string;
}

/**
 * The shared "does this OTP code check out for this purpose" rule set —
 * `ResetPasswordUseCase` and `VerifyResetCodeUseCase` both call this instead
 * of duplicating it (`VerifyOtpUseCase` predates this helper and has its own
 * copy for the LOGIN_OR_SIGNUP purpose; not touched here).
 *
 * Throws `DomainError` the same way both callers used to inline:
 * - not found / already consumed / wrong purpose → 400 `INVALID_CODE`
 *   (never reveals which — a caller can't distinguish "no such request" from
 *   "already used" from "wrong purpose")
 * - expired → 410 `CODE_EXPIRED`
 * - attempts already at the max → 423 `TOO_MANY_ATTEMPTS`
 * - wrong code → persists an incremented attempt count via
 *   `incrementAttempts` (passed in by the caller, since persistence is an
 *   infrastructure concern this domain function doesn't own) and then 400
 *   `INVALID_CODE`, or 423 `TOO_MANY_ATTEMPTS` if that increment reaches the
 *   max — the increment must survive even though this call also throws, so
 *   it's deliberately awaited and persisted before the throw, not wrapped in
 *   whatever transaction the caller's success path uses.
 *
 * Resolves (no throw) once the code matches — callers decide what "valid"
 * means for them (consume + change password, or just report success).
 */
export async function validateOtpCode(
  otpRequest: OtpValidationRecord | null,
  input: OtpValidationInput,
  incrementAttempts: (id: string) => Promise<{ attempts: number }>,
): Promise<void> {
  if (!otpRequest || otpRequest.consumed_at || otpRequest.purpose !== input.purpose) {
    throw new DomainError(400, 'INVALID_CODE', 'The provided code is invalid.');
  }

  if (otpRequest.expires_at.getTime() < Date.now()) {
    throw new DomainError(410, 'CODE_EXPIRED', 'This code has expired — request a new one.');
  }

  if (otpRequest.attempts >= OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS) {
    throw new DomainError(423, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts — request a new code.');
  }

  const matches = await verifyOtpCode(otpRequest.code_hash, input.code);
  if (!matches) {
    const updated = await incrementAttempts(otpRequest.id);
    if (updated.attempts >= OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS) {
      throw new DomainError(423, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts — request a new code.');
    }
    throw new DomainError(400, 'INVALID_CODE', 'The provided code is invalid.');
  }
}
