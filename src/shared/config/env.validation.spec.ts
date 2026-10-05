import 'reflect-metadata';
import { validateEnv } from './env.validation';

const baseConfig = {
  DATABASE_URL: 'postgresql://app:secret@db.example.test:5432/medsuper?sslmode=require',
  DIRECT_URL: 'postgresql://migrator:secret@db.example.test:5432/medsuper?sslmode=require',
  REDIS_URL: 'rediss://cache.example.test:6379',
  REDIS_ENABLED: 'true',
  JWT_ACCESS_SECRET: 'local-development-secret',
  IMAGEKIT_PRIVATE_KEY: 'local-imagekit-key',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/example',
};

describe('validateEnv release configuration', () => {
  it('keeps local development defaults usable without a browser-origin allowlist', () => {
    expect(
      validateEnv({ ...baseConfig, NODE_ENV: 'development' }).NODE_ENV,
    ).toBe('development');
  });

  it('reports production launch blockers instead of allowing unsafe CORS or weak secrets', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        REDIS_ENABLED: 'false',
        JWT_ACCESS_SECRET: 'short',
        CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      }),
    ).toThrow(
      /JWT_ACCESS_SECRET must contain at least 32 characters[\s\S]*REDIS_ENABLED must be true[\s\S]*CORS_ALLOWED_ORIGINS must list one or more HTTPS origins[\s\S]*SMS_PROVIDER must be smsmisr/,
    );
  });

  const releaseConfig = {
    ...baseConfig,
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'release-secret-with-at-least-32-characters',
    CORS_ALLOWED_ORIGINS: 'https://pharmacy.example.test,https://laboratory.example.test',
  };
  const smsMisrConfig = {
    SMS_PROVIDER: 'smsmisr',
    SMSMISR_ENVIRONMENT: 'live',
    SMSMISR_USERNAME: 'user',
    SMSMISR_PASSWORD: 'pass',
    SMSMISR_SENDER: 'sender-token',
    SMSMISR_OTP_TEMPLATE: 'template-token',
  };

  it('treats an empty SMS_PROVIDER (as written by .env.example) as the dev logging sender', () => {
    expect(validateEnv({ ...baseConfig, NODE_ENV: 'development', SMS_PROVIDER: '', SMSMISR_ENVIRONMENT: '' }).SMS_PROVIDER).toBe('');
  });

  it('blocks production while the dev-only logging OTP sender is selected', () => {
    expect(() => validateEnv(releaseConfig)).toThrow('SMS_PROVIDER must be smsmisr');
  });

  it('blocks production on the SMS Misr test environment, which delivers nothing', () => {
    expect(() => validateEnv({ ...releaseConfig, ...smsMisrConfig, SMSMISR_ENVIRONMENT: 'test' })).toThrow('SMSMISR_ENVIRONMENT must be live');
  });

  it('boots production once SMS Misr is selected, live, and fully configured', () => {
    expect(validateEnv({ ...releaseConfig, ...smsMisrConfig }).SMS_PROVIDER).toBe('smsmisr');
  });

  it('fails fast in any environment when SMS Misr is selected without every credential', () => {
    expect(() =>
      validateEnv({ ...baseConfig, NODE_ENV: 'development', SMS_PROVIDER: 'smsmisr', SMSMISR_USERNAME: 'user' }),
    ).toThrow(/SMSMISR_PASSWORD is required[\s\S]*SMSMISR_SENDER is required/);
  });

  it('does not require an OTP template (OTPs fall back to the SMS API until one is approved)', () => {
    expect(validateEnv({ ...releaseConfig, ...smsMisrConfig, SMSMISR_OTP_TEMPLATE: undefined }).SMS_PROVIDER).toBe('smsmisr');
  });
});
