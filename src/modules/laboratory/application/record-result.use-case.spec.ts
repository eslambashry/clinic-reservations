import { RecordResultUseCase } from './record-result.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn(), setStatus: jest.fn() };
  const labOrderItems = { findById: jest.fn(), markRecorded: jest.fn(), findByOrderId: jest.fn() };
  const labResults = { create: jest.fn().mockResolvedValue({ id: 'res-1' }) };
  const testCatalog = { findByCodes: jest.fn().mockResolvedValue([{ code: 'CBC', display_name: 'صورة دم كاملة' }]) };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new RecordResultUseCase(prisma as any, labOrders as any, labOrderItems as any, labResults as any, testCatalog as any, getActiveRoleMembership as any, audit as any);
  return { tx, labOrders, labOrderItems, labResults, getActiveRoleMembership, audit, useCase };
}

describe('RecordResultUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const order = { id: 'order-1', version: 1, status: 'IN_ANALYSIS', lab_branch_id: 'branch-1' };
  const item = { id: 'item-1', lab_order_id: 'order-1', version: 1, catalog_code: 'CBC', result_state: 'PENDING' };

  it('records a result for one item and keeps the order IN_ANALYSIS while other items remain pending', async () => {
    const { tx, getActiveRoleMembership, labOrders, labOrderItems, labResults, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labOrderItems.findById.mockResolvedValue(item);
    labOrderItems.findByOrderId.mockResolvedValue([item, { id: 'item-2', result_state: 'PENDING' }]);

    const result = await useCase.execute('order-1', { itemId: 'item-1', fileLabel: '', sizeKb: 120 }, actor);

    expect(labResults.create).toHaveBeenCalledWith(tx, expect.objectContaining({ labOrderId: 'order-1', itemId: 'item-1', uploadedBy: 'staff-1' }));
    expect(labOrderItems.markRecorded).toHaveBeenCalledWith(tx, 'item-1', 1);
    expect(labOrders.setStatus).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.result-recorded', reasonCode: 'صورة دم كاملة' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'IN_ANALYSIS' });
  });

  it('flips the order to RESULTS_READY once every item is recorded', async () => {
    const { getActiveRoleMembership, labOrders, labOrderItems, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labOrderItems.findById.mockResolvedValue(item);
    labOrderItems.findByOrderId.mockResolvedValue([item, { id: 'item-2', result_state: 'RECORDED' }]);

    const result = await useCase.execute('order-1', { itemId: 'item-1', fileLabel: 'x.pdf', sizeKb: 50 }, actor);

    expect(labOrders.setStatus).toHaveBeenCalledWith(expect.anything(), 'order-1', 1, 'RESULTS_READY');
    expect(result.status).toBe('RESULTS_READY');
  });

  it('409s when a result was already recorded for this item', async () => {
    const { getActiveRoleMembership, labOrders, labOrderItems, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labOrderItems.findById.mockResolvedValue({ ...item, result_state: 'RECORDED' });

    await expect(useCase.execute('order-1', { itemId: 'item-1', fileLabel: 'x.pdf', sizeKb: 50 }, actor)).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('404s an item that does not belong to this order', async () => {
    const { getActiveRoleMembership, labOrders, labOrderItems, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labOrderItems.findById.mockResolvedValue({ ...item, lab_order_id: 'other-order' });

    await expect(useCase.execute('order-1', { itemId: 'item-1', fileLabel: 'x.pdf', sizeKb: 50 }, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('422s outside IN_ANALYSIS/RESULTS_READY', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, status: 'AWAITING_SAMPLE' });

    await expect(useCase.execute('order-1', { itemId: 'item-1', fileLabel: 'x.pdf', sizeKb: 50 }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });
});
