import { RejectLabOrderUseCase } from './reject-lab-order.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn(), rejectOrder: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getCustodyEvents = { executeForOrders: jest.fn().mockResolvedValue(new Map()) };
  const audit = { record: jest.fn() };
  const useCase = new RejectLabOrderUseCase(prisma as any, labOrders as any, getActiveRoleMembership as any, getCustodyEvents as any, audit as any);
  return { tx, labOrders, getActiveRoleMembership, getCustodyEvents, audit, useCase };
}

describe('RejectLabOrderUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };

  it('rejects a REQUESTED order with no live sample', async () => {
    const { tx, getActiveRoleMembership, labOrders, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'REQUESTED', lab_branch_id: 'branch-1' });

    const result = await useCase.execute('order-1', { reason: 'التحليل غير متاح' }, actor);

    expect(labOrders.rejectOrder).toHaveBeenCalledWith(tx, 'order-1', 1, { reason: 'التحليل غير متاح', note: null });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.order-rejected' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'REJECTED' });
  });

  it('422s once analysis has already started', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'IN_ANALYSIS', lab_branch_id: 'branch-1' });

    await expect(useCase.execute('order-1', { reason: 'x' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('422s when a live sample already exists, even in an otherwise-rejectable status', async () => {
    const { getActiveRoleMembership, labOrders, getCustodyEvents, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1' });
    getCustodyEvents.executeForOrders.mockResolvedValue(new Map([['order-1', [{ type: 'SAMPLE_COLLECTED' }]]]));

    await expect(useCase.execute('order-1', { reason: 'x' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });
});
