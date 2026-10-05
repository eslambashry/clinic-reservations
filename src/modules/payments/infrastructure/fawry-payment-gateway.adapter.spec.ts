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
        adapter.initiatePayment({ merchantReference: '1001', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() }),
      ).rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' });
    });

    it('computes the request signature per FawryPay\'s documented formula: merchantCode + merchantRefNum + paymentMethod + amount(2dp) + secureKey', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678' });

      await adapter.initiatePayment({ merchantReference: '1001', amount: '580.5', currency: 'EGP', customer, expiresAt: new Date() });

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      const expectedSignature = sha256('merchant-code-11001PayAtFawry580.50secure-key-1');
      expect(body.signature).toBe(expectedSignature);
      expect(body.amount).toBe('580.50');
      expect(body.merchantRefNum).toBe(1001);
      expect(body.paymentMethod).toBe('PayAtFawry');
      expect(body.customerMobile).toBe('01234567891');
      expect(body.customerEmail).toBe('na@medsuper.example');
      expect(body).not.toHaveProperty('customerName');
      expect(body.customerEmail).not.toBe(customer.email);
    });

    it('sends paymentExpiry as the caller-computed expiresAt, in unix milliseconds', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678' });
      const expiresAt = new Date(Date.now() + 15 * 60_000);

      await adapter.initiatePayment({ merchantReference: '1001', amount: '580.55', currency: 'EGP', customer, expiresAt });

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.paymentExpiry).toBe(expiresAt.getTime());
    });

    it('returns the referenceCode from the charge response, keyed to our own merchantReference', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678' });

      const result = await adapter.initiatePayment({ merchantReference: '1001', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() });

      expect(result).toEqual({ gatewayReference: '1001', referenceCode: '963455678' });
    });

    it('throws ExternalProviderError when the response is missing referenceNumber', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ statusDescription: 'Merchant not found' });

      await expect(
        adapter.initiatePayment({ merchantReference: '1001', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() }),
      ).rejects.toMatchObject({ provider: 'Fawry' });
    });

    it('calls the staging base URL by default when FAWRY_BASE_URL is unset', async () => {
      const adapter = buildAdapter({ baseUrl: null });
      mockFetchOnce({ referenceNumber: '963455678' });

      await adapter.initiatePayment({ merchantReference: '1001', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() });

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://atfawry.fawrystaging.com/ECommerceWeb/Fawry/payments/charge');
    });

    it('refuses a non-numeric merchantReference (a UUID must never reach Fawry) without calling Fawry', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678' });

      await expect(
        adapter.initiatePayment({ merchantReference: '3f1c2a4e-0000-4000-8000-000000000000', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() }),
      ).rejects.toThrow('must be numeric');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('converts an E.164 customer phone to the local 01XXXXXXXXX format Fawry documents', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678' });

      await adapter.initiatePayment({ merchantReference: '1001', amount: '100', currency: 'EGP', customer: { ...customer, phone: '+201012345678' }, expiresAt: new Date() });

      expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).customerMobile).toBe('01012345678');
    });

    it('throws ExternalProviderError when Fawry reports a business failure statusCode in a 2xx response', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '963455678', statusCode: 9946, statusDescription: 'Blank or invalid signature' });

      await expect(
        adapter.initiatePayment({ merchantReference: '1001', amount: '580.55', currency: 'EGP', customer, expiresAt: new Date() }),
      ).rejects.toMatchObject({ provider: 'Fawry' });
    });
  });

  describe('initiateMobileWalletPayment (MWALLET Request-to-Pay)', () => {
    const walletInput = {
      merchantReference: '1002',
      amount: '250',
      currency: 'EGP',
      customer: { ...customer, phone: '+201098765432' },
      expiresAt: new Date(Date.now() + 10 * 60_000),
      debitMobileWalletNo: '+201012345678',
    };

    it('posts to the MWALLET charge path with paymentMethod MWALLET and the local-format debitMobileWalletNo', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ type: 'ChargeResponse', referenceNumber: '7700123', merchantRefNumber: '1002', statusCode: 200, statusDescription: 'Operation done successfully' });

      await adapter.initiateMobileWalletPayment(walletInput);

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://atfawry.fawrystaging.com/ECommerceWeb/api/payments/charge');
      const body = JSON.parse(init.body);
      expect(body.paymentMethod).toBe('MWALLET');
      expect(body.merchantRefNum).toBe(1002);
      expect(body.debitMobileWalletNo).toBe('01012345678');
      expect(body.customerMobile).toBe('01098765432');
      expect(body.amount).toBe('250.00');
      expect(body.currencyCode).toBe('EGP');
      expect(body.paymentExpiry).toBe(walletInput.expiresAt.getTime());
      expect(body).not.toHaveProperty('walletProvider');
      expect(body).not.toHaveProperty('customerProfileId');
    });

    it('signs merchantCode + merchantRefNum + "" + MWALLET + amount(2dp) + debitMobileWalletNo + secureKey', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '7700123', statusCode: 200 });

      await adapter.initiateMobileWalletPayment(walletInput);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.signature).toBe(sha256('merchant-code-11002MWALLET250.0001012345678secure-key-1'));
    });

    it('returns our numeric reference and Fawry\'s referenceNumber (used later for cancel/refund)', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ referenceNumber: '7700123', statusCode: 200 });

      await expect(adapter.initiateMobileWalletPayment(walletInput)).resolves.toEqual({ gatewayReference: '1002', referenceCode: '7700123' });
    });

    it('throws ExternalProviderError when Fawry rejects the request', async () => {
      const adapter = buildAdapter();
      mockFetchOnce({ statusCode: 9901, statusDescription: 'merchant code is blank or invalid' });

      await expect(adapter.initiateMobileWalletPayment(walletInput)).rejects.toMatchObject({ provider: 'Fawry' });
    });

    it('throws PAYMENT_GATEWAY_NOT_CONFIGURED when credentials are missing', async () => {
      const adapter = buildAdapter({ secureKey: null });

      await expect(adapter.initiateMobileWalletPayment(walletInput)).rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' });
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
        merchantRefNumber: '1001',
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

    it('accepts an MWALLET notification whose numeric merchantRefNumber arrives as a JSON number (not formatted as 2dp)', () => {
      const adapter = buildAdapter();
      const payload: Record<string, unknown> = {
        fawryRefNumber: 7700123,
        merchantRefNumber: 1002,
        paymentAmount: 250,
        orderAmount: 250,
        orderStatus: 'PAID',
        paymentMethod: 'MWALLET',
        paymentReferenceNumber: '',
      };
      payload.messageSignature = sha256('77001231002250.00250.00PAIDMWALLETsecure-key-1');

      expect(adapter.verifyWebhookSignature(payload, undefined)).toBe(true);
    });
  });

  describe('parseWebhookEvent', () => {
    it('maps a PAID order to success:true, with our merchantRefNumber as gatewayReference', () => {
      const adapter = buildAdapter();
      const event = adapter.parseWebhookEvent({
        fawryRefNumber: 'FR-1',
        merchantRefNumber: '1001',
        orderStatus: 'PAID',
      });

      expect(event).toEqual({ gatewayReference: '1001', gatewayTransactionId: 'FR-1', success: true, failureCode: undefined });
    });

    it('maps a non-PAID order to success:false with a failureCode', () => {
      const adapter = buildAdapter();
      const event = adapter.parseWebhookEvent({
        fawryRefNumber: 'FR-1',
        merchantRefNumber: '1001',
        orderStatus: 'EXPIRED',
        failureErrorCode: 'ORDER_EXPIRED',
      });

      expect(event).toMatchObject({ success: false, failureCode: 'ORDER_EXPIRED' });
    });

    it('stringifies numeric identifiers so the webhook lookup always receives a string reference', () => {
      const adapter = buildAdapter();
      const event = adapter.parseWebhookEvent({ fawryRefNumber: 7700123, merchantRefNumber: 1002, orderStatus: 'PAID' });

      expect(event).toMatchObject({ gatewayReference: '1002', gatewayTransactionId: '7700123', success: true });
    });

    it('throws WEBHOOK_PAYLOAD_INVALID when required identifiers are missing', () => {
      const adapter = buildAdapter();
      expect(() => adapter.parseWebhookEvent({ orderStatus: 'PAID' })).toThrow();
    });
  });
});
