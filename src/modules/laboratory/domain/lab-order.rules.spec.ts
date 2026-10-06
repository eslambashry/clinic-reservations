import {
  assertCollectionGateSatisfied,
  assertFutureInstant,
  assertHasLiveSample,
  assertNoLiveSample,
  assertNoPendingReview,
  assertOrderIsRejectable,
  assertRecollectionRequired,
  assertStatus,
  assertStatusIn,
  collectionGateSatisfied,
  hasCustodyEventAfter,
  hasLiveSample,
  lastBlockingIssueIndex,
} from './lab-order.rules';

const ev = (...types: string[]) => types.map((type) => ({ type })) as any[];

describe('lab-order.rules', () => {
  it('lastBlockingIssueIndex finds the latest rejection or recollection, else -1', () => {
    expect(lastBlockingIssueIndex(ev())).toBe(-1);
    expect(lastBlockingIssueIndex(ev('SAMPLE_COLLECTED'))).toBe(-1);
    expect(lastBlockingIssueIndex(ev('SAMPLE_REJECTED', 'SAMPLE_COLLECTED', 'RECOLLECTION_REQUESTED', 'IN_TRANSIT'))).toBe(2);
  });

  it('hasCustodyEventAfter only counts events after the last blocking issue', () => {
    expect(hasCustodyEventAfter(ev('SAMPLE_COLLECTED'), ['SAMPLE_COLLECTED'])).toBe(true);
    expect(hasCustodyEventAfter(ev('SAMPLE_COLLECTED', 'SAMPLE_REJECTED'), ['SAMPLE_COLLECTED'])).toBe(false);
    expect(hasCustodyEventAfter(ev('SAMPLE_REJECTED', 'SAMPLE_COLLECTED'), ['SAMPLE_COLLECTED'])).toBe(true);
  });

  it('hasLiveSample', () => {
    expect(hasLiveSample(ev('SAMPLE_COLLECTED'))).toBe(true);
    expect(hasLiveSample(ev())).toBe(false);
  });

  it('collectionGateSatisfied depends on collection type', () => {
    expect(collectionGateSatisfied(ev('IN_TRANSIT'), 'HOME_COLLECTION')).toBe(true);
    expect(collectionGateSatisfied(ev('ARRIVAL_CONFIRMED'), 'HOME_COLLECTION')).toBe(false);
    expect(collectionGateSatisfied(ev('ARRIVAL_CONFIRMED'), 'VISIT')).toBe(true);
    expect(collectionGateSatisfied(ev('IN_TRANSIT'), 'VISIT')).toBe(false);
  });

  it('assertStatus / assertStatusIn throw a business rule error with the given code', () => {
    expect(() => assertStatus('QUOTED', 'QUOTED', 'C', 'm')).not.toThrow();
    expect(() => assertStatus('REQUESTED', 'QUOTED', 'C', 'm')).toThrow(expect.objectContaining({ code: 'C' }));
    expect(() => assertStatusIn('QUOTED', ['QUOTED', 'REJECTED'], 'C', 'm')).not.toThrow();
    expect(() => assertStatusIn('REQUESTED', ['QUOTED'], 'C2', 'm')).toThrow(expect.objectContaining({ code: 'C2' }));
  });

  it('assertOrderIsRejectable blocks bad statuses and live samples', () => {
    expect(() => assertOrderIsRejectable('REQUESTED', false)).not.toThrow();
    expect(() => assertOrderIsRejectable('AWAITING_SAMPLE', false)).not.toThrow();
    expect(() => assertOrderIsRejectable('IN_ANALYSIS', false)).toThrow(expect.objectContaining({ code: 'LAB_ORDER_NOT_REJECTABLE' }));
    expect(() => assertOrderIsRejectable('QUOTED', true)).toThrow(expect.objectContaining({ code: 'LAB_ORDER_NOT_REJECTABLE' }));
  });

  it('assertNoLiveSample conflicts, with default and custom codes', () => {
    expect(() => assertNoLiveSample(false)).not.toThrow();
    expect(() => assertNoLiveSample(true)).toThrow(expect.objectContaining({ code: 'LAB_ORDER_SAMPLE_ALREADY_LIVE' }));
    expect(() => assertNoLiveSample(true, 'X', 'msg')).toThrow(expect.objectContaining({ code: 'X' }));
  });

  it('simple guards', () => {
    expect(() => assertHasLiveSample(true)).not.toThrow();
    expect(() => assertHasLiveSample(false)).toThrow(expect.objectContaining({ code: 'LAB_ORDER_NO_LIVE_SAMPLE' }));
    expect(() => assertCollectionGateSatisfied(true)).not.toThrow();
    expect(() => assertCollectionGateSatisfied(false)).toThrow(expect.objectContaining({ code: 'LAB_ORDER_COLLECTION_GATE_NOT_SATISFIED' }));
    expect(() => assertRecollectionRequired(true)).not.toThrow();
    expect(() => assertRecollectionRequired(false)).toThrow(expect.objectContaining({ code: 'LAB_ORDER_RECOLLECTION_NOT_REQUIRED' }));
    expect(() => assertNoPendingReview(false)).not.toThrow();
    expect(() => assertNoPendingReview(true)).toThrow(expect.objectContaining({ code: 'LAB_ORDER_RESULTS_PENDING_REVIEW' }));
  });

  it('assertFutureInstant accepts future dates and rejects past or invalid ones', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const past = new Date(Date.now() - 3_600_000).toISOString();
    expect(() => assertFutureInstant(future, 'C', 'm')).not.toThrow();
    expect(() => assertFutureInstant(past, 'C', 'm')).toThrow(expect.objectContaining({ code: 'C' }));
    expect(() => assertFutureInstant('not-a-date', 'C', 'm')).toThrow(expect.objectContaining({ code: 'C' }));
  });
});
