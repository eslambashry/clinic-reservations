import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { RejectProviderPrescriptionUseCase } from './reject-provider-prescription.use-case';

describe('RejectProviderPrescriptionUseCase', () => {
  const doctorActor = { sub: 'doctor-user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;
  const scope = { doctorId: 'doctor-1', doctorUserId: 'doctor-user-1', affiliations: [], affiliationIds: ['aff-1'], clinicBranchIds: ['branch-1'] };
  const pendingPrescription = {
    id: 'prescription-1',
    version: 1,
    status: 'PENDING_DOCTOR_APPROVAL',
    doctor_id: 'doctor-user-1',
    patient_id: 'patient-1',
  };

  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const prescriptions = { findById: jest.fn(), reject: jest.fn() };
    const doctorScope = { execute: jest.fn().mockResolvedValue(scope) };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };

    const useCase = new RejectProviderPrescriptionUseCase(prisma as any, prescriptions as any, doctorScope as any, audit as any, outbox as any);
    return { tx, prescriptions, doctorScope, audit, outbox, useCase };
  }

  it('rejects a pending draft owned by the calling doctor, recording the reason', async () => {
    const { tx, prescriptions, audit, outbox, useCase } = setup();
    prescriptions.findById.mockResolvedValue(pendingPrescription);

    const result = await useCase.execute('prescription-1', { reason: 'Dosage looks wrong', expectedVersion: 1 }, doctorActor);

    expect(result).toEqual({ prescriptionId: 'prescription-1', status: 'REJECTED' });
    expect(prescriptions.reject).toHaveBeenCalledWith(
      tx,
      'prescription-1',
      1,
      expect.objectContaining({ decidedByUserId: 'doctor-user-1', rejectionReason: 'Dosage looks wrong' }),
    );
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'prescriptions.prescription.reject', reasonCode: 'Dosage looks wrong' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderPrescriptionRejected', expect.objectContaining({ prescriptionId: 'prescription-1' }));
  });

  it('rejects a non-DOCTOR caller outright', async () => {
    const { prescriptions, useCase } = setup();
    const assistant = { ...doctorActor, contextType: 'CLINIC_STAFF' };

    await expect(useCase.execute('prescription-1', { reason: 'x', expectedVersion: 1 }, assistant)).rejects.toBeInstanceOf(ForbiddenError);
    expect(prescriptions.findById).not.toHaveBeenCalled();
  });

  it('404s (hiding existence) when a different doctor owns the draft', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...pendingPrescription, doctor_id: 'someone-elses-user-id' });

    await expect(useCase.execute('prescription-1', { reason: 'x', expectedVersion: 1 }, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
    expect(prescriptions.reject).not.toHaveBeenCalled();
  });

  it('404s when retried against an already-decided prescription', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...pendingPrescription, status: 'REJECTED' });

    await expect(useCase.execute('prescription-1', { reason: 'x', expectedVersion: 1 }, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
  });
});
