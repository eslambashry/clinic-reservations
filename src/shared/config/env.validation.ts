import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

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

  @IsIn(['true', 'false'])
  REDIS_ENABLED: string;

  /** Signs/verifies short-lived access JWTs (File 11 Part 07.1). Refresh tokens are opaque, not JWT — no secret needed for those; they're hashed with deterministic SHA-256 for lookup, not argon2 (see `identity-auth/domain/refresh-token.util.ts`). */
  @IsString()
  JWT_ACCESS_SECRET: string;

  /**
   * Comma-separated allowlist of browser origins allowed to call the API
   * (e.g. `https://app.medsuper.example,https://admin.medsuper.example`).
   * Optional: unset means "reflect any Origin" (`src/main.ts`), which is
   * fine for local dev across arbitrary localhost ports but must be set
   * before a real deployment — `main.ts` logs a warning at boot if it's
   * still unset while `NODE_ENV=production`.
   */
  @IsString()
  @IsOptional()
  CORS_ALLOWED_ORIGINS?: string;

  /**
   * ImageKit (`DEC-009` — object storage vendor, File 12 Part 12) — private
   * API key, used server-side to authenticate uploads and to sign private-file
   * URLs (`src/shared/kernel/storage/imagekit-storage.adapter.ts`). Never
   * logged, never sent to a client.
   */
  @IsString()
  IMAGEKIT_PRIVATE_KEY: string;

  /** Public delivery endpoint (e.g. `https://ik.imagekit.io/<id>`) — used to build both public and signed URLs. */
  @IsString()
  IMAGEKIT_URL_ENDPOINT: string;

  /** Not used server-side today (all uploads are server-side, authenticated by `IMAGEKIT_PRIVATE_KEY`) — kept for a future client-side/direct-upload flow. */
  @IsString()
  @IsOptional()
  IMAGEKIT_PUBLIC_KEY?: string;

  /**
   * Paymob (`DEC-001`, File 12 Part 50) — all optional, unlike the
   * `IMAGEKIT_*` vars above: DEC-001 is still `Open` (File 10 Part 10,
   * "recommended: Paymob," not yet contracted), so the process must still
   * boot without these. `PaymobPaymentGatewayAdapter` fails fast with a
   * clear `PAYMENT_GATEWAY_NOT_CONFIGURED` error the first time an online
   * payment is actually attempted without them, rather than pretending to
   * succeed.
   */
  @IsString()
  @IsOptional()
  PAYMOB_API_KEY?: string;

  /** Per-payment-method integration IDs, configured in the Paymob dashboard against one merchant account. */
  @IsString()
  @IsOptional()
  PAYMOB_INTEGRATION_ID_CARD?: string;

  @IsString()
  @IsOptional()
  PAYMOB_INTEGRATION_ID_FAWRY?: string;

  @IsString()
  @IsOptional()
  PAYMOB_INTEGRATION_ID_WALLET?: string;

  /** Hosted card iframe id (Paymob dashboard) — builds the `redirectUrl` returned for `CARD` payments. */
  @IsString()
  @IsOptional()
  PAYMOB_IFRAME_ID?: string;

  /** HMAC secret used to verify `POST /v1/webhooks/payments/paymob` authenticity — never trust an unverified webhook body. */
  @IsString()
  @IsOptional()
  PAYMOB_HMAC_SECRET?: string;
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
