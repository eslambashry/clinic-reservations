import { createHash } from 'node:crypto';
import { FawryPaymentGatewayAdapter } from './fawry-payment-gateway.adapter';

const CONFIG: { merchantCode: string | null; secureKey: string | null; baseUrl: string | null } = {
  merchantCode: 'merchant-code-1',
  secureKey: 'secure-key-1',
  baseUrl: null,
};

function buildAdapter(overrides: Partial<typeof CONFIG> = {}) {
  const configService = { get: jest.fn().mockReturnValue({ ...CONFIG, ...overrides }) };
  return new FawryPaymentGatewayAdapter(configService as any);
}

function mockFetchOnce(body: unknown, ok = true) {
  (global as any).fetch = jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 502, json: () => Promise.resolve(body), text: () => Promise.resolve('') });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const customer = { firstName: 'Ahmed Ali', lastName: '', email: 'ahmed@example.com', phone: '01234567891' };

describe('FawryPaymentGatewayAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initiatePayment', () => {
    it('throws PAYMENT_GATEWAY_NOT_CONFIGURED when credentials are missing', async () => {
      const adapter = buildAdapter({ merchantCode: null });

      await expect(
        adapter.initiatePayment({ merchantReference: 'attempt-1', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() }),
      ).rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' });
    });

    it('computes the request signature per FawryPay\'s documented formula: merchantCode + merchantRefNum + paymentMethod + amount(2dp) + secureKey', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678' });

      await adapter.initiatePayment({ merchantReference: 'attempt-1', amount: '580.5', currency: 'EGP', customer, expiresAt: new Date() });

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      const expectedSignature = sha256('merchant-code-1attempt-1PayAtFawry580.50secure-key-1');
      expect(body.signature).toBe(expectedSignature);
      expect(body.amount).toBe('580.50');
      expect(body.merchantRefNum).toBe('attempt-1');
      expect(body.paymentMethod).toBe('PayAtFawry');
      expect(body.customerMobile).toBe(customer.phone);
      expect(body.customerEmail).toBe('na@medsuper.example');
      expect(body).not.toHaveProperty('customerName');
      expect(body.customerEmail).not.toBe(customer.email);
    });

    it('sends paymentExpiry as the caller-computed expiresAt, in unix milliseconds', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678' });
      const expiresAt = new Date(Date.now() + 15 * 60_000);

      await adapter.initiatePayment({ merchantReference: 'attempt-1', amount: '580.55', currency: 'EGP', customer, expiresAt });

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.paymentExpiry).toBe(expiresAt.getTime());
    });

    it('returns the referenceCode from the charge response, keyed to our own merchantReference', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678' });

      const result = await adapter.initiatePayment({ merchantReference: 'attempt-1', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() });

      expect(result).toEqual({ gatewayReference: 'attempt-1', referenceCode: '963455678' });
    });

    it('throws ExternalProviderError when the response is missing referenceNumber', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ statusDescription: 'Merchant not found' });

      await expect(
        adapter.initiatePayment({ merchantReference: 'attempt-1', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() }),
      ).rejects.toMatchObject({ provider: 'Fawry' });
    });

    it('calls the staging base URL by default when FAWRY_BASE_URL is unset', async () => {
      const adapter = buildAdapter({ baseUrl: null });
      mockFetchOnce({ referenceNumber: '963455678' });

      await adapter.initiatePayment({ merchantReference: 'attempt-1', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() });

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://atfawry.fawrystaging.com/ECommerceWeb/Fawry/payments/charge');
    });
  });

  describe('cancelUnpaidOrder', () => {
    it('computes the signature per the documented formula: orderRefNo + merchantAccount + lang + secureKey', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ code: 9900 });

      await adapter.cancelUnpaidOrder('963455678');

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/ECommerceWeb/api/orders/cancel-unpaid-order');
      const body = JSON.parse(init.body);
      expect(body.orderRefNo).toBe('963455678');
      expect(body.merchantAccount).toBe('merchant-code-1');
      expect(body.signature).toBe(sha256('963455678merchant-code-1ar-egsecure-key-1'));
    });
  });

  describe('refund', () => {
    it('computes the signature per the documented formula: merchantCode + referenceNumber + refundAmount(2dp) + reason + secureKey', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ statusCode: 200 });

      await adapter.refund('963455678', '362.5', 'Appointment cancelled');

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/ECommerceWeb/Fawry/payments/refund');
      const body = JSON.parse(init.body);
      expect(body.refundAmount).toBe('362.50');
      expect(body.signature).toBe(sha256('merchant-code-1963455678362.50Appointment cancelledsecure-key-1'));
    });
  });

  describe('verifyWebhookSignature', () => {
    const fields = ['fawryRefNumber', 'merchantRefNumber', 'paymentAmount', 'orderAmount', 'orderStatus', 'paymentMethod', 'paymentReferenceNumber'];

    function buildValidPayload() {
      const payload: Record<string, unknown> = {
        fawryRefNumber: 'FR-1',
        merchantRefNumber: 'attempt-1',
        paymentAmount: '580.55',
        orderAmount: '580.55',
        orderStatus: 'PAID',
        paymentMethod: 'PayAtFawry',
        paymentReferenceNumber: '963455678',
      };
      const concatenated = fields.map((f) => String(payload[f])).join('') + 'secure-key-1';
      payload.messageSignature = sha256(concatenated);
      return payload;
    }

    it('accepts a payload whose messageSignature matches the documented field order', () => {
      const adapter = buildAdapter();
      expect(adapter.verifyWebhookSignature(buildValidPayload(), undefined)).toBe(true);
    });

    it('rejects a payload with a tampered field (signature no longer matches)', () => {
      const adapter = buildAdapter();
      const payload = buildValidPayload();
      payload.paymentAmount = '1.00';
      expect(adapter.verifyWebhookSignature(payload, undefined)).toBe(false);
    });

    it('rejects a payload with no messageSignature at all', () => {
      const adapter = buildAdapter();
      expect(adapter.verifyWebhookSignature({}, undefined)).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('maps a PAID order to success:true, with our merchantRefNumber as gatewayReference', () => {
      const adapter = buildAdapter();
      const event = adapter.parseWebhookEvent({
        fawryRefNumber: 'FR-1',
        merchantRefNumber: 'attempt-1',
        orderStatus: 'PAID',
      });

      expect(event).toEqual({ gatewayReference: 'attempt-1', gatewayTransactionId: 'FR-1', success: true, failureCode: undefined });
    });

    it('maps a non-PAID order to success:false with a failureCode', () => {
      const adapter = buildAdapter();
      const event = adapter.parseWebhookEvent({
        fawryRefNumber: 'FR-1',
        merchantRefNumber: 'attempt-1',
        orderStatus: 'EXPIRED',
        failureErrorCode: 'ORDER_EXPIRED',
      });

      expect(event).toMatchObject({ success: false, failureCode: 'ORDER_EXPIRED' });
    });

    it('throws WEBHOOK_PAYLOAD_INVALID when required identifiers are missing', () => {
      const adapter = buildAdapter();
      expect(() => adapter.parseWebhookEvent({ orderStatus: 'PAID' })).toThrow();
    });
  });
});
