import { NotFoundError } from '../../../shared/core/errors/domain-errors';
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
      create: jest
        .fn()
        .mockImplementation((_tx: unknown, input: any) => ({ code: '11111111-1111-4111-8111-111111111111', ...input })),
    };
    const audit = { record: jest.fn() };
    const useCase = new CreateSpecialtyUseCase(prisma as any, specialties as any, audit as any);
    return { tx, specialties, audit, useCase };
  }

  it('creates a top-level specialty and records an audit entry', async () => {
    const { tx, specialties, audit, useCase } = setup();

    const result = await useCase.execute({ name_ar: 'أمراض القلب' }, actor);

    // `code` comes back from the database, it is never supplied.
    expect(result.code).toBe('11111111-1111-4111-8111-111111111111');
    expect(specialties.create).toHaveBeenCalledWith(tx, { name_ar: 'أمراض القلب' });
    expect(audit.record).toHaveBeenCalledWith(tx, {
      actorUserId: 'admin-user-1',
      actorRoleMembershipId: 'membership-1',
      action: 'provider_directory.specialty.create',
      resourceType: 'specialty',
      resourceId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('404s when the parent code does not exist', async () => {
    const { specialties, useCase } = setup();
    specialties.findByCode.mockResolvedValue(null);

    await expect(
      useCase.execute({ name_ar: 'قلب الأطفال', parent_code: '22222222-2222-4222-8222-222222222222' }, actor),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(specialties.create).not.toHaveBeenCalled();
  });

  it('creates a child specialty when the parent exists', async () => {
    const { specialties, useCase } = setup();
    specialties.findByCode.mockResolvedValue({ code: '22222222-2222-4222-8222-222222222222' });

    await useCase.execute({ name_ar: 'قلب الأطفال', parent_code: '22222222-2222-4222-8222-222222222222' }, actor);

    expect(specialties.create).toHaveBeenCalledWith(expect.anything(), {
      name_ar: 'قلب الأطفال',
      parent_code: '22222222-2222-4222-8222-222222222222',
    });
  });
});
