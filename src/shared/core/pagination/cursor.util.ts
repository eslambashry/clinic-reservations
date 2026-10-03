import { DomainError } from '../errors/domain-errors';
import { arErrorMessage } from '../errors/error-messages.ar';

/**
 * Opaque cursor pagination (File 10 §2.2: "request `?cursor=<opaque>&limit=20`;
 * response `{ items: [...], nextCursor: opaque-or-null }`. No offset/page
 * pagination anywhere"). File 12 Part 32.16: implemented once here, reused
 * by every module needing a list endpoint — Provider Directory is the first.
 *
 * The cursor payload is caller-defined (typically the last row's sort-key
 * value plus a unique tiebreaker id) — this module only owns the opaque
 * encoding, not the pagination semantics of any particular query.
 */
export function encodeCursor<T>(payload: T): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined): T | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    // Malformed/tampered cursor — treat as "no cursor" (start from the
    // beginning) rather than surfacing a confusing 500 for an opaque token
    // clients are never meant to construct themselves.
    return undefined;
  }
}

/**
 * Search cursors carry the sort key they were issued under (`s`) because the
 * keyset value (`v`) is only meaningful for that sort: a name-sorted cursor
 * replayed against a distance sort would reach Postgres as
 * `('<brand name>')::numeric` and fail with a raw 500, and a rating cursor
 * replayed against a price sort silently skips/repeats rows. The default sort
 * of the search endpoints depends on whether `lat`/`lng` are sent, so a
 * client that changes location mid-pagination hits exactly this. Reject such
 * a cursor as a client error instead.
 */
export function decodeSortBoundCursor<T extends { s: string; v: string | null }>(
  cursor: string | undefined,
  sortKey: string,
  options: { numericValue: boolean },
): T | undefined {
  const decoded = decodeCursor<T>(cursor);
  if (!decoded) return undefined;
  const valueIsValid = !options.numericValue || decoded.v === null || (typeof decoded.v === 'string' && Number.isFinite(Number(decoded.v)) && decoded.v.trim() !== '');
  if (decoded.s !== sortKey || !valueIsValid) {
    throw new DomainError(400, 'VALIDATION_ERROR', arErrorMessage('VALIDATION_ERROR'), { field: 'cursor', reason: 'CURSOR_SORT_MISMATCH' });
  }
  return decoded;
}
