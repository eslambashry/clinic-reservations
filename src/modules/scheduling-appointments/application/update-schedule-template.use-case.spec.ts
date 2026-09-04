import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateScheduleTemplateUseCase } from './update-schedule-template.use-case';

function buildTx() {
  return {} as any;
}

describe('UpdateScheduleTemplateUseCase', () => {
  const actor = { sub: 'admin-1', roleMembershipId: 'membership-1', roleCode: 'ADMIN', contextType: 'ADMIN', permissions: [] } as any;

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const scheduleTemplates = {
      findById: jest.fn(),
      update: jest.fn(),
      findByAffiliationIdAndWeekday: jest.fn().mockResolvedValue([]),
    };
    const audit = { record: jest.fn() };
    const useCase = new UpdateScheduleTemplateUseCase(prisma as any, scheduleTemplates as any, audit as any);
    return { tx, scheduleTemplates, audit, useCase };
  }

  it('throws NotFoundError when the template does not exist', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing', {}, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('validates the merged startTime/endTime, not just the fields being patched', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.findById.mockResolvedValue({
      id: 't1',
      doctor_clinic_affiliation_id: 'aff-1',
      weekday: 1,
      start_time: '09:00',
      end_time: '13:00',
      version: 1,
    });

    await expect(useCase.execute('t1', { startTime: '14:00' }, actor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(scheduleTemplates.update).not.toHaveBeenCalled();
  });

  it('updates with the current version and audits it', async () => {
    const { tx, scheduleTemplates, audit, useCase } = setup();
    scheduleTemplates.findById.mockResolvedValue({
      id: 't1',
      doctor_clinic_affiliation_id: 'aff-1',
      weekday: 1,
      start_time: '09:00',
      end_time: '13:00',
      version: 2,
    });

    await useCase.execute('t1', { bufferMinutes: 10 }, actor);

    expect(scheduleTemplates.update).toHaveBeenCalledWith(tx, 't1', 2, { bufferMinutes: 10 });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'scheduling_appointments.schedule_template.update', resourceId: 't1' }));
  });

  it('rejects an edit that would overlap another template on the same day', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.findById.mockResolvedValue({
      id: 't1',
      doctor_clinic_affiliation_id: 'aff-1',
      weekday: 1,
      start_time: '09:00',
      end_time: '13:00',
      version: 1,
    });
    scheduleTemplates.findByAffiliationIdAndWeekday.mockResolvedValue([
      { id: 't1', start_time: '09:00', end_time: '13:00' },
      { id: 't2', start_time: '14:00', end_time: '16:00' },
    ]);

    await expect(useCase.execute('t1', { endTime: '15:00' }, actor)).rejects.toBeInstanceOf(ConflictError);
    expect(scheduleTemplates.update).not.toHaveBeenCalled();
  });

  it('does not treat the template being edited as overlapping itself', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.findById.mockResolvedValue({
      id: 't1',
      doctor_clinic_affiliation_id: 'aff-1',
      weekday: 1,
      start_time: '09:00',
      end_time: '13:00',
      version: 1,
    });
    scheduleTemplates.findByAffiliationIdAndWeekday.mockResolvedValue([
      { id: 't1', start_time: '09:00', end_time: '13:00' },
    ]);

    await useCase.execute('t1', { bufferMinutes: 15 }, actor);

    expect(scheduleTemplates.update).toHaveBeenCalled();
  });
});
