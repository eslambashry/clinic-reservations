import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { SuspendDoctorUseCase } from './suspend-doctor.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('SuspendDoctorUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findById: jest.fn().mockResolvedValue({ id: 'd1', version: 3, status: 'VERIFIED' }), setStatus: jest.fn() };
    const audit = { record: jest.fn() };
    return { tx, doctors, audit, useCase: new SuspendDoctorUseCase(prisma as any, doctors as any, audit as any) };
  }

  it('404s when doctor missing', async () => {
    const { useCase, doctors, audit } = setup();
    doctors.findById.mockResolvedValue(null);
    await expect(useCase.execute('d1', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('suspends and audits previous status', async () => {
    const { tx, useCase, doctors, audit } = setup();
    await useCase.execute('d1', actor);
    expect(doctors.setStatus).toHaveBeenCalledWith(tx, 'd1', 3, 'SUSPENDED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'previous_status:VERIFIED' }));
  });
});
