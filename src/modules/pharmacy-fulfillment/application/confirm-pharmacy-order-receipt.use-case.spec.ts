import { ConfirmPharmacyOrderReceiptUseCase } from './confirm-pharmacy-order-receipt.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const pharmacyOrders = { findById: jest.fn(), setStatus: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new ConfirmPharmacyOrderReceiptUseCase(prisma as any, pharmacyOrders as any, audit as any);
  return { tx, pharmacyOrders, useCase };
}

describe('ConfirmPharmacyOrderReceiptUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

  it('closes an OUT_FOR_DELIVERY order to FULFILLED for its own patient', async () => {
    const { tx, pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'OUT_FOR_DELIVERY', patient_id: 'patient-1' });

    const result = await useCase.execute('order-1', actor);

    expect(pharmacyOrders.setStatus).toHaveBeenCalledWith(tx, 'order-1', 1, 'FULFILLED');
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'FULFILLED' });
  });

  it('422s when the order is not out for delivery', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'READY_FOR_PICKUP', patient_id: 'patient-1' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({
      code: 'PHARMACY_ORDER_NOT_OUT_FOR_DELIVERY',
      httpStatus: 422,
    });
  });

  it("404s when the order belongs to a different patient (IDOR guard)", async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'OUT_FOR_DELIVERY', patient_id: 'some-other-patient' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the order does not exist', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(null);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('propagates an optimistic-lock conflict when the order changed between read and write', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'OUT_FOR_DELIVERY', patient_id: 'patient-1' });
    pharmacyOrders.setStatus.mockRejectedValue({ code: 'OPTIMISTIC_LOCK_CONFLICT', httpStatus: 409 });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'OPTIMISTIC_LOCK_CONFLICT', httpStatus: 409 });
  });
});
