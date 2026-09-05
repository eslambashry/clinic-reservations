import { GenerateSlotsUseCase } from './generate-slots.use-case';

function template(overrides: Partial<any> = {}) {
  return {
    id: 't1',
    doctor_clinic_affiliation_id: 'aff-1',
    weekday: 1,
    start_time: '09:00',
    end_time: '10:00',
    slot_duration_minutes: 20,
    buffer_minutes: 5,
    ...overrides,
  };
}

describe('GenerateSlotsUseCase', () => {
  function setup() {
    const prisma = {};
    const scheduleTemplates = { findDistinctAffiliationIds: jest.fn(), findByAffiliationId: jest.fn() };
    const appointmentSlots = { createMany: jest.fn(), findExistingStartTimes: jest.fn().mockResolvedValue([]) };
    const listSchedulableAffiliations = { execute: jest.fn() };
    const useCase = new GenerateSlotsUseCase(prisma as any, scheduleTemplates as any, appointmentSlots as any, listSchedulableAffiliations as any);
    return { scheduleTemplates, appointmentSlots, listSchedulableAffiliations, useCase };
  }

  it('only generates for affiliations the visibility check returns (not every affiliation with a template)', async () => {
    const { scheduleTemplates, appointmentSlots, listSchedulableAffiliations, useCase } = setup();
    scheduleTemplates.findDistinctAffiliationIds.mockResolvedValue(['aff-visible', 'aff-hidden']);
    listSchedulableAffiliations.execute.mockResolvedValue([{ affiliationId: 'aff-visible', timezone: 'UTC' }]);
    scheduleTemplates.findByAffiliationId.mockResolvedValue([template({ doctor_clinic_affiliation_id: 'aff-visible' })]);
    appointmentSlots.createMany.mockResolvedValue(3);

    const result = await useCase.execute();

    expect(listSchedulableAffiliations.execute).toHaveBeenCalledWith(['aff-visible', 'aff-hidden']);
    expect(scheduleTemplates.findByAffiliationId).toHaveBeenCalledTimes(1);
    expect(scheduleTemplates.findByAffiliationId).toHaveBeenCalledWith(expect.anything(), 'aff-visible');
    expect(appointmentSlots.createMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ affiliationsProcessed: 1, slotsCreated: 3 });
  });

  it('isolates a per-affiliation failure so one bad affiliation does not block the rest', async () => {
    const { scheduleTemplates, appointmentSlots, listSchedulableAffiliations, useCase } = setup();
    scheduleTemplates.findDistinctAffiliationIds.mockResolvedValue(['aff-broken', 'aff-ok']);
    listSchedulableAffiliations.execute.mockResolvedValue([
      { affiliationId: 'aff-broken', timezone: 'UTC' },
      { affiliationId: 'aff-ok', timezone: 'UTC' },
    ]);
    scheduleTemplates.findByAffiliationId.mockImplementation((_db: unknown, affiliationId: string) => [
      template({ doctor_clinic_affiliation_id: affiliationId }),
    ]);
    appointmentSlots.createMany.mockImplementation((_db: unknown, affiliationId: string) => {
      if (affiliationId === 'aff-broken') {
        return Promise.reject(new Error('db exploded'));
      }
      return Promise.resolve(5);
    });

    const result = await useCase.execute();

    expect(appointmentSlots.createMany).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ affiliationsProcessed: 2, slotsCreated: 5 });
  });

  it('skips affiliations with no templates without calling createMany', async () => {
    const { scheduleTemplates, appointmentSlots, listSchedulableAffiliations, useCase } = setup();
    scheduleTemplates.findDistinctAffiliationIds.mockResolvedValue(['aff-1']);
    listSchedulableAffiliations.execute.mockResolvedValue([{ affiliationId: 'aff-1', timezone: 'UTC' }]);
    scheduleTemplates.findByAffiliationId.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(appointmentSlots.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ affiliationsProcessed: 1, slotsCreated: 0 });
  });

  it('never generates a second cadence for a day that already has any slot, even after the template changed', async () => {
    const { scheduleTemplates, appointmentSlots, listSchedulableAffiliations, useCase } = setup();
    scheduleTemplates.findDistinctAffiliationIds.mockResolvedValue(['aff-1']);
    listSchedulableAffiliations.execute.mockResolvedValue([{ affiliationId: 'aff-1', timezone: 'UTC' }]);
    // Template now says 30-minute slots, and covers every weekday (1-7) so
    // "today" always matches regardless of which day the test runs — but
    // "today" (the first date the rolling window covers) already has an
    // old-cadence (20-minute) slot on it from before the doctor's edit.
    const today = new Date();
    const todayNineAm = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 9, 0, 0));
    scheduleTemplates.findByAffiliationId.mockResolvedValue(
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => template({ weekday, slot_duration_minutes: 30, buffer_minutes: 0 })),
    );
    appointmentSlots.findExistingStartTimes.mockResolvedValue([todayNineAm]);
    appointmentSlots.createMany.mockResolvedValue(0);

    await useCase.execute();

    const candidates = appointmentSlots.createMany.mock.calls[0][2] as { startAt: Date }[];
    const todayIso = todayNineAm.toISOString().slice(0, 10);
    const candidatesForToday = candidates.filter((c) => c.startAt.toISOString().slice(0, 10) === todayIso);
    expect(candidatesForToday).toHaveLength(0);
  });
});
