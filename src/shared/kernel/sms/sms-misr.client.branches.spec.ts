import { SmsMisrClient } from './sms-misr.client';

describe('SmsMisrClient failure branches', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as any;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  const client = () =>
    new SmsMisrClient({
      get: () => ({ smsMisr: { username: 'u', password: 'p', sender: 's', otpTemplate: 't', environment: 'test' } }),
    } as any);

  it('falls back to the provider Message for an unmapped code', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ code: '9999', Message: 'weird' }) });
    await expect(client().sendOtp('+201001234567', '1')).rejects.toMatchObject({ httpStatus: 502, code: 'GATEWAY_UNAVAILABLE' });
  });

  it('handles a non-JSON response (no code, no message)', async () => {
    fetchMock.mockResolvedValue({ status: 502, json: async () => { throw new Error('bad json'); } });
    await expect(client().sendSms('+201001234567', 'hi')).rejects.toMatchObject({ httpStatus: 502 });
  });

  it('wraps network errors, including non-Error rejections and short phone numbers', async () => {
    fetchMock.mockRejectedValue('offline');
    await expect(client().sendSms('123', 'hi')).rejects.toMatchObject({ httpStatus: 502 });
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(client().sendOtp('+201001234567', '1')).rejects.toMatchObject({ httpStatus: 502 });
  });

  it('succeeds with a known failure code mapping not triggered on the right success code', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ code: '4901' }) });
    await expect(client().sendOtp('201001234567', '1')).resolves.toBeUndefined();
  });
});
