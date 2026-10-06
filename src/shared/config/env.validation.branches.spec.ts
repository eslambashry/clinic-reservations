import 'reflect-metadata';
import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://app:secret@db.example.test:5432/medsuper?sslmode=require',
  DIRECT_URL: 'postgresql://migrator:secret@db.example.test:5432/medsuper?sslmode=require',
  REDIS_URL: 'rediss://cache.example.test:6379',
  REDIS_ENABLED: 'true',
  JWT_ACCESS_SECRET: 'local-development-secret',
  IMAGEKIT_PRIVATE_KEY: 'k',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/example',
};

const prod = {
  ...base,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  SMS_PROVIDER: 'smsmisr',
  SMSMISR_ENVIRONMENT: 'live',
  SMSMISR_USERNAME: 'u',
  SMSMISR_PASSWORD: 'p',
  SMSMISR_SENDER: 's',
};

describe('validateEnv branches', () => {
  it('coerces numeric strings via @Type for PORT and the appointment grace', () => {
    const env = validateEnv({ ...base, PORT: '4000', APPOINTMENT_END_GRACE_MINUTES: '15' });
    expect(env.PORT).toBe(4000);
    expect(env.APPOINTMENT_END_GRACE_MINUTES).toBe(15);
  });

  it('rejects an out-of-range PORT with a joined message', () => {
    expect(() => validateEnv({ ...base, PORT: '0' })).toThrow(/Invalid environment configuration/);
  });

  it.each([
    ['not a url', 'http-not'],
    ['http scheme', 'http://app.example.com'],
    ['path', 'https://app.example.com/path'],
    ['credentials', 'https://u:p@app.example.com'],
    ['query', 'https://app.example.com/?a=1'],
    ['hash', 'https://app.example.com/#x'],
  ])('production blocks CORS origin with %s', (_n, origin) => {
    expect(() => validateEnv({ ...prod, CORS_ALLOWED_ORIGINS: origin })).toThrow(/Production startup is blocked/);
  });

  it('production blocks an empty CORS allowlist', () => {
    expect(() => validateEnv({ ...prod })).toThrow(/CORS/);
  });

  it('production boots with a valid https origin list', () => {
    const env = validateEnv({ ...prod, CORS_ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com' });
    expect(env.NODE_ENV).toBe('production');
  });
});
