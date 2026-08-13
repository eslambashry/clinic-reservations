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
