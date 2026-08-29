import { GetPharmacyOrderUseCase } from './get-pharmacy-order.use-case';

describe('GetPharmacyOrderUseCase', () => {
  const order = { id: 'order-1', status: 'UNDER_REVIEW', fulfillment_type: 'PICKUP', pharmacy_branch_id: 'branch-1', patient_id: 'patient-1' };
  const items = [{ id: 'oi-1', prescription_item_id: 'pi-1', status: 'AVAILABLE', substituted_drug_code: null, unit_price: { toString: () => '10.00' }, quantity: 20 }];
  const substitutions: any[] = [];

  function setup() {
    const prisma = {} as any;
    const pharmacyOrders = { findById: jest.fn() };
    const pharmacyOrderItems = { findByOrderId: jest.fn() };
    const substitutionRepo = { findByOrderId: jest.fn() };
    const getActiveRoleMembership = { execute: jest.fn() };
    const useCase = new GetPharmacyOrderUseCase(prisma, pharmacyOrders as any, pharmacyOrderItems as any, substitutionRepo as any, getActiveRoleMembership as any);
    pharmacyOrderItems.findByOrderId.mockResolvedValue(items);
    substitutionRepo.findByOrderId.mockResolvedValue(substitutions);
    return { pharmacyOrders, pharmacyOrderItems, substitutionRepo, getActiveRoleMembership, useCase };
  }

  it('returns the order detail for the owning patient', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);
    const actor = { sub: 'patient-1', contextType: 'PATIENT' } as any;

    const result = await useCase.execute('order-1', actor);

    expect(result.pharmacyOrderId).toBe('order-1');
    expect(result.items[0]).toEqual({ id: 'oi-1', prescriptionItemId: 'pi-1', status: 'AVAILABLE', substitutedDrugCode: null, unitPrice: '10.00', quantity: 20 });
  });

  it('returns the order detail for the assigned branch\'s staff', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-1', contextId: 'branch-1' });
    const actor = { sub: 'staff-1', contextType: 'PHARMACY_STAFF' } as any;

    const result = await useCase.execute('order-1', actor);

    expect(result.pharmacyOrderId).toBe('order-1');
  });

  it('404s for staff assigned to a different branch', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-1', contextId: 'some-other-branch' });
    const actor = { sub: 'staff-1', contextType: 'PHARMACY_STAFF' } as any;

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s for an unrelated patient', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);
    const actor = { sub: 'someone-else', contextType: 'PATIENT' } as any;

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the order does not exist', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(null);
    const actor = { sub: 'patient-1', contextType: 'PATIENT' } as any;

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });
});
