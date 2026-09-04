import { randomInt } from 'node:crypto';

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;
const LENGTH = 16;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

/**
 * One-time password for staff provisioning (e.g. a doctor creating a clinic
 * assistant account) — CSPRNG-backed (`node:crypto.randomInt`, same primitive
 * as `otp-code.util.ts`), guaranteed to satisfy `IsStrongPassword`'s policy
 * (8-64 chars, upper/lower/digit/symbol) so the generated credential is never
 * rejected if the recipient later re-sets it via the normal password flow.
 * Never logged, never persisted — the caller hashes it immediately and
 * returns the plaintext to the client exactly once.
 */
export function generateStaffPassword(): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: LENGTH - required.length }, () => pick(ALL));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
