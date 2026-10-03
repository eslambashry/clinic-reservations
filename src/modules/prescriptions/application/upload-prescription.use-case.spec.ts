import { UploadPrescriptionUseCase } from './upload-prescription.use-case';
import { AssertDoctorPrescribingEligibilityUseCase } from '../../provider-directory/application/assert-doctor-prescribing-eligibility.use-case';
import { DoctorRepository } from '../../provider-directory/infrastructure/doctor.repository';

function buildTx() {
  return { $queryRaw: jest.fn().mockResolvedValue([]), doctor: { findUnique: jest.fn().mockResolvedValue({ status: 'VERIFIED', deleted_at: null }) } } as any;
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
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)), doctor: tx.doctor };
    const prescriptions = { create: jest.fn(), setStatus: jest.fn() };
    const images = { createMany: jest.fn() };
    const items = { createManySuggested: jest.fn() };
    const qualityChecker = { check: jest.fn() };
    const ocrExtractor = { extract: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const mediaStorage = { upload: jest.fn().mockResolvedValue({ url: 'https://example.com/rx1.jpg', fileId: 'file-1', filePath: '/prescriptions/patient-1/rx1.jpg' }) };
    const doctorScope = { execute: jest.fn().mockResolvedValue({ doctorId: 'doctor-id-1', doctorUserId: 'doctor-1', affiliationIds: ['aff-1'] }) };
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
      new AssertDoctorPrescribingEligibilityUseCase(new DoctorRepository()),
    );
    return { tx, prisma, prescriptions, images, items, qualityChecker, ocrExtractor, audit, outbox, mediaStorage, doctorScope, patientAccess, getDoctorAppointment, useCase };
  }

  const providerActor = (role: string) => ({ sub: 'provider-1', roleMembershipId: 'provider-membership', contextType: role, permissions: ['prescriptions:create:assistant', 'lab-orders:create:assistant'] }) as any;

  it.each(['PENDING', 'REJECTED', 'SUSPENDED', 'DELETED'].flatMap((status) => ['DOCTOR', 'CLINIC_STAFF'].map((role) => ({ status, role }))))(
    'blocks medication upload for $status supervising doctor and $role before storage', async ({ status, role }) => {
      const { tx, mediaStorage, prescriptions, audit, outbox, useCase } = setup();
      tx.doctor.findUnique.mockResolvedValue({ status, deleted_at: status === 'DELETED' ? new Date() : null });
      await expect(useCase.executeForProvider({ ...input, patientId: 'patient-1', documentType: 'PRESCRIPTION' }, providerActor(role)))
        .rejects.toMatchObject({ code: status === 'DELETED' ? 'RESOURCE_NOT_FOUND' : 'DOCTOR_NOT_ELIGIBLE_TO_PRESCRIBE' });
      expect(mediaStorage.upload).not.toHaveBeenCalled();
      expect(prescriptions.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(outbox.emit).not.toHaveBeenCalled();
    },
  );

  it('rechecks suspension under the transaction lock after an eligible medication upload preflight', async () => {
    const { tx, qualityChecker, ocrExtractor, prescriptions, images, audit, outbox, useCase } = setup();
    tx.doctor.findUnique.mockResolvedValueOnce({ status: 'VERIFIED', deleted_at: null }).mockResolvedValueOnce({ status: 'SUSPENDED', deleted_at: null });
    qualityChecker.check.mockResolvedValue({ passed: true });
    ocrExtractor.extract.mockResolvedValue([]);
    await expect(useCase.executeForProvider({ ...input, patientId: 'patient-1', documentType: 'PRESCRIPTION' }, providerActor('DOCTOR')))
      .rejects.toMatchObject({ code: 'DOCTOR_NOT_ELIGIBLE_TO_PRESCRIBE' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prescriptions.create).not.toHaveBeenCalled();
    expect(images.createMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it.each([['DOCTOR', true, 'ACCEPTED'], ['CLINIC_STAFF', true, 'PENDING_DOCTOR_APPROVAL'], ['DOCTOR', false, 'QUALITY_CHECK_FAILED'], ['CLINIC_STAFF', false, 'QUALITY_CHECK_FAILED']])(
    'preserves verified %s medication upload quality=%s -> %s', async (role, passed, status) => {
      const { prescriptions, qualityChecker, ocrExtractor, useCase } = setup();
      prescriptions.create.mockResolvedValue(prescription);
      qualityChecker.check.mockResolvedValue({ passed });
      ocrExtractor.extract.mockResolvedValue([]);
      await expect(useCase.executeForProvider({ ...input, patientId: 'patient-1', documentType: 'PRESCRIPTION' }, providerActor(role as string)))
        .resolves.toEqual({ prescriptionId: prescription.id, status });
    },
  );

  it('preserves the separate laboratory referral upload contract for a suspended doctor', async () => {
    const { tx, prescriptions, qualityChecker, useCase } = setup();
    tx.doctor.findUnique.mockResolvedValue({ status: 'SUSPENDED', deleted_at: null });
    prescriptions.create.mockResolvedValue(prescription);
    qualityChecker.check.mockResolvedValue({ passed: true });
    await expect(useCase.executeForProvider({ ...input, patientId: 'patient-1', documentType: 'LAB_REFERRAL' }, providerActor('DOCTOR')))
      .resolves.toEqual({ prescriptionId: prescription.id, status: 'QUALITY_CHECK_PASSED' });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('sets QUALITY_CHECK_PASSED, runs OCR, and sends no upload notification when all images pass', async () => {
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
    expect(outbox.emit).not.toHaveBeenCalledWith(expect.anything(), 'PrescriptionUploaded', expect.anything());
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
