import { describe, it, expect, jest } from '@jest/globals';
import { ListSchedulableAffiliationsUseCase } from './list-schedulable-affiliations.use-case';

function affiliation(overrides: Partial<any> = {}) {
  return {
    id: 'aff-1',
    status: 'ACTIVE',
    doctor: { status: 'VERIFIED', deleted_at: null },
    clinic_branch: { status: 'VERIFIED', iana_timezone: 'Africa/Cairo', clinic: { status: 'VERIFIED', deleted_at: null } },
    ...overrides,
  };
}

describe('ListSchedulableAffiliationsUseCase', () => {
  function setup() {
    const prisma = {};
    const affiliations = { findManyByIdsWithVisibilityChain: jest.fn() };
    const useCase = new ListSchedulableAffiliationsUseCase(prisma as any, affiliations as any);
    return { affiliations, useCase };
  }

  it('returns an empty array without querying when given no ids', async () => {
    const { affiliations, useCase } = setup();

    const result = await useCase.execute([]);

    expect(result).toEqual([]);
    expect(affiliations.findManyByIdsWithVisibilityChain).not.toHaveBeenCalled();
  });

  it('filters out affiliations that fail the visibility chain', async () => {
    const { affiliations, useCase } = setup();
    const visible = affiliation({ id: 'aff-visible' });
    const pendingDoctor = affiliation({ id: 'aff-pending', doctor: { status: 'PENDING', deleted_at: null } });
    const suspendedBranch = affiliation({
      id: 'aff-suspended-branch',
      clinic_branch: { status: 'SUSPENDED', iana_timezone: 'Africa/Cairo', clinic: { status: 'VERIFIED', deleted_at: null } },
    });
    affiliations.findManyByIdsWithVisibilityChain.mockResolvedValue([visible, pendingDoctor, suspendedBranch]);

    const result = await useCase.execute(['aff-visible', 'aff-pending', 'aff-suspended-branch']);

    expect(result).toEqual([{ affiliationId: 'aff-visible', timezone: 'Africa/Cairo' }]);
  });
});
