import { ListLabAuditUseCase } from './list-lab-audit.use-case';

const staffActor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;

function order(overrides: Partial<Record<string, any>> = {}) {
  return { id: 'order-1', patient_id: 'patient-1', lab_branch_id: 'branch-1', ...overrides };
}

function log(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'log-1',
    action: 'laboratory.lab-order.request-received',
    resource_type: 'lab_order',
    resource_id: 'order-1',
    actor_user_id: null,
    reason_code: null,
    occurred_at: new Date('2026-08-29T10:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const prisma = {} as any;
  const labOrders = { findAllForBranch: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getUserSummary = { execute: jest.fn() };
  const audit = { listByResource: jest.fn() };
  const useCase = new ListLabAuditUseCase(prisma, labOrders as any, getActiveRoleMembership as any, getUserSummary as any, audit as any);
  return { labOrders, getActiveRoleMembership, getUserSummary, audit, useCase };
}

describe('ListLabAuditUseCase', () => {
  it('403s a LAB_STAFF actor with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute({}, staffActor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('returns an empty page without querying audit_logs when the branch owns no orders', async () => {
    const { getActiveRoleMembership, labOrders, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    labOrders.findAllForBranch.mockResolvedValue([]);

    const result = await useCase.execute({}, staffActor);

    expect(result).toEqual({ entries: [], nextCursor: null, total: 0 });
    expect(audit.listByResource).not.toHaveBeenCalled();
  });

  it('reads detail straight off reason_code (no reconstruction needed, unlike pharmacy), drops unmapped actions, and preserves the repository\'s own (newest-first) ordering', async () => {
    const { getActiveRoleMembership, labOrders, getUserSummary, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    labOrders.findAllForBranch.mockResolvedValue([order()]);
    getUserSummary.execute.mockResolvedValue({ id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' });
    // Pre-ordered newest-first, matching what `AuditLogRepository.findByResource`'s
    // own `ORDER BY occurred_at DESC` actually returns — this use-case trusts
    // that order rather than re-sorting, so the mock must supply it already sorted.
    audit.listByResource.mockResolvedValue([
      log({ id: 'log-2', action: 'laboratory.lab-order.quote-sent', reason_code: '#5', occurred_at: new Date('2026-08-29T11:00:00Z') }),
      log({ id: 'log-1', action: 'laboratory.lab-order.request-received', occurred_at: new Date('2026-08-29T10:00:00Z') }),
      log({ id: 'log-3', action: 'some-other-module.thing.happened' }),
    ]);

    const result = await useCase.execute({}, staffActor);

    expect(result.total).toBe(2);
    expect(result.entries.map((e) => e.action)).toEqual(['QUOTE_SENT', 'REQUEST_RECEIVED']);
    expect(result.entries[0].detail).toBe('#5');
  });

  it('filters by action and free-text search over patient name / detail / derived order code', async () => {
    const { getActiveRoleMembership, labOrders, getUserSummary, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    labOrders.findAllForBranch.mockResolvedValue([order()]);
    getUserSummary.execute.mockResolvedValue({ id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' });
    audit.listByResource.mockResolvedValue([
      log({ id: 'log-1', action: 'laboratory.lab-order.request-received' }),
      log({ id: 'log-2', action: 'laboratory.lab-order.order-rejected', reason_code: 'OUT_OF_STOCK' }),
    ]);

    const byAction = await useCase.execute({ action: 'ORDER_REJECTED' }, staffActor);
    expect(byAction.entries).toHaveLength(1);
    expect(byAction.entries[0].detail).toBe('OUT_OF_STOCK');

    const bySearch = await useCase.execute({ search: 'sara' }, staffActor);
    expect(bySearch.total).toBe(2);

    const byMiss = await useCase.execute({ search: 'nobody-matches-this' }, staffActor);
    expect(byMiss.total).toBe(0);
  });

  it('paginates via an opaque offset cursor', async () => {
    const { getActiveRoleMembership, labOrders, getUserSummary, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    labOrders.findAllForBranch.mockResolvedValue([order()]);
    getUserSummary.execute.mockResolvedValue(null);
    audit.listByResource.mockResolvedValue([log({ id: 'log-1' }), log({ id: 'log-2', action: 'laboratory.lab-order.order-rejected' })]);

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
