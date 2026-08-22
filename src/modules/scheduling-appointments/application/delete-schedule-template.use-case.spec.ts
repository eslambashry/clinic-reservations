import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DeleteScheduleTemplateUseCase } from './delete-schedule-template.use-case';

function buildTx() {
  return {} as any;
}

describe('DeleteScheduleTemplateUseCase', () => {
  const actor = { sub: 'admin-1', roleMembershipId: 'membership-1', roleCode: 'ADMIN', contextType: 'ADMIN', permissions: [] } as any;

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const scheduleTemplates = { findById: jest.fn(), remove: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new DeleteScheduleTemplateUseCase(prisma as any, scheduleTemplates as any, audit as any);
    return { tx, scheduleTemplates, audit, useCase };
  }

  it('throws NotFoundError when the template does not exist', async () => {
    const { scheduleTemplates, useCase } = setup();
    scheduleTemplates.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removes the template and audits it in the same transaction', async () => {
    const { tx, scheduleTemplates, audit, useCase } = setup();
    scheduleTemplates.findById.mockResolvedValue({ id: 't1', version: 1 });

    await useCase.execute('t1', actor);

    expect(scheduleTemplates.remove).toHaveBeenCalledWith(tx, 't1', 1);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'scheduling_appointments.schedule_template.delete', resourceId: 't1' }));
  });
});
