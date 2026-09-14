import { CreateLabOrderUseCase } from './create-lab-order.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { create: jest.fn() };
  const labOrderItems = { createMany: jest.fn() };
  const labBranches = { findById: jest.fn() };
  const testCatalog = { findAllCodes: jest.fn() };
  const audit = { record: jest.fn() };
  const outbox = { emit: jest.fn() };
  const listStaffByContext = { execute: jest.fn().mockResolvedValue([]) };
  const useCase = new CreateLabOrderUseCase(
    prisma as any,
    labOrders as any,
    labOrderItems as any,
    labBranches as any,
    testCatalog as any,
    audit as any,
    outbox as any,
    listStaffByContext as any,
  );
  return { tx, prisma, labOrders, labOrderItems, labBranches, testCatalog, audit, outbox, listStaffByContext, useCase };
}

describe('CreateLabOrderUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const branch = { id: 'branch-1', home_collection_capable: true };

  it('creates an order from direct test-code selection, audits REQUEST_RECEIVED', async () => {
    const { tx, labOrders, labOrderItems, labBranches, testCatalog, audit, useCase } = setup();
    labBranches.findById.mockResolvedValue(branch);
    testCatalog.findAllCodes.mockResolvedValue(['CBC']);
    labOrders.create.mockResolvedValue({ id: 'order-1', status: 'REQUESTED' });

    const result = await useCase.execute({ labBranchId: 'branch-1', collectionType: 'VISIT', testCodes: ['CBC'] }, actor);

    expect(labOrderItems.createMany).toHaveBeenCalledWith(tx, 'order-1', [{ catalogCode: 'CBC' }]);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.request-received', resourceId: 'order-1' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'REQUESTED' });
  });

  it('notifies every LAB_STAFF member at the order\'s branch, one event per staff member', async () => {
    const { tx, labOrders, labBranches, testCatalog, outbox, listStaffByContext, useCase } = setup();
    labBranches.findById.mockResolvedValue(branch);
    testCatalog.findAllCodes.mockResolvedValue(['CBC']);
    labOrders.create.mockResolvedValue({ id: 'order-1', status: 'REQUESTED' });
    listStaffByContext.execute.mockResolvedValue([{ userId: 'lab-staff-1' }, { userId: 'lab-staff-2' }]);

    await useCase.execute({ labBranchId: 'branch-1', collectionType: 'VISIT', testCodes: ['CBC'] }, actor);

    expect(listStaffByContext.execute).toHaveBeenCalledWith({ roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', contextId: 'branch-1' });
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'NewLabOrderForStaff', { labOrderId: 'order-1', labStaffUserId: 'lab-staff-1' });
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'NewLabOrderForStaff', { labOrderId: 'order-1', labStaffUserId: 'lab-staff-2' });
  });

  it('creates a prescription-only order with zero items ("incomplete request")', async () => {
    const { labOrders, labOrderItems, labBranches, useCase } = setup();
    labBranches.findById.mockResolvedValue(branch);
    labOrders.create.mockResolvedValue({ id: 'order-1', status: 'REQUESTED' });

    await useCase.execute({ labBranchId: 'branch-1', collectionType: 'VISIT', prescriptionId: 'presc-1' }, actor);

    expect(labOrderItems.createMany).not.toHaveBeenCalled();
    expect(labOrders.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ prescriptionId: 'presc-1' }));
  });

  it('rejects when neither test codes nor a prescription are provided', async () => {
    const { useCase } = setup();

    await expect(useCase.execute({ labBranchId: 'branch-1', collectionType: 'VISIT' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('404s on an unknown lab branch', async () => {
    const { labBranches, useCase } = setup();
    labBranches.findById.mockResolvedValue(null);

    await expect(useCase.execute({ labBranchId: 'nope', collectionType: 'VISIT', testCodes: ['CBC'] }, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('422s HOME_COLLECTION against a branch that does not offer it', async () => {
    const { labBranches, useCase } = setup();
    labBranches.findById.mockResolvedValue({ id: 'branch-1', home_collection_capable: false });

    await expect(useCase.execute({ labBranchId: 'branch-1', collectionType: 'HOME_COLLECTION', testCodes: ['CBC'] }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('422s on an unknown test catalog code', async () => {
    const { labBranches, testCatalog, useCase } = setup();
    labBranches.findById.mockResolvedValue(branch);
    testCatalog.findAllCodes.mockResolvedValue([]);

    await expect(useCase.execute({ labBranchId: 'branch-1', collectionType: 'VISIT', testCodes: ['NOPE'] }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });
});
