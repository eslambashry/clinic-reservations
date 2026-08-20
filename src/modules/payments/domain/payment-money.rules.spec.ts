import { computeCancellationFeeSplit, computeCommissionSplit, computeProportionalCommissionReversal } from './payment-money.rules';

describe('computeCommissionSplit', () => {
  it('splits an even amount cleanly', () => {
    expect(computeCommissionSplit({ amount: '200.00', commissionRatePercent: 15 })).toEqual({
      platformAmount: '30.00',
      providerAmount: '170.00',
    });
  });

  it('rounds an odd-cent split to the nearest cent', () => {
    expect(computeCommissionSplit({ amount: '99.99', commissionRatePercent: 15 })).toEqual({
      platformAmount: '15.00',
      providerAmount: '84.99',
    });
  });

  it('gives the provider everything at a 0% rate', () => {
    expect(computeCommissionSplit({ amount: '150.00', commissionRatePercent: 0 })).toEqual({
      platformAmount: '0.00',
      providerAmount: '150.00',
    });
  });
});

describe('computeCancellationFeeSplit', () => {
  it('applies no fee at 0%', () => {
    expect(computeCancellationFeeSplit({ capturedAmount: '200.00', feePercent: 0 })).toEqual({
      feeApplied: '0.00',
      refundAmount: '200.00',
    });
  });

  it('applies a 10% fee', () => {
    expect(computeCancellationFeeSplit({ capturedAmount: '200.00', feePercent: 10 })).toEqual({
      feeApplied: '20.00',
      refundAmount: '180.00',
    });
  });

  it('forfeits the full amount at a 100% fee', () => {
    expect(computeCancellationFeeSplit({ capturedAmount: '200.00', feePercent: 100 })).toEqual({
      feeApplied: '200.00',
      refundAmount: '0.00',
    });
  });
});

describe('computeProportionalCommissionReversal', () => {
  it('reverses the full commission on a full refund', () => {
    expect(
      computeProportionalCommissionReversal({ originalCommission: '30.00', capturedAmount: '200.00', refundAmount: '200.00' }),
    ).toBe('-30.00');
  });

  it('reverses a proportional share on a partial refund', () => {
    expect(
      computeProportionalCommissionReversal({ originalCommission: '30.00', capturedAmount: '200.00', refundAmount: '180.00' }),
    ).toBe('-27.00');
  });

  it('is guarded against division by zero when the captured amount is 0', () => {
    expect(
      computeProportionalCommissionReversal({ originalCommission: '0.00', capturedAmount: '0.00', refundAmount: '0.00' }),
    ).toBe('0.00');
  });
});
