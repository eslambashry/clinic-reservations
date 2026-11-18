import { AppointmentSlotRepository } from './appointment-slot.repository';

describe('AppointmentSlotRepository', () => {
  const repo = new AppointmentSlotRepository();
  const mk = (count = 1) => ({
    createMany: jest.fn().mockResolvedValue({ count: 2 }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count }),
  });
  const a = new Date('2026-01-01T00:00:00Z');
  const b = new Date('2026-01-02T00:00:00Z');

  it('createMany returns 0 for empty input without a query', async () => {
    const m = mk();
    await expect(repo.createMany({ appointmentSlot: m } as any, 'a', [])).resolves.toBe(0);
    expect(m.createMany).not.toHaveBeenCalled();
  });

  it('createMany inserts OPEN slots with skipDuplicates', async () => {
    const m = mk();
    await expect(repo.createMany({ appointmentSlot: m } as any, 'a', [{ startAt: a, endAt: b }])).resolves.toBe(2);
    expect(m.createMany).toHaveBeenCalledWith({
      data: [{ doctor_clinic_affiliation_id: 'a', start_at: a, end_at: b, status: 'OPEN' }],
      skipDuplicates: true,
    });
  });

  it('findOpenInRange / findById / findExistingStartTimes', async () => {
    const m = mk();
    const db = { appointmentSlot: m } as any;
    await repo.findOpenInRange(db, 'a', a, b);
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'OPEN' }) }));
    await repo.findById(db, 's');
    expect(m.findUnique).toHaveBeenCalledWith({ where: { id: 's' } });
    m.findMany.mockResolvedValue([{ start_at: a }, { start_at: b }]);
    await expect(repo.findExistingStartTimes(db, 'a', a, b)).resolves.toEqual([a, b]);
  });

  it.each([
    ['markHeld', 'OPEN', 'HELD'],
    ['markBooked', 'HELD', 'BOOKED'],
    ['markBookedDirect', 'OPEN', 'BOOKED'],
    ['markOpen', 'HELD', 'OPEN'],
    ['releaseBooked', 'BOOKED', 'OPEN'],
  ])('%s transitions %s -> %s and reflects row count', async (method, from, to) => {
    const m = mk(1);
    await expect((repo as any)[method]({ appointmentSlot: m } as any, 's')).resolves.toBe(true);
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: 's', status: from }, data: { status: to, version: { increment: 1 } } });
    await expect((repo as any)[method]({ appointmentSlot: mk(0) } as any, 's')).resolves.toBe(false);
  });
});
