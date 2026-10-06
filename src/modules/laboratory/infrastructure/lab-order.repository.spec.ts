import { LabOrderRepository } from './lab-order.repository';

const okUpdate = () => jest.fn().mockResolvedValue({ count: 1 });
const cursor = { createdAt: '2026-01-01T00:00:00.000Z', id: 'c1' };
const d = new Date('2026-01-01T00:00:00.000Z');

describe('LabOrderRepository', () => {
  const repo = new LabOrderRepository();

  it('create maps the input columns', async () => {
    const db = { labOrder: { create: jest.fn() } } as any;
    await repo.create(db, {
      patientId: 'p',
      labBranchId: 'b',
      prescriptionId: 'rx',
      collectionType: 'VISIT',
      doctorId: 'd',
      createdByUserId: 'u',
      appointmentId: 'a',
      batchId: 'batch',
    });
    expect(db.labOrder.create).toHaveBeenCalledWith({
      data: {
        patient_id: 'p',
        lab_branch_id: 'b',
        prescription_id: 'rx',
        collection_type: 'VISIT',
        doctor_id: 'd',
        created_by_user_id: 'u',
        appointment_id: 'a',
        batch_id: 'batch',
      },
    });
  });

  it('findById / findAllForBranch', async () => {
    const db = { labOrder: { findUnique: jest.fn(), findMany: jest.fn() } } as any;
    await repo.findById(db, 'o1');
    expect(db.labOrder.findUnique).toHaveBeenCalledWith({ where: { id: 'o1' } });
    await repo.findAllForBranch(db, 'b1');
    expect(db.labOrder.findMany).toHaveBeenCalledWith({ where: { lab_branch_id: 'b1' } });
  });

  describe('findByDoctorId', () => {
    it('applies creator, status and descending cursor filters', async () => {
      const db = { labOrder: { findMany: jest.fn() } } as any;
      await repo.findByDoctorId(db, 'doc', { cursor, limit: 10, sortDirection: 'desc', status: 'QUOTED' }, 'creator');
      expect(db.labOrder.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { doctor_id: 'doc' },
            { created_by_user_id: 'creator' },
            { status: 'QUOTED' },
            { OR: [{ created_at: { lt: d } }, { created_at: d, id: { lt: 'c1' } }] },
          ],
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 10,
      });
    });

    it('omits optional filters', async () => {
      const db = { labOrder: { findMany: jest.fn() } } as any;
      await repo.findByDoctorId(db, 'doc', { limit: 5, sortDirection: 'asc' });
      expect(db.labOrder.findMany.mock.calls[0][0].where).toEqual({ AND: [{ doctor_id: 'doc' }] });
    });
  });

  it('findForPatient uses an ascending cursor filter', async () => {
    const db = { labOrder: { findMany: jest.fn() } } as any;
    await repo.findForPatient(db, 'p1', { cursor, limit: 5, sortDirection: 'asc', status: 'REQUESTED' });
    expect(db.labOrder.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { patient_id: 'p1' },
          { status: 'REQUESTED' },
          { OR: [{ created_at: { gt: d } }, { created_at: d, id: { gt: 'c1' } }] },
        ],
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    await repo.findForPatient(db, 'p1', { limit: 5, sortDirection: 'asc' });
    expect(db.labOrder.findMany.mock.calls[1][0].where).toEqual({ AND: [{ patient_id: 'p1' }] });
  });

  it('findForBranch filters by branch', async () => {
    const db = { labOrder: { findMany: jest.fn() } } as any;
    await repo.findForBranch(db, 'b1', { limit: 5, sortDirection: 'desc', status: 'REJECTED' });
    expect(db.labOrder.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ lab_branch_id: 'b1' }, { status: 'REJECTED' }],
    });
    await repo.findForBranch(db, 'b1', { limit: 5, sortDirection: 'desc' });
    expect(db.labOrder.findMany.mock.calls[1][0].where).toEqual({ AND: [{ lab_branch_id: 'b1' }] });
  });

  describe('optimistic-lock writes', () => {
    const lockWhere = { id: 'o1', version: 4 };

    it('setStatus', async () => {
      const db = { labOrder: { updateMany: okUpdate() } } as any;
      await repo.setStatus(db, 'o1', 4, 'IN_ANALYSIS' as any);
      expect(db.labOrder.updateMany).toHaveBeenCalledWith({
        where: lockWhere,
        data: { status: 'IN_ANALYSIS', version: { increment: 1 } },
      });
    });

    it('submitQuote', async () => {
      const db = { labOrder: { updateMany: okUpdate() } } as any;
      const appointmentAt = new Date('2026-02-01T10:00:00Z');
      await repo.submitQuote(db, 'o1', 4, {
        totalPrice: '100.00',
        currency: 'EGP',
        appointmentAt,
        prepInstructions: 'fast',
        queueNumber: 3,
      });
      expect(db.labOrder.updateMany).toHaveBeenCalledWith({
        where: lockWhere,
        data: {
          status: 'QUOTED',
          total_price: '100.00',
          currency: 'EGP',
          appointment_at: appointmentAt,
          prep_instructions: 'fast',
          queue_number: 3,
          quoted_at: expect.any(Date),
          version: { increment: 1 },
        },
      });
    });

    it('confirmBooking, rescheduleAppointment, setRecollectionRequired', async () => {
      const db = { labOrder: { updateMany: okUpdate() } } as any;
      await repo.confirmBooking(db, 'o1', 4, 'CODE');
      expect(db.labOrder.updateMany.mock.calls[0][0].data).toEqual({
        status: 'AWAITING_SAMPLE',
        booking_code: 'CODE',
        version: { increment: 1 },
      });
      await repo.rescheduleAppointment(db, 'o1', 4, d);
      expect(db.labOrder.updateMany.mock.calls[1][0].data).toEqual({ appointment_at: d, version: { increment: 1 } });
      await repo.setRecollectionRequired(db, 'o1', 4, false);
      expect(db.labOrder.updateMany.mock.calls[2][0].data).toEqual({ recollection_required: false, version: { increment: 1 } });
    });

    it('rejectSample reverts the status only when asked', async () => {
      const db = { labOrder: { updateMany: okUpdate() } } as any;
      await repo.rejectSample(db, 'o1', 4, true);
      expect(db.labOrder.updateMany.mock.calls[0][0].data).toEqual({
        recollection_required: true,
        status: 'AWAITING_SAMPLE',
        version: { increment: 1 },
      });
      await repo.rejectSample(db, 'o1', 4, false);
      expect(db.labOrder.updateMany.mock.calls[1][0].data).toEqual({
        recollection_required: true,
        version: { increment: 1 },
      });
    });

    it('rejectOrder', async () => {
      const db = { labOrder: { updateMany: okUpdate() } } as any;
      await repo.rejectOrder(db, 'o1', 4, { reason: 'r', note: null });
      expect(db.labOrder.updateMany.mock.calls[0][0].data).toEqual({
        status: 'REJECTED',
        rejection_reason: 'r',
        rejection_note: null,
        rejected_at: expect.any(Date),
        version: { increment: 1 },
      });
    });

    it('throws on a version conflict', async () => {
      const db = { labOrder: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } } as any;
      await expect(repo.setStatus(db, 'o1', 4, 'REJECTED')).rejects.toThrow();
    });
  });
});
