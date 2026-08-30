import { ListPharmacyAuditUseCase } from './list-pharmacy-audit.use-case';

const staffActor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;

function order(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'order-1',
    patient_id: 'patient-1',
    pharmacy_branch_id: 'branch-1',
    fulfillment_type: 'PICKUP',
    total_price: null,
    currency: null,
    rejection_reason: null,
    rejection_note: null,
    ...overrides,
  };
}

function log(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'log-1',
    action: 'pharmacy-fulfillment.pharmacy-order.create',
    resource_type: 'pharmacy_order',
    resource_id: 'order-1',
    actor_user_id: null,
    occurred_at: new Date('2026-08-29T10:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const prisma = {} as any;
  const pharmacyOrders = { findAllForBranch: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getUserSummary = { execute: jest.fn() };
  const audit = { listByResource: jest.fn() };
  const useCase = new ListPharmacyAuditUseCase(prisma, pharmacyOrders as any, getActiveRoleMembership as any, getUserSummary as any, audit as any);
  return { prisma, pharmacyOrders, getActiveRoleMembership, getUserSummary, audit, useCase };
}

describe('ListPharmacyAuditUseCase', () => {
  it('403s a PHARMACY_STAFF actor with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute({}, staffActor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('returns an empty page without querying audit_logs when the branch owns no orders', async () => {
    const { getActiveRoleMembership, pharmacyOrders, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    pharmacyOrders.findAllForBranch.mockResolvedValue([]);

    const result = await useCase.execute({}, staffActor);

    expect(result).toEqual({ entries: [], nextCursor: null, total: 0 });
    expect(audit.listByResource).not.toHaveBeenCalled();
  });

  it('maps a mixed set of raw actions to the dashboard vocabulary, resolving fulfill by fulfillment_type and dropping unmapped actions', async () => {
    const { getActiveRoleMembership, pharmacyOrders, getUserSummary, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    pharmacyOrders.findAllForBranch.mockResolvedValue([
      order({ id: 'order-1', total_price: { toFixed: () => '225.00' }, currency: 'EGP' }),
      order({ id: 'order-2', fulfillment_type: 'DELIVERY' }),
    ]);
    getUserSummary.execute.mockResolvedValue({ id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' });
    audit.listByResource.mockResolvedValue([
      log({ id: 'log-1', action: 'pharmacy-fulfillment.pharmacy-order.create', resource_id: 'order-1' }),
      log({ id: 'log-2', action: 'pharmacy-fulfillment.pharmacy-order.quote', resource_id: 'order-1' }),
      log({ id: 'log-3', action: 'pharmacy-fulfillment.pharmacy-order.fulfill', resource_id: 'order-2' }),
      log({ id: 'log-4', action: 'pharmacy-fulfillment.pharmacy-order-broadcast.accept', resource_id: 'order-1' }),
    ]);

    const result = await useCase.execute({}, staffActor);

    expect(result.total).toBe(3);
    expect(result.entries.map((e) => e.action)).toEqual(['ORDER_RECEIVED', 'QUOTE_SENT', 'HANDED_TO_COURIER']);
    expect(result.entries[1].detail).toBe('225.00 EGP');
  });

  it('filters by action and free-text search over patient name / detail / derived order code', async () => {
    const { getActiveRoleMembership, pharmacyOrders, getUserSummary, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    pharmacyOrders.findAllForBranch.mockResolvedValue([order({ id: 'order-1', rejection_reason: 'OUT_OF_STOCK', rejection_note: null })]);
    getUserSummary.execute.mockResolvedValue({ id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' });
    audit.listByResource.mockResolvedValue([
      log({ id: 'log-1', action: 'pharmacy-fulfillment.pharmacy-order.create' }),
      log({ id: 'log-2', action: 'pharmacy-fulfillment.pharmacy-order.reject' }),
    ]);

    const byAction = await useCase.execute({ action: 'ORDER_REJECTED' }, staffActor);
    expect(byAction.entries).toHaveLength(1);
    expect(byAction.entries[0].action).toBe('ORDER_REJECTED');
    expect(byAction.entries[0].detail).toBe('OUT_OF_STOCK');

    const bySearch = await useCase.execute({ search: 'sara' }, staffActor);
    expect(bySearch.total).toBe(2);

    const byMiss = await useCase.execute({ search: 'nobody-matches-this' }, staffActor);
    expect(byMiss.total).toBe(0);
  });

  it('paginates via an opaque offset cursor', async () => {
    const { getActiveRoleMembership, pharmacyOrders, getUserSummary, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    pharmacyOrders.findAllForBranch.mockResolvedValue([order()]);
    getUserSummary.execute.mockResolvedValue(null);
    audit.listByResource.mockResolvedValue([
      log({ id: 'log-1' }),
      log({ id: 'log-2', action: 'pharmacy-fulfillment.pharmacy-order.reject' }),
    ]);

    const first = await useCase.execute({ limit: 1 }, staffActor);
    expect(first.entries).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    expect(first.total).toBe(2);

    const second = await useCase.execute({ limit: 1, cursor: first.nextCursor! }, staffActor);
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0].id).not.toBe(first.entries[0].id);
    expect(second.nextCursor).toBeNull();
  });
});
