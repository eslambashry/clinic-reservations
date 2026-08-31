import { CreatePharmacyOrderUseCase } from './create-pharmacy-order.use-case';

function buildTx() {
  return {} as any;
}

describe('CreatePharmacyOrderUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const input = { prescriptionId: 'prescription-1', fulfillmentType: 'PICKUP' as const, lat: 30.0444, lng: 31.2357 };
  const branchSearchResult = { items: [{ branchId: 'branch-1' }, { branchId: 'branch-2' }], nextCursor: null };
  const acceptedPrescription = { prescriptionId: 'prescription-1', items: [{ id: 'item-1', drugCode: 'PARA500', quantity: 20 }] };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacyOrders = { create: jest.fn(), findLatestByPrescriptionId: jest.fn() };
    const pharmacyOrderItems = { createMany: jest.fn() };
    const broadcasts = { createMany: jest.fn() };
    const getAcceptedPrescription = { execute: jest.fn() };
    const searchPharmacyBranches = { execute: jest.fn() };
    const getPharmacyBranch = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CreatePharmacyOrderUseCase(
      prisma as any,
      pharmacyOrders as any,
      pharmacyOrderItems as any,
      broadcasts as any,
      getAcceptedPrescription as any,
      searchPharmacyBranches as any,
      getPharmacyBranch as any,
      audit as any,
      outbox as any,
    );
    return { tx, pharmacyOrders, pharmacyOrderItems, broadcasts, getAcceptedPrescription, searchPharmacyBranches, getPharmacyBranch, audit, outbox, useCase };
  }

  it('creates the order, its items, and one broadcast per nearby branch', async () => {
    const { tx, pharmacyOrders, pharmacyOrderItems, broadcasts, getAcceptedPrescription, searchPharmacyBranches, audit, outbox, useCase } = setup();
    searchPharmacyBranches.execute.mockResolvedValue(branchSearchResult);
    pharmacyOrders.findLatestByPrescriptionId.mockResolvedValue(null);
    getAcceptedPrescription.execute.mockResolvedValue(acceptedPrescription);
    pharmacyOrders.create.mockResolvedValue({ id: 'order-1', status: 'RECEIVED' });

    const result = await useCase.execute(input, actor);

    expect(searchPharmacyBranches.execute).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 30.0444, lng: 31.2357, deliveryCapable: undefined }),
    );
    expect(getAcceptedPrescription.execute).toHaveBeenCalledWith(tx, 'prescription-1', 'patient-1');
    expect(pharmacyOrderItems.createMany).toHaveBeenCalledWith(tx, 'order-1', [{ prescriptionItemId: 'item-1', quantity: 20 }]);
    expect(broadcasts.createMany).toHaveBeenCalledWith(tx, 'order-1', ['branch-1', 'branch-2']);
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PharmacyOrderCreated', expect.objectContaining({ pharmacyOrderId: 'order-1' }));
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'pharmacy-fulfillment.pharmacy-order.create' }));
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'RECEIVED', broadcastedBranchIds: ['branch-1', 'branch-2'] });
  });

  it('passes deliveryCapable: true when fulfillmentType is DELIVERY', async () => {
    const { pharmacyOrders, getAcceptedPrescription, searchPharmacyBranches, useCase } = setup();
    searchPharmacyBranches.execute.mockResolvedValue(branchSearchResult);
    pharmacyOrders.findLatestByPrescriptionId.mockResolvedValue(null);
    getAcceptedPrescription.execute.mockResolvedValue(acceptedPrescription);
    pharmacyOrders.create.mockResolvedValue({ id: 'order-1', status: 'RECEIVED' });

    await useCase.execute({ ...input, fulfillmentType: 'DELIVERY' }, actor);

    expect(searchPharmacyBranches.execute).toHaveBeenCalledWith(expect.objectContaining({ deliveryCapable: true }));
  });

  it('broadcasts to exactly the chosen branch when pharmacyBranchId is given, skipping the nearest-branch search', async () => {
    const { pharmacyOrders, pharmacyOrderItems, broadcasts, getAcceptedPrescription, searchPharmacyBranches, getPharmacyBranch, useCase } = setup();
    getPharmacyBranch.execute.mockResolvedValue({ id: 'branch-9', delivery_capable: true });
    pharmacyOrders.findLatestByPrescriptionId.mockResolvedValue(null);
    getAcceptedPrescription.execute.mockResolvedValue(acceptedPrescription);
    pharmacyOrders.create.mockResolvedValue({ id: 'order-1', status: 'RECEIVED' });

    const result = await useCase.execute({ ...input, pharmacyBranchId: 'branch-9' }, actor);

    expect(getPharmacyBranch.execute).toHaveBeenCalledWith('branch-9', undefined);
    expect(searchPharmacyBranches.execute).not.toHaveBeenCalled();
    expect(broadcasts.createMany).toHaveBeenCalledWith(expect.anything(), 'order-1', ['branch-9']);
    expect(result.broadcastedBranchIds).toEqual(['branch-9']);
  });

  it('422s with PHARMACY_BRANCH_NOT_DELIVERY_CAPABLE when the chosen branch cannot deliver and DELIVERY was requested', async () => {
    const { getPharmacyBranch, useCase } = setup();
    getPharmacyBranch.execute.mockResolvedValue({ id: 'branch-9', delivery_capable: false });

    await expect(
      useCase.execute({ ...input, fulfillmentType: 'DELIVERY', pharmacyBranchId: 'branch-9' }, actor),
    ).rejects.toMatchObject({ code: 'PHARMACY_BRANCH_NOT_DELIVERY_CAPABLE', httpStatus: 422 });
  });

  it('propagates NotFoundError from GetPharmacyBranchUseCase when the chosen branch does not exist or is not visible', async () => {
    const { getPharmacyBranch, useCase } = setup();
    getPharmacyBranch.execute.mockRejectedValue(Object.assign(new Error('not found'), { code: 'NOT_FOUND', httpStatus: 404 }));

    await expect(useCase.execute({ ...input, pharmacyBranchId: 'missing-branch' }, actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('422s with NO_PHARMACY_BRANCHES_AVAILABLE and never opens a transaction when no branches are nearby', async () => {
    const { pharmacyOrders, searchPharmacyBranches, useCase } = setup();
    searchPharmacyBranches.execute.mockResolvedValue({ items: [], nextCursor: null });

    await expect(useCase.execute(input, actor)).rejects.toMatchObject({ code: 'NO_PHARMACY_BRANCHES_AVAILABLE', httpStatus: 422 });
    expect(pharmacyOrders.findLatestByPrescriptionId).not.toHaveBeenCalled();
  });

  it('409s with PHARMACY_ORDER_ALREADY_EXISTS when an active order already exists for this prescription', async () => {
    const { pharmacyOrders, searchPharmacyBranches, useCase } = setup();
    searchPharmacyBranches.execute.mockResolvedValue(branchSearchResult);
    pharmacyOrders.findLatestByPrescriptionId.mockResolvedValue({ id: 'order-0', status: 'UNDER_REVIEW' });

    await expect(useCase.execute(input, actor)).rejects.toMatchObject({ code: 'PHARMACY_ORDER_ALREADY_EXISTS', httpStatus: 409 });
  });

  it('allows creating a new order when the prescription\'s latest order is terminal (REJECTED/FULFILLED)', async () => {
    const { pharmacyOrders, getAcceptedPrescription, searchPharmacyBranches, useCase } = setup();
    searchPharmacyBranches.execute.mockResolvedValue(branchSearchResult);
    pharmacyOrders.findLatestByPrescriptionId.mockResolvedValue({ id: 'order-0', status: 'REJECTED' });
    getAcceptedPrescription.execute.mockResolvedValue(acceptedPrescription);
    pharmacyOrders.create.mockResolvedValue({ id: 'order-1', status: 'RECEIVED' });

    const result = await useCase.execute(input, actor);

    expect(result.pharmacyOrderId).toBe('order-1');
  });

  it('422s with NO_FULFILLABLE_ITEMS when the accepted prescription has no fulfillable items', async () => {
    const { pharmacyOrders, getAcceptedPrescription, searchPharmacyBranches, useCase } = setup();
    searchPharmacyBranches.execute.mockResolvedValue(branchSearchResult);
    pharmacyOrders.findLatestByPrescriptionId.mockResolvedValue(null);
    getAcceptedPrescription.execute.mockResolvedValue({ prescriptionId: 'prescription-1', items: [] });

    await expect(useCase.execute(input, actor)).rejects.toMatchObject({ code: 'NO_FULFILLABLE_ITEMS', httpStatus: 422 });
  });

  it('propagates PRESCRIPTION_NOT_ACCEPTED from the prescriptions module read', async () => {
    const { pharmacyOrders, getAcceptedPrescription, searchPharmacyBranches, useCase } = setup();
    searchPharmacyBranches.execute.mockResolvedValue(branchSearchResult);
    pharmacyOrders.findLatestByPrescriptionId.mockResolvedValue(null);
    getAcceptedPrescription.execute.mockRejectedValue(Object.assign(new Error('not accepted'), { code: 'PRESCRIPTION_NOT_ACCEPTED', httpStatus: 422 }));

    await expect(useCase.execute(input, actor)).rejects.toMatchObject({ code: 'PRESCRIPTION_NOT_ACCEPTED' });
  });
});
