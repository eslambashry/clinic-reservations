import { ListScheduleTemplatesUseCase } from './list-schedule-templates.use-case';

describe('ListScheduleTemplatesUseCase', () => {
  function setup() {
    const prisma = {};
    const scheduleTemplates = { findByAffiliationId: jest.fn() };
    const useCase = new ListScheduleTemplatesUseCase(prisma as any, scheduleTemplates as any);
    return { prisma, scheduleTemplates, useCase };
  }

  it('delegates to the repository, scoped to the given affiliation', async () => {
    const { prisma, scheduleTemplates, useCase } = setup();
    const templates = [
      { id: 'template-1', doctor_clinic_affiliation_id: 'aff-1', weekday: 1 },
      { id: 'template-2', doctor_clinic_affiliation_id: 'aff-1', weekday: 3 },
    ];
    scheduleTemplates.findByAffiliationId.mockResolvedValue(templates);

    const result = await useCase.execute('aff-1');

    expect(result).toBe(templates);
    expect(scheduleTemplates.findByAffiliationId).toHaveBeenCalledWith(prisma, 'aff-1');
  });

  it('returns an empty list for an affiliation with no templates, without throwing', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.findByAffiliationId.mockResolvedValue([]);

    await expect(useCase.execute('aff-with-no-templates')).resolves.toEqual([]);
  });
});
