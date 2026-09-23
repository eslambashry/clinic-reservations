import {
  assertCanCreatePharmacyOrder,
  assertNoActiveOrderExists,
  assertOrderCanBeginFulfillment,
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

describe('assertCanCreatePharmacyOrder', () => {
  it('throws when neither structured items nor an image exists', () => {
    expect(() => assertCanCreatePharmacyOrder([], 0)).toThrow(expect.objectContaining({ code: 'PRESCRIPTION_HAS_NO_CONTENT' }));
  });

  it('allows image-only prescriptions because the staff queue prices from the image', () => {
    expect(() => assertCanCreatePharmacyOrder([], 1)).not.toThrow();
  });

  it('allows structured prescription items', () => {
    expect(() => assertCanCreatePharmacyOrder([{}], 0)).not.toThrow();
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

describe('assertOrderCanBeginFulfillment', () => {
  it('allows newly priced ACCEPTED orders and legacy PAID/PREPARING orders', () => {
    expect(() => assertOrderCanBeginFulfillment('ACCEPTED')).not.toThrow();
    expect(() => assertOrderCanBeginFulfillment('PAID')).not.toThrow();
    expect(() => assertOrderCanBeginFulfillment('PREPARING')).not.toThrow();
  });

  it('rejects an order that has not been priced', () => {
    expect(() => assertOrderCanBeginFulfillment('UNDER_REVIEW')).toThrow(
      expect.objectContaining({ code: 'PHARMACY_ORDER_NOT_READY_FOR_FULFILLMENT', httpStatus: 422 }),
    );
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
