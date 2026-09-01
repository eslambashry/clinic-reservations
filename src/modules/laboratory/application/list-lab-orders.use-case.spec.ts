import { ListLabOrdersUseCase } from './list-lab-orders.use-case';

const patient = { id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' };

function setup() {
  const prisma = {} as any;
  const labOrders = { findForPatient: jest.fn(), findForBranch: jest.fn() };
  const labOrderItems = { findByOrderId: jest.fn().mockResolvedValue([]) };
  const labResults = { findByOrderId: jest.fn().mockResolvedValue([]) };
  const labOrderNotes = { findByOrderId: jest.fn().mockResolvedValue([]) };
  const testCatalog = { findByCodes: jest.fn().mockResolvedValue([]) };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getUserSummary = { execute: jest.fn().mockResolvedValue(patient) };
  const getPrescriptionSummary = { execute: jest.fn() };
  const getCustodyEvents = { executeForOrders: jest.fn().mockResolvedValue(new Map()) };
  const useCase = new ListLabOrdersUseCase(
    prisma,
    labOrders as any,
    labOrderItems as any,
    labResults as any,
    labOrderNotes as any,
    testCatalog as any,
    getActiveRoleMembership as any,
    getUserSummary as any,
    getPrescriptionSummary as any,
    getCustodyEvents as any,
  );
  return { labOrders, getActiveRoleMembership, getUserSummary, getCustodyEvents, useCase };
}

function row(id: string, createdAt: string) {
  return {
    id,
    patient_id: 'patient-1',
    lab_branch_id: 'branch-1',
    prescription_id: null,
    status: 'REQUESTED',
    collection_type: 'VISIT',
    total_price: null,
    currency: null,
    appointment_at: null,
    prep_instructions: null,
    quoted_at: null,
    queue_number: null,
    booking_code: null,
    rejection_reason: null,
    rejection_note: null,
    rejected_at: null,
    recollection_required: false,
    created_at: new Date(createdAt),
    updated_at: new Date(createdAt),
  };
}

describe('ListLabOrdersUseCase', () => {
  const patientActor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const staffActor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;

  it("lists and enriches the caller's own orders for a PATIENT actor", async () => {
    const { labOrders, useCase } = setup();
    labOrders.findForPatient.mockResolvedValue([row('order-1', '2026-08-29T10:00:00Z')]);

    const result = await useCase.execute({}, patientActor);

    expect(labOrders.findForPatient).toHaveBeenCalledWith(expect.anything(), 'patient-1', expect.objectContaining({ limit: 21, sortDirection: 'desc' }));
    expect(result.orders).toEqual([expect.objectContaining({ id: 'order-1', patient })]);
  });

  it("lists the caller's full branch queue for a LAB_STAFF actor (no broadcast subset, unlike pharmacy)", async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    labOrders.findForBranch.mockResolvedValue([]);

    await useCase.execute({}, staffActor);

    expect(labOrders.findForBranch).toHaveBeenCalledWith(expect.anything(), 'branch-1', expect.objectContaining({ limit: 21 }));
  });

  it('403s a LAB_STAFF actor with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute({}, staffActor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('fetches custody events once for the whole page, not once per row', async () => {
    const { labOrders, getCustodyEvents, useCase } = setup();
    labOrders.findForPatient.mockResolvedValue([row('o-1', '2026-01-01T00:00:00Z'), row('o-2', '2026-01-02T00:00:00Z')]);

    await useCase.execute({ limit: 2 }, patientActor);

    expect(getCustodyEvents.executeForOrders).toHaveBeenCalledTimes(1);
    expect(getCustodyEvents.executeForOrders).toHaveBeenCalledWith(expect.anything(), ['o-1', 'o-2']);
  });

  it('paginates: returns nextCursor only when more rows exist beyond the page', async () => {
    const { labOrders, useCase } = setup();
    const rows = [row('o-0', '2026-01-01T00:00:00Z'), row('o-1', '2026-01-02T00:00:00Z'), row('o-2', '2026-01-03T00:00:00Z')];
    labOrders.findForPatient.mockResolvedValue(rows);

    const result = await useCase.execute({ limit: 2 }, patientActor);

    expect(result.orders).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });

  it('returns a null nextCursor when the page is not full', async () => {
    const { labOrders, useCase } = setup();
    labOrders.findForPatient.mockResolvedValue([row('o-1', '2026-01-01T00:00:00Z')]);

    const result = await useCase.execute({ limit: 20 }, patientActor);

    expect(result.nextCursor).toBeNull();
  });
});
