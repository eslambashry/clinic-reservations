import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { MarkNotificationReadUseCase } from './mark-notification-read.use-case';

describe('MarkNotificationReadUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const notifications = { findById: jest.fn(), markRead: jest.fn() };
    const useCase = new MarkNotificationReadUseCase(prisma, notifications as any);
    return { prisma, notifications, useCase };
  }

  it('404s when the notification does not exist or belongs to a different user', async () => {
    const { notifications, useCase } = setup();
    notifications.findById.mockResolvedValue({ id: 'n1', user_id: 'someone-else' });

    await expect(useCase.execute('n1', 'patient-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks it read and returns READ status', async () => {
    const { notifications, useCase } = setup();
    notifications.findById.mockResolvedValue({ id: 'n1', user_id: 'patient-1' });
    notifications.markRead.mockResolvedValue(true);

    const result = await useCase.execute('n1', 'patient-1');

    expect(result).toEqual({ id: 'n1', status: 'READ' });
  });

  it('is a safe no-op when the notification was already read (repeat click)', async () => {
    const { notifications, useCase } = setup();
    notifications.findById.mockResolvedValue({ id: 'n1', user_id: 'patient-1' });
    notifications.markRead.mockResolvedValue(false); // already read_at IS NOT NULL

    await expect(useCase.execute('n1', 'patient-1')).resolves.toEqual({ id: 'n1', status: 'READ' });
  });
});
