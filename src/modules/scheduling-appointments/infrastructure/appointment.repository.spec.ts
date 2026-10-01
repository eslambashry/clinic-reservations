import { AppointmentRepository } from './appointment.repository';

describe('AppointmentRepository terminal visit updates', () => {
  afterEach(() => jest.useRealTimers());

  it('expires only confirmed, waiting visits whose slot has ended at the grace cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-02T12:00:00.000Z'));
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new AppointmentRepository();
    const db = { appointment: { updateMany } } as any;

    await expect(repository.expireWaitingVisits(db, 30)).resolves.toBe(1);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: 'CONFIRMED',
        visit_status: 'WAITING',
        slot: { end_at: { lte: new Date('2026-10-02T11:30:00.000Z') } },
      },
      data: { visit_status: 'TIME_EXPIRED', version: { increment: 1 } },
    });
  });

  it('keeps cancelled, future, in-room, and already terminal visits out of the atomic update predicate', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = new AppointmentRepository();
    const db = { appointment: { updateMany } } as any;

    await repository.expireWaitingVisits(db, 0);

    const [{ where }] = updateMany.mock.calls[0];
    // One database-side predicate is the race protection: any cancellation,
    // check-in, future slot, or prior expiry no longer matches these clauses.
    expect(where).toMatchObject({
      status: 'CONFIRMED',
      visit_status: 'WAITING',
      slot: { end_at: { lte: expect.any(Date) } },
    });
    expect(where.status).not.toBe('CANCELLED');
    expect(where.visit_status).not.toBe('IN_DOCTOR_ROOM');
    expect(where.visit_status).not.toBe('TIME_EXPIRED');
  });

  it('writes CANCELLED lifecycle and visit state in one version-guarded update', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new AppointmentRepository();
    const db = { appointment: { updateMany } } as any;

    await expect(repository.cancel(db, 'appointment-1', 4, 'user-1', 'PATIENT_REQUEST')).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'appointment-1', version: 4, status: 'CONFIRMED' },
      data: {
        status: 'CANCELLED',
        visit_status: 'CANCELLED',
        cancelled_by: 'user-1',
        cancelled_reason: 'PATIENT_REQUEST',
        version: { increment: 1 },
      },
    });
  });
});
