import { UploadPrescriptionUseCase } from './upload-prescription.use-case';

function buildTx() {
  return {} as any;
}

describe('UploadPrescriptionUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const input = {
    files: [{ buffer: Buffer.from('img'), originalName: 'rx1.jpg', mimeType: 'image/jpeg', sizeBytes: 3 }],
    notes: 'Take with food',
  };
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
    const doctorScope = { execute: jest.fn().mockResolvedValue({ doctorUserId: 'doctor-1', affiliationIds: ['aff-1'] }) };
    const patientAccess = { execute: jest.fn().mockResolvedValue(undefined) };
    const getDoctorAppointment = { execute: jest.fn() };
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
      doctorScope as any,
      patientAccess as any,
      getDoctorAppointment as any,
    );
    return { tx, prisma, prescriptions, images, items, qualityChecker, ocrExtractor, audit, outbox, mediaStorage, doctorScope, patientAccess, getDoctorAppointment, useCase };
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

  it('uploads provider prescription photos to the patient folder and queues assistant medication images for doctor approval', async () => {
    const { prescriptions, images, items, qualityChecker, ocrExtractor, doctorScope, patientAccess, outbox, mediaStorage, useCase } = setup();
    const assistant = {
      sub: 'assistant-1', roleMembershipId: 'assistant-membership', contextType: 'CLINIC_STAFF',
      permissions: ['prescriptions:create:assistant'],
    } as any;
    qualityChecker.check.mockResolvedValue({ passed: true, blurScore: null });
    ocrExtractor.extract.mockResolvedValue([]);
    prescriptions.create.mockResolvedValue(prescription);

    const result = await useCase.executeForProvider({
      ...input,
      patientId: 'patient-1',
      documentType: 'PRESCRIPTION' as any,
    }, assistant);

    expect(result).toEqual({ prescriptionId: 'prescription-1', status: 'PENDING_DOCTOR_APPROVAL' });
    expect(doctorScope.execute).toHaveBeenCalledWith(assistant);
    expect(patientAccess.execute).toHaveBeenCalledWith('patient-1', ['aff-1']);
    expect(mediaStorage.upload).toHaveBeenCalledWith(input.files[0], { folder: 'prescriptions/patient-1', isPrivate: true });
    expect(prescriptions.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      patientId: 'patient-1', source: 'DOCTOR_ISSUED', documentType: 'PRESCRIPTION',
      status: 'PENDING_DOCTOR_APPROVAL', createdByUserId: 'assistant-1',
    }));
    expect(images.createMany).toHaveBeenCalled();
    expect(items.createManySuggested).not.toHaveBeenCalled();
    expect(outbox.emit).toHaveBeenCalledWith(expect.anything(), 'ProviderPrescriptionPendingApproval', expect.anything());
  });

  it('allows an authorized assistant lab referral without prescription signoff and skips medication OCR', async () => {
    const { prescriptions, images, items, qualityChecker, ocrExtractor, useCase } = setup();
    const assistant = {
      sub: 'assistant-1', roleMembershipId: 'assistant-membership', contextType: 'CLINIC_STAFF',
      permissions: ['lab-orders:create:assistant'],
    } as any;
    qualityChecker.check.mockResolvedValue({ passed: true, blurScore: null });
    prescriptions.create.mockResolvedValue(prescription);

    const result = await useCase.executeForProvider({
      ...input,
      patientId: 'patient-1',
      documentType: 'LAB_REFERRAL' as any,
    }, assistant);

    expect(result).toEqual({ prescriptionId: 'prescription-1', status: 'QUALITY_CHECK_PASSED' });
    expect(prescriptions.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      documentType: 'LAB_REFERRAL', status: 'QUALITY_CHECK_PASSED',
    }));
    expect(images.createMany).toHaveBeenCalled();
    expect(ocrExtractor.extract).not.toHaveBeenCalled();
    expect(items.createManySuggested).not.toHaveBeenCalled();
  });

  it('rejects provider image uploads for patients outside the doctor scope before storing files', async () => {
    const { mediaStorage, patientAccess, useCase } = setup();
    patientAccess.execute.mockRejectedValue(new Error('not in scope'));
    const doctor = { sub: 'doctor-1', roleMembershipId: 'doctor-membership', contextType: 'DOCTOR', permissions: [] } as any;

    await expect(useCase.executeForProvider({
      ...input,
      patientId: 'patient-outside-scope',
      documentType: 'LAB_REFERRAL' as any,
    }, doctor)).rejects.toThrow('not in scope');
    expect(mediaStorage.upload).not.toHaveBeenCalled();
  });
});
