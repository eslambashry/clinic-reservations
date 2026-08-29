import { ApprovePharmacyOrderUseCase } from './approve-pharmacy-order.use-case';

function buildTx() {
  return {} as any;
}

describe('ApprovePharmacyOrderUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const acceptedOrder = { id: 'order-1', version: 3, status: 'ACCEPTED', patient_id: 'patient-1', pharmacy_branch_id: 'branch-1' };
  const substitutionProposedOrder = { ...acceptedOrder, status: 'SUBSTITUTION_PROPOSED' };
  const items = [
    { status: 'AVAILABLE', unit_price: { toString: () => '10.00' }, quantity: 20 },
    { status: 'UNAVAILABLE', unit_price: null, quantity: 5 },
  ];

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacyOrders = { findById: jest.fn(), markPaid: jest.fn() };
    const pharmacyOrderItems = { findByOrderId: jest.fn() };
    const substitutions = { approveAllPendingForOrder: jest.fn() };
    const capturePayment = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new ApprovePharmacyOrderUseCase(
      prisma as any,
      pharmacyOrders as any,
      pharmacyOrderItems as any,
      substitutions as any,
      capturePayment as any,
      audit as any,
    );
    pharmacyOrderItems.findByOrderId.mockResolvedValue(items);
    capturePayment.execute.mockResolvedValue({ paymentIntentId: 'intent-1', commissionAmount: '30.00', providerAmount: '170.00' });
    pharmacyOrders.markPaid.mockResolvedValue(true);
    return { tx, pharmacyOrders, pharmacyOrderItems, substitutions, capturePayment, audit, useCase };
  }

  it('captures payment for the computed total and marks the order PAID (from ACCEPTED)', async () => {
    const { tx, pharmacyOrders, substitutions, capturePayment, audit, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(acceptedOrder);

    const result = await useCase.execute('order-1', actor);

    expect(substitutions.approveAllPendingForOrder).not.toHaveBeenCalled();
    expect(capturePayment.execute).toHaveBeenCalledWith(tx, {
      payerUserId: 'patient-1',
      payableType: 'PHARMACY_ORDER',
      payableId: 'order-1',
      amount: '200.00',
      currency: 'EGP',
      providerType: 'PHARMACY',
      providerId: 'branch-1',
      idempotencyKey: 'pharmacy-order:order-1',
    });
    expect(pharmacyOrders.markPaid).toHaveBeenCalledWith(tx, 'order-1', 3, 'intent-1');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'pharmacy-fulfillment.pharmacy-order.approve' }));
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'PAID', paymentIntentId: 'intent-1', totalAmount: '200.00', currency: 'EGP' });
  });

  it('approves pending substitutions first when the order is SUBSTITUTION_PROPOSED', async () => {
    const { tx, pharmacyOrders, substitutions, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(substitutionProposedOrder);

    await useCase.execute('order-1', actor);

    expect(substitutions.approveAllPendingForOrder).toHaveBeenCalledWith(tx, 'order-1');
  });

  it('404s when the caller does not own the order', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...acceptedOrder, patient_id: 'someone-else' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('422s with PHARMACY_ORDER_NOT_APPROVABLE for a non-approvable status', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...acceptedOrder, status: 'UNDER_REVIEW' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'PHARMACY_ORDER_NOT_APPROVABLE', httpStatus: 422 });
  });

  it('409s when markPaid loses the race (order changed concurrently)', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(acceptedOrder);
    pharmacyOrders.markPaid.mockResolvedValue(false);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'PHARMACY_ORDER_STATUS_CHANGED', httpStatus: 409 });
  });
});
