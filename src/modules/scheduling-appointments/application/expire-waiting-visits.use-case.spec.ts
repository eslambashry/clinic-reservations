import { ExpireWaitingVisitsUseCase } from './expire-waiting-visits.use-case';

describe('ExpireWaitingVisitsUseCase', () => {
  it('uses the configured grace period and returns the number atomically changed by the repository', async () => {
    const tx = {};
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const appointments = { expireWaitingVisits: jest.fn().mockResolvedValue(3) };
    const config = { get: jest.fn().mockReturnValue({ appointmentEndGraceMinutes: 0 }) };
    const useCase = new ExpireWaitingVisitsUseCase(prisma as any, appointments as any, config as any);

    await expect(useCase.execute()).resolves.toBe(3);
    // All three sweep updates run on one transaction client.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(appointments.expireWaitingVisits).toHaveBeenCalledWith(tx, 0);
  });

  it('uses the documented 30-minute default when scheduling configuration is unavailable', async () => {
    const tx = {};
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const appointments = { expireWaitingVisits: jest.fn().mockResolvedValue(0) };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const useCase = new ExpireWaitingVisitsUseCase(prisma as any, appointments as any, config as any);

    await useCase.execute();
    expect(appointments.expireWaitingVisits).toHaveBeenCalledWith(tx, 30);
  });
});
