import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetPrescriptionUseCase } from './get-prescription.use-case';

function buildTx() {
  return {} as any;
}

describe('GetPrescriptionUseCase', () => {
  const prescription = { id: 'prescription-1', patient_id: 'patient-1', status: 'QUALITY_CHECK_PASSED', source: 'PATIENT_UPLOADED', notes: 'Take with food' };

  function setup() {
    const prisma = buildTx();
    const prescriptions = { findById: jest.fn() };
    const images = { findByPrescriptionId: jest.fn() };
    const items = { findByPrescriptionId: jest.fn() };
    const reviews = { findByPrescriptionId: jest.fn() };
    const mediaStorage = { getSignedUrl: jest.fn((url: string) => `${url}?signed=1`) };
    const useCase = new GetPrescriptionUseCase(prisma as any, prescriptions as any, images as any, items as any, reviews as any, mediaStorage as any);
    return { prescriptions, images, items, reviews, mediaStorage, useCase };
  }

  it('404s when the prescription does not exist', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue(null);

    const actor = { sub: 'patient-1', contextType: 'PATIENT' } as any;
    await expect(useCase.execute('prescription-1', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when a different patient tries to read someone else\'s prescription', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);

    const actor = { sub: 'other-patient', contextType: 'PATIENT' } as any;
    await expect(useCase.execute('prescription-1', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('allows the owning patient to read their own prescription', async () => {
    const { prescriptions, images, items, reviews, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    images.findByPrescriptionId.mockResolvedValue([]);
    items.findByPrescriptionId.mockResolvedValue([]);
    reviews.findByPrescriptionId.mockResolvedValue([]);

    const actor = { sub: 'patient-1', contextType: 'PATIENT' } as any;
    const result = await useCase.execute('prescription-1', actor);

    expect(result.prescriptionId).toBe('prescription-1');
    expect(result.notes).toBe('Take with food');
  });

  it('allows PHARMACY_STAFF to read any prescription (no branch-scoping yet, File 12 Part 37.4)', async () => {
    const { prescriptions, images, items, reviews, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    images.findByPrescriptionId.mockResolvedValue([]);
    items.findByPrescriptionId.mockResolvedValue([]);
    reviews.findByPrescriptionId.mockResolvedValue([]);

    const actor = { sub: 'someone-else', contextType: 'PHARMACY_STAFF' } as any;
    const result = await useCase.execute('prescription-1', actor);

    expect(result.prescriptionId).toBe('prescription-1');
  });
});
