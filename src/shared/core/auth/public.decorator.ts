import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts an endpoint out of the globally-applied `JwtAuthGuard` (auth is
 * fail-closed by default — File 11 Part 23 — so endpoints like OTP
 * request/verify and the health check must opt out explicitly, not the
 * other way around).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
