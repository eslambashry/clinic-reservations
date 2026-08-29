import { SubmitPharmacyOrderQuoteUseCase } from './submit-pharmacy-order-quote.use-case';

function buildTx() {
  return {} as any;
}

describe('SubmitPharmacyOrderQuoteUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'membership-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'membership-2', contextId: 'branch-1' };
  const order = { id: 'order-1', version: 1, status: 'UNDER_REVIEW', pharmacy_branch_id: 'branch-1' };
  const orderItem1 = { id: 'oi-1', prescription_item_id: 'pi-1', version: 1, quantity: 20 };
  const orderItem2 = { id: 'oi-2', prescription_item_id: 'pi-2', version: 1, quantity: 10 };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacyOrders = { findById: jest.fn(), setStatus: jest.fn() };
    const pharmacyOrderItems = { findByOrderId: jest.fn(), updateQuote: jest.fn() };
    const substitutions = { createMany: jest.fn() };
    const getActiveRoleMembership = { execute: jest.fn() };
    const getDrugCodes = { execute: jest.fn() };
    const getControlledStatus = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new SubmitPharmacyOrderQuoteUseCase(
      prisma as any,
      pharmacyOrders as any,
      pharmacyOrderItems as any,
      substitutions as any,
      getActiveRoleMembership as any,
      getDrugCodes as any,
      getControlledStatus as any,
      audit as any,
      outbox as any,
    );
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue(order);
    pharmacyOrderItems.findByOrderId.mockResolvedValue([orderItem1, orderItem2]);
    getDrugCodes.execute.mockResolvedValue(new Map([['pi-1', 'PARA500'], ['pi-2', 'AMOX250']]));
    getControlledStatus.execute.mockResolvedValue(new Map([['PARA500', false], ['AMOX250', false]]));
    return { tx, prisma, pharmacyOrders, pharmacyOrderItems, substitutions, getActiveRoleMembership, getDrugCodes, getControlledStatus, audit, outbox, useCase };
  }

  it('resolves ACCEPTED and computes totalPrice when nothing needs substitution', async () => {
    const { tx, pharmacyOrders, pharmacyOrderItems, outbox, useCase } = setup();

    const result = await useCase.execute(
      'order-1',
      {
        items: [
          { prescriptionItemId: 'pi-1', status: 'AVAILABLE', unitPrice: '10.00' },
          { prescriptionItemId: 'pi-2', status: 'AVAILABLE', unitPrice: '5.00' },
        ],
      },
      actor,
    );

    expect(pharmacyOrderItems.updateQuote).toHaveBeenCalledWith(tx, 'oi-1', 1, { status: 'AVAILABLE', unitPrice: '10.00', substitutedDrugCode: null });
    expect(pharmacyOrders.setStatus).toHaveBeenCalledWith(tx, 'order-1', 1, 'ACCEPTED');
    expect(outbox.emit).not.toHaveBeenCalled();
    // (10.00 * 20) + (5.00 * 10) = 200 + 50 = 250.00
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'ACCEPTED', totalPrice: '250.00', currency: 'EGP' });
  });

  it('resolves SUBSTITUTION_PROPOSED, creates a Substitution row, and emits SubstitutionProposed', async () => {
    const { tx, pharmacyOrders, substitutions, outbox, useCase } = setup();

    const result = await useCase.execute(
      'order-1',
      {
        items: [
          { prescriptionItemId: 'pi-1', status: 'SUBSTITUTED', substituteDrugCode: 'PARA650', unitPrice: '12.00' },
          { prescriptionItemId: 'pi-2', status: 'AVAILABLE', unitPrice: '5.00' },
        ],
      },
      actor,
    );

    expect(substitutions.createMany).toHaveBeenCalledWith(tx, [
      { pharmacyOrderItemId: 'oi-1', originalDrugCode: 'PARA500', substitutedDrugCode: 'PARA650', proposedByUserId: 'staff-1' },
    ]);
    expect(pharmacyOrders.setStatus).toHaveBeenCalledWith(tx, 'order-1', 1, 'SUBSTITUTION_PROPOSED');
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'SubstitutionProposed', { pharmacyOrderId: 'order-1' });
    expect(result.status).toBe('SUBSTITUTION_PROPOSED');
  });

  it('422s with NO_ITEMS_AVAILABLE when every item is UNAVAILABLE', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute(
        'order-1',
        { items: [{ prescriptionItemId: 'pi-1', status: 'UNAVAILABLE' }, { prescriptionItemId: 'pi-2', status: 'UNAVAILABLE' }] },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'NO_ITEMS_AVAILABLE', httpStatus: 422 });
  });

  it('403s when the caller has no active pharmacy branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(
      useCase.execute('order-1', { items: [{ prescriptionItemId: 'pi-1', status: 'AVAILABLE', unitPrice: '10.00' }] }, actor),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('404s when the order was not claimed by the caller\'s branch', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...order, pharmacy_branch_id: 'some-other-branch' });

    await expect(
      useCase.execute('order-1', { items: [{ prescriptionItemId: 'pi-1', status: 'AVAILABLE', unitPrice: '10.00' }] }, actor),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('422s with PHARMACY_ORDER_NOT_UNDER_REVIEW when the order is not UNDER_REVIEW', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...order, status: 'RECEIVED' });

    await expect(
      useCase.execute('order-1', { items: [{ prescriptionItemId: 'pi-1', status: 'AVAILABLE', unitPrice: '10.00' }] }, actor),
    ).rejects.toMatchObject({ code: 'PHARMACY_ORDER_NOT_UNDER_REVIEW', httpStatus: 422 });
  });

  it('422s with QUOTE_ITEMS_MISMATCH when the submitted items don\'t exactly cover the order\'s items', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute('order-1', { items: [{ prescriptionItemId: 'pi-1', status: 'AVAILABLE', unitPrice: '10.00' }] }, actor),
    ).rejects.toMatchObject({ code: 'QUOTE_ITEMS_MISMATCH', httpStatus: 422 });
  });

  it('422s with CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED when a dispensed item is controlled and not confirmed', async () => {
    const { getControlledStatus, useCase } = setup();
    getControlledStatus.execute.mockResolvedValue(new Map([['PARA500', true], ['AMOX250', false]]));

    await expect(
      useCase.execute(
        'order-1',
        {
          items: [
            { prescriptionItemId: 'pi-1', status: 'AVAILABLE', unitPrice: '10.00' },
            { prescriptionItemId: 'pi-2', status: 'AVAILABLE', unitPrice: '5.00' },
          ],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED', httpStatus: 422 });
  });

  it('succeeds when a controlled-substance item is explicitly confirmed', async () => {
    const { getControlledStatus, pharmacyOrders, useCase } = setup();
    getControlledStatus.execute.mockResolvedValue(new Map([['PARA500', true], ['AMOX250', false]]));

    const result = await useCase.execute(
      'order-1',
      {
        items: [
          { prescriptionItemId: 'pi-1', status: 'AVAILABLE', unitPrice: '10.00' },
          { prescriptionItemId: 'pi-2', status: 'AVAILABLE', unitPrice: '5.00' },
        ],
        controlledSubstanceConfirmed: true,
      },
      actor,
    );

    expect(pharmacyOrders.setStatus).toHaveBeenCalledWith(expect.anything(), 'order-1', 1, 'ACCEPTED');
    expect(result.status).toBe('ACCEPTED');
  });
});
