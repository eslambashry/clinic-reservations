/**
 * Password-auth rate limiting, module-local (mirrors `otp.constants.ts`'s
 * "own domain rules" scope — not File 12 Part 08's shared registry).
 */
export const PASSWORD_CONSTANTS = {
  /** "5 attempts / 10 min" per phone number — a login guess is more likely
   * to be a benign typo than an OTP re-request, so slightly more generous
   * than OTP's 3/10min, but still capped against brute force. */
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 5,
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: 600,
} as const;
