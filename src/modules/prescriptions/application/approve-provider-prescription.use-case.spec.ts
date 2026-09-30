import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { ApproveProviderPrescriptionUseCase } from './approve-provider-prescription.use-case';

describe('ApproveProviderPrescriptionUseCase', () => {
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
    const prescriptions = { findById: jest.fn(), approve: jest.fn() };
    const doctorScope = { execute: jest.fn().mockResolvedValue(scope) };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };

    const useCase = new ApproveProviderPrescriptionUseCase(prisma as any, prescriptions as any, doctorScope as any, audit as any, outbox as any);
    return { tx, prescriptions, doctorScope, audit, outbox, useCase };
  }

  it('approves a pending draft owned by the calling doctor', async () => {
    const { tx, prescriptions, audit, outbox, useCase } = setup();
    prescriptions.findById.mockResolvedValue(pendingPrescription);

    const result = await useCase.execute('prescription-1', 1, doctorActor);

    expect(result).toEqual({ prescriptionId: 'prescription-1', status: 'ACCEPTED' });
    expect(prescriptions.approve).toHaveBeenCalledWith(tx, 'prescription-1', 1, expect.objectContaining({ decidedByUserId: 'doctor-user-1' }));
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'prescriptions.prescription.approve', subjectPatientId: 'patient-1' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderPrescriptionApproved', expect.objectContaining({ prescriptionId: 'prescription-1' }));
  });

  it('rejects a non-DOCTOR caller outright (an assistant can never self-sign)', async () => {
    const { prescriptions, useCase } = setup();
    const assistant = { ...doctorActor, contextType: 'CLINIC_STAFF' };

    await expect(useCase.execute('prescription-1', 1, assistant)).rejects.toBeInstanceOf(ForbiddenError);
    expect(prescriptions.findById).not.toHaveBeenCalled();
  });

  it('404s (hiding existence) when a different doctor owns the draft', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...pendingPrescription, doctor_id: 'someone-elses-user-id' });

    await expect(useCase.execute('prescription-1', 1, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
    expect(prescriptions.approve).not.toHaveBeenCalled();
  });

  it('404s when the prescription is not in PENDING_DOCTOR_APPROVAL (e.g. already approved)', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...pendingPrescription, status: 'ACCEPTED' });

    await expect(useCase.execute('prescription-1', 1, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the prescription does not exist', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing', 1, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('passes the client-observed version to the optimistic-locking repository', async () => {
    const { tx, prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue(pendingPrescription);
    prescriptions.approve.mockRejectedValue(new OptimisticLockError('prescription-1', 2));

    await expect(useCase.execute('prescription-1', 2, doctorActor)).rejects.toBeInstanceOf(OptimisticLockError);
    expect(prescriptions.approve).toHaveBeenCalledWith(tx, 'prescription-1', 2, expect.anything());
  });
});
