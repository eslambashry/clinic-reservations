import { assertValidFlatQuoteInput } from './pharmacy-order-quote.rules';

describe('assertValidFlatQuoteInput', () => {
  it('allows a positive totalPrice', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '225.00' })).not.toThrow();
  });

  it('throws INVALID_TOTAL_PRICE when totalPrice is zero', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '0' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TOTAL_PRICE', httpStatus: 422 }),
    );
  });

  it('throws INVALID_TOTAL_PRICE when totalPrice is negative', () => {
    expect(() => assertValidFlatQuoteInput({ totalPrice: '-5.00' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TOTAL_PRICE' }),
    );
  });
});
