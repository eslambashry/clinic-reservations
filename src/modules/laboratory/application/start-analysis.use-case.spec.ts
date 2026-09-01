import { StartAnalysisUseCase } from './start-analysis.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn(), setStatus: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getCustodyEvents = { executeForOrders: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new StartAnalysisUseCase(prisma as any, labOrders as any, getActiveRoleMembership as any, getCustodyEvents as any, audit as any);
  return { tx, labOrders, getActiveRoleMembership, getCustodyEvents, audit, useCase };
}

describe('StartAnalysisUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const order = { id: 'order-1', version: 1, status: 'AWAITING_SAMPLE', lab_branch_id: 'branch-1' };
  const liveSample = new Map([['order-1', [{ type: 'ARRIVAL_CONFIRMED' }, { type: 'SAMPLE_COLLECTED' }]]]);

  it('starts analysis on a collected sample, folding technicianName into the detail text (never the recorded actor)', async () => {
    const { tx, getActiveRoleMembership, labOrders, getCustodyEvents, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    getCustodyEvents.executeForOrders.mockResolvedValue(liveSample);

    const result = await useCase.execute('order-1', { technicianName: 'أحمد فتحي', note: 'عاجل' }, actor);

    expect(labOrders.setStatus).toHaveBeenCalledWith(tx, 'order-1', 1, 'IN_ANALYSIS');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'staff-1', action: 'laboratory.lab-order.analysis-started', reasonCode: 'أحمد فتحي — عاجل' }),
    );
    expect(result).toEqual({ labOrderId: 'order-1', status: 'IN_ANALYSIS' });
  });

  it('422s without a live sample', async () => {
    const { getActiveRoleMembership, labOrders, getCustodyEvents, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    getCustodyEvents.executeForOrders.mockResolvedValue(new Map());

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('422s when the order is not AWAITING_SAMPLE', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, status: 'QUOTED' });

    await expect(useCase.execute('order-1', undefined, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });
});
