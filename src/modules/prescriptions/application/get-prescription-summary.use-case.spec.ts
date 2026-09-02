import { GetPrescriptionSummaryUseCase } from './get-prescription-summary.use-case';

describe('GetPrescriptionSummaryUseCase', () => {
  it('projects the prescription and its images', async () => {
    const prescriptions = {
      findById: jest.fn().mockResolvedValue({
        id: 'presc-1',
        source: 'PATIENT_UPLOADED',
        status: 'ACCEPTED',
        expires_at: new Date('2026-09-01T00:00:00Z'),
        doctor_id: null,
        notes: 'Take with food',
      }),
    };
    const images = {
      findByPrescriptionId: jest.fn().mockResolvedValue([{ id: 'img-1', file_url: 'https://x/1.jpg', quality_check_status: 'PASSED' }]),
    };
    const mediaStorage = { getSignedUrl: jest.fn((url: string) => `${url}?signed=1`) };
    const useCase = new GetPrescriptionSummaryUseCase(prescriptions as any, images as any, mediaStorage as any);

    const result = await useCase.execute({} as any, 'presc-1');

    expect(result).toEqual({
      id: 'presc-1',
      source: 'PATIENT_UPLOADED',
      status: 'ACCEPTED',
      expiresAt: '2026-09-01T00:00:00.000Z',
      doctorId: null,
      notes: 'Take with food',
      images: [{ id: 'img-1', fileUrl: 'https://x/1.jpg?signed=1', qualityCheckStatus: 'PASSED' }],
    });
  });

  it('returns null when the prescription does not exist', async () => {
    const prescriptions = { findById: jest.fn().mockResolvedValue(null) };
    const images = { findByPrescriptionId: jest.fn() };
    const mediaStorage = { getSignedUrl: jest.fn() };
    const useCase = new GetPrescriptionSummaryUseCase(prescriptions as any, images as any, mediaStorage as any);

    expect(await useCase.execute({} as any, 'missing')).toBeNull();
  });
});
