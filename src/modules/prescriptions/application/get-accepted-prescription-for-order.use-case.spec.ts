import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetAcceptedPrescriptionForOrderUseCase } from './get-accepted-prescription-for-order.use-case';

function buildTx() {
  return {} as any;
}

describe('GetAcceptedPrescriptionForOrderUseCase', () => {
  const tx = buildTx();

  function setup() {
    const prescriptions = { findById: jest.fn() };
    const items = { findByPrescriptionId: jest.fn() };
    const useCase = new GetAcceptedPrescriptionForOrderUseCase(prescriptions as any, items as any);
    return { prescriptions, items, useCase };
  }

  it('404s when the prescription does not exist', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue(null);

    await expect(useCase.execute(tx, 'prescription-1', 'patient-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s (hiding existence) when the caller is not the owning patient', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ id: 'prescription-1', patient_id: 'someone-else', status: 'ACCEPTED' });

    await expect(useCase.execute(tx, 'prescription-1', 'patient-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('422s with PRESCRIPTION_NOT_ACCEPTED when the prescription is not yet ACCEPTED', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ id: 'prescription-1', patient_id: 'patient-1', status: 'QUALITY_CHECK_PASSED' });

    await expect(useCase.execute(tx, 'prescription-1', 'patient-1')).rejects.toMatchObject({
      code: 'PRESCRIPTION_NOT_ACCEPTED',
      httpStatus: 422,
    });
  });

  it('returns only items with both a drugCode and a quantity set', async () => {
    const { prescriptions, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ id: 'prescription-1', patient_id: 'patient-1', status: 'ACCEPTED' });
    items.findByPrescriptionId.mockResolvedValue([
      { id: 'item-1', drug_code: 'PARA500', quantity: 20 },
      { id: 'item-2', drug_code: null, quantity: null },
      { id: 'item-3', drug_code: 'AMOX250', quantity: null },
    ]);

    const result = await useCase.execute(tx, 'prescription-1', 'patient-1');

    expect(result).toEqual({
      prescriptionId: 'prescription-1',
      items: [{ id: 'item-1', drugCode: 'PARA500', quantity: 20 }],
    });
  });
});
