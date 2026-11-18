import { ManageAddressUseCase } from './manage-address.use-case';

describe('ManageAddressUseCase', () => {
  const tx = {} as any;

  it('delegates create to the repository', async () => {
    const addresses = { create: jest.fn().mockResolvedValue({ id: 'ad1' }), update: jest.fn() };
    const useCase = new ManageAddressUseCase(addresses as any);
    const input = { line1: 'a' } as any;
    await expect(useCase.create(tx, input)).resolves.toEqual({ id: 'ad1' });
    expect(addresses.create).toHaveBeenCalledWith(tx, input);
  });

  it('delegates update with the optimistic version', async () => {
    const addresses = { create: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    const useCase = new ManageAddressUseCase(addresses as any);
    await useCase.update(tx, 'ad1', 4, { city: 'Giza' });
    expect(addresses.update).toHaveBeenCalledWith(tx, 'ad1', 4, { city: 'Giza' });
  });
});
