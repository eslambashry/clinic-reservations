import { CollectSampleUseCase } from './collect-sample.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn(), setRecollectionRequired: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getCustodyEvents = { executeForOrders: jest.fn().mockResolvedValue(new Map()) };
  const audit = { record: jest.fn() };
  const useCase = new CollectSampleUseCase(prisma as any, labOrders as any, getActiveRoleMembership as any, getCustodyEvents as any, audit as any);
  return { tx, labOrders, getActiveRoleMembership, getCustodyEvents, audit, useCase };
}

describe('CollectSampleUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const order = { id: 'order-1', version: 1, status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1', collection_type: 'VISIT', recollection_required: false };

  it('collects a sample once the arrival gate is satisfied', async () => {
    const { tx, getActiveRoleMembership, labOrders, getCustodyEvents, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    getCustodyEvents.executeForOrders.mockResolvedValue(new Map([['order-1', [{ type: 'ARRIVAL_CONFIRMED' }]]]));

    const result = await useCase.execute('order-1', undefined, actor);

    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.sample-collected' }));
    expect(labOrders.setRecollectionRequired).not.toHaveBeenCalled();
    expect(result).toEqual({ labOrderId: 'order-1', status: 'AWAITING_SAMPLE' });
  });

  it('clears recollection_required when collecting after a rejected sample', async () => {
    const { tx, getActiveRoleMembership, labOrders, getCustodyEvents, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, recollection_required: true });
    getCustodyEvents.executeForOrders.mockResolvedValue(new Map([['order-1', [{ type: 'ARRIVAL_CONFIRMED' }]]]));

    await useCase.execute('order-1', undefined, actor);

    expect(labOrders.setRecollectionRequired).toHaveBeenCalledWith(tx, 'order-1', 1, false);
  });

  it('422s when the arrival/courier gate is not satisfied yet', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('409s when a sample is already live', async () => {
    const { getActiveRoleMembership, labOrders, getCustodyEvents, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    getCustodyEvents.executeForOrders.mockResolvedValue(new Map([['order-1', [{ type: 'ARRIVAL_CONFIRMED' }, { type: 'SAMPLE_COLLECTED' }]]]));

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 409 });
  });
});
