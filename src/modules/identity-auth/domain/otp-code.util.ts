import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { OTP_CONSTANTS } from './otp.constants';

/**
 * A 6-digit OTP is low-entropy (1,000,000 possibilities) — argon2's slow,
 * salted hash is what makes brute-forcing `code_hash` infeasible even with
 * DB access. Contrast with refresh tokens (`refresh-token.util.ts`), which
 * are high-entropy and hashed with fast SHA-256 instead, for lookup reasons
 * — see File 12 Part 04.
 */
export function generateOtpCode(): string {
  const min = 10 ** (OTP_CONSTANTS.CODE_LENGTH - 1);
  const max = 10 ** OTP_CONSTANTS.CODE_LENGTH - 1;
  return randomInt(min, max + 1).toString();
}

export function hashOtpCode(code: string): Promise<string> {
  return argon2.hash(code);
}

export function verifyOtpCode(hash: string, candidate: string): Promise<boolean> {
  return argon2.verify(hash, candidate);
}
