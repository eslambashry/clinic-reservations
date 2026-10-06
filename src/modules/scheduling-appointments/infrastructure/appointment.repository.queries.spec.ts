import { AppointmentRepository } from './appointment.repository';

describe('AppointmentRepository queries', () => {
  const repo = new AppointmentRepository();
  const mk = () => ({
    create: jest.fn().mockResolvedValue({ id: 'a' }),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  });
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-02T00:00:00Z');
  const cursor = { startAt: '2026-01-01T10:00:00.000Z', id: 'c1' };

  it('create stores CONFIRMED with mapped fields', async () => {
    const m = mk();
    await repo.create({ appointment: m } as any, {
      id: 'a',
      slotId: 's',
      patientId: 'p',
      doctorClinicAffiliationId: 'd',
      rescheduledFromAppointmentId: 'r',
      paymentIntentId: 'pi',
      remainingBalance: 5,
    } as any);
    expect(m.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'a', slot_id: 's', patient_id: 'p', status: 'CONFIRMED', payment_intent_id: 'pi', remaining_balance: 5 }),
    });
  });

  it('findById / findByIdWithSlotTimes / findByIdWithDoctorView use findUnique', async () => {
    const m = mk();
    const db = { appointment: m } as any;
    await repo.findById(db, 'a');
    expect(m.findUnique).toHaveBeenLastCalledWith({ where: { id: 'a' } });
    await repo.findByIdWithSlotTimes(db, 'a');
    expect(m.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'a' }, include: expect.any(Object) }));
    await repo.findByIdWithDoctorView(db, 'a');
    expect(m.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ include: expect.objectContaining({ patient: expect.any(Object) }) }));
  });

  describe('listForPatient', () => {
    it('applies only the patient scope with no optional filters', async () => {
      const m = mk();
      await repo.listForPatient({ appointment: m } as any, { patientId: 'p', limit: 10 });
      const arg = m.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ patient_id: 'p' });
      expect(arg.take).toBe(10);
    });

    it('merges from+to into one start_at filter, adds status and cursor', async () => {
      const m = mk();
      await repo.listForPatient({ appointment: m } as any, { patientId: 'p', status: 'CONFIRMED', from, to, cursor, limit: 5 } as any);
      const where = m.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('CONFIRMED');
      expect(where.slot).toEqual({ start_at: { gte: from, lt: to } });
      expect(where.OR).toHaveLength(2);
      expect(where.OR[1].id).toEqual({ gt: 'c1' });
    });

    it('supports a from-only and a to-only bound', async () => {
      const m = mk();
      const db = { appointment: m } as any;
      await repo.listForPatient(db, { patientId: 'p', from, limit: 1 });
      expect(m.findMany.mock.calls[0][0].where.slot).toEqual({ start_at: { gte: from } });
      await repo.listForPatient(db, { patientId: 'p', to, limit: 1 });
      expect(m.findMany.mock.calls[1][0].where.slot).toEqual({ start_at: { lt: to } });
    });
  });

  describe('listForDoctor', () => {
    it('returns [] without querying when the caller has no affiliations', async () => {
      const m = mk();
      await expect(repo.listForDoctor({ appointment: m } as any, { affiliationIds: [], limit: 5 })).resolves.toEqual([]);
      expect(m.findMany).not.toHaveBeenCalled();
    });

    it('scopes to affiliations with no optional filters', async () => {
      const m = mk();
      await repo.listForDoctor({ appointment: m } as any, { affiliationIds: ['x'], limit: 5 });
      expect(m.findMany.mock.calls[0][0].where).toEqual({ doctor_clinic_affiliation_id: { in: ['x'] } });
    });

    it('applies status, range and cursor filters', async () => {
      const m = mk();
      await repo.listForDoctor({ appointment: m } as any, { affiliationIds: ['x'], status: 'CANCELLED', from, to, cursor, limit: 5 } as any);
      const where = m.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('CANCELLED');
      expect(where.slot).toEqual({ start_at: { gte: from, lt: to } });
      expect(where.OR[0]).toEqual({ slot: { start_at: { gt: new Date(cursor.startAt) } } });
    });
  });

  describe('existsForPatientAndAffiliations', () => {
    it('is false without querying when there are no affiliations', async () => {
      const m = mk();
      await expect(repo.existsForPatientAndAffiliations({ appointment: m } as any, 'p', [])).resolves.toBe(false);
      expect(m.findFirst).not.toHaveBeenCalled();
    });

    it('reflects whether a matching appointment exists', async () => {
      const m = mk();
      const db = { appointment: m } as any;
      await expect(repo.existsForPatientAndAffiliations(db, 'p', ['x'])).resolves.toBe(false);
      m.findFirst.mockResolvedValue({ id: 'a' });
      await expect(repo.existsForPatientAndAffiliations(db, 'p', ['x'])).resolves.toBe(true);
    });
  });
});
