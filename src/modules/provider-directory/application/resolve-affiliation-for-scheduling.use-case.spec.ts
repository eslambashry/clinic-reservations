import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { ResolveAffiliationForSchedulingUseCase } from './resolve-affiliation-for-scheduling.use-case';

function affiliation(overrides: Partial<any> = {}) {
  return {
    id: 'aff-1',
    status: 'ACTIVE',
    doctor: { status: 'VERIFIED', deleted_at: null },
    clinic_branch: { status: 'VERIFIED', iana_timezone: 'Africa/Cairo', clinic: { status: 'VERIFIED', deleted_at: null } },
    ...overrides,
  };
}

describe('ResolveAffiliationForSchedulingUseCase', () => {
  function setup() {
    const prisma = {};
    const affiliations = { findByDoctorAndBranch: jest.fn() };
    const useCase = new ResolveAffiliationForSchedulingUseCase(prisma as any, affiliations as any);
    return { affiliations, useCase };
  }

  it('404s when no affiliation exists for the doctor/branch pair', async () => {
    const { affiliations, useCase } = setup();
    affiliations.findByDoctorAndBranch.mockResolvedValue(null);

    await expect(useCase.execute('d1', 'b1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s an anonymous caller when the doctor is PENDING (never reveal existence)', async () => {
    const { affiliations, useCase } = setup();
    affiliations.findByDoctorAndBranch.mockResolvedValue(affiliation({ doctor: { status: 'PENDING', deleted_at: null } }));

    await expect(useCase.execute('d1', 'b1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolves the affiliation id + branch timezone for a visible chain', async () => {
    const { affiliations, useCase } = setup();
    affiliations.findByDoctorAndBranch.mockResolvedValue(affiliation());

    const result = await useCase.execute('d1', 'b1', undefined);

    expect(result).toEqual({ affiliationId: 'aff-1', timezone: 'Africa/Cairo' });
  });

  it('lets an Admin caller bypass visibility for a PENDING doctor', async () => {
    const { affiliations, useCase } = setup();
    affiliations.findByDoctorAndBranch.mockResolvedValue(affiliation({ doctor: { status: 'PENDING', deleted_at: null } }));

    const result = await useCase.execute('d1', 'b1', 'ADMIN');

    expect(result).toEqual({ affiliationId: 'aff-1', timezone: 'Africa/Cairo' });
  });
});
