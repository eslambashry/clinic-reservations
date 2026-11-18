import { PolicyConfigRepository } from './policy-config.repository';

describe('PolicyConfigRepository', () => {
  const repo = new PolicyConfigRepository();
  const db: any = { policyConfig: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() } };
  beforeEach(() => jest.resetAllMocks());

  it('findEffective keeps the first (latest) row per policy type and queries by region', async () => {
    const rows = [
      { id: '1', policy_type: 'A' },
      { id: '2', policy_type: 'A' },
      { id: '3', policy_type: 'B' },
    ];
    db.policyConfig.findMany.mockResolvedValue(rows);
    const out = await repo.findEffective(db, 'EG');
    expect(out.map((r) => r.id)).toEqual(['1', '3']);
    const arg = db.policyConfig.findMany.mock.calls[0][0];
    expect(arg.where.region_code).toBe('EG');
    expect(arg.where.effective_from.lte).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual([{ policy_type: 'asc' }, { effective_from: 'desc' }]);
  });

  it('findEffective returns [] when there are no rows', async () => {
    db.policyConfig.findMany.mockResolvedValue([]);
    expect(await repo.findEffective(db, 'EG')).toEqual([]);
  });

  it('findCurrent selects the latest effective row', async () => {
    db.policyConfig.findFirst.mockResolvedValue({ id: 'x' });
    expect(await repo.findCurrent(db, 'EG', 'COMMISSION_RATE' as any)).toEqual({ id: 'x' });
    const arg = db.policyConfig.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({ region_code: 'EG', policy_type: 'COMMISSION_RATE' });
    expect(arg.orderBy).toEqual({ effective_from: 'desc' });
  });

  it('create maps params to columns', async () => {
    await repo.create(db, { regionCode: 'EG', policyType: 'COMMISSION_RATE' as any, value: { ratePercent: 1 }, createdBy: 'u' });
    expect(db.policyConfig.create).toHaveBeenCalledWith({
      data: { region_code: 'EG', policy_type: 'COMMISSION_RATE', value: { ratePercent: 1 }, created_by: 'u' },
    });
  });
});
