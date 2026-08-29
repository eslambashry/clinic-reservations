import { RejectPharmacyOrderUseCase } from './reject-pharmacy-order.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const pharmacyOrders = { findById: jest.fn(), rejectOrder: jest.fn() };
  const broadcasts = { findByOrderAndBranch: jest.fn(), markResponded: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new RejectPharmacyOrderUseCase(prisma as any, pharmacyOrders as any, broadcasts as any, getActiveRoleMembership as any, audit as any);
  return { tx, pharmacyOrders, broadcasts, getActiveRoleMembership, audit, useCase };
}

describe('RejectPharmacyOrderUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const unclaimedOrder = { id: 'order-1', version: 1, status: 'RECEIVED', pharmacy_branch_id: null };
  const claimedOrder = { id: 'order-1', version: 1, status: 'UNDER_REVIEW', pharmacy_branch_id: 'branch-1' };
  const acceptedOrder = { id: 'order-1', version: 2, status: 'ACCEPTED', pharmacy_branch_id: 'branch-1' };
  const unrespondedBroadcast = { id: 'bc-1', response: null };

  describe('decline path — unresponded broadcast', () => {
    it("declines the branch's own broadcast without touching the order, no reason required", async () => {
      const { pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue(unclaimedOrder);
      broadcasts.findByOrderAndBranch.mockResolvedValue(unrespondedBroadcast);
      broadcasts.markResponded.mockResolvedValue(true);

      const result = await useCase.execute('order-1', {}, actor);

      expect(broadcasts.markResponded).toHaveBeenCalledWith(expect.anything(), 'bc-1', 'DECLINED');
      expect(pharmacyOrders.rejectOrder).not.toHaveBeenCalled();
      expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'RECEIVED' });
    });

    it('declines even if another branch already won the claim race in the meantime', async () => {
      const { pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue({ ...unclaimedOrder, status: 'UNDER_REVIEW', pharmacy_branch_id: 'other-branch' });
      broadcasts.findByOrderAndBranch.mockResolvedValue(unrespondedBroadcast);
      broadcasts.markResponded.mockResolvedValue(true);

      const result = await useCase.execute('order-1', {}, actor);

      expect(result.status).toBe('UNDER_REVIEW');
    });

    it('409s with BROADCAST_ALREADY_RESPONDED on a lost double-tap race', async () => {
      const { pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue(unclaimedOrder);
      broadcasts.findByOrderAndBranch.mockResolvedValue(unrespondedBroadcast);
      broadcasts.markResponded.mockResolvedValue(false);

      await expect(useCase.execute('order-1', {}, actor)).rejects.toMatchObject({ code: 'BROADCAST_ALREADY_RESPONDED', httpStatus: 409 });
    });
  });

  describe('whole-order reject path — already claimed by this branch', () => {
    it('rejects an UNDER_REVIEW order claimed by the caller\'s branch', async () => {
      const { tx, pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue(claimedOrder);
      broadcasts.findByOrderAndBranch.mockResolvedValue({ id: 'bc-1', response: 'ACCEPTED' });

      const result = await useCase.execute('order-1', { reason: 'OUT_OF_STOCK', note: 'no stock' }, actor);

      expect(pharmacyOrders.rejectOrder).toHaveBeenCalledWith(tx, 'order-1', 1, { reason: 'OUT_OF_STOCK', note: 'no stock' });
      expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'REJECTED' });
    });

    it('422s with REJECTION_REASON_REQUIRED when no reason is given', async () => {
      const { pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue(claimedOrder);
      broadcasts.findByOrderAndBranch.mockResolvedValue({ id: 'bc-1', response: 'ACCEPTED' });

      await expect(useCase.execute('order-1', {}, actor)).rejects.toMatchObject({ code: 'REJECTION_REASON_REQUIRED', httpStatus: 422 });
    });

    it('also rejects an already-ACCEPTED order (patient stalling on payment)', async () => {
      const { tx, pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue(acceptedOrder);
      broadcasts.findByOrderAndBranch.mockResolvedValue({ id: 'bc-1', response: 'ACCEPTED' });

      const result = await useCase.execute('order-1', { reason: 'OTHER', note: 'no response' }, actor);

      expect(pharmacyOrders.rejectOrder).toHaveBeenCalledWith(tx, 'order-1', 2, { reason: 'OTHER', note: 'no response' });
      expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'REJECTED' });
    });

    it('422s with PHARMACY_ORDER_NOT_REJECTABLE for a status neither UNDER_REVIEW nor ACCEPTED', async () => {
      const { pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue({ ...claimedOrder, status: 'PAID' });
      broadcasts.findByOrderAndBranch.mockResolvedValue({ id: 'bc-1', response: 'ACCEPTED' });

      await expect(useCase.execute('order-1', { reason: 'OTHER' }, actor)).rejects.toMatchObject({
        code: 'PHARMACY_ORDER_NOT_REJECTABLE',
        httpStatus: 422,
      });
    });
  });

  it('403s when the caller has no active pharmacy branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', { reason: 'OTHER' }, actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it("404s when the order isn't claimed by the caller's branch and there is no broadcast for it", async () => {
    const { pharmacyOrders, broadcasts, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ ...claimedOrder, pharmacy_branch_id: 'other-branch' });
    broadcasts.findByOrderAndBranch.mockResolvedValue(null);

    await expect(useCase.execute('order-1', { reason: 'OTHER' }, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });
});
