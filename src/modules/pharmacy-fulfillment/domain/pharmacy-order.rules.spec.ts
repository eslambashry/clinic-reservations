import {
  assertHasFulfillableItems,
  assertNoActiveOrderExists,
  assertOrderIsPaid,
  assertOrderIsReadyToComplete,
  isActiveOrderStatus,
  nextStatusAfterFulfill,
} from './pharmacy-order.rules';

describe('isActiveOrderStatus', () => {
  it('treats REJECTED and FULFILLED as terminal', () => {
    expect(isActiveOrderStatus('REJECTED')).toBe(false);
    expect(isActiveOrderStatus('FULFILLED')).toBe(false);
  });

  it('treats every other status as active', () => {
    expect(isActiveOrderStatus('RECEIVED')).toBe(true);
    expect(isActiveOrderStatus('PAID')).toBe(true);
  });
});

describe('assertNoActiveOrderExists', () => {
  it('allows creation when no prior order exists', () => {
    expect(() => assertNoActiveOrderExists(null)).not.toThrow();
  });

  it('allows creation when the prior order is terminal', () => {
    expect(() => assertNoActiveOrderExists({ status: 'REJECTED' })).not.toThrow();
  });

  it('throws PHARMACY_ORDER_ALREADY_EXISTS when the prior order is still active', () => {
    expect(() => assertNoActiveOrderExists({ status: 'UNDER_REVIEW' })).toThrow(
      expect.objectContaining({ code: 'PHARMACY_ORDER_ALREADY_EXISTS', httpStatus: 409 }),
    );
  });
});

describe('assertHasFulfillableItems', () => {
  it('throws NO_FULFILLABLE_ITEMS for an empty list', () => {
    expect(() => assertHasFulfillableItems([])).toThrow(expect.objectContaining({ code: 'NO_FULFILLABLE_ITEMS' }));
  });

  it('allows a non-empty list', () => {
    expect(() => assertHasFulfillableItems([{}])).not.toThrow();
  });
});

describe('nextStatusAfterFulfill', () => {
  it('routes PICKUP orders to READY_FOR_PICKUP', () => {
    expect(nextStatusAfterFulfill('PICKUP')).toBe('READY_FOR_PICKUP');
  });

  it('routes DELIVERY orders to OUT_FOR_DELIVERY', () => {
    expect(nextStatusAfterFulfill('DELIVERY')).toBe('OUT_FOR_DELIVERY');
  });

  it('routes CLINIC_HANDOVER orders to READY_FOR_PICKUP — same as PICKUP', () => {
    expect(nextStatusAfterFulfill('CLINIC_HANDOVER')).toBe('READY_FOR_PICKUP');
  });
});

describe('assertOrderIsPaid', () => {
  it('allows PAID', () => {
    expect(() => assertOrderIsPaid('PAID')).not.toThrow();
  });

  it('throws PHARMACY_ORDER_NOT_PAID for anything else', () => {
    expect(() => assertOrderIsPaid('ACCEPTED')).toThrow(expect.objectContaining({ code: 'PHARMACY_ORDER_NOT_PAID', httpStatus: 422 }));
  });
});

describe('assertOrderIsReadyToComplete', () => {
  it('allows READY_FOR_PICKUP', () => {
    expect(() => assertOrderIsReadyToComplete('READY_FOR_PICKUP')).not.toThrow();
  });

  it('allows OUT_FOR_DELIVERY', () => {
    expect(() => assertOrderIsReadyToComplete('OUT_FOR_DELIVERY')).not.toThrow();
  });

  it('throws PHARMACY_ORDER_NOT_READY_TO_COMPLETE for anything else', () => {
    expect(() => assertOrderIsReadyToComplete('PAID')).toThrow(
      expect.objectContaining({ code: 'PHARMACY_ORDER_NOT_READY_TO_COMPLETE', httpStatus: 422 }),
    );
  });
});
