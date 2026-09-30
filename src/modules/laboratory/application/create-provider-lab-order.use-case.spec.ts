import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateProviderLabOrderUseCase } from './create-provider-lab-order.use-case';

describe('CreateProviderLabOrderUseCase', () => {
  const doctorActor = { sub: 'doctor-user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;
  const assistantActor = {
    sub: 'assistant-user-1',
    roleMembershipId: 'membership-2',
    roleCode: 'CLINIC_STAFF',
    contextType: 'CLINIC_STAFF',
    permissions: ['lab-orders:create:assistant'],
  } as any;
  const scope = { doctorId: 'doctor-1', doctorUserId: 'doctor-user-1', affiliations: [], affiliationIds: ['aff-1'], clinicBranchIds: ['branch-1'] };
  const verifiedBranch = { id: 'lab-branch-1', status: 'VERIFIED', home_collection_capable: false };
  const baseInput = { patientId: 'patient-1', labBranchId: 'lab-branch-1', collectionType: 'VISIT' as const, prescriptionId: 'prescription-1' };

  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const labOrders = { create: jest.fn().mockResolvedValue({ id: 'lab-order-1' }) };
    const labBranches = { findById: jest.fn().mockResolvedValue(verifiedBranch) };
    const getPrescriptionSummary = { execute: jest.fn().mockResolvedValue({ id: 'prescription-1', patientId: 'patient-1' }) };
    const doctorScope = { execute: jest.fn().mockResolvedValue(scope) };
    const patientAccess = { execute: jest.fn().mockResolvedValue(undefined) };
    const getDoctorAppointment = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const listStaffByContext = { execute: jest.fn().mockResolvedValue([]) };

    const useCase = new CreateProviderLabOrderUseCase(
      prisma as any,
      labOrders as any,
      labBranches as any,
      getPrescriptionSummary as any,
      doctorScope as any,
      patientAccess as any,
      getDoctorAppointment as any,
      audit as any,
      outbox as any,
      listStaffByContext as any,
    );

    return { tx, prisma, labOrders, labBranches, getPrescriptionSummary, doctorScope, patientAccess, getDoctorAppointment, audit, outbox, listStaffByContext, useCase };
  }

  it('a DOCTOR creates a lab order straight into REQUESTED, in the named branch', async () => {
    const { tx, labOrders, audit, outbox, useCase } = setup();

    const result = await useCase.execute(baseInput, doctorActor);

    expect(result).toEqual({ labOrderId: 'lab-order-1', status: 'REQUESTED' });
    expect(labOrders.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ patientId: 'patient-1', labBranchId: 'lab-branch-1', doctorId: 'doctor-user-1', createdByUserId: 'doctor-user-1' }),
    );
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceType: 'lab_order', subjectPatientId: 'patient-1' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderLabOrderCreated', expect.objectContaining({ labOrderId: 'lab-order-1' }));
  });

  it('an authorized CLINIC_STAFF assistant creates directly too — no doctor sign-off gate for labs', async () => {
    const { labOrders, useCase } = setup();

    const result = await useCase.execute(baseInput, assistantActor);

    expect(result).toEqual({ labOrderId: 'lab-order-1', status: 'REQUESTED' });
    expect(labOrders.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ doctorId: 'doctor-user-1', createdByUserId: 'assistant-user-1' }));
  });

  it('rejects a CLINIC_STAFF caller who lacks the assistant permission', async () => {
    const { labOrders, useCase } = setup();
    const unauthorizedAssistant = { ...assistantActor, permissions: [] };

    await expect(useCase.execute(baseInput, unauthorizedAssistant)).rejects.toBeInstanceOf(ForbiddenError);
    expect(labOrders.create).not.toHaveBeenCalled();
  });

  it('rejects any other role outright', async () => {
    const { useCase } = setup();
    const patientActor = { sub: 'patient-1', roleMembershipId: 'membership-3', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] };

    await expect(useCase.execute(baseInput, patientActor as any)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('propagates the patient-relationship check failure (cross-clinic / unrelated patient)', async () => {
    const { patientAccess, labOrders, useCase } = setup();
    const notFound = new NotFoundError('Patient', 'patient-1');
    patientAccess.execute.mockRejectedValue(notFound);

    await expect(useCase.execute(baseInput, doctorActor)).rejects.toBe(notFound);
    expect(labOrders.create).not.toHaveBeenCalled();
  });

  it('404s when the named lab branch does not exist or is not VERIFIED', async () => {
    const { labBranches, labOrders, useCase } = setup();
    labBranches.findById.mockResolvedValue(null);

    await expect(useCase.execute(baseInput, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
    expect(labOrders.create).not.toHaveBeenCalled();
  });

  it('rejects HOME_COLLECTION against a branch that does not support it', async () => {
    const { labBranches, useCase } = setup();
    labBranches.findById.mockResolvedValue({ ...verifiedBranch, home_collection_capable: false });

    await expect(useCase.execute({ ...baseInput, collectionType: 'HOME_COLLECTION' }, doctorActor)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejects when no uploaded referral is supplied', async () => {
    const { useCase } = setup();

    await expect(useCase.execute({ ...baseInput, prescriptionId: undefined as any }, doctorActor)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejects when the optional appointmentId belongs to a different patient', async () => {
    const { getDoctorAppointment, labOrders, useCase } = setup();
    getDoctorAppointment.execute.mockResolvedValue({ patientId: 'someone-else' });

    await expect(useCase.execute({ ...baseInput, appointmentId: 'appt-1' }, doctorActor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(labOrders.create).not.toHaveBeenCalled();
  });

  it('rejects a prescription that belongs to a different patient', async () => {
    const { getPrescriptionSummary, labOrders, useCase } = setup();
    getPrescriptionSummary.execute.mockResolvedValue({ id: 'prescription-1', patientId: 'someone-else' });

    await expect(useCase.execute({ ...baseInput, prescriptionId: 'prescription-1' }, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
    expect(labOrders.create).not.toHaveBeenCalled();
  });

  it('atomically creates an independent lab order for every authorized patient', async () => {
    const { prisma, labOrders, useCase } = setup();
    labOrders.create
      .mockResolvedValueOnce({ id: 'lab-order-1' })
      .mockResolvedValueOnce({ id: 'lab-order-2' });

    const result = await useCase.executeBatch([baseInput, { ...baseInput, patientId: 'patient-2' }], doctorActor);

    expect(result.results).toEqual([
      { patientId: 'patient-1', labOrderId: 'lab-order-1', status: 'REQUESTED' },
      { patientId: 'patient-2', labOrderId: 'lab-order-2', status: 'REQUESTED' },
    ]);
    expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(labOrders.create).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ patientId: 'patient-1', batchId: result.batchId }));
    expect(labOrders.create).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ patientId: 'patient-2', batchId: result.batchId }));
  });

  it('preflights every patient so a mixed-authorization batch never starts a write transaction', async () => {
    const { prisma, patientAccess, labOrders, useCase } = setup();
    patientAccess.execute
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NotFoundError('Patient', 'patient-2'));

    await expect(useCase.executeBatch([baseInput, { ...baseInput, patientId: 'patient-2' }], doctorActor)).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(labOrders.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate patient selection before any batch write', async () => {
    const { prisma, labOrders, useCase } = setup();

    await expect(useCase.executeBatch([baseInput, { ...baseInput }], doctorActor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(labOrders.create).not.toHaveBeenCalled();
  });
});
