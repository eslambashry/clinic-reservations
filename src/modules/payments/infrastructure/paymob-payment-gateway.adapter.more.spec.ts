import { createHmac } from 'node:crypto';
import { PaymobPaymentGatewayAdapter } from './paymob-payment-gateway.adapter';

const CONFIG = { apiKey: 'k', integrationIdCard: 'int', iframeId: 'ifr', hmacSecret: 'secret' };

function build(config: Partial<typeof CONFIG> | null = {}) {
  const configService = { get: jest.fn().mockReturnValue(config === null ? {} : { ...CONFIG, ...config }) };
  return new PaymobPaymentGatewayAdapter(configService as any);
}

function mockFetch(...responses: Array<{ ok?: boolean; status?: number; body?: unknown; text?: string | Error }>) {
  const calls: Array<{ url: string; body: any }> = [];
  let i = 0;
  (global as any).fetch = jest.fn((url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const r = responses[i++];
    return Promise.resolve({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: () => Promise.resolve(r.body),
      text: () => (r.text instanceof Error ? Promise.reject(r.text) : Promise.resolve(r.text ?? '')),
    });
  });
  return calls;
}

const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id',
  'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id',
  'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
];

function sign(obj: any, secret = CONFIG.hmacSecret): string {
  const s = HMAC_FIELDS.map((p) => {
    const v = p.split('.').reduce((a: any, k) => a?.[k], obj);
    return v === undefined || v === null ? '' : String(v);
  }).join('');
  return createHmac('sha512', secret).update(s).digest('hex');
}

describe('PaymobPaymentGatewayAdapter (additional)', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('verifyWebhookSignature', () => {
    const obj = {
      amount_cents: 20000, created_at: '2026-01-01', currency: 'EGP', error_occured: false, has_parent_transaction: false,
      id: 77, integration_id: 1, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false,
      is_standalone_payment: true, is_voided: false, order: { id: 5 }, owner: 9, pending: false,
      source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success: true,
    };

    it('accepts a valid signature, with and without the obj wrapper', () => {
      const adapter = build();
      expect(adapter.verifyWebhookSignature({ obj }, sign(obj))).toBe(true);
      expect(adapter.verifyWebhookSignature(obj as any, sign(obj))).toBe(true);
    });

    it('treats missing nested fields as empty strings', () => {
      const sparse = { id: 1, success: true };
      expect(build().verifyWebhookSignature(sparse, sign(sparse))).toBe(true);
    });

    it('rejects missing hmac, wrong hmac and wrong length hmac', () => {
      const adapter = build();
      expect(adapter.verifyWebhookSignature({ obj }, undefined)).toBe(false);
      expect(adapter.verifyWebhookSignature({ obj }, sign(obj, 'other'))).toBe(false);
      expect(adapter.verifyWebhookSignature({ obj }, 'abcd')).toBe(false);
    });

    it('throws PAYMENT_GATEWAY_NOT_CONFIGURED without the secret', () => {
      expect(() => build({ hmacSecret: '' }).verifyWebhookSignature({ obj }, 'x')).toThrow(
        expect.objectContaining({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' }),
      );
    });
  });

  describe('parseWebhookEvent', () => {
    it('parses a successful event', () => {
      const ev = build().parseWebhookEvent({ obj: { id: 12, success: true, error_occured: false, order: { merchant_order_id: 'm1' } } });
      expect(ev).toEqual({ gatewayReference: 'm1', gatewayTransactionId: '12', success: true, failureCode: undefined });
    });

    it('marks success=false when error_occured is true even if success is true', () => {
      const ev = build().parseWebhookEvent({ id: 1, success: true, error_occured: true, order: { merchant_order_id: 'm' } });
      expect(ev.success).toBe(false);
      expect(ev.failureCode).toBeUndefined();
    });

    it('uses the txn_response_code on failure, else GATEWAY_DECLINED', () => {
      const adapter = build();
      expect(
        adapter.parseWebhookEvent({ obj: { id: 1, success: false, data: { txn_response_code: 'DECLINED_05' }, order: { merchant_order_id: 'm' } } })
          .failureCode,
      ).toBe('DECLINED_05');
      expect(adapter.parseWebhookEvent({ obj: { id: 1, success: false, order: { merchant_order_id: 'm' } } }).failureCode).toBe('GATEWAY_DECLINED');
    });

    it('throws WEBHOOK_PAYLOAD_INVALID without a merchant_order_id', () => {
      expect(() => build().parseWebhookEvent({ obj: { id: 1 } })).toThrow(expect.objectContaining({ code: 'WEBHOOK_PAYLOAD_INVALID', httpStatus: 400 }));
    });
  });

  describe('refund', () => {
    it('authenticates then posts the refund in cents and returns the refund id', async () => {
      const calls = mockFetch({ body: { token: 'tok' } }, { body: { id: 321 } });
      await expect(build().refund('txn-1', '12.34')).resolves.toEqual({ gatewayRefundReference: '321' });
      expect(calls[0].url).toContain('/api/auth/tokens');
      expect(calls[0].body).toEqual({ api_key: 'k' });
      expect(calls[1].url).toContain('/api/acceptance/void_refund/refund');
      expect(calls[1].body).toEqual({ transaction_id: 'txn-1', amount_cents: 1234, auth_token: 'tok' });
    });

    it('returns an undefined reference when Paymob returns no id', async () => {
      mockFetch({ body: { token: 'tok' } }, { body: {} });
      await expect(build().refund('t', '1')).resolves.toEqual({ gatewayRefundReference: undefined });
    });
  });

  describe('request failures and config', () => {
    it('wraps a non-ok response (with body text) as a 502 ExternalProviderError', async () => {
      mockFetch({ ok: false, status: 500, text: 'bad' });
      await expect(build().refund('t', '1')).rejects.toMatchObject({ httpStatus: 502 });
    });

    it('still wraps a non-ok response when reading the body fails', async () => {
      mockFetch({ ok: false, status: 500, text: new Error('read fail') });
      await expect(build().refund('t', '1')).rejects.toMatchObject({ httpStatus: 502 });
    });

    it('wraps network errors', async () => {
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('net'));
      await expect(build().refund('t', '1')).rejects.toMatchObject({ httpStatus: 502 });
    });

    it.each(['apiKey', 'integrationIdCard', 'iframeId'] as const)('throws not-configured when %s is missing', async (key) => {
      mockFetch({ body: { token: 't' } }, { body: { id: 1 } }, { body: { token: 'p' } });
      const adapter = build({ [key]: '' } as any);
      const input = { merchantReference: 'm', amount: '1.00', currency: 'EGP', expiresAt: new Date(Date.now() + 600_000), customer: { firstName: 'A', lastName: 'B', email: 'e', phone: 'p' } };
      await expect(adapter.initiateCardPayment(input as any)).rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' });
    });

    it('fills billing_data fallbacks (name split, N/A, default email)', async () => {
      const calls = mockFetch({ body: { token: 't' } }, { body: { id: 1 } }, { body: { token: 'p' } });
      await build().initiateCardPayment({
        merchantReference: 'm', amount: '1.00', currency: 'EGP', expiresAt: new Date(Date.now() + 600_000),
        customer: { firstName: 'Sara Mohamed Ali', lastName: '', email: '', phone: '+20' },
      } as any);
      const billing = calls[2].body.billing_data;
      expect(billing.first_name).toBe('Sara');
      expect(billing.last_name).toBe('Mohamed Ali');
      expect(billing.email).toBe('na@medsuper.example');

      mockFetch({ body: { token: 't' } }, { body: { id: 1 } }, { body: { token: 'p' } });
      const calls2 = mockFetch({ body: { token: 't' } }, { body: { id: 1 } }, { body: { token: 'p' } });
      await build().initiateCardPayment({
        merchantReference: 'm', amount: '1.00', currency: 'EGP', expiresAt: new Date(Date.now() + 600_000),
        customer: { firstName: '', lastName: '', email: 'e@x.com', phone: '+20' },
      } as any);
      expect(calls2[2].body.billing_data).toMatchObject({ first_name: 'N/A', last_name: 'N/A', email: 'e@x.com' });
    });
  });
});

describe('PaymobPaymentGatewayAdapter.queryTransaction', () => {
  const build = () => new PaymobPaymentGatewayAdapter({ get: jest.fn().mockReturnValue({ apiKey: 'k', integrationIdCard: 'i', iframeId: 'f', hmacSecret: 's' }) } as any);
  const respond = (...responses: any[]) => {
    let i = 0;
    (global as any).fetch = jest.fn(() => Promise.resolve(responses[i++]));
    return (global as any).fetch as jest.Mock;
  };
  const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') });

  it('returns PAID with a webhook-shaped event', async () => {
    const fetchMock = respond(ok({ token: 'auth' }), ok({ id: 77, success: true, pending: false, error_occured: false, amount_cents: 1000, currency: 'EGP', order: { id: 5 } }));
    const result = await build().queryTransaction('ref-1');
    expect(fetchMock.mock.calls[1][0]).toContain('/api/ecommerce/orders/transaction_inquiry');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ auth_token: 'auth', merchant_order_id: 'ref-1' });
    expect(result.status).toBe('PAID');
    expect(result.event).toMatchObject({ gatewayReference: 'ref-1', gatewayTransactionId: '77', success: true, amountCents: 1000, currency: 'EGP' });
  });

  it('returns FAILED for an unsuccessful transaction', async () => {
    respond(ok({ token: 'auth' }), ok({ id: 78, success: false, pending: false, data: { txn_response_code: '5' } }));
    const result = await build().queryTransaction('ref-1');
    expect(result.status).toBe('FAILED');
    expect(result.event?.failureCode).toBe('5');
  });

  it('returns PENDING when Paymob says pending', async () => {
    respond(ok({ token: 'auth' }), ok({ id: 79, success: false, pending: true }));
    expect((await build().queryTransaction('ref-1')).status).toBe('PENDING');
  });

  it('returns NOT_FOUND on 404 or an empty body', async () => {
    respond(ok({ token: 'auth' }), { ok: false, status: 404, text: () => Promise.resolve('') });
    expect((await build().queryTransaction('ref-1')).status).toBe('NOT_FOUND');
    respond(ok({ token: 'auth' }), ok({}));
    expect((await build().queryTransaction('ref-1')).status).toBe('NOT_FOUND');
  });

  it('throws ExternalProviderError on other HTTP errors', async () => {
    respond(ok({ token: 'auth' }), { ok: false, status: 500, text: () => Promise.resolve('x') });
    await expect(build().queryTransaction('ref-1')).rejects.toBeDefined();
  });
});
