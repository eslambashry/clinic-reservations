import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateSpecialtyUseCase } from './update-specialty.use-case';

const actor = {
  sub: 'admin-user-1',
  roleMembershipId: 'membership-1',
  roleCode: 'ADMIN',
  contextType: 'ADMIN',
  permissions: [],
} as any;

describe('UpdateSpecialtyUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const specialties = {
      findByCode: jest.fn().mockResolvedValue({ code: 'CARDIOLOGY', name_ar: 'أمراض القلب' }),
      ancestorCodes: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation((_tx: unknown, code: string, input: any) => ({
        code,
        ...input,
      })),
    };
    const audit = { record: jest.fn() };
    const useCase = new UpdateSpecialtyUseCase(prisma as any, specialties as any, audit as any);
    return { tx, specialties, audit, useCase };
  }

  it('404s when the specialty does not exist', async () => {
    const { specialties, useCase } = setup();
    specialties.findByCode.mockResolvedValue(null);

    await expect(useCase.execute('NOPE', { name_ar: 'x' }, actor)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('renames a specialty and records an audit entry', async () => {
    const { tx, specialties, audit, useCase } = setup();

    await useCase.execute('CARDIOLOGY', { name_ar: 'أمراض القلب والأوعية' }, actor);

    expect(specialties.update).toHaveBeenCalledWith(tx, 'CARDIOLOGY', {
      name_ar: 'أمراض القلب والأوعية',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'provider_directory.specialty.update' }),
    );
  });

  it('clears the parent when parent_code is explicitly null', async () => {
    const { tx, specialties, useCase } = setup();

    await useCase.execute('CARDIOLOGY', { parent_code: null }, actor);

    expect(specialties.update).toHaveBeenCalledWith(tx, 'CARDIOLOGY', { parent_code: null });
    // A null parent needs no existence or cycle check.
    expect(specialties.ancestorCodes).not.toHaveBeenCalled();
  });

  it('409s when a specialty is made its own parent', async () => {
    const { specialties, useCase } = setup();

    const error = await useCase
      .execute('CARDIOLOGY', { parent_code: 'CARDIOLOGY' }, actor)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('SPECIALTY_PARENT_CYCLE');
    expect(specialties.update).not.toHaveBeenCalled();
  });

  it('409s when a specialty is re-parented under its own descendant', async () => {
    const { specialties, useCase } = setup();
    specialties.findByCode
      .mockResolvedValueOnce({ code: 'CARDIOLOGY' })
      .mockResolvedValueOnce({ code: 'PEDIATRIC_CARDIOLOGY' });
    // The proposed parent's ancestry runs back through the specialty itself.
    specialties.ancestorCodes.mockResolvedValue(['PEDIATRIC_CARDIOLOGY', 'CARDIOLOGY']);

    const error = await useCase
      .execute('CARDIOLOGY', { parent_code: 'PEDIATRIC_CARDIOLOGY' }, actor)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('SPECIALTY_PARENT_CYCLE');
    expect(specialties.update).not.toHaveBeenCalled();
  });

  it('404s when the new parent does not exist', async () => {
    const { specialties, useCase } = setup();
    specialties.findByCode
      .mockResolvedValueOnce({ code: 'CARDIOLOGY' })
      .mockResolvedValueOnce(null);

    await expect(
      useCase.execute('CARDIOLOGY', { parent_code: 'NOPE' }, actor),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
