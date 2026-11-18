import { REGION_CONSTANTS } from '../../config/constants';
import { BusinessRuleError } from '../../core/errors/domain-errors';
import { UpsertPolicyConfigUseCase } from './upsert-policy-config.use-case';

describe('UpsertPolicyConfigUseCase', () => {
  const tx: any = { tx: true };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const repo = { findCurrent: jest.fn(), create: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new UpsertPolicyConfigUseCase(prisma as any, repo as any, audit as any);
  const actor: any = { sub: 'admin-1', roleMembershipId: 'rm-1' };
  const created = { id: 'p1', region_code: 'EG', policy_type: 'COMMISSION_RATE', value: { ratePercent: 7 }, effective_from: new Date('2026-02-02T00:00:00Z'), created_by: 'admin-1' };
  beforeEach(() => {
    jest.clearAllMocks();
    repo.create.mockResolvedValue(created);
  });

  it('inserts a new row and audits with previous value none', async () => {
    repo.findCurrent.mockResolvedValue(null);
    const out = await useCase.execute({ policyType: 'COMMISSION_RATE' as any, value: { ratePercent: 7 } }, actor);
    expect(repo.findCurrent).toHaveBeenCalledWith(tx, REGION_CONSTANTS.DEFAULT_REGION_CODE, 'COMMISSION_RATE');
    expect(repo.create).toHaveBeenCalledWith(tx, { regionCode: REGION_CONSTANTS.DEFAULT_REGION_CODE, policyType: 'COMMISSION_RATE', value: { ratePercent: 7 }, createdBy: 'admin-1' });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ actorUserId: 'admin-1', actorRoleMembershipId: 'rm-1', resourceId: 'p1', reasonCode: 'previous_value:none' }));
    expect(out).toEqual({ id: 'p1', regionCode: 'EG', policyType: 'COMMISSION_RATE', value: { ratePercent: 7 }, effectiveFrom: '2026-02-02T00:00:00.000Z', createdBy: 'admin-1' });
  });

  it('records the previous value for an explicit region', async () => {
    repo.findCurrent.mockResolvedValue({ value: { ratePercent: 3 } });
    await useCase.execute({ policyType: 'COMMISSION_RATE' as any, regionCode: 'SA', value: { ratePercent: 7 } }, actor);
    expect(repo.findCurrent).toHaveBeenCalledWith(tx, 'SA', 'COMMISSION_RATE');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'previous_value:{"ratePercent":3}' }));
  });

  it('rejects invalid values before opening a transaction', async () => {
    await expect(useCase.execute({ policyType: 'COMMISSION_RATE' as any, value: { ratePercent: 500 } }, actor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
