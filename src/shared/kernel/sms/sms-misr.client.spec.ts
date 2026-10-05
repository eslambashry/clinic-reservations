import { SmsMisrClient, toSmsMisrMobile } from './sms-misr.client';

describe('SmsMisrClient', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as any;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  function client(overrides: Record<string, string | null> = {}) {
    const smsMisr = { username: 'user', password: 'pass', sender: 'sender-token', otpTemplate: 'template-token', environment: 'test', ...overrides };
    return new SmsMisrClient({ get: () => ({ provider: 'smsmisr', smsMisr }) } as any);
  }

  it('posts the OTP form to the test environment with the E.164 number minus its +', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ code: '4901' }) });

    await client().sendOtp('+201001234567', '123456');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://smsmisr.com/api/OTP/');
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
      environment: '2',
      username: 'user',
      password: 'pass',
      sender: 'sender-token',
      mobile: '201001234567',
      template: 'template-token',
      otp: '123456',
    });
  });

  it('uses environment=1 when configured for live', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ code: 4901 }) });

    await client({ environment: 'live' }).sendOtp('+201001234567', '123456');

    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('environment')).toBe('1');
  });

  it('maps an SMS Misr failure code to a 502 GATEWAY_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ code: '4909' }) });

    await expect(client().sendOtp('+201001234567', '123456')).rejects.toMatchObject({ code: 'GATEWAY_UNAVAILABLE', httpStatus: 502 });
  });

  it('refuses the OTP API without a template, and either API without credentials', async () => {
    await expect(client({ otpTemplate: null }).sendOtp('+201001234567', '123456')).rejects.toMatchObject({ code: 'SMS_PROVIDER_NOT_CONFIGURED' });
    await expect(client({ sender: null }).sendSms('+201001234567', 'hi')).rejects.toMatchObject({ code: 'SMS_PROVIDER_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends free text through the SMS API as Arabic, succeeding on 1901', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ code: '1901', SMSID: '1', cost: '1' }) });

    await client({ otpTemplate: null }).sendSms('+201001234567', 'رمز 123456');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://smsmisr.com/api/SMS/');
    const body = new URLSearchParams(init.body);
    expect(body.get('language')).toBe('2');
    expect(body.get('message')).toBe('رمز 123456');
    expect(body.get('mobile')).toBe('201001234567');
    expect(body.get('template')).toBeNull();
  });

  it('maps an SMS API failure code to a 502 GATEWAY_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ code: '1905' }) });

    await expect(client().sendSms('+201001234567', 'hi')).rejects.toMatchObject({ code: 'GATEWAY_UNAVAILABLE' });
  });

  it('reports whether an OTP template is configured', () => {
    expect(client().hasOtpTemplate()).toBe(true);
    expect(client({ otpTemplate: null }).hasOtpTemplate()).toBe(false);
  });

  it('strips only a leading +', () => {
    expect(toSmsMisrMobile('+201001234567')).toBe('201001234567');
    expect(toSmsMisrMobile('201001234567')).toBe('201001234567');
  });
});
