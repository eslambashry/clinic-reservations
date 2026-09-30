import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DeleteSpecialtyUseCase } from './delete-specialty.use-case';

const actor = {
  sub: 'admin-user-1',
  roleMembershipId: 'membership-1',
  roleCode: 'ADMIN',
  contextType: 'ADMIN',
  permissions: [],
} as any;

describe('DeleteSpecialtyUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const specialties = {
      findByCode: jest.fn().mockResolvedValue({ code: 'CARDIOLOGY', name_ar: 'أمراض القلب' }),
      countDoctors: jest.fn().mockResolvedValue(0),
      countChildren: jest.fn().mockResolvedValue(0),
      delete: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const useCase = new DeleteSpecialtyUseCase(prisma as any, specialties as any, audit as any);
    return { tx, specialties, audit, useCase };
  }

  it('404s when the specialty does not exist', async () => {
    const { specialties, useCase } = setup();
    specialties.findByCode.mockResolvedValue(null);

    await expect(useCase.execute('NOPE', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(specialties.delete).not.toHaveBeenCalled();
  });

  it('deletes a specialty nothing depends on and records an audit entry', async () => {
    const { tx, specialties, audit, useCase } = setup();

    await useCase.execute('CARDIOLOGY', actor);

    expect(specialties.delete).toHaveBeenCalledWith(tx, 'CARDIOLOGY');
    expect(audit.record).toHaveBeenCalledWith(tx, {
      actorUserId: 'admin-user-1',
      actorRoleMembershipId: 'membership-1',
      action: 'provider_directory.specialty.delete',
      resourceType: 'specialty',
      resourceId: 'CARDIOLOGY',
    });
  });

  it('refuses to delete a specialty that has doctors, naming the count', async () => {
    const { specialties, audit, useCase } = setup();
    specialties.countDoctors.mockResolvedValue(12);

    const error = await useCase.execute('CARDIOLOGY', actor).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('SPECIALTY_IN_USE');
    expect((error as ConflictError).message).toContain('12');
    expect((error as ConflictError).details).toMatchObject({ doctorCount: 12, childCount: 0 });
    expect(specialties.delete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses to delete a parent specialty that still has children', async () => {
    const { specialties, useCase } = setup();
    specialties.countChildren.mockResolvedValue(3);

    const error = await useCase.execute('INTERNAL_MEDICINE', actor).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('SPECIALTY_IN_USE');
    expect((error as ConflictError).details).toMatchObject({ doctorCount: 0, childCount: 3 });
    expect(specialties.delete).not.toHaveBeenCalled();
  });

  it('names both reasons when the specialty has doctors and children', async () => {
    const { specialties, useCase } = setup();
    specialties.countDoctors.mockResolvedValue(2);
    specialties.countChildren.mockResolvedValue(1);

    const error = await useCase.execute('INTERNAL_MEDICINE', actor).catch((e: unknown) => e);

    expect((error as ConflictError).message).toBe(
      'لا يمكن حذف هذا التخصص لارتباطه بـ طبيبين وتخصص فرعي واحد',
    );
  });
});
