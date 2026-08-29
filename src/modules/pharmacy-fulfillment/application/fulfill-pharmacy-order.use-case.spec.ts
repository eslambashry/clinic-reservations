import { FulfillPharmacyOrderUseCase } from './fulfill-pharmacy-order.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const pharmacyOrders = { findById: jest.fn(), setStatus: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new FulfillPharmacyOrderUseCase(prisma as any, pharmacyOrders as any, getActiveRoleMembership as any, audit as any);
  return { tx, pharmacyOrders, getActiveRoleMembership, useCase };
}

describe('FulfillPharmacyOrderUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };

  it('moves a PAID pickup order to READY_FOR_PICKUP', async () => {
    const { tx, pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'PAID', pharmacy_branch_id: 'branch-1', fulfillment_type: 'PICKUP' });

    const result = await useCase.execute('order-1', actor);

    expect(pharmacyOrders.setStatus).toHaveBeenCalledWith(tx, 'order-1', 1, 'READY_FOR_PICKUP');
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'READY_FOR_PICKUP' });
  });

  it('moves a PAID delivery order to OUT_FOR_DELIVERY', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'PAID', pharmacy_branch_id: 'branch-1', fulfillment_type: 'DELIVERY' });

    const result = await useCase.execute('order-1', actor);

    expect(result.status).toBe('OUT_FOR_DELIVERY');
  });

  it('422s when the order is not PAID', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'ACCEPTED', pharmacy_branch_id: 'branch-1', fulfillment_type: 'PICKUP' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'PHARMACY_ORDER_NOT_PAID', httpStatus: 422 });
  });

  it('403s when the caller has no active pharmacy branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it("404s when the order was claimed by a different branch (IDOR guard)", async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'PAID', pharmacy_branch_id: 'some-other-branch', fulfillment_type: 'PICKUP' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the order does not exist', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue(null);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('propagates an optimistic-lock conflict when the order changed between read and write', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'PAID', pharmacy_branch_id: 'branch-1', fulfillment_type: 'PICKUP' });
    pharmacyOrders.setStatus.mockRejectedValue({ code: 'OPTIMISTIC_LOCK_CONFLICT', httpStatus: 409 });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'OPTIMISTIC_LOCK_CONFLICT', httpStatus: 409 });
  });
});
