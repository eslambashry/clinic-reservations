import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateClinicUseCase } from './update-clinic.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('UpdateClinicUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const clinics = { findById: jest.fn().mockResolvedValue({ id: 'c1', version: 2 }), update: jest.fn() };
    const audit = { record: jest.fn() };
    return { tx, clinics, audit, useCase: new UpdateClinicUseCase(prisma as any, clinics as any, audit as any) };
  }

  it('404s when clinic missing', async () => {
    const { useCase, clinics } = setup();
    clinics.findById.mockResolvedValue(null);
    await expect(useCase.execute('c1', {} as any, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(clinics.update).not.toHaveBeenCalled();
  });

  it('updates with version and audits', async () => {
    const { tx, useCase, clinics, audit } = setup();
    const input = { brandName: 'X' } as any;
    await useCase.execute('c1', input, actor);
    expect(clinics.update).toHaveBeenCalledWith(tx, 'c1', 2, input);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'c1', action: 'provider_directory.clinic.update' }));
  });
});
