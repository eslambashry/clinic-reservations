import { UpdateNotificationPreferencesUseCase } from './update-notification-preferences.use-case';

describe('UpdateNotificationPreferencesUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const preferences = { upsert: jest.fn() };
    const useCase = new UpdateNotificationPreferencesUseCase(prisma as any, preferences as any);
    return { tx, prisma, preferences, useCase };
  }

  it('rejects disabling SAFETY_CRITICAL for any channel — File 10 §11', async () => {
    const { preferences, useCase } = setup();

    await expect(
      useCase.execute('patient-1', [{ tier: 'SAFETY_CRITICAL', channel: 'PUSH', enabled: false }]),
    ).rejects.toMatchObject({ code: 'SAFETY_CRITICAL_NOTIFICATION_NOT_DISABLEABLE' });
    expect(preferences.upsert).not.toHaveBeenCalled();
  });

  it('allows enabling SAFETY_CRITICAL explicitly (a no-op, but not an error)', async () => {
    const { tx, preferences, useCase } = setup();

    await useCase.execute('patient-1', [{ tier: 'SAFETY_CRITICAL', channel: 'PUSH', enabled: true }]);

    expect(preferences.upsert).toHaveBeenCalledWith(tx, { userId: 'patient-1', tier: 'SAFETY_CRITICAL', channel: 'PUSH', enabled: true });
  });

  it('upserts every input row for a disableable tier', async () => {
    const { tx, preferences, useCase } = setup();

    await useCase.execute('patient-1', [
      { tier: 'TRANSACTIONAL', channel: 'SMS', enabled: false },
      { tier: 'INFORMATIONAL', channel: 'PUSH', enabled: false },
    ]);

    expect(preferences.upsert).toHaveBeenCalledTimes(2);
    expect(preferences.upsert).toHaveBeenCalledWith(tx, { userId: 'patient-1', tier: 'TRANSACTIONAL', channel: 'SMS', enabled: false });
  });

  it('rejects the whole batch (no partial writes) when any one entry violates the SAFETY_CRITICAL rule', async () => {
    const { preferences, useCase } = setup();

    await expect(
      useCase.execute('patient-1', [
        { tier: 'TRANSACTIONAL', channel: 'SMS', enabled: false },
        { tier: 'SAFETY_CRITICAL', channel: 'SMS', enabled: false },
      ]),
    ).rejects.toMatchObject({ code: 'SAFETY_CRITICAL_NOTIFICATION_NOT_DISABLEABLE' });
    expect(preferences.upsert).not.toHaveBeenCalled();
  });
});
