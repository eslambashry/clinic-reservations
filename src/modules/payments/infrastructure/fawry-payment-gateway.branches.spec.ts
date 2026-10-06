import { FawryPaymentGatewayAdapter, toFawryLocalMobile } from './fawry-payment-gateway.adapter';

function build(overrides: Record<string, unknown> = {}) {
  const cfg = { merchantCode: 'mc', secureKey: 'sk', baseUrl: 'https://custom.example', ...overrides };
  return new FawryPaymentGatewayAdapter({ get: jest.fn().mockReturnValue(cfg) } as any);
}

const customer = { firstName: 'A', lastName: '', email: 'a@x.com', phone: '+201234567891' };

describe('FawryPaymentGatewayAdapter branches', () => {
  const originalFetch = (global as any).fetch;
  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it('wraps non-2xx responses (with and without readable body) as a 502 provider error', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('bad') });
    await expect(build().cancelUnpaidOrder('ref')).rejects.toMatchObject({ httpStatus: 502 });
    expect((global as any).fetch.mock.calls[0][0]).toBe('https://custom.example/ECommerceWeb/api/orders/cancel-unpaid-order');

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.reject(new Error('x')) });
    await expect(build({ baseUrl: null }).refund('ref', '10')).rejects.toMatchObject({ httpStatus: 502 });
    expect((global as any).fetch.mock.calls[0][0]).toContain('/ECommerceWeb/Fawry/payments/refund');
  });

  it('refund posts a 2dp amount and default reason; returns empty reference', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    expect(await build().refund('ref', '10.5')).toEqual({});
    const body = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ refundAmount: '10.50', reason: 'Appointment cancelled', referenceNumber: 'ref' });
  });

  it('rejects a non-numeric merchantReference before calling Fawry', async () => {
    (global as any).fetch = jest.fn();
    await expect(
      build().initiatePayment({ merchantReference: 'uuid-abc', amount: '1', currency: 'EGP', customer, expiresAt: new Date() } as any),
    ).rejects.toThrow(/numeric/);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('missing config on cancel/verify raises PAYMENT_GATEWAY_NOT_CONFIGURED', async () => {
    await expect(build({ merchantCode: null }).cancelUnpaidOrder('r')).rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' });
    expect(() => build({ secureKey: null }).verifyWebhookSignature({}, undefined)).toThrow();
  });

  describe('verifyWebhookSignature', () => {
    const { createHash } = require('node:crypto');
    const sha = (v: string) => createHash('sha256').update(v).digest('hex');

    it('false without a signature', () => {
      expect(build().verifyWebhookSignature({ fawryRefNumber: '1' }, undefined)).toBe(false);
    });

    it('accepts a matching (case-insensitive) signature with 2dp amounts and null fields', () => {
      const raw: any = { fawryRefNumber: 'F1', merchantRefNumber: 123, paymentAmount: '10', orderAmount: 10, orderStatus: 'PAID', paymentMethod: null, paymentReferenceNumber: undefined };
      raw.messageSignature = sha('F1' + '123' + '10.00' + '10.00' + 'PAID' + '' + '' + 'sk').toUpperCase();
      expect(build().verifyWebhookSignature(raw, undefined)).toBe(true);
    });

    it('keeps non-numeric amounts verbatim and empty amounts empty; rejects mismatch', () => {
      const raw: any = { fawryRefNumber: 'F1', merchantRefNumber: '1', paymentAmount: 'abc', orderAmount: '', orderStatus: 'PAID', paymentMethod: 'X', paymentReferenceNumber: 'P' };
      raw.messageSignature = sha('F1' + '1' + 'abc' + '' + 'PAID' + 'X' + 'P' + 'sk');
      expect(build().verifyWebhookSignature(raw, undefined)).toBe(true);
      raw.messageSignature = 'deadbeef';
      expect(build().verifyWebhookSignature(raw, undefined)).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('400s when references are missing', () => {
      expect(() => build().parseWebhookEvent({ merchantRefNumber: '1' })).toThrow();
      expect(() => build().parseWebhookEvent({ fawryRefNumber: '1' })).toThrow();
    });
    it('maps PAID and failure codes', () => {
      const a = build();
      expect(a.parseWebhookEvent({ merchantRefNumber: '1', fawryRefNumber: 'f', orderStatus: 'PAID' })).toMatchObject({ success: true, failureCode: undefined });
      expect(a.parseWebhookEvent({ merchantRefNumber: '1', fawryRefNumber: 'f', orderStatus: 'EXPIRED', failureErrorCode: 'E1' }).failureCode).toBe('E1');
      expect(a.parseWebhookEvent({ merchantRefNumber: '1', fawryRefNumber: 'f', orderStatus: 'EXPIRED' }).failureCode).toBe('EXPIRED');
      expect(a.parseWebhookEvent({ merchantRefNumber: '1', fawryRefNumber: 'f' }).failureCode).toBe('GATEWAY_DECLINED');
    });
  });

  describe('toFawryLocalMobile', () => {
    it.each([
      ['+201234567891', '01234567891'],
      ['20 123-4567891', '0123' + '4567891'],
      ['01234567891', '01234567891'],
      ['201234', '201234'],
    ])('%s -> %s', (input, out) => {
      expect(toFawryLocalMobile(input)).toBe(out);
    });
  });
});
