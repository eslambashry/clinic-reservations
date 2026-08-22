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
    const appointmentSlots = { createMany: jest.fn() };
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
});
