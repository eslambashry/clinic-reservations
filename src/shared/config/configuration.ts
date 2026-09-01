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
    enabled: boolean // if redis dose not work 
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
    enabled: process.env.REDIS_ENABLED === 'true', // if redis dose not work 

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
});
