import { PaymobPaymentGatewayAdapter } from './paymob-payment-gateway.adapter';

const CONFIG = {
  apiKey: 'test-api-key',
  integrationIdCard: 'card-int-1',
  integrationIdFawry: 'fawry-int-1',
  integrationIdWallet: 'wallet-int-1',
  iframeId: 'iframe-1',
  hmacSecret: 'test-hmac-secret',
};

function buildAdapter() {
  const configService = { get: jest.fn().mockReturnValue(CONFIG) };
  return new PaymobPaymentGatewayAdapter(configService as any);
}

function mockFetchSequence(bodies: unknown[]) {
  const calls: { url: string; body: any }[] = [];
  let i = 0;
  (global as any).fetch = jest.fn((url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const body = bodies[i++];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
  return calls;
}

const customer = { firstName: 'Sara Ahmed', lastName: '', email: 'sara@example.com', phone: '+201000000000' };

describe('PaymobPaymentGatewayAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the caller-computed expiresAt (as remaining seconds) on the payment_keys request for Fawry — never a fixed constant (File 12 Part 51)', async () => {
    const adapter = buildAdapter();
    const expiresAt = new Date(Date.now() + 15 * 60_000); // Fawry's 15-minute window
    const calls = mockFetchSequence([
      { token: 'auth-token' }, // /api/auth/tokens
      { id: 555 }, // /api/ecommerce/orders
      { token: 'payment-key' }, // /api/acceptance/payment_keys
      { data: { bill_reference: '999888777' } }, // /api/acceptance/payments/pay
    ]);

    await adapter.initiateFawryPayment({ merchantReference: 'attempt-1', amount: '200.00', currency: 'EGP', customer, expiresAt });

    const paymentKeysCall = calls.find((c) => c.url.includes('/api/acceptance/payment_keys'));
    expect(paymentKeysCall).toBeDefined();
    const sentExpiration = paymentKeysCall!.body.expiration as number;
    // Allow a small tolerance for time elapsed between computing `expiresAt` in the test and the assertion.
    expect(sentExpiration).toBeGreaterThan(895);
    expect(sentExpiration).toBeLessThanOrEqual(900);
  });

  it('clamps to a 60-second floor when expiresAt is already in the past, instead of sending a zero/negative expiration Paymob would reject', async () => {
    const adapter = buildAdapter();
    const expiresAt = new Date(Date.now() - 60_000);
    const calls = mockFetchSequence([
      { token: 'auth-token' },
      { id: 555 },
      { token: 'payment-key' },
    ]);

    await adapter.initiateCardPayment({ merchantReference: 'attempt-1', amount: '200.00', currency: 'EGP', customer, expiresAt });

    const paymentKeysCall = calls.find((c) => c.url.includes('/api/acceptance/payment_keys'));
    expect(paymentKeysCall!.body.expiration).toBe(60);
  });

  it('uses the Fawry integration id (not card/wallet) when requesting the payment key for a Fawry payment', async () => {
    const adapter = buildAdapter();
    const calls = mockFetchSequence([
      { token: 'auth-token' },
      { id: 555 },
      { token: 'payment-key' },
      { data: { bill_reference: '999888777' } },
    ]);

    await adapter.initiateFawryPayment({
      merchantReference: 'attempt-1',
      amount: '200.00',
      currency: 'EGP',
      customer,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });

    const paymentKeysCall = calls.find((c) => c.url.includes('/api/acceptance/payment_keys'));
    expect(paymentKeysCall!.body.integration_id).toBe('fawry-int-1');
  });
});
