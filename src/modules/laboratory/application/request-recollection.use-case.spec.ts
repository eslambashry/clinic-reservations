import { RequestRecollectionUseCase } from './request-recollection.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new RequestRecollectionUseCase(prisma as any, labOrders as any, getActiveRoleMembership as any, audit as any);
  return { tx, labOrders, getActiveRoleMembership, audit, useCase };
}

describe('RequestRecollectionUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };

  it('requests recollection on a rejected-sample hold', async () => {
    const { tx, getActiveRoleMembership, labOrders, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1', recollection_required: true });

    const result = await useCase.execute('order-1', { reason: 'إعادة سحب' }, actor);

    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.recollection-requested', reasonCode: 'إعادة سحب' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'AWAITING_SAMPLE' });
  });

  it('422s when recollection was not actually required', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1', recollection_required: false });

    await expect(useCase.execute('order-1', { reason: 'x' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('422s outside AWAITING_SAMPLE', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', status: 'QUOTED', lab_branch_id: 'branch-1', recollection_required: true });

    await expect(useCase.execute('order-1', { reason: 'x' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });
});
