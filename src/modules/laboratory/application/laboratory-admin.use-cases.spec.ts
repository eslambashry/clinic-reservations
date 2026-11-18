import { CreateLaboratoryUseCase } from './create-laboratory.use-case';
import { GetLaboratoryUseCase } from './get-laboratory.use-case';
import { SuspendLaboratoryUseCase } from './suspend-laboratory.use-case';
import { UpdateLaboratoryUseCase } from './update-laboratory.use-case';
import { VerifyLaboratoryUseCase } from './verify-laboratory.use-case';

const actor = { sub: 'admin-1', roleMembershipId: 'rm-admin' } as any;

function base() {
  const tx = { tx: true } as any;
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
  const laboratories = {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdWithBranches: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const outbox = { emit: jest.fn() };
  return { tx, prisma, laboratories, audit, outbox };
}

describe('CreateLaboratoryUseCase', () => {
  it('creates the laboratory and audits it', async () => {
    const b = base();
    b.laboratories.create.mockResolvedValue({ id: 'lab-1' });
    const useCase = new CreateLaboratoryUseCase(b.prisma as any, b.laboratories as any, b.audit as any);
    const input = { legalName: 'L', brandName: 'B' } as any;

    await expect(useCase.execute(input, actor)).resolves.toEqual({ id: 'lab-1' });
    expect(b.laboratories.create).toHaveBeenCalledWith(b.tx, input);
    expect(b.audit.record).toHaveBeenCalledWith(b.tx, {
      actorUserId: 'admin-1',
      actorRoleMembershipId: 'rm-admin',
      action: 'laboratory.laboratory.create',
      resourceType: 'laboratory',
      resourceId: 'lab-1',
    });
  });
});

describe('GetLaboratoryUseCase', () => {
  it('returns the laboratory with branches', async () => {
    const b = base();
    b.laboratories.findByIdWithBranches.mockResolvedValue({ id: 'lab-1', deleted_at: null });
    const useCase = new GetLaboratoryUseCase(b.prisma as any, b.laboratories as any);
    await expect(useCase.execute('lab-1')).resolves.toEqual({ id: 'lab-1', deleted_at: null });
    expect(b.laboratories.findByIdWithBranches).toHaveBeenCalledWith(b.prisma, 'lab-1');
  });

  it('404s a missing laboratory', async () => {
    const b = base();
    b.laboratories.findByIdWithBranches.mockResolvedValue(null);
    const useCase = new GetLaboratoryUseCase(b.prisma as any, b.laboratories as any);
    await expect(useCase.execute('lab-1')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s a soft-deleted laboratory', async () => {
    const b = base();
    b.laboratories.findByIdWithBranches.mockResolvedValue({ id: 'lab-1', deleted_at: new Date() });
    const useCase = new GetLaboratoryUseCase(b.prisma as any, b.laboratories as any);
    await expect(useCase.execute('lab-1')).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('UpdateLaboratoryUseCase', () => {
  it('updates with the current version and audits', async () => {
    const b = base();
    b.laboratories.findById.mockResolvedValue({ id: 'lab-1', version: 3, deleted_at: null });
    const useCase = new UpdateLaboratoryUseCase(b.prisma as any, b.laboratories as any, b.audit as any);

    await useCase.execute('lab-1', { brandName: 'New' } as any, actor);

    expect(b.laboratories.update).toHaveBeenCalledWith(b.tx, 'lab-1', 3, { brandName: 'New' });
    expect(b.audit.record).toHaveBeenCalledWith(b.tx, expect.objectContaining({ action: 'laboratory.laboratory.update' }));
  });

  it.each([[null], [{ deleted_at: new Date() }]])('404s when laboratory is %p', async (row) => {
    const b = base();
    b.laboratories.findById.mockResolvedValue(row);
    const useCase = new UpdateLaboratoryUseCase(b.prisma as any, b.laboratories as any, b.audit as any);
    await expect(useCase.execute('lab-1', {} as any, actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(b.laboratories.update).not.toHaveBeenCalled();
  });
});

describe('SuspendLaboratoryUseCase', () => {
  it('sets SUSPENDED and audits the previous status', async () => {
    const b = base();
    b.laboratories.findById.mockResolvedValue({ id: 'lab-1', version: 2, status: 'VERIFIED', deleted_at: null });
    const useCase = new SuspendLaboratoryUseCase(b.prisma as any, b.laboratories as any, b.audit as any);

    await useCase.execute('lab-1', actor);

    expect(b.laboratories.setStatus).toHaveBeenCalledWith(b.tx, 'lab-1', 2, 'SUSPENDED');
    expect(b.audit.record).toHaveBeenCalledWith(
      b.tx,
      expect.objectContaining({ action: 'laboratory.laboratory.suspend', reasonCode: 'previous_status:VERIFIED' }),
    );
  });

  it.each([[null], [{ deleted_at: new Date() }]])('404s when laboratory is %p', async (row) => {
    const b = base();
    b.laboratories.findById.mockResolvedValue(row);
    const useCase = new SuspendLaboratoryUseCase(b.prisma as any, b.laboratories as any, b.audit as any);
    await expect(useCase.execute('lab-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(b.laboratories.setStatus).not.toHaveBeenCalled();
  });
});

describe('VerifyLaboratoryUseCase', () => {
  it('sets VERIFIED, audits and emits ProviderVerified', async () => {
    const b = base();
    b.laboratories.findById.mockResolvedValue({ id: 'lab-1', version: 1, status: 'PENDING', deleted_at: null });
    const useCase = new VerifyLaboratoryUseCase(b.prisma as any, b.laboratories as any, b.audit as any, b.outbox as any);

    await useCase.execute('lab-1', actor);

    expect(b.laboratories.setStatus).toHaveBeenCalledWith(b.tx, 'lab-1', 1, 'VERIFIED');
    expect(b.audit.record).toHaveBeenCalledWith(
      b.tx,
      expect.objectContaining({ action: 'laboratory.laboratory.verify', reasonCode: 'previous_status:PENDING' }),
    );
    expect(b.outbox.emit).toHaveBeenCalledWith(b.tx, 'ProviderVerified', { providerType: 'LAB', providerId: 'lab-1' });
  });

  it.each([[null], [{ deleted_at: new Date() }]])('404s when laboratory is %p', async (row) => {
    const b = base();
    b.laboratories.findById.mockResolvedValue(row);
    const useCase = new VerifyLaboratoryUseCase(b.prisma as any, b.laboratories as any, b.audit as any, b.outbox as any);
    await expect(useCase.execute('lab-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(b.outbox.emit).not.toHaveBeenCalled();
  });
});
