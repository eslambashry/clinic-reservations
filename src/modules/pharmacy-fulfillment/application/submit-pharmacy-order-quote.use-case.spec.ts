import { SubmitPharmacyOrderQuoteUseCase } from './submit-pharmacy-order-quote.use-case';

function buildTx() {
  return {} as any;
}

describe('SubmitPharmacyOrderQuoteUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'membership-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'membership-2', contextId: 'branch-1' };
  const claimedOrder = { id: 'order-1', version: 1, status: 'UNDER_REVIEW', pharmacy_branch_id: 'branch-1' };
  const unclaimedOrder = { id: 'order-1', version: 1, status: 'RECEIVED', pharmacy_branch_id: null };
  const orderItem1 = { id: 'oi-1', prescription_item_id: 'pi-1', version: 1, quantity: 20 };
  const orderItem2 = { id: 'oi-2', prescription_item_id: 'pi-2', version: 1, quantity: 10 };

  const validInput = { totalPrice: '225.00', estimatedReadyMinutes: 45, note: 'كل الأصناف متوفرة' };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacyOrders = { findById: jest.fn(), submitQuote: jest.fn(), claimForBranch: jest.fn() };
    const pharmacyOrderItems = { findByOrderId: jest.fn() };
    const broadcasts = { findByOrderAndBranch: jest.fn(), markResponded: jest.fn() };
    const getActiveRoleMembership = { execute: jest.fn() };
    const getDrugCodes = { execute: jest.fn() };
    const getControlledStatus = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new SubmitPharmacyOrderQuoteUseCase(
      prisma as any,
      pharmacyOrders as any,
      pharmacyOrderItems as any,
      broadcasts as any,
      getActiveRoleMembership as any,
      getDrugCodes as any,
      getControlledStatus as any,
      audit as any,
      outbox as any,
    );
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue(claimedOrder);
    pharmacyOrderItems.findByOrderId.mockResolvedValue([orderItem1, orderItem2]);
    getDrugCodes.execute.mockResolvedValue(
      new Map([
        ['pi-1', 'PARA500'],
        ['pi-2', 'AMOX250'],
      ]),
    );
    getControlledStatus.execute.mockResolvedValue(
      new Map([
        ['PARA500', false],
        ['AMOX250', false],
      ]),
    );
    return { tx, prisma, pharmacyOrders, pharmacyOrderItems, broadcasts, getActiveRoleMembership, getDrugCodes, getControlledStatus, audit, outbox, useCase };
  }

  it('persists the flat quote and returns ACCEPTED for an already-claimed order', async () => {
    const { tx, pharmacyOrders, outbox, useCase } = setup();

    const result = await useCase.execute('order-1', validInput, actor);

    expect(pharmacyOrders.submitQuote).toHaveBeenCalledWith(tx, 'order-1', 1, {
      totalPrice: '225.00',
      currency: 'EGP',
      estimatedReadyMinutes: 45,
      note: 'كل الأصناف متوفرة',
    });
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PharmacyOrderQuoted', { pharmacyOrderId: 'order-1', totalPrice: '225.00', currency: 'EGP' });
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'ACCEPTED', totalPrice: '225.00', currency: 'EGP' });
  });

  it('claims an unclaimed RECEIVED order first, then quotes it, in one call', async () => {
    const { tx, pharmacyOrders, broadcasts, outbox, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(unclaimedOrder);
    broadcasts.findByOrderAndBranch.mockResolvedValue({ id: 'bc-1', response: null });
    pharmacyOrders.claimForBranch.mockResolvedValue(true);

    const result = await useCase.execute('order-1', validInput, actor);

    expect(pharmacyOrders.claimForBranch).toHaveBeenCalledWith(tx, 'order-1', 1, 'branch-1');
    expect(broadcasts.markResponded).toHaveBeenCalledWith(tx, 'bc-1', 'ACCEPTED');
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PharmacyOrderAccepted', { pharmacyOrderId: 'order-1', pharmacyBranchId: 'branch-1' });
    // version incremented by the claim (1 -> 2) before the quote's own optimistic-lock write.
    expect(pharmacyOrders.submitQuote).toHaveBeenCalledWith(tx, 'order-1', 2, expect.anything());
    expect(result.status).toBe('ACCEPTED');
  });

  it('409s with ORDER_ALREADY_CLAIMED when another branch wins the claim race', async () => {
    const { pharmacyOrders, broadcasts, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(unclaimedOrder);
    broadcasts.findByOrderAndBranch.mockResolvedValue({ id: 'bc-1', response: null });
    pharmacyOrders.claimForBranch.mockResolvedValue(false);

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({ code: 'ORDER_ALREADY_CLAIMED', httpStatus: 409 });
  });

  it("404s when this branch was never broadcast the order", async () => {
    const { pharmacyOrders, broadcasts, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(unclaimedOrder);
    broadcasts.findByOrderAndBranch.mockResolvedValue(null);

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('422s with INVALID_TOTAL_PRICE when totalPrice is not positive', async () => {
    const { useCase } = setup();
    await expect(useCase.execute('order-1', { ...validInput, totalPrice: '0' }, actor)).rejects.toMatchObject({
      code: 'INVALID_TOTAL_PRICE',
      httpStatus: 422,
    });
  });

  it('403s when the caller has no active pharmacy branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it("404s when the order was claimed by a different branch", async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...claimedOrder, pharmacy_branch_id: 'some-other-branch' });

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('422s with PHARMACY_ORDER_NOT_UNDER_REVIEW when the order is already quoted', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...claimedOrder, status: 'ACCEPTED' });

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({
      code: 'PHARMACY_ORDER_NOT_UNDER_REVIEW',
      httpStatus: 422,
    });
  });

  it('422s with CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED when the prescription includes a controlled drug and it is not confirmed', async () => {
    const { getControlledStatus, useCase } = setup();
    getControlledStatus.execute.mockResolvedValue(
      new Map([
        ['PARA500', true],
        ['AMOX250', false],
      ]),
    );

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({
      code: 'CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED',
      httpStatus: 422,
    });
  });

  it('succeeds when a controlled-substance prescription is explicitly confirmed', async () => {
    const { getControlledStatus, pharmacyOrders, useCase } = setup();
    getControlledStatus.execute.mockResolvedValue(
      new Map([
        ['PARA500', true],
        ['AMOX250', false],
      ]),
    );

    const result = await useCase.execute('order-1', { ...validInput, controlledSubstanceConfirmed: true }, actor);

    expect(pharmacyOrders.submitQuote).toHaveBeenCalled();
    expect(result.status).toBe('ACCEPTED');
  });
});
