import { Settings } from 'luxon';
import { DispatchNotificationUseCase } from './dispatch-notification.use-case';

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
    const notifications = { create: jest.fn() };
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

  it('creates one Notification row per channel and delivers each when nothing suppresses it', async () => {
    const { tx, notifications, deliver, useCase } = setup();
    notifications.create.mockResolvedValueOnce({ id: 'notif-push' }).mockResolvedValueOnce({ id: 'notif-sms' });

    await useCase.executeFromEvent('AppointmentConfirmed', { appointmentId: 'appt-1', patientId: 'patient-1' });

    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'patient-1', tier: 'TRANSACTIONAL', channel: 'PUSH' }));
    expect(notifications.create).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'patient-1', tier: 'TRANSACTIONAL', channel: 'SMS' }));
    expect(deliver.execute).toHaveBeenCalledTimes(2);
    expect(deliver.execute).toHaveBeenCalledWith(expect.objectContaining({ id: 'notif-push', channel: 'PUSH', userId: 'patient-1' }));
  });

  it('skips a channel the user explicitly disabled — no row created, nothing delivered', async () => {
    const { notifications, preferences, deliver, useCase } = setup();
    preferences.listForUser.mockResolvedValue([{ tier: 'TRANSACTIONAL', channel: 'SMS', enabled: false }]);
    notifications.create.mockResolvedValue({ id: 'notif-push' });

    await useCase.executeFromEvent('AppointmentConfirmed', { appointmentId: 'appt-1', patientId: 'patient-1' });

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channel: 'PUSH' }));
    expect(deliver.execute).toHaveBeenCalledTimes(1);
  });

  it('SAFETY_CRITICAL is delivered even when a preference row says disabled (File 10 §11)', async () => {
    const { notifications, preferences, deliver, useCase } = setup();
    preferences.listForUser.mockResolvedValue([{ tier: 'SAFETY_CRITICAL', channel: 'PUSH', enabled: false }, { tier: 'SAFETY_CRITICAL', channel: 'SMS', enabled: false }]);
    notifications.create.mockResolvedValue({ id: 'notif-1' });

    await useCase.executeFromEvent('CriticalLabResult', { labOrderId: 'order-1', patientId: 'patient-1', resultId: 'res-1' });

    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(deliver.execute).toHaveBeenCalledTimes(2);
  });

  it('creates the row but skips delivery when quiet hours suppress a TRANSACTIONAL notification', async () => {
    const { notifications, policyConfig, deliver, useCase } = setup();
    // 2026-01-01T12:00:00Z is 14:00 in Africa/Cairo (UTC+2, no DST) — a fixed, deterministic local hour, not the real system clock.
    Settings.now = () => Date.parse('2026-01-01T12:00:00Z');
    policyConfig.getValue.mockResolvedValue({ startHour: 10, endHour: 18 });
    notifications.create.mockResolvedValue({ id: 'notif-1' });

    await useCase.executeFromEvent('AppointmentConfirmed', { appointmentId: 'appt-1', patientId: 'patient-1' });

    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(deliver.execute).not.toHaveBeenCalled();
  });

  it('SAFETY_CRITICAL bypasses quiet hours entirely', async () => {
    const { notifications, policyConfig, deliver, useCase } = setup();
    Settings.now = () => Date.parse('2026-01-01T12:00:00Z'); // same fixed 14:00 Cairo time as above, still inside the quiet window
    policyConfig.getValue.mockResolvedValue({ startHour: 10, endHour: 18 });
    notifications.create.mockResolvedValue({ id: 'notif-1' });

    await useCase.executeFromEvent('CriticalLabResult', { labOrderId: 'order-1', patientId: 'patient-1', resultId: 'res-1' });

    expect(deliver.execute).toHaveBeenCalledTimes(2);
  });
});
