import { GetUserSummaryUseCase } from './get-user-summary.use-case';

describe('GetUserSummaryUseCase', () => {
  it('masks the phone number, keeping the last 3 digits visible', async () => {
    const users = { findById: jest.fn().mockResolvedValue({ id: 'u-1', first_name: 'Sara', last_name: 'Ali', phone: '+201234567890' }) };
    const useCase = new GetUserSummaryUseCase(users as any);

    const result = await useCase.execute({} as any, 'u-1');

    expect(result).toEqual({ id: 'u-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '**********890' });
  });

  it('returns null for a user that does not exist', async () => {
    const users = { findById: jest.fn().mockResolvedValue(null) };
    const useCase = new GetUserSummaryUseCase(users as any);

    expect(await useCase.execute({} as any, 'missing')).toBeNull();
  });
});
