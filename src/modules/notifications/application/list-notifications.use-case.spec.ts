import { ListNotificationsUseCase } from './list-notifications.use-case';

describe('ListNotificationsUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const notifications = { list: jest.fn() };
    const useCase = new ListNotificationsUseCase(prisma, notifications as any);
    return { prisma, notifications, useCase };
  }

  it('passes unreadOnly/limit through and returns null nextCursor when fewer rows than the limit come back', async () => {
    const { prisma, notifications, useCase } = setup();
    notifications.list.mockResolvedValue([{ id: 'n1', created_at: new Date('2026-01-01T00:00:00Z') }]);

    const result = await useCase.execute({ userId: 'patient-1', unreadOnly: true, limit: 20 });

    expect(notifications.list).toHaveBeenCalledWith(prisma, { userId: 'patient-1', unreadOnly: true, cursor: undefined, limit: 20 });
    expect(result.nextCursor).toBeNull();
  });

  it('returns an encoded nextCursor when exactly `limit` rows come back', async () => {
    const { notifications, useCase } = setup();
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, created_at: new Date('2026-01-01T00:00:00Z') }));
    notifications.list.mockResolvedValue(rows);

    const result = await useCase.execute({ userId: 'patient-1', limit: 3 });

    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe('string');
  });
});
