import { RecordResultDeliveryUseCase } from './record-result-delivery.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn() };
  const labResults = { findByOrderId: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new RecordResultDeliveryUseCase(prisma as any, labOrders as any, labResults as any, getActiveRoleMembership as any, audit as any);
  return { tx, labOrders, labResults, getActiveRoleMembership, audit, useCase };
}

describe('RecordResultDeliveryUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const order = { id: 'order-1', status: 'RESULTS_READY', lab_branch_id: 'branch-1' };

  it('attests delivery once every result has been reviewed', async () => {
    const { tx, getActiveRoleMembership, labOrders, labResults, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labResults.findByOrderId.mockResolvedValue([{ review_state: 'REVIEWED' }]);

    await useCase.execute('order-1', { recipientRole: 'patient', recipientName: 'سارة علي', method: 'whatsapp' }, actor);

    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.result-delivered', reasonCode: expect.stringContaining('سارة علي') }));
  });

  it('422s while any result is still pending human review', async () => {
    const { getActiveRoleMembership, labOrders, labResults, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    labResults.findByOrderId.mockResolvedValue([{ review_state: 'REVIEWED' }, { review_state: 'UNREVIEWED' }]);

    await expect(useCase.execute('order-1', { recipientRole: 'patient', recipientName: 'x', method: 'whatsapp' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('422s when results are not RESULTS_READY yet', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, status: 'IN_ANALYSIS' });

    await expect(useCase.execute('order-1', { recipientRole: 'patient', recipientName: 'x', method: 'whatsapp' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('rejects an empty recipient name', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);

    await expect(useCase.execute('order-1', { recipientRole: 'patient', recipientName: '  ', method: 'whatsapp' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });
});
