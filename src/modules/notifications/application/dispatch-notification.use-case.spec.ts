import { Settings } from 'luxon';
import { DispatchNotificationUseCase } from './dispatch-notification.use-case';
import { NOTIFICATION_TEMPLATES } from '../domain/notification-templates';

// Every production template is PUSH-only today (SMS has no provider, File 10
// Part 4). The dispatcher still loops per channel, so its per-channel rules
// (opt-out, inbox-row choice, replay) are exercised against two fixture
// templates rather than by pretending a real template has an SMS channel.
jest.mock('../domain/notification-templates', () => {
  const actual = jest.requireActual('../domain/notification-templates');
  const render = (p: Record<string, unknown>) => ({ title: 't', body: 'b', data: { id: p.id } });
  return {
    ...actual,
    NOTIFICATION_TEMPLATES: {
      ...actual.NOTIFICATION_TEMPLATES,
      TestTwoChannelTransactional: { tier: 'TRANSACTIONAL', channels: ['PUSH', 'SMS'], extractUserId: (p: any) => p.patientId, render },
      TestTwoChannelSafetyCritical: { tier: 'SAFETY_CRITICAL', channels: ['PUSH', 'SMS'], extractUserId: (p: any) => p.patientId, render },
    },
  };
});

function buildTx() {
  return {} as any;
}

describe('DispatchNotificationUseCase', () => {
  const realNow = Settings.now;

  afterEach(() => {
    Settings.now = realNow;
  });

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const notifications = { createOnce: jest.fn() };
    const preferences = { listForUser: jest.fn().mockResolvedValue([]) };
    const policyConfig = { getValue: jest.fn().mockResolvedValue(null) };
    const deliver = { execute: jest.fn() };
    const useCase = new DispatchNotificationUseCase(prisma as any, notifications as any, preferences as any, policyConfig as any, deliver as any);
    return { tx, prisma, notifications, preferences, policyConfig, deliver, useCase };
  }

  it('no-ops for an event with no registered template', async () => {
    const { prisma, useCase } = setup();

    await useCase.executeFromEvent('SomeUnrelatedEvent', { foo: 'bar' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no-ops when the payload has no recipient field the template recognizes', async () => {
    const { prisma, useCase } = setup();

    await useCase.executeFromEvent('AppointmentConfirmed', { appointmentId: 'appt-1' }); // no patientId

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('every production template is PUSH-only (no SMS provider is wired)', () => {
    for (const [name, template] of Object.entries(NOTIFICATION_TEMPLATES)) {
      if (name.startsWith('Test')) continue;
      expect({ name, channels: template.channels }).toEqual({ name, channels: ['PUSH'] });
    }
  });

  it('creates one Notification row for a real PUSH-only template and delivers it', async () => {
    const { tx, notifications, deliver, useCase } = setup();
    notifications.createOnce.mockResolvedValue({ id: 'notif-push', status: 'PENDING' });

    await useCase.executeFromEvent('AppointmentConfirmed', { appointmentId: 'appt-1', patientId: 'patient-1' }, 'event-1');

    expect(notifications.createOnce).toHaveBeenCalledTimes(1);
    expect(notifications.createOnce).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'patient-1', tier: 'TRANSACTIONAL', channel: 'PUSH', sourceEventId: 'event-1', visibleInInbox: true }));
    expect(deliver.execute).toHaveBeenCalledWith(expect.objectContaining({ id: 'notif-push', channel: 'PUSH', userId: 'patient-1', templateCode: 'AppointmentConfirmed' }));
  });

  it('creates one Notification row per channel and delivers each when nothing suppresses it', async () => {
    const { tx, notifications, deliver, useCase } = setup();
    notifications.createOnce.mockResolvedValueOnce({ id: 'notif-push' }).mockResolvedValueOnce({ id: 'notif-sms' });

    await useCase.executeFromEvent('TestTwoChannelTransactional', { appointmentId: 'appt-1', patientId: 'patient-1' });

    expect(notifications.createOnce).toHaveBeenCalledTimes(2);
    expect(notifications.createOnce).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'patient-1', tier: 'TRANSACTIONAL', channel: 'PUSH' }));
    expect(notifications.createOnce).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'patient-1', tier: 'TRANSACTIONAL', channel: 'SMS' }));
    expect(deliver.execute).toHaveBeenCalledTimes(2);
    expect(deliver.execute).toHaveBeenCalledWith(expect.objectContaining({ id: 'notif-push', channel: 'PUSH', userId: 'patient-1' }));
  });

  it('skips a channel the user explicitly disabled — no row created, nothing delivered', async () => {
    const { notifications, preferences, deliver, useCase } = setup();
    preferences.listForUser.mockResolvedValue([{ tier: 'TRANSACTIONAL', channel: 'SMS', enabled: false }]);
    notifications.createOnce.mockResolvedValue({ id: 'notif-push' });

    await useCase.executeFromEvent('TestTwoChannelTransactional', { appointmentId: 'appt-1', patientId: 'patient-1' });

    expect(notifications.createOnce).toHaveBeenCalledTimes(1);
    expect(notifications.createOnce).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channel: 'PUSH' }));
    expect(deliver.execute).toHaveBeenCalledTimes(1);
  });

  it('SAFETY_CRITICAL is delivered even when a preference row says disabled (File 10 §11)', async () => {
    const { notifications, preferences, deliver, useCase } = setup();
    preferences.listForUser.mockResolvedValue([{ tier: 'SAFETY_CRITICAL', channel: 'PUSH', enabled: false }, { tier: 'SAFETY_CRITICAL', channel: 'SMS', enabled: false }]);
    notifications.createOnce.mockResolvedValue({ id: 'notif-1' });

    await useCase.executeFromEvent('TestTwoChannelSafetyCritical', { id: 'x', patientId: 'patient-1' });

    expect(notifications.createOnce).toHaveBeenCalledTimes(2);
    expect(deliver.execute).toHaveBeenCalledTimes(2);
  });

  it('the real CriticalLabResult template ignores a disabled PUSH preference', async () => {
    const { notifications, preferences, deliver, useCase } = setup();
    preferences.listForUser.mockResolvedValue([{ tier: 'SAFETY_CRITICAL', channel: 'PUSH', enabled: false }]);
    notifications.createOnce.mockResolvedValue({ id: 'notif-1', status: 'PENDING' });

    await useCase.executeFromEvent('CriticalLabResult', { labOrderId: 'order-1', patientId: 'patient-1', resultId: 'res-1' });

    expect(notifications.createOnce).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tier: 'SAFETY_CRITICAL', channel: 'PUSH' }));
    expect(deliver.execute).toHaveBeenCalledTimes(1);
  });

  it('a TRANSACTIONAL PUSH the user disabled produces no row and no delivery', async () => {
    const { notifications, preferences, deliver, useCase } = setup();
    preferences.listForUser.mockResolvedValue([{ tier: 'TRANSACTIONAL', channel: 'PUSH', enabled: false }]);

    await useCase.executeFromEvent('AppointmentConfirmed', { appointmentId: 'appt-1', patientId: 'patient-1' });

    expect(notifications.createOnce).not.toHaveBeenCalled();
    expect(deliver.execute).not.toHaveBeenCalled();
  });

  it('creates the row but skips delivery when quiet hours suppress a TRANSACTIONAL notification', async () => {
    const { notifications, policyConfig, deliver, useCase } = setup();
    // 2026-01-01T12:00:00Z is 14:00 in Africa/Cairo (UTC+2, no DST) — a fixed, deterministic local hour, not the real system clock.
    Settings.now = () => Date.parse('2026-01-01T12:00:00Z');
    policyConfig.getValue.mockResolvedValue({ startHour: 10, endHour: 18 });
    notifications.createOnce.mockResolvedValue({ id: 'notif-1' });

    await useCase.executeFromEvent('AppointmentConfirmed', { appointmentId: 'appt-1', patientId: 'patient-1' });

    expect(notifications.createOnce).toHaveBeenCalledTimes(1);
    expect(deliver.execute).not.toHaveBeenCalled();
  });

  it('SAFETY_CRITICAL bypasses quiet hours entirely', async () => {
    const { notifications, policyConfig, deliver, useCase } = setup();
    Settings.now = () => Date.parse('2026-01-01T12:00:00Z'); // same fixed 14:00 Cairo time as above, still inside the quiet window
    policyConfig.getValue.mockResolvedValue({ startHour: 10, endHour: 18 });
    notifications.createOnce.mockResolvedValue({ id: 'notif-1' });

    await useCase.executeFromEvent('CriticalLabResult', { labOrderId: 'order-1', patientId: 'patient-1', resultId: 'res-1' });

    expect(deliver.execute).toHaveBeenCalledTimes(1);
  });

  it('keys every row on the source outbox event and shows exactly one of them in the inbox', async () => {
    const { tx, notifications, useCase } = setup();
    notifications.createOnce.mockResolvedValueOnce({ id: 'notif-push', status: 'PENDING' }).mockResolvedValueOnce({ id: 'notif-sms', status: 'PENDING' });

    await useCase.executeFromEvent('TestTwoChannelTransactional', { id: 'x', patientId: 'patient-1' }, 'event-1');

    expect(notifications.createOnce).toHaveBeenNthCalledWith(1, tx, expect.objectContaining({ channel: 'PUSH', sourceEventId: 'event-1', visibleInInbox: true }));
    expect(notifications.createOnce).toHaveBeenNthCalledWith(2, tx, expect.objectContaining({ channel: 'SMS', sourceEventId: 'event-1', visibleInInbox: false }));
  });

  it('a re-processed event does not re-deliver a row that was already SENT', async () => {
    const { notifications, deliver, useCase } = setup();
    notifications.createOnce.mockResolvedValueOnce({ id: 'notif-push', status: 'SENT' }).mockResolvedValueOnce({ id: 'notif-sms', status: 'FAILED' });

    await useCase.executeFromEvent('TestTwoChannelTransactional', { id: 'x', patientId: 'patient-1' }, 'event-1');

    expect(deliver.execute).toHaveBeenCalledTimes(1);
    expect(deliver.execute).toHaveBeenCalledWith(expect.objectContaining({ id: 'notif-sms', channel: 'SMS' }));
  });
});
