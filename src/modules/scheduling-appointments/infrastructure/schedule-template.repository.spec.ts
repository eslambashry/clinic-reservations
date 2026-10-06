import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { ScheduleTemplateRepository } from './schedule-template.repository';

describe('ScheduleTemplateRepository', () => {
  const repo = new ScheduleTemplateRepository();
  const model = () => ({
    create: jest.fn().mockResolvedValue({ id: 't' }),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  });

  it('create maps fields to snake_case', async () => {
    const m = model();
    await repo.create({ scheduleTemplate: m } as any, {
      doctorClinicAffiliationId: 'a',
      weekday: 1,
      startTime: '09:00',
      endTime: '12:00',
      slotDurationMinutes: 30,
      bufferMinutes: 5,
    });
    expect(m.create).toHaveBeenCalledWith({
      data: {
        doctor_clinic_affiliation_id: 'a',
        weekday: 1,
        start_time: '09:00',
        end_time: '12:00',
        slot_duration_minutes: 30,
        buffer_minutes: 5,
      },
    });
  });

  it('finders query by id / affiliation / weekday', async () => {
    const m = model();
    const db = { scheduleTemplate: m } as any;
    await repo.findById(db, 'x');
    expect(m.findUnique).toHaveBeenCalledWith({ where: { id: 'x' } });
    await repo.findByAffiliationId(db, 'a');
    expect(m.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { doctor_clinic_affiliation_id: 'a' } }));
    await repo.findByAffiliationIdAndWeekday(db, 'a', 2);
    expect(m.findMany).toHaveBeenLastCalledWith({ where: { doctor_clinic_affiliation_id: 'a', weekday: 2 } });
  });

  it('findByAffiliationIds short-circuits on empty and batches otherwise', async () => {
    const m = model();
    const db = { scheduleTemplate: m } as any;
    await expect(repo.findByAffiliationIds(db, [])).resolves.toEqual([]);
    expect(m.findMany).not.toHaveBeenCalled();
    await repo.findByAffiliationIds(db, ['a', 'b']);
    expect(m.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { doctor_clinic_affiliation_id: { in: ['a', 'b'] } } }),
    );
  });

  it('findDistinctAffiliationIds maps rows to ids', async () => {
    const m = model();
    m.findMany.mockResolvedValue([{ doctor_clinic_affiliation_id: 'a' }, { doctor_clinic_affiliation_id: 'b' }]);
    await expect(repo.findDistinctAffiliationIds({ scheduleTemplate: m } as any)).resolves.toEqual(['a', 'b']);
  });

  it('update sends only the provided fields', async () => {
    const m = model();
    await repo.update({ scheduleTemplate: m } as any, 't', 3, {
      weekday: 0,
      startTime: '08:00',
      endTime: '10:00',
      slotDurationMinutes: 20,
      bufferMinutes: 0,
    });
    expect(m.updateMany.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ weekday: 0, start_time: '08:00', end_time: '10:00', slot_duration_minutes: 20, buffer_minutes: 0 }),
    );

    const m2 = model();
    await repo.update({ scheduleTemplate: m2 } as any, 't', 3, {});
    expect(m2.updateMany.mock.calls[0][0].data).not.toHaveProperty('weekday');
    expect(m2.updateMany.mock.calls[0][0].data).not.toHaveProperty('start_time');
  });

  it('remove deletes version-guarded and throws OptimisticLockError on 0 rows', async () => {
    const m = model();
    await repo.remove({ scheduleTemplate: m } as any, 't', 2);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: 't', version: 2 } });
    m.deleteMany.mockResolvedValue({ count: 0 });
    await expect(repo.remove({ scheduleTemplate: m } as any, 't', 2)).rejects.toBeInstanceOf(OptimisticLockError);
  });
});
