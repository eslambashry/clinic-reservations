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
      /JWT_ACCESS_SECRET must contain at least 32 characters[\s\S]*REDIS_ENABLED must be true[\s\S]*CORS_ALLOWED_ORIGINS must list one or more HTTPS origins[\s\S]*production OTP sender must be selected/,
    );
  });

  it('still blocks production until a real OTP sender is installed', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'release-secret-with-at-least-32-characters',
        CORS_ALLOWED_ORIGINS:
          'https://pharmacy.example.test,https://laboratory.example.test',
      }),
    ).toThrow('a production OTP sender must be selected and configured');
  });
});
