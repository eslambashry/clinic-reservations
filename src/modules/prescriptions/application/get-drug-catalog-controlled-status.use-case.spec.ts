import { GetDrugCatalogControlledStatusUseCase } from './get-drug-catalog-controlled-status.use-case';

describe('GetDrugCatalogControlledStatusUseCase', () => {
  function setup() {
    const drugCatalog = { findManyByCode: jest.fn() };
    const useCase = new GetDrugCatalogControlledStatusUseCase(drugCatalog as any);
    return { drugCatalog, useCase };
  }

  it('returns a map of code to controlled_substance, deduping the input codes', async () => {
    const { drugCatalog, useCase } = setup();
    drugCatalog.findManyByCode.mockResolvedValue([
      { code: 'PARA500', controlled_substance: false },
      { code: 'TRAMADOL50', controlled_substance: true },
    ]);

    const result = await useCase.execute({} as any, ['PARA500', 'TRAMADOL50', 'PARA500']);

    expect(drugCatalog.findManyByCode).toHaveBeenCalledWith({}, ['PARA500', 'TRAMADOL50']);
    expect(result).toEqual(
      new Map([
        ['PARA500', false],
        ['TRAMADOL50', true],
      ]),
    );
  });
});
