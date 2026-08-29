import { RejectPharmacyOrderSubstitutionUseCase } from './reject-pharmacy-order-substitution.use-case';

function buildTx() {
  return {} as any;
}

describe('RejectPharmacyOrderSubstitutionUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const order = { id: 'order-1', version: 2, status: 'SUBSTITUTION_PROPOSED', patient_id: 'patient-1' };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacyOrders = { findById: jest.fn(), setStatus: jest.fn() };
    const substitutions = { rejectAllPendingForOrder: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new RejectPharmacyOrderSubstitutionUseCase(prisma as any, pharmacyOrders as any, substitutions as any, audit as any);
    return { tx, pharmacyOrders, substitutions, audit, useCase };
  }

  it('rejects all pending substitutions and sets the order REJECTED', async () => {
    const { tx, pharmacyOrders, substitutions, audit, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);

    const result = await useCase.execute('order-1', actor);

    expect(substitutions.rejectAllPendingForOrder).toHaveBeenCalledWith(tx, 'order-1');
    expect(pharmacyOrders.setStatus).toHaveBeenCalledWith(tx, 'order-1', 2, 'REJECTED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'pharmacy-fulfillment.pharmacy-order-substitution.reject' }));
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'REJECTED' });
  });

  it('404s when the caller does not own the order', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...order, patient_id: 'someone-else' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('422s when the order has no pending substitution to reject', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...order, status: 'UNDER_REVIEW' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'PHARMACY_ORDER_NOT_SUBSTITUTION_PROPOSED', httpStatus: 422 });
  });
});
