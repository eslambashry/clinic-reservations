import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateSpecialtyUseCase } from './create-specialty.use-case';

const actor = {
  sub: 'admin-user-1',
  roleMembershipId: 'membership-1',
  roleCode: 'ADMIN',
  contextType: 'ADMIN',
  permissions: [],
} as any;

describe('CreateSpecialtyUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const specialties = {
      findByCode: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((_tx: unknown, input: any) => ({ ...input })),
    };
    const audit = { record: jest.fn() };
    const useCase = new CreateSpecialtyUseCase(prisma as any, specialties as any, audit as any);
    return { tx, specialties, audit, useCase };
  }

  it('creates a top-level specialty and records an audit entry', async () => {
    const { tx, specialties, audit, useCase } = setup();

    const result = await useCase.execute({ code: 'CARDIOLOGY', name_ar: 'أمراض القلب' }, actor);

    expect(result.code).toBe('CARDIOLOGY');
    expect(specialties.create).toHaveBeenCalledWith(tx, {
      code: 'CARDIOLOGY',
      name_ar: 'أمراض القلب',
    });
    expect(audit.record).toHaveBeenCalledWith(tx, {
      actorUserId: 'admin-user-1',
      actorRoleMembershipId: 'membership-1',
      action: 'provider_directory.specialty.create',
      resourceType: 'specialty',
      resourceId: 'CARDIOLOGY',
    });
  });

  it('409s when the code is already taken', async () => {
    const { specialties, useCase } = setup();
    specialties.findByCode.mockResolvedValue({ code: 'CARDIOLOGY' });

    const error = await useCase
      .execute({ code: 'CARDIOLOGY', name_ar: 'أمراض القلب' }, actor)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('SPECIALTY_CODE_EXISTS');
    expect(specialties.create).not.toHaveBeenCalled();
  });

  it('404s when the parent code does not exist', async () => {
    const { specialties, useCase } = setup();
    // The specialty itself is free, its parent is missing.
    specialties.findByCode.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(
      useCase.execute(
        { code: 'PEDIATRIC_CARDIOLOGY', name_ar: 'قلب الأطفال', parent_code: 'NOPE' },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(specialties.create).not.toHaveBeenCalled();
  });

  it('creates a child specialty when the parent exists', async () => {
    const { specialties, useCase } = setup();
    specialties.findByCode
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ code: 'CARDIOLOGY' });

    await useCase.execute(
      { code: 'PEDIATRIC_CARDIOLOGY', name_ar: 'قلب الأطفال', parent_code: 'CARDIOLOGY' },
      actor,
    );

    expect(specialties.create).toHaveBeenCalledWith(expect.anything(), {
      code: 'PEDIATRIC_CARDIOLOGY',
      name_ar: 'قلب الأطفال',
      parent_code: 'CARDIOLOGY',
    });
  });
});
