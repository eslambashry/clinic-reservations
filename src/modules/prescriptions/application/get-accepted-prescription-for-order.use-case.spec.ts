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

  it('allows QUALITY_CHECK_PASSED — ACCEPTED only ever comes from a review endpoint nothing in the current ecosystem calls', async () => {
    const { prescriptions, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ id: 'prescription-1', patient_id: 'patient-1', status: 'QUALITY_CHECK_PASSED' });
    items.findByPrescriptionId.mockResolvedValue([{ id: 'item-1', drug_code: null, drug_name_free_text: 'Panadol', quantity: 20 }]);

    const result = await useCase.execute(tx, 'prescription-1', 'patient-1');

    expect(result.prescriptionId).toBe('prescription-1');
  });

  it.each(['UPLOADED', 'QUALITY_CHECK_FAILED', 'REJECTED', 'CANCELLED'])(
    '422s with PRESCRIPTION_NOT_ACCEPTED when the prescription status is %s',
    async (status) => {
      const { prescriptions, useCase } = setup();
      prescriptions.findById.mockResolvedValue({ id: 'prescription-1', patient_id: 'patient-1', status });

      await expect(useCase.execute(tx, 'prescription-1', 'patient-1')).rejects.toMatchObject({
        code: 'PRESCRIPTION_NOT_ACCEPTED',
        httpStatus: 422,
      });
    },
  );

  it('returns items with a quantity and either a real drugCode or only OCR free-text — neither alone with no quantity counts', async () => {
    const { prescriptions, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ id: 'prescription-1', patient_id: 'patient-1', status: 'ACCEPTED' });
    items.findByPrescriptionId.mockResolvedValue([
      { id: 'item-1', drug_code: 'PARA500', drug_name_free_text: null, quantity: 20 },
      { id: 'item-2', drug_code: null, drug_name_free_text: 'Amoxicillin', quantity: 10 },
      { id: 'item-3', drug_code: null, drug_name_free_text: null, quantity: 5 },
      { id: 'item-4', drug_code: 'AMOX250', drug_name_free_text: null, quantity: null },
    ]);

    const result = await useCase.execute(tx, 'prescription-1', 'patient-1');

    expect(result).toEqual({
      prescriptionId: 'prescription-1',
      items: [
        { id: 'item-1', drugCode: 'PARA500', quantity: 20 },
        { id: 'item-2', drugCode: null, quantity: 10 },
      ],
    });
  });
});
