import { RejectSampleUseCase } from './reject-sample.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn(), rejectSample: jest.fn() };
  const labOrderItems = { resetToPending: jest.fn() };
  const labResults = { deleteByOrderId: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getCustodyEvents = { executeForOrders: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new RejectSampleUseCase(prisma as any, labOrders as any, labOrderItems as any, labResults as any, getActiveRoleMembership as any, getCustodyEvents as any, audit as any);
  return { tx, labOrders, labOrderItems, labResults, getActiveRoleMembership, getCustodyEvents, audit, useCase };
}

describe('RejectSampleUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const liveSample = new Map([['order-1', [{ type: 'SAMPLE_COLLECTED' }]]]);

  it('invalidates results/items and reverts IN_ANALYSIS back to AWAITING_SAMPLE', async () => {
    const { tx, getActiveRoleMembership, labOrders, labOrderItems, labResults, getCustodyEvents, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'IN_ANALYSIS', lab_branch_id: 'branch-1' });
    getCustodyEvents.executeForOrders.mockResolvedValue(liveSample);

    const result = await useCase.execute('order-1', { reason: 'عينة ملوثة' }, actor);

    expect(labResults.deleteByOrderId).toHaveBeenCalledWith(tx, 'order-1');
    expect(labOrderItems.resetToPending).toHaveBeenCalledWith(tx, 'order-1');
    expect(labOrders.rejectSample).toHaveBeenCalledWith(tx, 'order-1', 1, true);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.sample-rejected', reasonCode: 'عينة ملوثة' }));
    expect(result.status).toBe('AWAITING_SAMPLE');
  });

  it('does not revert status when still AWAITING_SAMPLE (nothing to revert from)', async () => {
    const { getActiveRoleMembership, labOrders, getCustodyEvents, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1' });
    getCustodyEvents.executeForOrders.mockResolvedValue(liveSample);

    await useCase.execute('order-1', { reason: 'x' }, actor);

    expect(labOrders.rejectSample).toHaveBeenCalledWith(expect.anything(), 'order-1', 1, false);
  });

  it('422s with no live sample to reject', async () => {
    const { getActiveRoleMembership, labOrders, getCustodyEvents, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1' });
    getCustodyEvents.executeForOrders.mockResolvedValue(new Map());

    await expect(useCase.execute('order-1', { reason: 'x' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('rejects an empty reason before touching the database', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);

    await expect(useCase.execute('order-1', { reason: '  ' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
    expect(labOrders.findById).not.toHaveBeenCalled();
  });
});
