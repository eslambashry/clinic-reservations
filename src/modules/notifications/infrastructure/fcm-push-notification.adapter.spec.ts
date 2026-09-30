import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { FcmPushNotificationAdapter } from './fcm-push-notification.adapter';

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(() => ({ type: 'application-default' })),
  cert: jest.fn((credentials) => ({ type: 'service-account', ...credentials })),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'medsuper-test' })),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({
    sendEachForMulticast: jest.fn().mockResolvedValue({ responses: [{ success: true }] }),
  })),
}));

describe('FcmPushNotificationAdapter credentials', () => {
  beforeEach(() => jest.clearAllMocks());

  function createAdapter(firebase: Record<string, string | null>) {
    return new FcmPushNotificationAdapter({
      get: jest.fn().mockReturnValue(firebase),
    } as any);
  }

  it('uses Cloud Run application default credentials when no key is configured', async () => {
    const adapter = createAdapter({ projectId: 'clinic-dd7cc', clientEmail: null, privateKey: null });

    await adapter.send(['device-token'], { title: 'title', body: 'body' });

    expect(applicationDefault).toHaveBeenCalledTimes(1);
    expect(cert).not.toHaveBeenCalled();
    expect(initializeApp).toHaveBeenCalledWith({
      projectId: 'clinic-dd7cc',
      credential: { type: 'application-default' },
    });
    expect(getApps).toHaveBeenCalledTimes(1);
    expect(getMessaging).toHaveBeenCalledTimes(1);
  });

  it('keeps service-account credentials available for non-Google hosts', async () => {
    const adapter = createAdapter({
      projectId: 'clinic-dd7cc',
      clientEmail: 'firebase-admin@example.test',
      privateKey: 'test-private-key',
    });

    await adapter.send(['device-token'], { title: 'title', body: 'body' });

    expect(applicationDefault).not.toHaveBeenCalled();
    expect(cert).toHaveBeenCalledWith({
      projectId: 'clinic-dd7cc',
      clientEmail: 'firebase-admin@example.test',
      privateKey: 'test-private-key',
    });
  });

  it('rejects a partial service-account configuration before attempting delivery', async () => {
    const adapter = createAdapter({ projectId: 'clinic-dd7cc', clientEmail: 'firebase-admin@example.test', privateKey: null });

    await expect(adapter.send(['device-token'], { title: 'title', body: 'body' })).rejects.toMatchObject({
      code: 'PUSH_PROVIDER_NOT_CONFIGURED',
      details: { missingEnvVars: ['FIREBASE_PRIVATE_KEY'] },
    });
    expect(applicationDefault).not.toHaveBeenCalled();
    expect(getMessaging).not.toHaveBeenCalled();
  });
});
