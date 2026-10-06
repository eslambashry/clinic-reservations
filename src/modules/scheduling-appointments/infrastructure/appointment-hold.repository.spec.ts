import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { AppointmentHoldRepository } from './appointment-hold.repository';

describe('AppointmentHoldRepository', () => {
  const repo = new AppointmentHoldRepository();
  const mk = (count = 1) => ({
    create: jest.fn().mockResolvedValue({ id: 'h' }),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count }),
  });
  const d = new Date('2026-01-01T00:00:00Z');

  it('create maps fields', async () => {
    const m = mk();
    await repo.create({ appointmentHold: m } as any, { slotId: 's', patientId: 'p', expiresAt: d, rescheduledFromAppointmentId: 'r' });
    expect(m.create).toHaveBeenCalledWith({
      data: { slot_id: 's', patient_id: 'p', expires_at: d, rescheduled_from_appointment_id: 'r' },
    });
  });

  it('findById / findByPaymentIntentId / findActiveExpired query correctly', async () => {
    const m = mk();
    const db = { appointmentHold: m } as any;
    await repo.findById(db, 'h');
    expect(m.findUnique).toHaveBeenCalledWith({ where: { id: 'h' } });
    await repo.findByPaymentIntentId(db, 'pi');
    expect(m.findUnique).toHaveBeenLastCalledWith({ where: { payment_intent_id: 'pi' } });
    await repo.findActiveExpired(db, d);
    expect(m.findMany).toHaveBeenCalledWith({ where: { status: 'ACTIVE', expires_at: { lte: d } } });
  });

  it('markConverted succeeds or throws OptimisticLockError', async () => {
    await expect(repo.markConverted({ appointmentHold: mk(1) } as any, 'h', 1, d)).resolves.toBeUndefined();
    await expect(repo.markConverted({ appointmentHold: mk(0) } as any, 'h', 1, d)).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it('markExpired returns whether one row changed', async () => {
    await expect(repo.markExpired({ appointmentHold: mk(1) } as any, 'h', d)).resolves.toBe(true);
    await expect(repo.markExpired({ appointmentHold: mk(0) } as any, 'h', d)).resolves.toBe(false);
  });

  it('linkOnlinePayment returns whether one row changed', async () => {
    const m = mk(1);
    await expect(repo.linkOnlinePayment({ appointmentHold: m } as any, 'h', 2, 'pi', d)).resolves.toBe(true);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { id: 'h', version: 2, status: 'ACTIVE' },
      data: { payment_intent_id: 'pi', expires_at: d, version: { increment: 1 } },
    });
    await expect(repo.linkOnlinePayment({ appointmentHold: mk(0) } as any, 'h', 2, 'pi', d)).resolves.toBe(false);
  });
});
