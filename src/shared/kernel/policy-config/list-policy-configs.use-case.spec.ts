import { REGION_CONSTANTS } from '../../config/constants';
import { ListPolicyConfigsUseCase } from './list-policy-configs.use-case';

describe('ListPolicyConfigsUseCase', () => {
  const prisma: any = {};
  const repo = { findEffective: jest.fn() };
  const useCase = new ListPolicyConfigsUseCase(prisma, repo as any);
  const row = { id: '1', region_code: 'EG', policy_type: 'COMMISSION_RATE', value: { ratePercent: 5 }, effective_from: new Date('2026-01-01T00:00:00Z'), created_by: 'u' };

  it('maps rows for an explicit region', async () => {
    repo.findEffective.mockResolvedValue([row]);
    expect(await useCase.execute('SA')).toEqual({
      policies: [{ id: '1', regionCode: 'EG', policyType: 'COMMISSION_RATE', value: { ratePercent: 5 }, effectiveFrom: '2026-01-01T00:00:00.000Z', createdBy: 'u' }],
    });
    expect(repo.findEffective).toHaveBeenCalledWith(prisma, 'SA');
  });

  it('defaults to the default region', async () => {
    repo.findEffective.mockResolvedValue([]);
    expect(await useCase.execute()).toEqual({ policies: [] });
    expect(repo.findEffective).toHaveBeenLastCalledWith(prisma, REGION_CONSTANTS.DEFAULT_REGION_CODE);
  });
});
