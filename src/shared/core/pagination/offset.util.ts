/**
 * Offset pagination for ADMIN list endpoints only.
 *
 * File 10 §2.2 states "no offset/page pagination anywhere", and `cursor.util.ts`
 * remains the rule for every patient- and provider-facing list: keyset paging
 * stays correct under concurrent inserts and never scans a growing prefix.
 *
 * The admin console is the deliberate exception. Its operators need to jump to
 * a specific page and see how much work is queued in total — neither of which a
 * keyset cursor can express, since it yields only `nextCursor` and no count.
 * The trade-offs that make offset paging wrong for patient feeds (row drift on
 * concurrent writes, deep-page cost) are acceptable against small, slow-moving
 * admin tables browsed by a handful of internal users.
 *
 * Cursor mode is preserved on every endpoint: `page` is opt-in, and its absence
 * leaves existing callers on exactly the path they use today.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Pagination metadata returned alongside the rows on every admin list endpoint. */
export interface OffsetPageMeta {
  /** Total rows matching the filter, ignoring pagination. */
  totalCount: number;
  /** The page actually served — 1 when the request used cursor mode. */
  page: number;
  /** The page size actually applied after clamping. */
  limit: number;
  /** Always at least 1, so the UI never renders "page 1 of 0" for an empty list. */
  totalPages: number;
}

export interface OffsetPageInput {
  page?: number;
  limit?: number;
}

/**
 * Resolves the Prisma `skip`/`take` for a 1-based page number. Values are
 * clamped rather than rejected: the DTO layer already validates the range, and
 * a defensive clamp here keeps a direct internal caller from producing a
 * negative `skip`, which Prisma throws on.
 */
export function resolveOffset(input: OffsetPageInput): { skip: number; take: number; page: number; limit: number } {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(input.page ?? 1, 1);
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export function buildPageMeta(totalCount: number, page: number, limit: number): OffsetPageMeta {
  return {
    totalCount,
    page,
    limit,
    totalPages: Math.max(Math.ceil(totalCount / limit), 1),
  };
}

/** True when the caller asked for offset mode. `page` takes precedence over `cursor`. */
export function isOffsetMode(input: { page?: number }): boolean {
  return input.page !== undefined;
}
