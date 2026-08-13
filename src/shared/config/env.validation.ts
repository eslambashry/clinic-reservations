import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

/**
 * Fails fast at boot if a required env var is missing/malformed, instead of
 * surfacing as a runtime error the first time a request needs it.
 */
class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  // `@Type(() => Number)` explicitly, not relying on class-transformer's
  // `enableImplicitConversion` design-type reflection: that path depends on
  // `emitDecoratorMetadata`, which `tsx`/esbuild (the dev-loop transpiler,
  // `start:dev`) doesn't implement — plainToInstance silently left PORT as
  // the raw string "3000" under `tsx`, failing `@IsInt()`/`@Min(1)` even
  // though the identical code worked once actually compiled by `tsc`.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  /** Pooled connection (PgBouncer, sslmode=require) — File 11 Part 08, `src/db/client.ts`. */
  @IsString()
  DATABASE_URL: string;

  /** Direct connection, used by Prisma Migrate only. */
  @IsString()
  DIRECT_URL: string;

  @IsString()
  REDIS_URL: string;

  /** Signs/verifies short-lived access JWTs (File 11 Part 07.1). Refresh tokens are opaque, not JWT — no secret needed for those, they're hashed with argon2 instead. */
  @IsString()
  JWT_ACCESS_SECRET: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${messages}`);
  }

  return validated;
}
