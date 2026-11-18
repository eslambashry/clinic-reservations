import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetSpecialtyForAdminUseCase } from './get-specialty-for-admin.use-case';

describe('GetSpecialtyForAdminUseCase', () => {
  it('returns the specialty with counts', async () => {
    const specialties = { findByCodeWithCounts: jest.fn().mockResolvedValue({ code: 'CARDIO', doctorCount: 3 }) };
    const useCase = new GetSpecialtyForAdminUseCase(specialties as any);
    await expect(useCase.execute('CARDIO')).resolves.toEqual({ code: 'CARDIO', doctorCount: 3 });
    expect(specialties.findByCodeWithCounts).toHaveBeenCalledWith('CARDIO');
  });

  it('404s when missing', async () => {
    const specialties = { findByCodeWithCounts: jest.fn().mockResolvedValue(null) };
    const useCase = new GetSpecialtyForAdminUseCase(specialties as any);
    await expect(useCase.execute('NOPE')).rejects.toBeInstanceOf(NotFoundError);
  });
});
