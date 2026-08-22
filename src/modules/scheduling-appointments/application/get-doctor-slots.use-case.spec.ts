import { DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetDoctorSlotsUseCase } from './get-doctor-slots.use-case';

describe('GetDoctorSlotsUseCase', () => {
  function setup() {
    const prisma = {};
    const appointmentSlots = { findOpenInRange: jest.fn() };
    const resolveAffiliation = { execute: jest.fn() };
    const useCase = new GetDoctorSlotsUseCase(prisma as any, appointmentSlots as any, resolveAffiliation as any);
    return { appointmentSlots, resolveAffiliation, useCase };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('propagates the visibility 404 from ResolveAffiliationForSchedulingUseCase', async () => {
    const { resolveAffiliation, useCase } = setup();
    resolveAffiliation.execute.mockRejectedValue(new NotFoundError('Doctor', 'd1'));

    await expect(useCase.execute('d1', 'b1', undefined, undefined, undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('defaults to [today, today+14days) in UTC when from/to are omitted', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-10T12:34:00Z'));
    const { appointmentSlots, resolveAffiliation, useCase } = setup();
    resolveAffiliation.execute.mockResolvedValue({ affiliationId: 'aff-1', timezone: 'UTC' });
    appointmentSlots.findOpenInRange.mockResolvedValue([]);

    await useCase.execute('d1', 'b1', undefined, undefined, undefined);

    expect(appointmentSlots.findOpenInRange).toHaveBeenCalledWith(
      expect.anything(),
      'aff-1',
      new Date('2026-03-10T00:00:00.000Z'),
      new Date('2026-03-24T00:00:00.000Z'),
    );
  });

  it('rejects a range where to <= from', async () => {
    const { resolveAffiliation, useCase } = setup();
    resolveAffiliation.execute.mockResolvedValue({ affiliationId: 'aff-1', timezone: 'UTC' });

    await expect(useCase.execute('d1', 'b1', '2026-03-10', '2026-03-09', undefined)).rejects.toMatchObject({
      code: 'INVALID_DATE_RANGE',
    });
  });

  it('rejects a range spanning more than 14 days', async () => {
    const { resolveAffiliation, useCase } = setup();
    resolveAffiliation.execute.mockResolvedValue({ affiliationId: 'aff-1', timezone: 'UTC' });

    await expect(useCase.execute('d1', 'b1', '2026-03-01', '2026-03-20', undefined)).rejects.toBeInstanceOf(DomainError);
  });

  it('maps repository rows to the File 10 §2.3 response shape', async () => {
    const { appointmentSlots, resolveAffiliation, useCase } = setup();
    resolveAffiliation.execute.mockResolvedValue({ affiliationId: 'aff-1', timezone: 'UTC' });
    appointmentSlots.findOpenInRange.mockResolvedValue([
      { id: 's1', start_at: new Date('2026-03-10T09:00:00.000Z'), end_at: new Date('2026-03-10T09:20:00.000Z') },
    ]);

    const result = await useCase.execute('d1', 'b1', '2026-03-10', '2026-03-11', undefined);

    expect(result).toEqual({
      slots: [{ slotId: 's1', startAt: '2026-03-10T09:00:00.000Z', endAt: '2026-03-10T09:20:00.000Z', status: 'OPEN' }],
    });
  });
});
