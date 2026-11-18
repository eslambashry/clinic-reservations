import { PolicyConfigReader } from './policy-config.reader';

describe('PolicyConfigReader', () => {
  const reader = new PolicyConfigReader();
  const tx: any = { policyConfig: { findFirst: jest.fn() } };

  it('returns the row value', async () => {
    tx.policyConfig.findFirst.mockResolvedValue({ value: { ratePercent: 10 } });
    expect(await reader.getValue(tx, 'EG', 'COMMISSION_RATE' as any)).toEqual({ ratePercent: 10 });
    const arg = tx.policyConfig.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({ region_code: 'EG', policy_type: 'COMMISSION_RATE' });
    expect(arg.orderBy).toEqual({ effective_from: 'desc' });
  });

  it('returns null when no row exists or the value is null', async () => {
    tx.policyConfig.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ value: null });
    expect(await reader.getValue(tx, 'EG', 'COMMISSION_RATE' as any)).toBeNull();
    expect(await reader.getValue(tx, 'EG', 'COMMISSION_RATE' as any)).toBeNull();
  });
});
