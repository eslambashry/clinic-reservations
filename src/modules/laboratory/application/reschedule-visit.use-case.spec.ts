import { RescheduleVisitUseCase } from './reschedule-visit.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn(), rescheduleAppointment: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getCustodyEvents = { executeForOrders: jest.fn().mockResolvedValue(new Map()) };
  const audit = { record: jest.fn() };
  const useCase = new RescheduleVisitUseCase(prisma as any, labOrders as any, getActiveRoleMembership as any, getCustodyEvents as any, audit as any);
  return { tx, labOrders, getActiveRoleMembership, getCustodyEvents, audit, useCase };
}

describe('RescheduleVisitUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const futureIso = new Date(Date.now() + 172_800_000).toISOString();
  const order = { id: 'order-1', version: 1, status: 'QUOTED', lab_branch_id: 'branch-1', appointment_at: new Date() };

  it('reschedules a QUOTED order with no live sample', async () => {
    const { tx, getActiveRoleMembership, labOrders, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);

    const result = await useCase.execute('order-1', { appointmentAt: futureIso, reason: 'طلب المريض' }, actor);

    expect(labOrders.rescheduleAppointment).toHaveBeenCalledWith(tx, 'order-1', 1, new Date(futureIso));
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.visit-rescheduled', reasonCode: 'طلب المريض' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'QUOTED' });
  });

  it('409s once a sample is already live — the appointment is history by then', async () => {
    const { getActiveRoleMembership, labOrders, getCustodyEvents, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, status: 'AWAITING_SAMPLE' });
    getCustodyEvents.executeForOrders.mockResolvedValue(new Map([['order-1', [{ type: 'SAMPLE_COLLECTED' }]]]));

    await expect(useCase.execute('order-1', { appointmentAt: futureIso }, actor)).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('422s outside QUOTED/AWAITING_SAMPLE', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, status: 'IN_ANALYSIS' });

    await expect(useCase.execute('order-1', { appointmentAt: futureIso }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('rejects a past appointment instant before touching the database', async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);

    await expect(useCase.execute('order-1', { appointmentAt: new Date(Date.now() - 1000).toISOString() }, actor)).rejects.toMatchObject({ httpStatus: 422 });
    expect(labOrders.findById).not.toHaveBeenCalled();
  });
});
