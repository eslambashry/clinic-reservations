import { ApprovePharmacyOrderUseCase } from './approve-pharmacy-order.use-case';

function buildTx() {
  return {} as any;
}

describe('ApprovePharmacyOrderUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const acceptedOrder = {
    id: 'order-1',
    version: 3,
    status: 'ACCEPTED',
    patient_id: 'patient-1',
    pharmacy_branch_id: 'branch-1',
    // Real Prisma.Decimal implements both toString (strips trailing zeros)
    // and toFixed (doesn't) — a mock with only toString let a real
    // `.toFixed(2)` vs `.toString()` bug through unnoticed (2026-08-29
    // production-readiness pass, found via real-Postgres integration
    // testing).
    total_price: { toString: () => '200', toFixed: (n: number) => (200).toFixed(n) },
    currency: 'EGP',
  };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacyOrders = { findById: jest.fn(), markPaid: jest.fn() };
    const capturePayment = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new ApprovePharmacyOrderUseCase(prisma as any, pharmacyOrders as any, capturePayment as any, audit as any);
    capturePayment.execute.mockResolvedValue({ paymentIntentId: 'intent-1', commissionAmount: '30.00', providerAmount: '170.00' });
    pharmacyOrders.markPaid.mockResolvedValue(true);
    return { tx, pharmacyOrders, capturePayment, audit, useCase };
  }

  it('captures payment for the quoted total and marks the order PAID', async () => {
    const { tx, pharmacyOrders, capturePayment, audit, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(acceptedOrder);

    const result = await useCase.execute('order-1', actor);

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

  it('422s with PHARMACY_ORDER_NOT_APPROVABLE when no quote total was ever set', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...acceptedOrder, total_price: null });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'PHARMACY_ORDER_NOT_APPROVABLE' });
  });

  it('409s when markPaid loses the race (order changed concurrently)', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(acceptedOrder);
    pharmacyOrders.markPaid.mockResolvedValue(false);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'PHARMACY_ORDER_STATUS_CHANGED', httpStatus: 409 });
  });
});
