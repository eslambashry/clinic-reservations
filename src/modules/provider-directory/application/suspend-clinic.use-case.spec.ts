import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { SuspendClinicUseCase } from './suspend-clinic.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('SuspendClinicUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const clinics = { findById: jest.fn().mockResolvedValue({ id: 'c1', version: 3, status: 'VERIFIED' }), setStatus: jest.fn() };
    const audit = { record: jest.fn() };
    return { tx, clinics, audit, useCase: new SuspendClinicUseCase(prisma as any, clinics as any, audit as any) };
  }

  it('404s when clinic missing', async () => {
    const { useCase, clinics, audit } = setup();
    clinics.findById.mockResolvedValue(null);
    await expect(useCase.execute('c1', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('suspends and audits previous status', async () => {
    const { tx, useCase, clinics, audit } = setup();
    await useCase.execute('c1', actor);
    expect(clinics.setStatus).toHaveBeenCalledWith(tx, 'c1', 3, 'SUSPENDED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'previous_status:VERIFIED' }));
  });
});
