import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateAffiliationUseCase } from './update-affiliation.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('UpdateAffiliationUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const affiliations = { findById: jest.fn().mockResolvedValue({ id: 'aff1', version: 2 }), update: jest.fn() };
    const audit = { record: jest.fn() };
    return { tx, affiliations, audit, useCase: new UpdateAffiliationUseCase(prisma as any, affiliations as any, audit as any) };
  }

  it('404s when affiliation missing', async () => {
    const { useCase, affiliations } = setup();
    affiliations.findById.mockResolvedValue(null);
    await expect(useCase.execute('aff1', {} as any, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(affiliations.update).not.toHaveBeenCalled();
  });

  it('updates with version and audits', async () => {
    const { tx, useCase, affiliations, audit } = setup();
    const input = { status: 'PAUSED' } as any;
    await useCase.execute('aff1', input, actor);
    expect(affiliations.update).toHaveBeenCalledWith(tx, 'aff1', 2, input);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'aff1', action: 'provider_directory.affiliation.update' }));
  });
});
