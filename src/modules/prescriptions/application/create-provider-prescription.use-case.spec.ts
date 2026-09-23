import { BusinessRuleError, ForbiddenError } from '../../../shared/core/errors/domain-errors';
import { CreateProviderPrescriptionUseCase } from './create-provider-prescription.use-case';

function buildTx() {
  return {} as any;
}

describe('CreateProviderPrescriptionUseCase', () => {
  const doctorActor = { sub: 'doctor-user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;
  const assistantActor = {
    sub: 'assistant-user-1',
    roleMembershipId: 'membership-2',
    roleCode: 'CLINIC_STAFF',
    contextType: 'CLINIC_STAFF',
    permissions: ['prescriptions:create:assistant'],
  } as any;
  const scope = { doctorId: 'doctor-1', doctorUserId: 'doctor-user-1', affiliations: [], affiliationIds: ['aff-1'], clinicBranchIds: ['branch-1'] };
  const baseInput = {
    patientId: 'patient-1',
    items: [{ drugNameFreeText: 'Amoxicillin 500mg', quantity: 14 }],
  };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const prescriptions = { create: jest.fn().mockResolvedValue({ id: 'prescription-1' }) };
    const items = { createManySuggested: jest.fn() };
    const doctorScope = { execute: jest.fn().mockResolvedValue(scope) };
    const patientAccess = { execute: jest.fn().mockResolvedValue(undefined) };
    const getDoctorAppointment = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };

    const useCase = new CreateProviderPrescriptionUseCase(
      prisma as any,
      prescriptions as any,
      items as any,
      doctorScope as any,
      patientAccess as any,
      getDoctorAppointment as any,
      audit as any,
      outbox as any,
    );

    return { tx, prisma, prescriptions, items, doctorScope, patientAccess, getDoctorAppointment, audit, outbox, useCase };
  }

  it('a DOCTOR creates and signs in one step — status ACCEPTED, no approval gate', async () => {
    const { tx, prescriptions, items, audit, outbox, useCase } = setup();

    const result = await useCase.execute(baseInput, doctorActor);

    expect(result).toEqual({ prescriptionId: 'prescription-1', status: 'ACCEPTED' });
    expect(prescriptions.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        patientId: 'patient-1',
        source: 'DOCTOR_ISSUED',
        status: 'ACCEPTED',
        doctorId: 'doctor-user-1',
        createdByUserId: 'doctor-user-1',
        createdByRole: 'DOCTOR',
      }),
    );
    expect(items.createManySuggested).toHaveBeenCalledWith(
      tx,
      'prescription-1',
      expect.arrayContaining([expect.objectContaining({ drugNameFreeText: 'Amoxicillin 500mg', quantity: 14 })]),
    );
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'prescriptions.prescription.create_by_doctor' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderPrescriptionCreated', expect.objectContaining({ prescriptionId: 'prescription-1' }));
  });

  it('an authorized CLINIC_STAFF assistant can only prepare a draft — status PENDING_DOCTOR_APPROVAL', async () => {
    const { prescriptions, audit, outbox, useCase } = setup();

    const result = await useCase.execute(baseInput, assistantActor);

    expect(result).toEqual({ prescriptionId: 'prescription-1', status: 'PENDING_DOCTOR_APPROVAL' });
    expect(prescriptions.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'PENDING_DOCTOR_APPROVAL',
        doctorId: 'doctor-user-1',
        createdByUserId: 'assistant-user-1',
        createdByRole: 'CLINIC_STAFF',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'prescriptions.prescription.prepare_by_assistant' }));
    expect(outbox.emit).toHaveBeenCalledWith(expect.anything(), 'ProviderPrescriptionPendingApproval', expect.anything());
  });

  it('rejects a CLINIC_STAFF caller who lacks the assistant permission', async () => {
    const { prescriptions, useCase } = setup();
    const unauthorizedAssistant = { ...assistantActor, permissions: [] };

    await expect(useCase.execute(baseInput, unauthorizedAssistant)).rejects.toBeInstanceOf(ForbiddenError);
    expect(prescriptions.create).not.toHaveBeenCalled();
  });

  it('rejects any other role (e.g. PATIENT) outright', async () => {
    const { useCase } = setup();
    const patientActor = { sub: 'patient-1', roleMembershipId: 'membership-3', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] };

    await expect(useCase.execute(baseInput, patientActor as any)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an empty item list', async () => {
    const { useCase } = setup();

    await expect(useCase.execute({ ...baseInput, items: [] }, doctorActor)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('propagates the patient-relationship check failure (cross-clinic / unrelated patient)', async () => {
    const { patientAccess, prescriptions, useCase } = setup();
    const notFound = new Error('not found');
    patientAccess.execute.mockRejectedValue(notFound);

    await expect(useCase.execute(baseInput, doctorActor)).rejects.toBe(notFound);
    expect(prescriptions.create).not.toHaveBeenCalled();
  });

  it('rejects when the optional appointmentId belongs to a different patient', async () => {
    const { getDoctorAppointment, prescriptions, useCase } = setup();
    getDoctorAppointment.execute.mockResolvedValue({ patientId: 'someone-else' });

    await expect(useCase.execute({ ...baseInput, appointmentId: 'appt-1' }, doctorActor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(prescriptions.create).not.toHaveBeenCalled();
  });

  it('links the appointmentId when it matches the same patient', async () => {
    const { getDoctorAppointment, prescriptions, useCase } = setup();
    getDoctorAppointment.execute.mockResolvedValue({ patientId: 'patient-1' });

    await useCase.execute({ ...baseInput, appointmentId: 'appt-1' }, doctorActor);

    expect(prescriptions.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ appointmentId: 'appt-1' }));
  });

  it('atomically creates a separate prescription per authorized patient, grouping only by batch metadata', async () => {
    const { prisma, prescriptions, useCase } = setup();
    prescriptions.create
      .mockResolvedValueOnce({ id: 'prescription-1' })
      .mockResolvedValueOnce({ id: 'prescription-2' });

    const result = await useCase.executeBatch(
      [baseInput, { ...baseInput, patientId: 'patient-2' }],
      assistantActor,
    );

    expect(result.results).toEqual([
      { patientId: 'patient-1', prescriptionId: 'prescription-1', status: 'PENDING_DOCTOR_APPROVAL' },
      { patientId: 'patient-2', prescriptionId: 'prescription-2', status: 'PENDING_DOCTOR_APPROVAL' },
    ]);
    expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prescriptions.create).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ patientId: 'patient-1', batchId: result.batchId }));
    expect(prescriptions.create).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ patientId: 'patient-2', batchId: result.batchId }));
  });

  it('does not begin a batch write when any selected patient is outside the provider scope', async () => {
    const { prisma, patientAccess, prescriptions, useCase } = setup();
    patientAccess.execute
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('patient hidden'));

    await expect(useCase.executeBatch([baseInput, { ...baseInput, patientId: 'patient-2' }], doctorActor)).rejects.toThrow('patient hidden');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prescriptions.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate patient selection before any batch write', async () => {
    const { prisma, prescriptions, useCase } = setup();

    await expect(useCase.executeBatch([baseInput, { ...baseInput }], doctorActor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prescriptions.create).not.toHaveBeenCalled();
  });

  it('propagates a batch transaction write failure and does not create later patient requests', async () => {
    const { prescriptions, items, useCase } = setup();
    prescriptions.create
      .mockResolvedValueOnce({ id: 'prescription-1' })
      .mockRejectedValueOnce(new Error('write failed'));

    await expect(
      useCase.executeBatch([baseInput, { ...baseInput, patientId: 'patient-2' }, { ...baseInput, patientId: 'patient-3' }], doctorActor),
    ).rejects.toThrow('write failed');
    expect(prescriptions.create).toHaveBeenCalledTimes(2);
    expect(items.createManySuggested).toHaveBeenCalledTimes(1);
  });
});
