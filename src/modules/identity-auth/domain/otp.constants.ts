/**
 * File 10 §2.3 — Identity module's own domain rules. Module-local, not File
 * 12 Part 08's shared registry: these govern only this module's OTP flow,
 * not a cross-module concern.
 */
export const OTP_CONSTANTS = {
  CODE_LENGTH: 6,
  EXPIRES_IN_SECONDS: 300,
  MAX_VERIFY_ATTEMPTS: 5,
  /** "3 requests / 10 min" per phone number (File 10 §2.3). */
  RATE_LIMIT_MAX_REQUESTS: 3,
  RATE_LIMIT_WINDOW_SECONDS: 600,
} as const;
