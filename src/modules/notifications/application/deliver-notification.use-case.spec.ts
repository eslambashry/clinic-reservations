import { DeliverNotificationUseCase } from './deliver-notification.use-case';
import { SmsChannelUnavailableError } from './ports/sms-sender.port';

describe('DeliverNotificationUseCase', () => {
  const lease = new Date('2026-09-26T12:10:00.000Z');
  const base = {
    id: 'notif-1',
    userId: 'patient-1',
    templateCode: 'AppointmentConfirmed',
    title: 'title',
    body: 'body',
    data: { appointmentId: 'appt-1', patientPhone: '+201000000001', note: 'free text', status: 'CONFIRMED', fulfillmentType: 'CLINIC_HANDOVER' },
  };
  const claimedRow = (overrides: Record<string, unknown> = {}) => ({ id: 'notif-1', lease_until: lease, retry_tokens: [], accepted_device_count: 0, ...overrides });
  const registrations = (...tokens: string[]) => tokens.map((fcmToken) => ({ id: `device-${fcmToken}`, fcmToken, sessionId: 'session-1', version: 1 }));

  function setup() {
    const prisma = {} as any;
    const notifications = {
      claimForDelivery: jest.fn().mockResolvedValue(claimedRow()),
      markSent: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn().mockResolvedValue(true),
      markUndeliverable: jest.fn().mockResolvedValue(true),
    };
    const push = { send: jest.fn() };
    const sms = { send: jest.fn() };
    const listUserDeviceTokens = { execute: jest.fn() };
    const pruneDeviceTokens = { execute: jest.fn().mockResolvedValue(0) };
    const getUserContactInfo = { execute: jest.fn() };
    const useCase = new DeliverNotificationUseCase(
      prisma,
      notifications as any,
      push as any,
      sms as any,
      listUserDeviceTokens as any,
      pruneDeviceTokens as any,
      getUserContactInfo as any,
    );
    return { prisma, notifications, push, sms, listUserDeviceTokens, pruneDeviceTokens, getUserContactInfo, useCase };
  }

  const pushResult = (accepted: string[], retryable: string[] = [], invalid: string[] = []) => ({ acceptedTokens: accepted, retryableTokens: retryable, invalidTokens: invalid });

  it('does nothing when the row cannot be claimed (already sent, out of attempts, or leased by another worker)', async () => {
    const { notifications, push, sms, useCase } = setup();
    notifications.claimForDelivery.mockResolvedValue(null);

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(push.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
    expect(notifications.markSent).not.toHaveBeenCalled();
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('sends only allowlisted identifiers in the push data, then marks SENT with the accepted device count under its lease', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(registrations('token-1', 'token-2'));
    push.send.mockResolvedValue(pushResult(['token-1', 'token-2']));

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(notifications.claimForDelivery).toHaveBeenCalledWith(prisma, 'notif-1', 5);
    expect(push.send).toHaveBeenCalledWith(['token-1', 'token-2'], {
      title: 'لديك إشعار جديد',
      body: 'افتح التطبيق للاطلاع على التحديث.',
      data: { appointmentId: 'appt-1', notificationId: 'notif-1', templateCode: 'AppointmentConfirmed', tier: 'TRANSACTIONAL' },
    });
    expect(notifications.markSent).toHaveBeenCalledWith(prisma, 'notif-1', lease, 2);
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('keeps sensitive admin details out of lock-screen copy', async () => {
    const { push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(registrations('token-1'));
    push.send.mockResolvedValue(pushResult(['token-1']));

    await useCase.execute({ ...base, templateCode: 'NewProviderRegistrationForAdmin', title: 'طلب توثيق طبيب جديد', body: 'تقدّم د. فلان بطلب انضمام', channel: 'PUSH' });

    expect(push.send).toHaveBeenCalledWith(['token-1'], expect.objectContaining({ title: 'لديك إشعار جديد', body: 'افتح التطبيق للاطلاع على التحديث.' }));
  });

  it.each(['PharmacyOrderQuoted', 'CriticalLabResult', 'PaymentCaptured', 'PharmacyOrderOnWayToClinicForStaff'])(
    'keeps %s clinical/financial/staff text in the authenticated inbox only', async (templateCode) => {
      const { push, listUserDeviceTokens, useCase } = setup();
      listUserDeviceTokens.execute.mockResolvedValue(registrations('token-1'));
      push.send.mockResolvedValue(pushResult(['token-1']));

      await useCase.execute({ ...base, templateCode, title: 'Sensitive title', body: 'Sensitive patient, clinic, price or result details', channel: 'PUSH' });

      expect(push.send).toHaveBeenCalledWith(['token-1'], expect.objectContaining({
        title: 'لديك إشعار جديد', body: 'افتح التطبيق للاطلاع على التحديث.',
      }));
      const sentMessage = push.send.mock.calls[0][1];
      expect(JSON.stringify(sentMessage)).not.toContain('Sensitive');
    },
  );

  it('keeps only transiently failed targets for retry and counts the accepted ones', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(registrations('phone', 'browser'));
    push.send.mockResolvedValue(pushResult(['phone'], ['browser']));

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(notifications.markFailed).toHaveBeenCalledWith(prisma, 'notif-1', lease, ['browser'], 1);
    expect(notifications.markSent).not.toHaveBeenCalled();
  });

  it('retries only the recorded retry targets that still belong to this user', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    notifications.claimForDelivery.mockResolvedValue(claimedRow({ retry_tokens: ['browser', 'moved-to-other-account'], accepted_device_count: 1 }));
    listUserDeviceTokens.execute.mockResolvedValue(registrations('phone', 'browser'));
    push.send.mockResolvedValue(pushResult(['browser']));

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(push.send).toHaveBeenCalledWith(['browser'], expect.anything());
    expect(notifications.markSent).toHaveBeenCalledWith(prisma, 'notif-1', lease, 1);
  });

  it('marks SENT without re-sending when earlier attempts reached a device and every retry target is gone', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    notifications.claimForDelivery.mockResolvedValue(claimedRow({ retry_tokens: ['logged-out-browser'], accepted_device_count: 1 }));
    listUserDeviceTokens.execute.mockResolvedValue(registrations('phone'));

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(push.send).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalledWith(prisma, 'notif-1', lease);
  });

  it('marks FAILED (not sent) when the user has zero registered device tokens', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue([]);

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(push.send).not.toHaveBeenCalled();
    expect(notifications.markFailed).toHaveBeenCalledWith(prisma, 'notif-1', lease, []);
  });

  it('prunes tokens FCM rejected as dead while still marking the send successful', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, pruneDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(registrations('live', 'dead'));
    push.send.mockResolvedValue(pushResult(['live'], [], ['dead']));

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(pruneDeviceTokens.execute).toHaveBeenCalledWith('patient-1', registrations('dead'));
    expect(notifications.markSent).toHaveBeenCalledWith(prisma, 'notif-1', lease, 1);
  });

  it('closes the failed row when every token was rejected as dead', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(registrations('dead-1', 'dead-2'));
    push.send.mockResolvedValue(pushResult([], [], ['dead-1', 'dead-2']));

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(notifications.markSent).not.toHaveBeenCalled();
    expect(notifications.markUndeliverable).toHaveBeenCalledWith(prisma, 'notif-1', lease, 5);
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('still marks sent when pruning itself fails', async () => {
    const { notifications, push, listUserDeviceTokens, pruneDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(registrations('live', 'dead'));
    push.send.mockResolvedValue(pushResult(['live'], [], ['dead']));
    pruneDeviceTokens.execute.mockRejectedValue(new Error('db down'));

    await useCase.execute({ ...base, channel: 'PUSH' });

    expect(notifications.markSent).toHaveBeenCalled();
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('never throws — a push-provider outage is recorded against the attempted targets', async () => {
    const { prisma, notifications, push, listUserDeviceTokens, useCase } = setup();
    listUserDeviceTokens.execute.mockResolvedValue(registrations('token-1'));
    push.send.mockRejectedValue(new Error('FCM down'));

    await expect(useCase.execute({ ...base, channel: 'PUSH' })).resolves.toBeUndefined();
    expect(notifications.markFailed).toHaveBeenCalledWith(prisma, 'notif-1', lease, ['token-1']);
  });

  it('sends via SMS when a provider accepts it, then marks sent', async () => {
    const { prisma, notifications, sms, getUserContactInfo, useCase } = setup();
    getUserContactInfo.execute.mockResolvedValue({ phone: '+201000000001' });

    await useCase.execute({ ...base, channel: 'SMS' });

    expect(sms.send).toHaveBeenCalledWith('+201000000001', 'title - body');
    expect(notifications.markSent).toHaveBeenCalledWith(prisma, 'notif-1', lease);
  });

  it('closes an SMS row as FAILED with no retries left when no SMS provider is configured — never SENT', async () => {
    const { prisma, notifications, sms, getUserContactInfo, useCase } = setup();
    getUserContactInfo.execute.mockResolvedValue({ phone: '+201000000001' });
    sms.send.mockRejectedValue(new SmsChannelUnavailableError());

    await useCase.execute({ ...base, channel: 'SMS' });

    expect(notifications.markUndeliverable).toHaveBeenCalledWith(prisma, 'notif-1', lease, 5);
    expect(notifications.markSent).not.toHaveBeenCalled();
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('treats any other SMS error as a retryable failure', async () => {
    const { prisma, notifications, sms, getUserContactInfo, useCase } = setup();
    getUserContactInfo.execute.mockResolvedValue({ phone: '+201000000001' });
    sms.send.mockRejectedValue(new Error('gateway timeout'));

    await useCase.execute({ ...base, channel: 'SMS' });

    expect(notifications.markFailed).toHaveBeenCalledWith(prisma, 'notif-1', lease, []);
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

    await useCase.execute({ ...base, channel: 'EMAIL' });

    expect(notifications.markFailed).toHaveBeenCalled();
  });
});
