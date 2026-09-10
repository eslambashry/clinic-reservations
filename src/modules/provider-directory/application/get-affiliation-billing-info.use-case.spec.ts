import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetAffiliationBillingInfoUseCase } from './get-affiliation-billing-info.use-case';

function buildTx() {
  return {} as any;
}

describe('GetAffiliationBillingInfoUseCase', () => {
  function setup() {
    const affiliations = { findById: jest.fn() };
    const doctors = { findById: jest.fn() };
    const useCase = new GetAffiliationBillingInfoUseCase(affiliations as any, doctors as any);
    return { affiliations, doctors, useCase };
  }

  it('404s when the affiliation does not exist', async () => {
    const { affiliations, useCase } = setup();
    affiliations.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildTx(), 'aff-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the affiliation points at a doctor that no longer exists', async () => {
    const { affiliations, doctors, useCase } = setup();
    affiliations.findById.mockResolvedValue({ consult_fee: { toString: () => '200.00' }, currency: 'EGP', doctor_id: 'doctor-1' });
    doctors.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildTx(), 'aff-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps consult_fee/currency/doctor_id/doctor_user_id/clinic_branch_id off the raw rows', async () => {
    const { affiliations, doctors, useCase } = setup();
    const tx = buildTx();
    affiliations.findById.mockResolvedValue({
      consult_fee: { toString: () => '200.00' },
      currency: 'EGP',
      doctor_id: 'doctor-1',
      clinic_branch_id: 'branch-1',
    });
    doctors.findById.mockResolvedValue({ user_id: 'user-1' });

    const result = await useCase.execute(tx, 'aff-1');

    expect(affiliations.findById).toHaveBeenCalledWith(tx, 'aff-1');
    expect(doctors.findById).toHaveBeenCalledWith(tx, 'doctor-1');
    expect(result).toEqual({
      consultFee: '200.00',
      currency: 'EGP',
      doctorId: 'doctor-1',
      doctorUserId: 'user-1',
      clinicBranchId: 'branch-1',
    });
  });
});
