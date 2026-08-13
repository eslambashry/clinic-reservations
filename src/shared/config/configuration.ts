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
  };
  jwt: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
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
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessTtlSeconds: AUTH_CONSTANTS.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlSeconds: AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS,
  },
});
