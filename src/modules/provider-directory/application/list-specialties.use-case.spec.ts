import { ListSpecialtiesUseCase } from './list-specialties.use-case';

describe('ListSpecialtiesUseCase', () => {
  it('returns all specialties from the repository', async () => {
    const specialties = { findAll: jest.fn().mockResolvedValue([{ code: 'A' }]) };
    await expect(new ListSpecialtiesUseCase(specialties as any).execute()).resolves.toEqual([{ code: 'A' }]);
    expect(specialties.findAll).toHaveBeenCalledTimes(1);
  });
});
