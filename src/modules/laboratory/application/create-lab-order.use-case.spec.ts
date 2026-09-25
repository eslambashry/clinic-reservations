import { CreateLabOrderUseCase } from './create-lab-order.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { create: jest.fn() };
  const labBranches = { findById: jest.fn() };
  const getPrescriptionSummary = { execute: jest.fn().mockResolvedValue({ id: 'presc-1', patientId: 'patient-1' }) };
  const audit = { record: jest.fn() };
  const outbox = { emit: jest.fn() };
  const listStaffByContext = { execute: jest.fn().mockResolvedValue([]) };
  const useCase = new CreateLabOrderUseCase(prisma as any, labOrders as any, labBranches as any, getPrescriptionSummary as any, audit as any, outbox as any, listStaffByContext as any);
  return { tx, labOrders, labBranches, getPrescriptionSummary, audit, outbox, listStaffByContext, useCase };
}

describe('CreateLabOrderUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const branch = { id: 'branch-1', home_collection_capable: true };
  const referral = { labBranchId: 'branch-1', collectionType: 'VISIT' as const, prescriptionId: 'presc-1' };

  it('creates an order from an uploaded referral and audits receipt', async () => {
    const { tx, labOrders, labBranches, audit, useCase } = setup();
    labBranches.findById.mockResolvedValue(branch);
    labOrders.create.mockResolvedValue({ id: 'order-1', status: 'REQUESTED' });
    const result = await useCase.execute(referral, actor);
    expect(labOrders.create).toHaveBeenCalledWith(tx, expect.objectContaining({ prescriptionId: 'presc-1' }));
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.request-received', resourceId: 'order-1' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'REQUESTED' });
  });

  it('notifies every LAB_STAFF member at the order branch', async () => {
    const { tx, labOrders, labBranches, outbox, listStaffByContext, useCase } = setup();
    labBranches.findById.mockResolvedValue(branch);
    labOrders.create.mockResolvedValue({ id: 'order-1', status: 'REQUESTED' });
    listStaffByContext.execute.mockResolvedValue([{ userId: 'staff-1' }, { userId: 'staff-2' }]);
    await useCase.execute(referral, actor);
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'NewLabOrderForStaff', { labOrderId: 'order-1', labStaffUserId: 'staff-1' });
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'NewLabOrderForStaff', { labOrderId: 'order-1', labStaffUserId: 'staff-2' });
  });

  it('404s rather than linking another patient\'s referral', async () => {
    const { labBranches, getPrescriptionSummary, labOrders, useCase } = setup();
    labBranches.findById.mockResolvedValue(branch);
    getPrescriptionSummary.execute.mockResolvedValue({ id: 'presc-1', patientId: 'someone-else' });
    await expect(useCase.execute(referral, actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(labOrders.create).not.toHaveBeenCalled();
  });

  it('404s on an unknown lab branch', async () => {
    const { labBranches, labOrders, useCase } = setup();
    labBranches.findById.mockResolvedValue(null);
    await expect(useCase.execute({ ...referral, labBranchId: 'nope' }, actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(labOrders.create).not.toHaveBeenCalled();
  });

  it('422s HOME_COLLECTION against a branch that does not offer it', async () => {
    const { labBranches, labOrders, useCase } = setup();
    labBranches.findById.mockResolvedValue({ id: 'branch-1', home_collection_capable: false });
    await expect(useCase.execute({ ...referral, collectionType: 'HOME_COLLECTION' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
    expect(labOrders.create).not.toHaveBeenCalled();
  });
});
