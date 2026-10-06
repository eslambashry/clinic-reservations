import configuration from './configuration';

describe('configuration', () => {
  const saved = { ...process.env };
  const keys = ['NODE_ENV','PORT','REDIS_ENABLED','REDIS_CA_CERT','CORS_ALLOWED_ORIGINS','IMAGEKIT_PUBLIC_KEY','PAYMOB_API_KEY','FAWRY_MERCHANT_CODE','FAWRY_BASE_URL','FIREBASE_PRIVATE_KEY','SMS_PROVIDER','SMSMISR_USERNAME','SMSMISR_ENVIRONMENT','APPOINTMENT_END_GRACE_MINUTES'];
  beforeEach(() => keys.forEach((k) => delete process.env[k]));
  afterAll(() => { process.env = saved; });

  it('applies defaults', () => {
    const c = configuration();
    expect(c.nodeEnv).toBe('development');
    expect(c.port).toBe(3000);
    expect(c.redis.enabled).toBe(false);
    expect(c.redis.caCert).toBeNull();
    expect(c.cors.allowedOrigins).toBeNull();
    expect(c.imagekit.publicKey).toBeNull();
    expect(c.paymob.apiKey).toBeNull();
    expect(c.fawry.baseUrl).toBeNull();
    expect(c.firebase.privateKey).toBeNull();
    expect(c.sms.provider).toBe('logging');
    expect(c.sms.smsMisr.username).toBeNull();
    expect(c.sms.smsMisr.environment).toBe('test');
    expect(c.scheduling.appointmentEndGraceMinutes).toBe(30);
  });

  it('reads provided values', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production', PORT: '8080', REDIS_ENABLED: 'true', REDIS_CA_CERT: 'ca',
      CORS_ALLOWED_ORIGINS: ' https://a.com, ,https://b.com ', IMAGEKIT_PUBLIC_KEY: 'pk',
      PAYMOB_API_KEY: 'pm', FAWRY_MERCHANT_CODE: 'fm', FAWRY_BASE_URL: 'https://f',
      FIREBASE_PRIVATE_KEY: 'a\nb', SMS_PROVIDER: 'smsmisr', SMSMISR_USERNAME: 'u',
      SMSMISR_ENVIRONMENT: 'live', APPOINTMENT_END_GRACE_MINUTES: '15',
    });
    const c = configuration();
    expect(c.nodeEnv).toBe('production');
    expect(c.port).toBe(8080);
    expect(c.redis).toMatchObject({ enabled: true, caCert: 'ca' });
    expect(c.cors.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(c.imagekit.publicKey).toBe('pk');
    expect(c.paymob.apiKey).toBe('pm');
    expect(c.fawry).toMatchObject({ merchantCode: 'fm', baseUrl: 'https://f' });
    expect(c.firebase.privateKey).toBe('a\nb');
    expect(c.sms.provider).toBe('smsmisr');
    expect(c.sms.smsMisr).toMatchObject({ username: 'u', environment: 'live' });
    expect(c.scheduling.appointmentEndGraceMinutes).toBe(15);
  });

  it.each(['-1', 'abc'])('falls back to 30 for invalid grace %s', (v) => {
    process.env.APPOINTMENT_END_GRACE_MINUTES = v;
    expect(configuration().scheduling.appointmentEndGraceMinutes).toBe(30);
  });
});
