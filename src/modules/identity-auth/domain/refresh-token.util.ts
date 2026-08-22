import { createHash, randomBytes } from 'node:crypto';

/**
 * Refresh tokens are opaque, high-entropy random values (File 11 07.1) —
 * 48 bytes = 384 bits, infeasible to brute-force regardless of hash speed.
 * `/token/refresh` and `/logout` present only the raw token with no other
 * lookup key, so the stored hash must be deterministic (`WHERE token_hash =
 * ?`) — SHA-256, not argon2 (argon2 salts per-hash, so re-hashing the same
 * input never equals a previously stored hash — see File 12 Part 04).
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
