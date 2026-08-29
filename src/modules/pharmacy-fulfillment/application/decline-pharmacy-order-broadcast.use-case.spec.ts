import { DeclinePharmacyOrderBroadcastUseCase } from './decline-pharmacy-order-broadcast.use-case';

function buildTx() {
  return {} as any;
}

describe('DeclinePharmacyOrderBroadcastUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'membership-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'membership-2', contextId: 'branch-1' };
  const broadcast = { id: 'broadcast-1', pharmacy_order_id: 'order-1', pharmacy_branch_id: 'branch-1', response: null };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const broadcasts = { findByOrderAndBranch: jest.fn(), markResponded: jest.fn() };
    const getActiveRoleMembership = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new DeclinePharmacyOrderBroadcastUseCase(prisma as any, broadcasts as any, getActiveRoleMembership as any, audit as any);
    return { tx, broadcasts, getActiveRoleMembership, audit, useCase };
  }

  it('marks the broadcast DECLINED', async () => {
    const { tx, broadcasts, getActiveRoleMembership, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    broadcasts.findByOrderAndBranch.mockResolvedValue(broadcast);
    broadcasts.markResponded.mockResolvedValue(true);

    const result = await useCase.execute('order-1', actor);

    expect(broadcasts.markResponded).toHaveBeenCalledWith(tx, 'broadcast-1', 'DECLINED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'pharmacy-fulfillment.pharmacy-order-broadcast.decline' }));
    expect(result).toEqual({ pharmacyOrderId: 'order-1', response: 'DECLINED' });
  });

  it('403s when the caller has no active pharmacy branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

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
    broadcasts.findByOrderAndBranch.mockResolvedValue(broadcast);
    broadcasts.markResponded.mockResolvedValue(false);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'BROADCAST_ALREADY_RESPONDED', httpStatus: 409 });
  });
});
