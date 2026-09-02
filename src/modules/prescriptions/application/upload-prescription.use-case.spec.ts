import { UploadPrescriptionUseCase } from './upload-prescription.use-case';

function buildTx() {
  return {} as any;
}

describe('UploadPrescriptionUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const input = { files: [{ buffer: Buffer.from('img'), originalName: 'rx1.jpg', mimeType: 'image/jpeg', sizeBytes: 3 }] };
  const prescription = { id: 'prescription-1', version: 1 };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const prescriptions = { create: jest.fn(), setStatus: jest.fn() };
    const images = { createMany: jest.fn() };
    const items = { createManySuggested: jest.fn() };
    const qualityChecker = { check: jest.fn() };
    const ocrExtractor = { extract: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const mediaStorage = { upload: jest.fn().mockResolvedValue({ url: 'https://example.com/rx1.jpg', fileId: 'file-1', filePath: '/prescriptions/patient-1/rx1.jpg' }) };
    const useCase = new UploadPrescriptionUseCase(
      prisma as any,
      prescriptions as any,
      images as any,
      items as any,
      qualityChecker as any,
      ocrExtractor as any,
      audit as any,
      outbox as any,
      mediaStorage as any,
    );
    return { tx, prisma, prescriptions, images, items, qualityChecker, ocrExtractor, audit, outbox, mediaStorage, useCase };
  }

  it('sets QUALITY_CHECK_PASSED, runs OCR, and emits PrescriptionUploaded when all images pass', async () => {
    const { tx, prescriptions, images, items, qualityChecker, ocrExtractor, audit, outbox, mediaStorage, useCase } = setup();
    qualityChecker.check.mockResolvedValue({ passed: true, blurScore: null });
    ocrExtractor.extract.mockResolvedValue([{ drugNameFreeText: 'Panadol', dose: null, frequency: null, durationDays: null, quantity: null }]);
    prescriptions.create.mockResolvedValue(prescription);

    const result = await useCase.execute(input, actor);

    expect(mediaStorage.upload).toHaveBeenCalledWith(input.files[0], { folder: 'prescriptions/patient-1', isPrivate: true });
    expect(result).toEqual({ prescriptionId: 'prescription-1', status: 'QUALITY_CHECK_PASSED' });
    expect(prescriptions.create).toHaveBeenCalledWith(tx, { patientId: 'patient-1', source: 'PATIENT_UPLOADED', notes: 'Take with food' });
    expect(images.createMany).toHaveBeenCalledWith(tx, [
      { prescriptionId: 'prescription-1', fileUrl: 'https://example.com/rx1.jpg', qualityCheck: { passed: true, blurScore: null } },
    ]);
    expect(items.createManySuggested).toHaveBeenCalledWith(tx, 'prescription-1', [
      { drugNameFreeText: 'Panadol', dose: null, frequency: null, durationDays: null, quantity: null },
    ]);
    expect(prescriptions.setStatus).toHaveBeenCalledWith(tx, 'prescription-1', 1, 'QUALITY_CHECK_PASSED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'prescriptions.prescription.upload', resourceId: 'prescription-1' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PrescriptionUploaded', expect.objectContaining({ prescriptionId: 'prescription-1', status: 'QUALITY_CHECK_PASSED' }));
  });

  it('sets QUALITY_CHECK_FAILED and skips OCR entirely when a quality check fails', async () => {
    const { prescriptions, items, qualityChecker, ocrExtractor, useCase } = setup();
    qualityChecker.check.mockResolvedValue({ passed: false, blurScore: 0.9 });
    prescriptions.create.mockResolvedValue(prescription);

    const result = await useCase.execute(input, actor);

    expect(result).toEqual({ prescriptionId: 'prescription-1', status: 'QUALITY_CHECK_FAILED' });
    expect(ocrExtractor.extract).not.toHaveBeenCalled();
    expect(items.createManySuggested).not.toHaveBeenCalled();
    expect(prescriptions.setStatus).toHaveBeenCalledWith(expect.anything(), 'prescription-1', 1, 'QUALITY_CHECK_FAILED');
  });
});
