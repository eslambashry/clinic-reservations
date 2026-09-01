import { AddOperationalNoteUseCase } from './add-operational-note.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const labOrders = { findById: jest.fn() };
  const labOrderNotes = { create: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new AddOperationalNoteUseCase(prisma as any, labOrders as any, labOrderNotes as any, getActiveRoleMembership as any, audit as any);
  return { tx, labOrders, labOrderNotes, getActiveRoleMembership, audit, useCase };
}

describe('AddOperationalNoteUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };
  const order = { id: 'order-1', status: 'IN_ANALYSIS', lab_branch_id: 'branch-1' };

  it('writes a note and truncates a long body for the audit detail', async () => {
    const { tx, getActiveRoleMembership, labOrders, labOrderNotes, audit, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue(order);
    const longBody = 'x'.repeat(60);

    await useCase.execute('order-1', { body: longBody }, actor);

    expect(labOrderNotes.create).toHaveBeenCalledWith(tx, 'order-1', 'staff-1', longBody);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'laboratory.lab-order.note-added', reasonCode: `${'x'.repeat(48)}…` }));
  });

  it('rejects an empty note', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);

    await expect(useCase.execute('order-1', { body: '   ' }, actor)).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('404s an order owned by a different branch', async () => {
    const { getActiveRoleMembership, labOrders, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    labOrders.findById.mockResolvedValue({ ...order, lab_branch_id: 'other-branch' });

    await expect(useCase.execute('order-1', { body: 'ملاحظة' }, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });
});
