import { NOTIFICATION_CONSTANTS } from '../../../shared/config/constants';
import { RetryFailedNotificationsUseCase } from './retry-failed-notifications.use-case';

describe('RetryFailedNotificationsUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const notifications = { findRetryable: jest.fn() };
    const deliver = { execute: jest.fn() };
    const policyConfig = { getValue: jest.fn().mockResolvedValue(null) };
    const useCase = new RetryFailedNotificationsUseCase(prisma, notifications as any, policyConfig as any, deliver as any);
    return { prisma, notifications, policyConfig, deliver, useCase };
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
it('leaves quiet-hours-respecting PENDING rows alone while the window is open', async () => {
    const { notifications, policyConfig, deliver, useCase } = setup();
    // Window covers every hour of the day, so the sweep is always inside it.
    policyConfig.getValue.mockResolvedValue({ startHour: 0, endHour: 24 });
    notifications.findRetryable.mockResolvedValue([
      { id: 'n1', user_id: 'u1', tier: 'TRANSACTIONAL', channel: 'PUSH', template_code: 'AppointmentConfirmed', title: 't', body: 'b', data: null },
    ]);

    const result = await useCase.execute();

    expect(deliver.execute).not.toHaveBeenCalled();
    expect(result.retried).toBe(0);
  });

  it('still delivers SAFETY_CRITICAL rows during quiet hours', async () => {
    const { notifications, policyConfig, deliver, useCase } = setup();
    policyConfig.getValue.mockResolvedValue({ startHour: 0, endHour: 24 });
    notifications.findRetryable.mockResolvedValue([
      { id: 'n1', user_id: 'u1', tier: 'SAFETY_CRITICAL', channel: 'PUSH', template_code: 'CriticalLabResult', title: 't', body: 'b', data: null },
    ]);

    const result = await useCase.execute();

    expect(deliver.execute).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(1);
  });
});
