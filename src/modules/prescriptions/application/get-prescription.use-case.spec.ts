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

  it('hides unsigned assistant drafts from the patient and pharmacy staff', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...prescription, status: 'PENDING_DOCTOR_APPROVAL' });

    await expect(useCase.execute('prescription-1', { sub: 'patient-1', contextType: 'PATIENT' } as any)).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCase.execute('prescription-1', { sub: 'pharmacy-staff', contextType: 'PHARMACY_STAFF' } as any)).rejects.toBeInstanceOf(NotFoundError);
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

  it.each(['someone-else', 'patient-1'])('denies global prescription access to pharmacy staff subject %s before signing images', async (sub) => {
    const { prescriptions, images, items, reviews, mediaStorage, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    await expect(useCase.execute('prescription-1', { sub, contextType: 'PHARMACY_STAFF' } as any)).rejects.toBeInstanceOf(NotFoundError);
    expect(images.findByPrescriptionId).not.toHaveBeenCalled();
    expect(items.findByPrescriptionId).not.toHaveBeenCalled();
    expect(reviews.findByPrescriptionId).not.toHaveBeenCalled();
    expect(mediaStorage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('preserves Admin detail reads', async () => {
    const { prescriptions, images, items, reviews, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...prescription, status: 'PENDING_DOCTOR_APPROVAL' });
    images.findByPrescriptionId.mockResolvedValue([]);
    items.findByPrescriptionId.mockResolvedValue([]);
    reviews.findByPrescriptionId.mockResolvedValue([]);
    await expect(useCase.execute('prescription-1', { sub: 'admin-1', contextType: 'ADMIN' } as any)).resolves.toMatchObject({ prescriptionId: 'prescription-1' });
  });
});
