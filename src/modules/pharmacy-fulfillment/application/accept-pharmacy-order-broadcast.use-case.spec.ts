import { AcceptPharmacyOrderBroadcastUseCase } from './accept-pharmacy-order-broadcast.use-case';

function buildTx() {
  return {} as any;
}

describe('AcceptPharmacyOrderBroadcastUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'membership-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'membership-2', contextId: 'branch-1' };
  const broadcast = { id: 'broadcast-1', pharmacy_order_id: 'order-1', pharmacy_branch_id: 'branch-1', response: null };
  const order = { id: 'order-1', version: 1, status: 'RECEIVED' };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacyOrders = { findById: jest.fn(), claimForBranch: jest.fn() };
    const broadcasts = { findByOrderAndBranch: jest.fn(), markResponded: jest.fn() };
    const getActiveRoleMembership = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new AcceptPharmacyOrderBroadcastUseCase(
      prisma as any,
      pharmacyOrders as any,
      broadcasts as any,
      getActiveRoleMembership as any,
      audit as any,
      outbox as any,
    );
    return { tx, pharmacyOrders, broadcasts, getActiveRoleMembership, audit, outbox, useCase };
  }

  it('claims the order, marks the broadcast ACCEPTED, and emits PharmacyOrderAccepted', async () => {
    const { tx, pharmacyOrders, broadcasts, getActiveRoleMembership, audit, outbox, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    broadcasts.findByOrderAndBranch.mockResolvedValue(broadcast);
    pharmacyOrders.findById.mockResolvedValue(order);
    pharmacyOrders.claimForBranch.mockResolvedValue(true);
    broadcasts.markResponded.mockResolvedValue(true);

    const result = await useCase.execute('order-1', actor);

    expect(getActiveRoleMembership.execute).toHaveBeenCalledWith('staff-1', 'PHARMACY_STAFF');
    expect(pharmacyOrders.claimForBranch).toHaveBeenCalledWith(tx, 'order-1', 1, 'branch-1');
    expect(broadcasts.markResponded).toHaveBeenCalledWith(tx, 'broadcast-1', 'ACCEPTED');
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PharmacyOrderAccepted', { pharmacyOrderId: 'order-1', pharmacyBranchId: 'branch-1' });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'pharmacy-fulfillment.pharmacy-order-broadcast.accept' }));
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'UNDER_REVIEW' });
  });

  it('403s when the caller has no active pharmacy branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('403s when the membership has no contextId', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'membership-2', contextId: null });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('404s when this order was never broadcast to the caller\'s branch', async () => {
    const { getActiveRoleMembership, broadcasts, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    broadcasts.findByOrderAndBranch.mockResolvedValue(null);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('409s with BROADCAST_ALREADY_RESPONDED when this branch already responded', async () => {
    const { getActiveRoleMembership, broadcasts, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    broadcasts.findByOrderAndBranch.mockResolvedValue({ ...broadcast, response: 'DECLINED' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'BROADCAST_ALREADY_RESPONDED', httpStatus: 409 });
  });

  it('409s with ORDER_ALREADY_CLAIMED when another branch already claimed the order (the losing-race case)', async () => {
    const { pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    broadcasts.findByOrderAndBranch.mockResolvedValue(broadcast);
    pharmacyOrders.findById.mockResolvedValue(order);
    pharmacyOrders.claimForBranch.mockResolvedValue(false);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'ORDER_ALREADY_CLAIMED', httpStatus: 409 });
    expect(broadcasts.markResponded).not.toHaveBeenCalled();
  });
});
