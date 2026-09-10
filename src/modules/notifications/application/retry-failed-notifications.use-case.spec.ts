import { NOTIFICATION_CONSTANTS } from '../../../shared/config/constants';
import { RetryFailedNotificationsUseCase } from './retry-failed-notifications.use-case';

describe('RetryFailedNotificationsUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const notifications = { findRetryable: jest.fn() };
    const deliver = { execute: jest.fn() };
    const useCase = new RetryFailedNotificationsUseCase(prisma, notifications as any, deliver as any);
    return { prisma, notifications, deliver, useCase };
  }

  it('queries with the configured max attempts / batch size and re-delivers every candidate', async () => {
    const { prisma, notifications, deliver, useCase } = setup();
    notifications.findRetryable.mockResolvedValue([
      {
        id: 'n1',
        user_id: 'patient-1',
        channel: 'PUSH',
        template_code: 'AppointmentConfirmed',
        title: 't1',
        body: 'b1',
        data: null,
      },
      {
        id: 'n2',
        user_id: 'patient-2',
        channel: 'SMS',
        template_code: 'PrescriptionUploaded',
        title: 't2',
        body: 'b2',
        data: { a: 1 },
      },
    ]);

    const result = await useCase.execute();

    expect(notifications.findRetryable).toHaveBeenCalledWith(
      prisma,
      NOTIFICATION_CONSTANTS.MAX_SEND_ATTEMPTS,
      NOTIFICATION_CONSTANTS.RETRY_SWEEP_BATCH_SIZE,
    );
    expect(deliver.execute).toHaveBeenCalledTimes(2);
    expect(deliver.execute).toHaveBeenCalledWith({
      id: 'n1',
      userId: 'patient-1',
      channel: 'PUSH',
      templateCode: 'AppointmentConfirmed',
      title: 't1',
      body: 'b1',
      data: null,
    });
    expect(result).toEqual({ retried: 2 });
  });

  it('reports zero retried when there is nothing to retry', async () => {
    const { notifications, deliver, useCase } = setup();
    notifications.findRetryable.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(deliver.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ retried: 0 });
  });
});
