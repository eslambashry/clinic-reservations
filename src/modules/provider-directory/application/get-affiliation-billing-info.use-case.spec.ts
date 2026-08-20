import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetAffiliationBillingInfoUseCase } from './get-affiliation-billing-info.use-case';

function buildTx() {
  return {} as any;
}

describe('GetAffiliationBillingInfoUseCase', () => {
  function setup() {
    const affiliations = { findById: jest.fn() };
    const useCase = new GetAffiliationBillingInfoUseCase(affiliations as any);
    return { affiliations, useCase };
  }

  it('404s when the affiliation does not exist', async () => {
    const { affiliations, useCase } = setup();
    affiliations.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildTx(), 'aff-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps consult_fee/currency/doctor_id off the raw affiliation row', async () => {
    const { affiliations, useCase } = setup();
    const tx = buildTx();
    affiliations.findById.mockResolvedValue({ consult_fee: { toString: () => '200.00' }, currency: 'EGP', doctor_id: 'doctor-1' });

    const result = await useCase.execute(tx, 'aff-1');

    expect(affiliations.findById).toHaveBeenCalledWith(tx, 'aff-1');
    expect(result).toEqual({ consultFee: '200.00', currency: 'EGP', doctorId: 'doctor-1' });
  });
});
