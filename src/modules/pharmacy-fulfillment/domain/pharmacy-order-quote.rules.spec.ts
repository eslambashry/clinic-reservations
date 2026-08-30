import { assertValidFlatQuoteInput } from './pharmacy-order-quote.rules';

describe('assertValidFlatQuoteInput', () => {
  it('allows a positive totalPrice and an in-range estimatedReadyMinutes', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '225.00', estimatedReadyMinutes: 45 })).not.toThrow();
  });

  it('throws INVALID_TOTAL_PRICE when totalPrice is zero', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '0', estimatedReadyMinutes: 45 })).toThrow(
      expect.objectContaining({ code: 'INVALID_TOTAL_PRICE', httpStatus: 422 }),
    );
  });

  it('throws INVALID_TOTAL_PRICE when totalPrice is negative', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '-5.00', estimatedReadyMinutes: 45 })).toThrow(
      expect.objectContaining({ code: 'INVALID_TOTAL_PRICE' }),
    );
  });

  it('throws INVALID_ESTIMATED_READY_MINUTES below the minimum', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '10.00', estimatedReadyMinutes: 4 })).toThrow(
      expect.objectContaining({ code: 'INVALID_ESTIMATED_READY_MINUTES' }),
    );
  });

  it('throws INVALID_ESTIMATED_READY_MINUTES above the maximum', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '10.00', estimatedReadyMinutes: 481 })).toThrow(
      expect.objectContaining({ code: 'INVALID_ESTIMATED_READY_MINUTES' }),
    );
  });

  it('throws INVALID_ESTIMATED_READY_MINUTES for a non-integer value', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '10.00', estimatedReadyMinutes: 45.5 })).toThrow(
      expect.objectContaining({ code: 'INVALID_ESTIMATED_READY_MINUTES' }),
    );
  });
});
