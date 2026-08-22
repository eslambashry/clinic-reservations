import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * File 12 Part 32.9. For routes File 10 documents as "Auth: optional"
 * (e.g. `GET /v1/doctors/search`) — unlike `@Public()`, `JwtAuthGuard` still
 * verifies a bearer token if one is present (attaching `request.user` so
 * `@CurrentUser()`/use-cases can branch on it, e.g. an Admin seeing a
 * `PENDING` provider's full detail), but never throws if the header is
 * missing or the token is invalid — the request just proceeds
 * unauthenticated, same as `@Public()` would.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
