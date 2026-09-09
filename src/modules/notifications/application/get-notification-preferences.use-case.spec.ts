import { GetNotificationPreferencesUseCase } from './get-notification-preferences.use-case';

describe('GetNotificationPreferencesUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const preferences = { listForUser: jest.fn() };
    const useCase = new GetNotificationPreferencesUseCase(prisma, preferences as any);
    return { prisma, preferences, useCase };
  }

  it('defaults every (tier, channel) combination to enabled when no preference row exists', async () => {
    const { preferences, useCase } = setup();
    preferences.listForUser.mockResolvedValue([]);

    const result = await useCase.execute('patient-1');

    const transactionalPush = result.find((r) => r.tier === 'TRANSACTIONAL' && r.channel === 'PUSH');
    expect(transactionalPush).toEqual({ tier: 'TRANSACTIONAL', channel: 'PUSH', enabled: true, userDisableable: true });
  });

  it('reflects a stored disabled preference', async () => {
    const { preferences, useCase } = setup();
    preferences.listForUser.mockResolvedValue([{ tier: 'INFORMATIONAL', channel: 'PUSH', enabled: false }]);

    const result = await useCase.execute('patient-1');

    const informationalPush = result.find((r) => r.tier === 'INFORMATIONAL' && r.channel === 'PUSH');
    expect(informationalPush?.enabled).toBe(false);
  });

  it('reports SAFETY_CRITICAL as always enabled and never user-disableable, regardless of any stored row', async () => {
    const { preferences, useCase } = setup();
    preferences.listForUser.mockResolvedValue([{ tier: 'SAFETY_CRITICAL', channel: 'PUSH', enabled: false }]);

    const result = await useCase.execute('patient-1');

    const safetyPush = result.find((r) => r.tier === 'SAFETY_CRITICAL' && r.channel === 'PUSH');
    expect(safetyPush?.userDisableable).toBe(false);
  });
});
