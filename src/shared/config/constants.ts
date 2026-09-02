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
 * ADR-005 (`docs/decisions/ADR-005-PROVIDER-SELF-REGISTRATION.md`, FILE_12
 * Part 34) — the self-registration form doesn't collect a branch timezone,
 * affiliation currency, or address country; these are flagged engineering
 * defaults for the Egypt-first MVP launch, not silently inline-guessed.
 */
export const PROVIDER_REGISTRATION_CONSTANTS = {
  DEFAULT_IANA_TIMEZONE: 'Africa/Cairo',
  DEFAULT_CURRENCY: 'EGP',
  DEFAULT_COUNTRY_CODE: 'EG',
} as const;

/** File 11 Part 01: single-region MVP launch — every `policy_configs` read defaults to this region until multi-region is built. */
export const REGION_CONSTANTS = {
  DEFAULT_REGION_CODE: 'EG',
} as const;

/**
 * File 12 Part 39.2: order creation broadcasts to the nearest N verified
 * pharmacy branches within this radius, reusing `SearchPharmacyBranchesUseCase`
 * (Part 38) rather than a new query. Radius matches that endpoint's own
 * default (Part 38 item 3) for consistency between search and broadcast.
 */
export const PHARMACY_CONSTANTS = {
  BROADCAST_FANOUT_COUNT: 5,
  BROADCAST_RADIUS_KM: 15,
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

/**
 * User-generated media/document uploads (`DEC-009`, resolved via ImageKit —
 * File 11 Part 04: "MIME allowlist (jpeg/png/pdf), size/count validated at
 * the API layer before touching storage"). File 11/12 give the MIME
 * allowlist but no exact byte sizes — those are engineering defaults for the
 * launch pilot, same spirit as `RATE_LIMIT_DEFAULT`, not a source-doc
 * citation. `PRESCRIPTION_MAX_FILES` is the one number File 10 §2.3 does
 * state explicitly, preserved unchanged from the pre-ImageKit implementation.
 */
export const MEDIA_CONSTANTS = {
  IMAGE_MIME_TYPES: ['image/jpeg', 'image/png'] as string[],
  DOCUMENT_MIME_TYPES: ['image/jpeg', 'image/png', 'application/pdf'] as string[],
  MAX_IMAGE_SIZE_BYTES: 8 * 1024 * 1024,
  MAX_DOCUMENT_SIZE_BYTES: 15 * 1024 * 1024,
  PRESCRIPTION_MAX_FILES: 5,
  /** How long a freshly generated signed URL for a private file stays valid (read-time only — never persisted). */
  SIGNED_URL_TTL_SECONDS: 5 * 60,
} as const;
