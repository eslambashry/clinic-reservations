import { CompletePharmacyOrderUseCase } from './complete-pharmacy-order.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const pharmacyOrders = { findById: jest.fn(), setStatus: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new CompletePharmacyOrderUseCase(prisma as any, pharmacyOrders as any, getActiveRoleMembership as any, audit as any);
  return { tx, pharmacyOrders, getActiveRoleMembership, useCase };
}

describe('CompletePharmacyOrderUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };

  it('closes a READY_FOR_PICKUP order to FULFILLED', async () => {
    const { tx, pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'READY_FOR_PICKUP', pharmacy_branch_id: 'branch-1' });

    const result = await useCase.execute('order-1', actor);

    expect(pharmacyOrders.setStatus).toHaveBeenCalledWith(tx, 'order-1', 1, 'FULFILLED');
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'FULFILLED' });
  });

  it('closes an OUT_FOR_DELIVERY order to FULFILLED directly (no DELIVERED step)', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'OUT_FOR_DELIVERY', pharmacy_branch_id: 'branch-1' });

    const result = await useCase.execute('order-1', actor);

    expect(result.status).toBe('FULFILLED');
  });

  it('422s when the order is not ready to complete', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'PAID', pharmacy_branch_id: 'branch-1' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({
      code: 'PHARMACY_ORDER_NOT_READY_TO_COMPLETE',
      httpStatus: 422,
    });
  });
});
