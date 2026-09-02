import { SetCriticalFlagUseCase } from './set-critical-flag.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn() };
  const labResults = { findById: jest.fn(), setCriticalCall: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new SetCriticalFlagUseCase(prisma as any, labOrders as any, labResults as any, getActiveRoleMembership as any, audit as any);
  return { tx, labOrders, labResults, getActiveRoleMembership, audit, useCase };
}

describe('SetCriticalFlagUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const order = { id: 'order-1', status: 'RESULTS_READY', lab_branch_id: 'branch-1' };
  const result = { id: 'res-1', lab_order_id: 'order-1', version: 1, review_state: 'UNREVIEWED', file_label: 'cbc.pdf' };

  it('makes the critical call and audits CRITICAL_FLAGGED when true', async () => {
    const { tx, getActiveRoleMembership, labOrders, labResults, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labResults.findById.mockResolvedValue(result);

    await useCase.execute('order-1', 'res-1', { isCritical: true }, actor);

    expect(labResults.setCriticalCall).toHaveBeenCalledWith(tx, 'res-1', 1, true);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.critical-flagged', reasonCode: 'cbc.pdf' }));
  });

  it('makes the non-critical call without auditing an event (never critical-and-unreviewed at once)', async () => {
    const { getActiveRoleMembership, labOrders, labResults, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labResults.findById.mockResolvedValue(result);

    await useCase.execute('order-1', 'res-1', { isCritical: false }, actor);

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('409s a second call against an already-reviewed result', async () => {
    const { getActiveRoleMembership, labOrders, labResults, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labResults.findById.mockResolvedValue({ ...result, review_state: 'REVIEWED' });

    await expect(useCase.execute('order-1', 'res-1', { isCritical: true }, actor)).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('404s a result that does not belong to this order', async () => {
    const { getActiveRoleMembership, labOrders, labResults, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labResults.findById.mockResolvedValue({ ...result, lab_order_id: 'other-order' });

    await expect(useCase.execute('order-1', 'res-1', { isCritical: true }, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });
});
