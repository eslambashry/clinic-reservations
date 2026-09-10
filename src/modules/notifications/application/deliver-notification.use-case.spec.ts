import { DeliverNotificationUseCase } from './deliver-notification.use-case';

function buildTx() {
  return {} as any;
}

describe('DeliverNotificationUseCase', () => {
  const base = {
    id: 'notif-1',
    userId: 'patient-1',
    templateCode: 'AppointmentConfirmed',
    title: 'title',
    body: 'body',
    data: { x: 1 },
  };

  function setup() {
    const prisma = buildTx();
    const notifications = { markSent: jest.fn(), markFailed: jest.fn() };
    const push = { send: jest.fn() };
    const sms = { send: jest.fn() };
    const listUserDeviceTokens = { execute: jest.fn() };
    const getUserContactInfo = { execute: jest.fn() };
    const useCase = new DeliverNotificationUseCase(
      prisma as any,
      notifications as any,
      push as any,
      sms as any,
      listUserDeviceTokens as any,
      getUserContactInfo as any,
    );
    return { prisma, notifications, push, sms, listUserDeviceTokens, getUserContactInfo, useCase };
  }

  it('sends via PUSH when the user has registered device tokens, then marks sent', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(['token-1', 'token-2']);
    push.send.mockResolvedValue({ invalidTokens: [] });

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(push.send).toHaveBeenCalledWith(['token-1', 'token-2'], {
      title: 'title',
      body: 'body',
      data: { x: 1, templateCode: 'AppointmentConfirmed' },
    });
    expect(notifications.markSent).toHaveBeenCalledWith(prisma, 'notif-1');
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('marks FAILED (not sent) when the user has zero registered device tokens', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue([]);

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(push.send).not.toHaveBeenCalled();
    expect(notifications.markFailed).toHaveBeenCalledWith(prisma, 'notif-1');
  });

  it('sends via SMS when the user has a phone on file, then marks sent', async () => {
    const { prisma, notifications, sms, getUserContactInfo, useCase } = setup();
    getUserContactInfo.execute.mockResolvedValue({ phone: '+201000000001' });

    await useCase.execute({ ...base, channel: 'SMS' });

    expect(sms.send).toHaveBeenCalledWith('+201000000001', 'title - body');
    expect(notifications.markSent).toHaveBeenCalledWith(prisma, 'notif-1');
  });

  it('marks FAILED when the user has no phone on file', async () => {
    const { notifications, sms, getUserContactInfo, useCase } = setup();
    getUserContactInfo.execute.mockResolvedValue(null);

    await useCase.execute({ ...base, channel: 'SMS' });

    expect(sms.send).not.toHaveBeenCalled();
    expect(notifications.markFailed).toHaveBeenCalled();
  });

  it('marks FAILED for an unsupported channel', async () => {
    const { notifications, useCase } = setup();

    await useCase.execute({ ...base, channel: 'CARRIER_PIGEON' });

    expect(notifications.markFailed).toHaveBeenCalled();
  });

  it('never throws — a push-provider failure is caught and recorded, not propagated', async () => {
    const { notifications, push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(['token-1']);
    push.send.mockRejectedValue(new Error('FCM outage'));

    await expect(useCase.execute({ ...base, channel: 'PUSH' })).resolves.toBeUndefined();
    expect(notifications.markFailed).toHaveBeenCalled();
  });
});
