import { SetMetadata } from '@nestjs/common';

/**
 * Marks a mutating endpoint as unavailable without an `Idempotency-Key`.
 * The interceptor remains reusable on legacy routes where the header is an
 * optional hardening layer; provider clinical writes opt into this stronger
 * contract explicitly rather than changing unrelated patient/staff routes.
 */
export const REQUIRE_IDEMPOTENCY_KEY = 'require-idempotency-key';
export const RequireIdempotencyKey = () => SetMetadata(REQUIRE_IDEMPOTENCY_KEY, true);
