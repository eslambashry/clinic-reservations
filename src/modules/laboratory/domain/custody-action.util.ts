/**
 * Custody event vocabulary — copied 1:1 from
 * `medsuper-laboratory-dashboard/src/lib/api/types.ts`'s `CustodyEventType`.
 * Not a Prisma/Postgres enum: these are never stored as their own column —
 * every laboratory use-case writes them as `audit_logs.action` via
 * `encodeCustodyAction` below, reusing the generic audit store exactly like
 * the pharmacy audit endpoint does (`docs/PROPOSED_CONTRACT.md` §6 there),
 * rather than adding a dedicated custody-event table.
 */
export const CUSTODY_EVENT_TYPES = [
  'REQUEST_RECEIVED',
  'QUOTE_SENT',
  'BOOKING_CONFIRMED',
  'ARRIVAL_CONFIRMED',
  'SAMPLE_COLLECTED',
  'IN_TRANSIT',
  'ANALYSIS_STARTED',
  'RESULT_RECORDED',
  'CRITICAL_FLAGGED',
  'SAMPLE_REJECTED',
  'RECOLLECTION_REQUESTED',
  'ORDER_REJECTED',
  'NOTE_ADDED',
  'RESULT_DELIVERED',
  'VISIT_RESCHEDULED',
] as const;

export type CustodyEventType = (typeof CUSTODY_EVENT_TYPES)[number];

/**
 * `audit_logs.action` for this module always encodes the exact
 * `CustodyEventType` directly (`laboratory.lab-order.<kebab-case-type>`) —
 * a pure syntactic transform, not a value resolved from order state at read
 * time. This is simpler than pharmacy-fulfillment's own action mapping
 * (which needs `fulfillment_type` to disambiguate one raw action into two
 * possible outcomes): every laboratory use-case already knows exactly which
 * `CustodyEventType` it produces, so there is nothing to resolve later.
 */
const ACTION_PREFIX = 'laboratory.lab-order.';

export function encodeCustodyAction(type: CustodyEventType): string {
  return `${ACTION_PREFIX}${type.toLowerCase().replace(/_/g, '-')}`;
}

/** Returns `null` for any `audit_logs` row not written by this module (defensive — `listByResource` is already scoped by `resourceType`/`resourceIds`, so this should never miss in practice). */
export function decodeCustodyAction(action: string): CustodyEventType | null {
  if (!action.startsWith(ACTION_PREFIX)) {
    return null;
  }
  const candidate = action.slice(ACTION_PREFIX.length).toUpperCase().replace(/-/g, '_');
  return (CUSTODY_EVENT_TYPES as readonly string[]).includes(candidate) ? (candidate as CustodyEventType) : null;
}
