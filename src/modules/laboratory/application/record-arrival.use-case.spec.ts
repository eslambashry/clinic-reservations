import { RecordArrivalUseCase } from './record-arrival.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getCustodyEvents = { executeForOrders: jest.fn().mockResolvedValue(new Map()) };
  const audit = { record: jest.fn() };
  const useCase = new RecordArrivalUseCase(prisma as any, labOrders as any, getActiveRoleMembership as any, getCustodyEvents as any, audit as any);
  return { tx, labOrders, getActiveRoleMembership, getCustodyEvents, audit, useCase };
}

describe('RecordArrivalUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const order = { id: 'order-1', version: 1, status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1', collection_type: 'VISIT' };

  it('records arrival for a VISIT order awaiting sample', async () => {
    const { tx, getActiveRoleMembership, labOrders, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);

    const result = await useCase.execute('order-1', { note: 'وصل في الموعد' }, actor);

    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.arrival-confirmed', reasonCode: 'وصل في الموعد' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'AWAITING_SAMPLE' });
  });

  it('rejects a HOME_COLLECTION order (arrival is VISIT-only)', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, collection_type: 'HOME_COLLECTION' });

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('409s if arrival was already recorded since the last blocking issue', async () => {
    const { getActiveRoleMembership, labOrders, getCustodyEvents, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    getCustodyEvents.executeForOrders.mockResolvedValue(new Map([['order-1', [{ type: 'ARRIVAL_CONFIRMED' }]]]));

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('422s when the order is not AWAITING_SAMPLE', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, status: 'QUOTED' });

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('403s with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 403 });
  });
});
