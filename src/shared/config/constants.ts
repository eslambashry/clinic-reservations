/**
 * Central registry of engineering constants — File 12 Part 08.
 *
 * Anything an Admin can tune at runtime (cancellation fee tiers, commission
 * rate, notification quiet hours) belongs in `policy_configs`, not here
 * (File 11 Part 12: "never hardcoded — computed server-side from policy
 * config"). This file is only for values File 11/12 fix as engineering
 * defaults. Every constant cites its source — don't add a bare number.
 */

/** File 11 Part 07.1 / `DEC-B08` recommended default. */
export const AUTH_CONSTANTS = {
  ACCESS_TOKEN_TTL_SECONDS: 30 * 60,
  REFRESH_TOKEN_TTL_SECONDS: 30 * 24 * 60 * 60,
} as const;

/** File 11 Part 12 (hold TTL matches the Flutter Architecture doc §4); grace period is `DEC-B11`'s recommended default. */
export const APPOINTMENT_CONSTANTS = {
  HOLD_TTL_MINUTES: 5,
  NO_SHOW_GRACE_PERIOD_MINUTES: 15,
} as const;

/**
 * File 11 Part 20 requires retry-with-backoff before an outbox event is
 * parked FAILED, but doesn't specify the count/interval — these are
 * engineering starting points in the same spirit as `DEC-B09`
 * ("start conservative, tune from real traffic"), not a File 10/11 citation.
 */
export const OUTBOX_CONSTANTS = {
  MAX_ATTEMPTS: 5,
  POLL_INTERVAL_MS: 2000,
  BATCH_SIZE: 20,
} as const;

/** File 11 Part 12 ("e.g., next 30 days") / File 12 Part 33.9. */
export const SCHEDULING_CONSTANTS = {
  SLOT_GENERATION_WINDOW_DAYS: 30,
} as const;

/**
 * `DEC-B09` — explicitly delegated to engineering discretion. This is the
 * global fallback only; endpoints with a documented stricter need (e.g.
 * `/otp/request`, File 11 Part 05.1) override it per-route with `@Throttle()`
 * when that endpoint is built — not raised here speculatively.
 */
export const RATE_LIMIT_DEFAULT = {
  TTL_SECONDS: 60,
  LIMIT: 100,
} as const;
