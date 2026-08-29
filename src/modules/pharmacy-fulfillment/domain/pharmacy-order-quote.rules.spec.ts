import { assertValidQuoteItemInput, computeOrderTotal, requiresControlledSubstanceConfirmationForQuote, resolveQuoteOutcome } from './pharmacy-order-quote.rules';

describe('resolveQuoteOutcome', () => {
  it('returns ACCEPTED when every item is AVAILABLE', () => {
    expect(resolveQuoteOutcome([{ status: 'AVAILABLE' }, { status: 'AVAILABLE' }])).toBe('ACCEPTED');
  });

  it('returns ACCEPTED when some items are UNAVAILABLE but at least one is AVAILABLE (partial fulfillment)', () => {
    expect(resolveQuoteOutcome([{ status: 'AVAILABLE' }, { status: 'UNAVAILABLE' }])).toBe('ACCEPTED');
  });

  it('returns SUBSTITUTION_PROPOSED when any item is SUBSTITUTED', () => {
    expect(resolveQuoteOutcome([{ status: 'AVAILABLE' }, { status: 'SUBSTITUTED' }])).toBe('SUBSTITUTION_PROPOSED');
  });

  it('throws NO_ITEMS_AVAILABLE when every item is UNAVAILABLE', () => {
    expect(() => resolveQuoteOutcome([{ status: 'UNAVAILABLE' }, { status: 'UNAVAILABLE' }])).toThrow(
      expect.objectContaining({ code: 'NO_ITEMS_AVAILABLE', httpStatus: 422 }),
    );
  });
});

describe('requiresControlledSubstanceConfirmationForQuote', () => {
  it('returns false when nothing dispensed is a controlled substance', () => {
    const controlledByCode = new Map([['PARA500', false]]);
    expect(requiresControlledSubstanceConfirmationForQuote([{ status: 'AVAILABLE', effectiveDrugCode: 'PARA500' }], controlledByCode)).toBe(false);
  });

  it('returns true when an AVAILABLE item\'s original drug is controlled', () => {
    const controlledByCode = new Map([['TRAMADOL50', true]]);
    expect(requiresControlledSubstanceConfirmationForQuote([{ status: 'AVAILABLE', effectiveDrugCode: 'TRAMADOL50' }], controlledByCode)).toBe(true);
  });

  it('returns true when a SUBSTITUTED item\'s substitute drug is controlled', () => {
    const controlledByCode = new Map([['PARA500', false], ['TRAMADOL50', true]]);
    expect(requiresControlledSubstanceConfirmationForQuote([{ status: 'SUBSTITUTED', effectiveDrugCode: 'TRAMADOL50' }], controlledByCode)).toBe(true);
  });

  it('ignores UNAVAILABLE items even if their drug is controlled', () => {
    const controlledByCode = new Map([['TRAMADOL50', true]]);
    expect(requiresControlledSubstanceConfirmationForQuote([{ status: 'UNAVAILABLE', effectiveDrugCode: 'TRAMADOL50' }], controlledByCode)).toBe(false);
  });
});

describe('assertValidQuoteItemInput', () => {
  it('allows an UNAVAILABLE item with no unitPrice', () => {
    expect(() => assertValidQuoteItemInput({ status: 'UNAVAILABLE' })).not.toThrow();
  });

  it('throws UNIT_PRICE_REQUIRED for an AVAILABLE item with no unitPrice', () => {
    expect(() => assertValidQuoteItemInput({ status: 'AVAILABLE' })).toThrow(expect.objectContaining({ code: 'UNIT_PRICE_REQUIRED' }));
  });

  it('throws SUBSTITUTE_DRUG_CODE_REQUIRED for a SUBSTITUTED item with no substituteDrugCode', () => {
    expect(() => assertValidQuoteItemInput({ status: 'SUBSTITUTED', unitPrice: '10.00' })).toThrow(
      expect.objectContaining({ code: 'SUBSTITUTE_DRUG_CODE_REQUIRED' }),
    );
  });

  it('allows a fully-specified SUBSTITUTED item', () => {
    expect(() => assertValidQuoteItemInput({ status: 'SUBSTITUTED', unitPrice: '10.00', substituteDrugCode: 'AMOX250' })).not.toThrow();
  });
});

describe('computeOrderTotal', () => {
  it('sums unitPrice * quantity across AVAILABLE and SUBSTITUTED items', () => {
    const total = computeOrderTotal([
      { status: 'AVAILABLE', unitPrice: '10.00', quantity: 20 },
      { status: 'SUBSTITUTED', unitPrice: '5.00', quantity: 10 },
    ]);
    expect(total).toBe('250.00');
  });

  it('ignores UNAVAILABLE items even if they somehow carry a unitPrice', () => {
    const total = computeOrderTotal([
      { status: 'AVAILABLE', unitPrice: '10.00', quantity: 20 },
      { status: 'UNAVAILABLE', unitPrice: '999.00', quantity: 5 },
    ]);
    expect(total).toBe('200.00');
  });

  it('returns "0.00" when there is nothing to total', () => {
    expect(computeOrderTotal([{ status: 'UNAVAILABLE', unitPrice: null, quantity: 1 }])).toBe('0.00');
  });
});
