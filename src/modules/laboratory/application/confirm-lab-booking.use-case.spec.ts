import { ConfirmLabBookingUseCase } from './confirm-lab-booking.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn(), confirmBooking: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new ConfirmLabBookingUseCase(prisma as any, labOrders as any, getActiveRoleMembership as any, audit as any);
  return { tx, labOrders, getActiveRoleMembership, audit, useCase };
}

describe('ConfirmLabBookingUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };

  it('confirms a QUOTED order, issuing a booking code and moving to AWAITING_SAMPLE — the transition the mock never implements', async () => {
    const { tx, labOrders, getActiveRoleMembership, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'QUOTED', lab_branch_id: 'branch-1' });

    const result = await useCase.execute('order-1', actor);

    expect(result.status).toBe('AWAITING_SAMPLE');
    expect(result.bookingCode).toMatch(/^LB-[A-Z0-9]{6}$/);
    expect(labOrders.confirmBooking).toHaveBeenCalledWith(tx, 'order-1', 1, result.bookingCode);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.booking-confirmed', reasonCode: result.bookingCode }));
  });

  it('422s when the order is not QUOTED', async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'REQUESTED', lab_branch_id: 'branch-1' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('403s with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('404s an order owned by a different branch', async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'QUOTED', lab_branch_id: 'other-branch' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });
});
