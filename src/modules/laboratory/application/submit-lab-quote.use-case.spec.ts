import { SubmitLabQuoteUseCase } from './submit-lab-quote.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn(), submitQuote: jest.fn() };
  const labOrderItems = { findByOrderId: jest.fn(), setUnitPrice: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new SubmitLabQuoteUseCase(prisma as any, labOrders as any, labOrderItems as any, getActiveRoleMembership as any, audit as any);
  return { tx, labOrders, labOrderItems, getActiveRoleMembership, audit, useCase };
}

describe('SubmitLabQuoteUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const futureIso = new Date(Date.now() + 86_400_000).toISOString();
  const validInput = { totalPrice: '450.00', appointmentAt: futureIso, prepInstructions: 'صائم 8 ساعات', queueNumber: 5 };

  it('quotes a REQUESTED order with items, splitting price presentationally', async () => {
    const { tx, labOrders, labOrderItems, getActiveRoleMembership, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'REQUESTED', lab_branch_id: 'branch-1' });
    labOrderItems.findByOrderId.mockResolvedValue([{ id: 'item-1' }, { id: 'item-2' }]);

    const result = await useCase.execute('order-1', validInput, actor);

    expect(labOrderItems.setUnitPrice).toHaveBeenCalledWith(tx, 'order-1', '225.00');
    expect(labOrders.submitQuote).toHaveBeenCalledWith(tx, 'order-1', 1, expect.objectContaining({ totalPrice: '450.00', queueNumber: 5, currency: 'EGP' }));
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.quote-sent', reasonCode: '#5' }));
    expect(result).toEqual({ labOrderId: 'order-1', status: 'QUOTED' });
  });

  it('422s a request with no items yet (prescription-only, not transcribed)', async () => {
    const { labOrders, labOrderItems, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'REQUESTED', lab_branch_id: 'branch-1' });
    labOrderItems.findByOrderId.mockResolvedValue([]);

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('422s when the order is not REQUESTED', async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'QUOTED', lab_branch_id: 'branch-1' });

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('403s a LAB_STAFF actor with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('404s an order claimed by a different branch (IDOR guard)', async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'REQUESTED', lab_branch_id: 'other-branch' });

    await expect(useCase.execute('order-1', validInput, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('rejects a non-positive total price before touching the database', async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);

    await expect(useCase.execute('order-1', { ...validInput, totalPrice: '0.00' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
    expect(labOrders.findById).not.toHaveBeenCalled();
  });

  it('rejects a past appointment instant', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);

    await expect(useCase.execute('order-1', { ...validInput, appointmentAt: new Date(Date.now() - 1000).toISOString() }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });
});
