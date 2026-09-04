import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateScheduleTemplateUseCase } from './create-schedule-template.use-case';

function buildTx() {
  return {} as any;
}

function fkViolation() {
  return new Prisma.PrismaClientKnownRequestError('FK violation', { code: 'P2003', clientVersion: '5.22.0' });
}

describe('CreateScheduleTemplateUseCase', () => {
  const actor = { sub: 'admin-1', roleMembershipId: 'membership-1', roleCode: 'ADMIN', contextType: 'ADMIN', permissions: [] } as any;
  const input = { doctorClinicAffiliationId: 'aff-1', weekday: 1, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 20, bufferMinutes: 5 };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const scheduleTemplates = { create: jest.fn(), findByAffiliationIdAndWeekday: jest.fn().mockResolvedValue([]) };
    const audit = { record: jest.fn() };
    const useCase = new CreateScheduleTemplateUseCase(prisma as any, scheduleTemplates as any, audit as any);
    return { tx, scheduleTemplates, audit, useCase };
  }

  it('rejects endTime <= startTime as a business rule, before touching the database', async () => {
    const { scheduleTemplates, useCase } = setup();

    await expect(useCase.execute({ ...input, startTime: '13:00', endTime: '09:00' }, actor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(scheduleTemplates.create).not.toHaveBeenCalled();
  });

  it('translates a foreign-key violation on the affiliation into NotFoundError', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.create.mockRejectedValue(fkViolation());

    await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates the template and audits it in the same transaction', async () => {
    const { tx, scheduleTemplates, audit, useCase } = setup();
    scheduleTemplates.create.mockResolvedValue({ id: 'template-1', ...input });

    const result = await useCase.execute(input, actor);

    expect(result.id).toBe('template-1');
    expect(scheduleTemplates.create).toHaveBeenCalledWith(tx, input);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'admin-1', action: 'scheduling_appointments.schedule_template.create', resourceId: 'template-1' }),
    );
  });

  it('rejects a same-day window that overlaps an existing template, including an exact duplicate', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.findByAffiliationIdAndWeekday.mockResolvedValue([
      { id: 'existing-1', start_time: '09:00', end_time: '13:00' },
    ]);

    await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(ConflictError);
    expect(scheduleTemplates.create).not.toHaveBeenCalled();
  });

  it('allows a same-day window that does not overlap an existing template', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.findByAffiliationIdAndWeekday.mockResolvedValue([
      { id: 'existing-1', start_time: '14:00', end_time: '16:00' },
    ]);
    scheduleTemplates.create.mockResolvedValue({ id: 'template-1', ...input });

    const result = await useCase.execute(input, actor);

    expect(result.id).toBe('template-1');
  });
});
