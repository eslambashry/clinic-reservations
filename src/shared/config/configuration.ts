import { AUTH_CONSTANTS } from './constants';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: {
    url: string;
    directUrl: string;
  };
  redis: {
    url: string;
    enabled: boolean;
  };
  jwt: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  };
  /** `null` means no allowlist configured — `main.ts` falls back to reflecting any Origin (dev-only). */
  cors: {
    allowedOrigins: string[] | null;
  };
  imagekit: {
    privateKey: string;
    urlEndpoint: string;
    publicKey: string | null;
  };
  /**
   * File 12 Part 50 / DEC-001: Paymob is the recommended gateway (File 10
   * Part 10) — credentials are not provisioned yet, so every field is
   * `null` until the real env vars are set. `PaymobPaymentGatewayAdapter`
   * throws a clear `PAYMENT_GATEWAY_NOT_CONFIGURED` error at call time (not
   * at boot — these are genuinely optional until Paymob is contracted).
   */
  paymob: {
    apiKey: string | null;
    integrationIdCard: string | null;
    integrationIdFawry: string | null;
    integrationIdWallet: string | null;
    iframeId: string | null;
    hmacSecret: string | null;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL as string,
    directUrl: process.env.DIRECT_URL as string,
  },
  redis: {
    url: process.env.REDIS_URL as string,
    enabled: process.env.REDIS_ENABLED === 'true',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessTtlSeconds: AUTH_CONSTANTS.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlSeconds: AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS,
  },
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
      : null,
  },
  imagekit: {
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY as string,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY ?? null,
  },
  paymob: {
    apiKey: process.env.PAYMOB_API_KEY ?? null,
    integrationIdCard: process.env.PAYMOB_INTEGRATION_ID_CARD ?? null,
    integrationIdFawry: process.env.PAYMOB_INTEGRATION_ID_FAWRY ?? null,
    integrationIdWallet: process.env.PAYMOB_INTEGRATION_ID_WALLET ?? null,
    iframeId: process.env.PAYMOB_IFRAME_ID ?? null,
    hmacSecret: process.env.PAYMOB_HMAC_SECRET ?? null,
  },
});
