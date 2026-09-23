import { ListTestCatalogUseCase } from './list-test-catalog.use-case';

describe('ListTestCatalogUseCase', () => {
  it('maps catalog rows to the provider/patient DTO and trims search input', async () => {
    const catalog = { list: jest.fn().mockResolvedValue([{ code: 'CBC', display_name: 'صورة دم كاملة' }]) };
    const useCase = new ListTestCatalogUseCase({} as any, catalog as any);

    await expect(useCase.execute('  دم  ')).resolves.toEqual({ items: [{ code: 'CBC', displayName: 'صورة دم كاملة' }] });
    expect(catalog.list).toHaveBeenCalledWith(expect.anything(), 'دم');
  });

  it('does not apply an empty search filter', async () => {
    const catalog = { list: jest.fn().mockResolvedValue([]) };
    const useCase = new ListTestCatalogUseCase({} as any, catalog as any);

    await useCase.execute('  ');
    expect(catalog.list).toHaveBeenCalledWith(expect.anything(), undefined);
  });
});
