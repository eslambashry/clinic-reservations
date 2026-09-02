import { DispatchCourierUseCase } from './dispatch-courier.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new DispatchCourierUseCase(prisma as any, labOrders as any, getActiveRoleMembership as any, audit as any);
  return { tx, labOrders, getActiveRoleMembership, audit, useCase };
}

describe('DispatchCourierUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const order = { id: 'order-1', version: 1, status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1', collection_type: 'HOME_COLLECTION' };

  it('dispatches a courier for a home-collection order', async () => {
    const { tx, getActiveRoleMembership, labOrders, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);

    const result = await useCase.execute('order-1', undefined, actor);

    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.in-transit' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'AWAITING_SAMPLE' });
  });

  it('rejects a VISIT order (courier dispatch is HOME_COLLECTION-only)', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, collection_type: 'VISIT' });

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('403s with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 403 });
  });
});
