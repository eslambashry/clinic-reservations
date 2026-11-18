import { DomainError, ExternalProviderError } from '../../../shared/core/errors/domain-errors';
import { FcmPushNotificationAdapter } from './fcm-push-notification.adapter';

const mockSend = jest.fn();

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(() => ({})),
  cert: jest.fn(() => ({})),
  getApps: jest.fn(() => [{ name: 'existing' }]),
  initializeApp: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: jest.fn(() => ({ sendEachForMulticast: mockSend })) }));

const adapterWith = (firebase: any) => new FcmPushNotificationAdapter({ get: () => firebase } as any);
const good = { projectId: 'p', clientEmail: null, privateKey: null };

describe('FcmPushNotificationAdapter.send', () => {
  beforeEach(() => mockSend.mockReset());

  it('returns empty result for no tokens without touching FCM', async () => {
    expect(await adapterWith(good).send([], { title: 't', body: 'b' })).toEqual({ acceptedTokens: [], retryableTokens: [], invalidTokens: [] });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('classifies accepted, invalid and retryable tokens', async () => {
    mockSend.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/invalid-registration-token' } },
        { success: false, error: { code: 'messaging/internal-error' } },
        { success: false },
      ],
    });
    const result = await adapterWith(good).send(['a', 'b', 'c', 'd', 'e'], { title: 't', body: 'b' });
    expect(result).toEqual({ acceptedTokens: ['a'], invalidTokens: ['b', 'c'], retryableTokens: ['d', 'e'] });
  });

  it('stringifies data and tags android notification when notificationId is a string', async () => {
    mockSend.mockResolvedValue({ responses: [{ success: true }] });
    await adapterWith(good).send(['a'], { title: 't', body: 'b', data: { notificationId: 'n1', count: 3 } });
    const arg = mockSend.mock.calls[0][0];
    expect(arg.data).toEqual({ notificationId: 'n1', count: '3' });
    expect(arg.android).toEqual({ notification: { tag: 'n1' } });
  });

  it('omits android tag when notificationId is not a string', async () => {
    mockSend.mockResolvedValue({ responses: [{ success: true }] });
    await adapterWith(good).send(['a'], { title: 't', body: 'b', data: { notificationId: 5 } });
    expect(mockSend.mock.calls[0][0].android).toBeUndefined();
  });

  it('wraps provider failures as ExternalProviderError', async () => {
    mockSend.mockRejectedValue(new Error('boom'));
    const adapter = adapterWith(good);
    jest.spyOn((adapter as any).logger, 'error').mockImplementation();
    await expect(adapter.send(['a'], { title: 't', body: 'b' })).rejects.toBeInstanceOf(ExternalProviderError);
  });

  it.each([
    [{ projectId: null, clientEmail: null, privateKey: null }, ['FIREBASE_PROJECT_ID']],
    [{ projectId: 'p', clientEmail: 'e', privateKey: null }, ['FIREBASE_PRIVATE_KEY']],
    [{ projectId: 'p', clientEmail: null, privateKey: 'k' }, ['FIREBASE_CLIENT_EMAIL']],
  ])('rethrows PUSH_PROVIDER_NOT_CONFIGURED for %j', async (cfg, missing) => {
    const err = await adapterWith(cfg).send(['a'], { title: 't', body: 'b' }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('PUSH_PROVIDER_NOT_CONFIGURED');
    expect(JSON.stringify(err.details ?? err)).toContain(missing[0]);
  });

  it('reuses an existing firebase app and cached messaging', async () => {
    mockSend.mockResolvedValue({ responses: [{ success: true }] });
    const adapter = adapterWith(good);
    await adapter.send(['a'], { title: 't', body: 'b' });
    await adapter.send(['a'], { title: 't', body: 'b' });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
