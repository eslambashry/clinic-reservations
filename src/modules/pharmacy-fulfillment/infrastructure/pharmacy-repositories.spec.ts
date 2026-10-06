import { PharmacyOrderRepository } from './pharmacy-order.repository';
import { PharmacyOrderBroadcastRepository } from './pharmacy-order-broadcast.repository';
import { PharmacyOrderItemRepository } from './pharmacy-order-item.repository';
import { SubstitutionRepository } from './substitution.repository';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

jest.mock('../../../shared/kernel/prisma/optimistic-lock', () => ({ updateWithOptimisticLock: jest.fn().mockResolvedValue(undefined) }));

function makeDb(): any {
  const models: Record<string, any> = {};
  return new Proxy({}, {
    get: (_t, k: string) => {
      if (k.startsWith('$')) {
        return (models[k] ??= jest.fn().mockResolvedValue([]));
      }
      return (models[k] ??= new Proxy({}, { get: (m: any, j: string) => (m[j] ??= jest.fn().mockResolvedValue({ count: 1 })) }));
    },
  });
}

const cursor = { createdAt: '2026-01-01T00:00:00Z', id: 'c' };

describe('PharmacyOrderRepository', () => {
  const repo = new PharmacyOrderRepository();

  it('locks, creates, finds', async () => {
    const db = makeDb();
    await repo.lockForPrescriptionAccess(db, 'o');
    expect(db.$queryRaw).toHaveBeenCalled();
    await repo.create(db, { prescriptionId: 'p', patientId: 'pt', fulfillmentType: 'PICKUP' as any });
    expect(db.pharmacyOrder.create.mock.calls[0][0].data.prescription_id).toBe('p');
    await repo.findActiveByPrescriptionId(db, 'p');
    await repo.findById(db, 'o');
    expect(db.pharmacyOrder.findFirst).toHaveBeenCalled();
    expect(db.pharmacyOrder.findUnique).toHaveBeenCalledWith({ where: { id: 'o' } });
  });

  it('claimForBranch reflects row count', async () => {
    const db = makeDb();
    expect(await repo.claimForBranch(db, 'o', 1, 'b')).toBe(true);
    db.pharmacyOrder.updateMany.mockResolvedValue({ count: 0 });
    expect(await repo.claimForBranch(db, 'o', 1, 'b')).toBe(false);
  });

  it('uses optimistic lock for status, quote and rejection', async () => {
    (updateWithOptimisticLock as jest.Mock).mockClear();
    const db = makeDb();
    await repo.setStatus(db, 'o', 1, 'COMPLETED' as any);
    await repo.submitQuote(db, 'o', 1, { totalPrice: '1', currency: 'EGP', estimatedReadyMinutes: null, note: null });
    await repo.rejectOrder(db, 'o', 1, { reason: 'OTHER' as any, note: null });
    const calls = (updateWithOptimisticLock as jest.Mock).mock.calls;
    expect(calls.map((c) => c[3].status)).toEqual(['COMPLETED', 'ACCEPTED', 'REJECTED']);
  });

  it('findForBranch / Patient / Doctor build optional filters', async () => {
    const db = makeDb();
    await repo.findForBranch(db, 'b', { limit: 5, sortDirection: 'asc' });
    await repo.findForBranch(db, 'b', { limit: 5, sortDirection: 'desc', status: 'RECEIVED' as any, cursor });
    expect(db.pharmacyOrder.findMany.mock.calls[0][0].where.AND).toHaveLength(1);
    expect(db.pharmacyOrder.findMany.mock.calls[1][0].where.AND).toHaveLength(3);
    await repo.findForPatient(db, 'p', { limit: 5, sortDirection: 'asc', cursor });
    await repo.findForPatient(db, 'p', { limit: 5, sortDirection: 'desc', status: 'RECEIVED' as any });
    expect(db.pharmacyOrder.findMany.mock.calls[2][0].where.AND).toHaveLength(2);
    expect(db.pharmacyOrder.findMany.mock.calls[3][0].where.AND).toHaveLength(2);
    await repo.findForDoctor(db, 'd', { limit: 5, sortDirection: 'asc' });
    await repo.findForDoctor(db, 'd', { limit: 5, sortDirection: 'desc', status: 'RECEIVED' as any, cursor }, 'creator');
    expect(db.pharmacyOrder.findMany.mock.calls[4][0].where.AND).toHaveLength(1);
    expect(db.pharmacyOrder.findMany.mock.calls[5][0].where.AND).toHaveLength(4);
  });

  it('findAllForBranch is unpaginated', async () => {
    const db = makeDb();
    await repo.findAllForBranch(db, 'b');
    expect(db.pharmacyOrder.findMany).toHaveBeenCalledWith({ where: { pharmacy_branch_id: 'b' } });
  });
});

describe('other pharmacy repositories', () => {
  it('broadcast repo', async () => {
    const db = makeDb();
    const repo = new PharmacyOrderBroadcastRepository();
    await repo.createMany(db, 'o', ['a', 'b']);
    expect(db.pharmacyOrderBroadcast.createMany.mock.calls[0][0].data).toHaveLength(2);
    await repo.findByOrderAndBranch(db, 'o', 'a');
    expect(await repo.markResponded(db, 'i', 'ACCEPTED' as any)).toBe(true);
    db.pharmacyOrderBroadcast.updateMany.mockResolvedValue({ count: 0 });
    expect(await repo.markResponded(db, 'i', 'ACCEPTED' as any)).toBe(false);
  });

  it('item repo', async () => {
    const db = makeDb();
    const repo = new PharmacyOrderItemRepository();
    await repo.createMany(db, 'o', [{ prescriptionItemId: 'p', quantity: 1 }]);
    await repo.findByOrderId(db, 'o');
    await repo.updateQuote(db, 'i', 1, { status: 'AVAILABLE' as any, unitPrice: '1', substitutedDrugCode: null });
    expect(db.pharmacyOrderItem.createMany).toHaveBeenCalled();
    expect(updateWithOptimisticLock).toHaveBeenCalled();
  });

  it('substitution repo', async () => {
    const db = makeDb();
    const repo = new SubstitutionRepository();
    await repo.findPendingByOrderId(db, 'o');
    await repo.rejectAllPendingForOrder(db, 'o');
    expect(db.substitution.updateMany.mock.calls[0][0].data.patient_decision).toBe('REJECTED');
  });
});
