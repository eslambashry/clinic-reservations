import { ListSpecialtiesForAdminUseCase } from './list-specialties-for-admin.use-case';

describe('ListSpecialtiesForAdminUseCase', () => {
  function setup() {
    const specialties = {
      findPageWithCounts: jest.fn().mockResolvedValue([{ code: 'A' }]),
      countAll: jest.fn().mockResolvedValue(45),
      findAllNames: jest.fn().mockResolvedValue([{ code: 'A', name_ar: 'a' }]),
    };
    return { specialties, useCase: new ListSpecialtiesForAdminUseCase(specialties as any) };
  }

  it('trims the search, applies offset paging and returns page meta', async () => {
    const { specialties, useCase } = setup();
    const res = await useCase.execute({ q: '  card ', page: 2, limit: 10 });
    expect(specialties.findPageWithCounts).toHaveBeenCalledWith({ search: 'card', skip: 10, take: 10 });
    expect(specialties.countAll).toHaveBeenCalledWith('card');
    expect(res.items).toEqual([{ code: 'A' }]);
    expect(res.allNames).toEqual([{ code: 'A', name_ar: 'a' }]);
    expect(res).toMatchObject({ page: 2, limit: 10, totalCount: 45 });
  });

  it('treats blank search as none and uses defaults with no input', async () => {
    const { specialties, useCase } = setup();
    await useCase.execute({ q: '   ' });
    expect(specialties.countAll).toHaveBeenLastCalledWith(undefined);
    await useCase.execute();
    expect(specialties.findPageWithCounts).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined, skip: 0 }));
  });
});
