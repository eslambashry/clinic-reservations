import { NOTIFICATION_TEMPLATES } from '../domain/notification-templates';
import { NotificationOutboxRegistrar } from './notification-outbox.registrar';

describe('NotificationOutboxRegistrar', () => {
  it('does nothing in the API process, where OutboxWorker is absent (undefined via @Optional)', () => {
    const dispatch = { executeFromEvent: jest.fn() };
    const registrar = new NotificationOutboxRegistrar(undefined, dispatch as any);

    expect(() => registrar.onModuleInit()).not.toThrow();
  });

  it('registers a handler for every event in NOTIFICATION_TEMPLATES when OutboxWorker is present (worker process)', () => {
    const outboxWorker = { registerHandler: jest.fn() };
    const dispatch = { executeFromEvent: jest.fn() };
    const registrar = new NotificationOutboxRegistrar(outboxWorker as any, dispatch as any);

    registrar.onModuleInit();

    const expectedEventNames = Object.keys(NOTIFICATION_TEMPLATES);
    expect(outboxWorker.registerHandler).toHaveBeenCalledTimes(expectedEventNames.length);
    for (const eventName of expectedEventNames) {
      expect(outboxWorker.registerHandler).toHaveBeenCalledWith({ eventName, handle: expect.any(Function) });
    }
  });

  it('the registered handler delegates to DispatchNotificationUseCase.executeFromEvent with the same event name', async () => {
    const outboxWorker = { registerHandler: jest.fn() };
    const dispatch = { executeFromEvent: jest.fn() };
    const registrar = new NotificationOutboxRegistrar(outboxWorker as any, dispatch as any);

    registrar.onModuleInit();

    const call = outboxWorker.registerHandler.mock.calls.find((c: any[]) => c[0].eventName === 'AppointmentConfirmed');
    await call[0].handle({ patientId: 'p1' });

    expect(dispatch.executeFromEvent).toHaveBeenCalledWith('AppointmentConfirmed', { patientId: 'p1' });
  });
});
