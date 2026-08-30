import { ListPharmacyOrdersUseCase } from './list-pharmacy-orders.use-case';

const patient = { id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' };
const prescription = { id: 'presc-1', source: 'PATIENT_UPLOADED', status: 'ACCEPTED', expiresAt: null, doctorId: null, images: [] };

function setup() {
  const prisma = {} as any;
  const pharmacyOrders = { findForPatient: jest.fn(), findForBranch: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getUserSummary = { execute: jest.fn().mockResolvedValue(patient) };
  const getPrescriptionSummary = { execute: jest.fn().mockResolvedValue(prescription) };
  const useCase = new ListPharmacyOrdersUseCase(
    prisma,
    pharmacyOrders as any,
    getActiveRoleMembership as any,
    getUserSummary as any,
    getPrescriptionSummary as any,
  );
  return { prisma, pharmacyOrders, getActiveRoleMembership, getUserSummary, getPrescriptionSummary, useCase };
}

function row(id: string, createdAt: string) {
  return {
    id,
    status: 'RECEIVED',
    fulfillment_type: 'PICKUP',
    patient_id: 'patient-1',
    prescription_id: 'presc-1',
    created_at: new Date(createdAt),
    updated_at: new Date(createdAt),
    total_price: null,
    currency: null,
    estimated_ready_minutes: null,
    staff_note: null,
    quoted_at: null,
    rejection_reason: null,
    rejection_note: null,
    rejected_at: null,
  };
}

describe('ListPharmacyOrdersUseCase', () => {
  const patientActor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const staffActor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;

  it("lists and enriches the caller's own orders for a PATIENT actor", async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findForPatient.mockResolvedValue([row('order-1', '2026-08-29T10:00:00Z')]);

    const result = await useCase.execute({}, patientActor);

    expect(pharmacyOrders.findForPatient).toHaveBeenCalledWith(
      expect.anything(),
      'patient-1',
      expect.objectContaining({ limit: 21, sortDirection: 'desc' }),
    );
    expect(result.orders).toEqual([expect.objectContaining({ id: 'order-1', patient })]);
  });

  it("lists the caller's branch queue for a PHARMACY_STAFF actor", async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    pharmacyOrders.findForBranch.mockResolvedValue([]);

    await useCase.execute({}, staffActor);

    expect(pharmacyOrders.findForBranch).toHaveBeenCalledWith(expect.anything(), 'branch-1', expect.objectContaining({ limit: 21 }));
  });

  it('403s a PHARMACY_STAFF actor with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute({}, staffActor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('paginates: returns nextCursor only when more rows exist beyond the page, and enriches only the page (not the peek row)', async () => {
    const { pharmacyOrders, getUserSummary, useCase } = setup();
    const rows = [row('o-0', '2026-01-01T00:00:00Z'), row('o-1', '2026-01-02T00:00:00Z'), row('o-2', '2026-01-03T00:00:00Z')];
    pharmacyOrders.findForPatient.mockResolvedValue(rows);

    const result = await useCase.execute({ limit: 2 }, patientActor);

    expect(result.orders).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
    expect(getUserSummary.execute).toHaveBeenCalledTimes(2);
  });

  it('returns a null nextCursor when the page is not full', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findForPatient.mockResolvedValue([row('o-1', '2026-01-01T00:00:00Z')]);

    const result = await useCase.execute({ limit: 20 }, patientActor);

    expect(result.nextCursor).toBeNull();
  });
});
