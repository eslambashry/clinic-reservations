import { GetPrescriptionItemDrugCodesUseCase } from './get-prescription-item-drug-codes.use-case';

describe('GetPrescriptionItemDrugCodesUseCase', () => {
  function setup() {
    const items = { findManyByIds: jest.fn() };
    const useCase = new GetPrescriptionItemDrugCodesUseCase(items as any);
    return { items, useCase };
  }

  it('returns a map of item id to drugCode, skipping items with no drugCode', async () => {
    const { items, useCase } = setup();
    items.findManyByIds.mockResolvedValue([
      { id: 'item-1', drug_code: 'PARA500' },
      { id: 'item-2', drug_code: null },
    ]);

    const result = await useCase.execute({} as any, ['item-1', 'item-2']);

    expect(result).toEqual(new Map([['item-1', 'PARA500']]));
  });
});
