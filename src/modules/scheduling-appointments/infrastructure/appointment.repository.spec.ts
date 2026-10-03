import { AppointmentRepository } from './appointment.repository';

describe('AppointmentRepository terminal visit updates', () => {
  afterEach(() => jest.useRealTimers());

  function setup(count = 1) {
    const updateMany = jest.fn().mockResolvedValue({ count });
    const repository = new AppointmentRepository();
    const db = { appointment: { updateMany } } as any;
    return { updateMany, repository, db };
  }

  describe('expireWaitingVisits (PM-APPT-04)', () => {
    it('turns only a still-CONFIRMED, never-admitted visit past slot end + grace into NO_SHOW / TIME_EXPIRED', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-02T12:00:00.000Z'));
      const { updateMany, repository, db } = setup();

      await expect(repository.expireWaitingVisits(db, 30)).resolves.toBe(3);

      expect(updateMany).toHaveBeenNthCalledWith(1, {
        where: { status: 'CONFIRMED', visit_status: 'WAITING', slot: { end_at: { lte: new Date('2026-10-02T11:30:00.000Z') } } },
        data: { status: 'NO_SHOW', visit_status: 'TIME_EXPIRED', version: { increment: 1 } },
      });
    });

    it('only reconciles the visit state of already-finished COMPLETED/RESCHEDULED rows — never NO_SHOW', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-02T12:00:00.000Z'));
      const { updateMany, repository, db } = setup();

      await repository.expireWaitingVisits(db, 30);

      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          status: { in: ['COMPLETED', 'RESCHEDULED'] },
          visit_status: 'WAITING',
          slot: { end_at: { lte: new Date('2026-10-02T11:30:00.000Z') } },
        },
        data: { visit_status: 'TIME_EXPIRED', version: { increment: 1 } },
      });
      expect(updateMany).toHaveBeenNthCalledWith(3, {
        where: { status: 'COMPLETED', visit_status: 'IN_DOCTOR_ROOM' },
        data: { visit_status: 'LEFT', version: { increment: 1 } },
      });
    });

    it('keeps cancelled, future, in-room and already-terminal visits out of every predicate, and moves no money', async () => {
      const { updateMany, repository, db } = setup(0);

      await repository.expireWaitingVisits(db, 0);

      const [noShow] = updateMany.mock.calls[0];
      expect(noShow.where).toMatchObject({ status: 'CONFIRMED', visit_status: 'WAITING', slot: { end_at: { lte: expect.any(Date) } } });
      // V1 no-show rule: only lifecycle fields change; no payment/ledger field is written.
      expect(Object.keys(noShow.data).sort()).toEqual(['status', 'version', 'visit_status']);
      const [reconcile] = updateMany.mock.calls[1];
      expect(reconcile.where.status.in).not.toContain('CANCELLED');
      expect(reconcile.where.status.in).not.toContain('CONFIRMED');
    });
  });

  describe('booking changes (PM-APPT-01/02)', () => {
    it('cancels only a CONFIRMED appointment whose patient is still WAITING, in one version-guarded update', async () => {
      const { updateMany, repository, db } = setup();

      await expect(repository.cancel(db, 'appointment-1', 4, 'user-1', 'PROVIDER_REQUEST')).resolves.toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'appointment-1', version: 4, status: 'CONFIRMED', visit_status: 'WAITING' },
        data: {
          status: 'CANCELLED',
          visit_status: 'CANCELLED',
          cancelled_by: 'user-1',
          cancelled_reason: 'PROVIDER_REQUEST',
          version: { increment: 1 },
        },
      });
    });

    it('repeats the patient start-time cutoff inside the cancel and reschedule writes', async () => {
      const { updateMany, repository, db } = setup();
      const now = new Date('2026-10-03T09:00:00.000Z');

      await repository.cancel(db, 'appointment-1', 4, 'user-1', 'PATIENT_REQUEST', now);
      await repository.markRescheduled(db, 'appointment-1', 4, now);

      for (const [{ where }] of updateMany.mock.calls) {
        expect(where).toEqual({
          id: 'appointment-1',
          version: 4,
          status: 'CONFIRMED',
          visit_status: 'WAITING',
          slot: { start_at: { gt: now } },
        });
      }
    });

    it('reports a lost race (0 rows) as false', async () => {
      const { repository, db } = setup(0);

      await expect(repository.markRescheduled(db, 'appointment-1', 4)).resolves.toBe(false);
    });
  });

  describe('updateVisitStatus (PM-APPT-04)', () => {
    it('completes the appointment in the same write that records LEFT', async () => {
      const { updateMany, repository, db } = setup();

      await repository.updateVisitStatus(db, 'appointment-1', 7, 'LEFT');

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'appointment-1', version: 7 },
        data: { visit_status: 'LEFT', status: 'COMPLETED', version: { increment: 1 } },
      });
    });

    it('leaves the appointment status alone for IN_DOCTOR_ROOM', async () => {
      const { updateMany, repository, db } = setup();

      await repository.updateVisitStatus(db, 'appointment-1', 7, 'IN_DOCTOR_ROOM');

      expect(updateMany.mock.calls[0][0].data).toEqual({ visit_status: 'IN_DOCTOR_ROOM', version: { increment: 1 } });
    });
  });
});
