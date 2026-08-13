/**
 * Domain exception hierarchy mapping directly onto File 11 Part 06's error
 * category table. Use-cases/domain code throw these — never a bare `Error`
 * or a raw Nest `HttpException` — so `ErrorEnvelopeFilter` can translate
 * them into the standard envelope without guessing intent from a message
 * string.
 */
export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 401 — File 11 Part 06 Authentication category. */
export class UnauthenticatedError extends AppError {
  readonly httpStatus = 401;
  readonly code: string;

  constructor(
    code: 'UNAUTHENTICATED' | 'TOKEN_EXPIRED' | 'INVALID_REFRESH_TOKEN' | 'TOKEN_FAMILY_REVOKED' = 'UNAUTHENTICATED',
    message = 'Authentication is required.',
  ) {
    super(message);
    this.code = code;
  }
}

/** 403 — File 11 Part 06 Authorization category. */
export class ForbiddenError extends AppError {
  readonly httpStatus = 403;
  readonly code: string;

  constructor(code: 'FORBIDDEN' | 'ROLE_NOT_PERMITTED' | 'RESOURCE_NOT_OWNED' = 'FORBIDDEN', message = 'You do not have permission to perform this action.') {
    super(message);
    this.code = code;
  }
}

/** 404 — File 11 Part 06 Not found category. */
export class NotFoundError extends AppError {
  readonly httpStatus = 404;
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found.`, { resourceType, resourceId });
  }
}

/**
 * 409 — File 11 Part 06 Conflict category (double-hold, idempotency-key
 * reuse, order already claimed). `code` is caller-supplied because the
 * table is open-ended (Part 06: "new error codes follow the same pattern").
 */
export class ConflictError extends AppError {
  readonly httpStatus = 409;

  constructor(
    public readonly code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/**
 * 422 — File 11 Part 06 Business rule category: syntactically valid request,
 * rejected because it violates a business rule (distinct from 400
 * validation). E.g. `HOLD_EXPIRED`, `CANCELLATION_WINDOW_PASSED`.
 */
export class BusinessRuleError extends AppError {
  readonly httpStatus = 422;

  constructor(
    public readonly code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/**
 * 502/503 — File 11 Part 06 External provider category. `message` shown to
 * the client is always generic; the real vendor error belongs in `cause`,
 * logged server-side only, never serialized into the response.
 */
export class ExternalProviderError extends AppError {
  readonly httpStatus: 502 | 503;
  readonly code = 'GATEWAY_UNAVAILABLE';

  constructor(
    provider: string,
    httpStatus: 502 | 503 = 502,
    public readonly cause?: unknown,
  ) {
    super(`${provider} is temporarily unavailable.`);
    this.httpStatus = httpStatus;
  }
}

/**
 * Escape hatch for endpoint-specific error contracts that don't fit the
 * categories above — e.g. File 10 §2.3's OTP-verify errors (`400
 * INVALID_CODE`, `410 CODE_EXPIRED`, `423 TOO_MANY_ATTEMPTS`) or `429
 * RATE_LIMITED`: each is explicitly specified by its own source doc section
 * with a status/code pair that isn't one of File 11 Part 06's generic
 * buckets. Prefer a named class above when a code genuinely fits one.
 */
export class DomainError extends AppError {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}
