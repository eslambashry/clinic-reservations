import 'reflect-metadata';
import { json } from 'express';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { MEDIA_CONSTANTS } from './shared/config/constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Express defaults the JSON body-parser limit to 100kb — far too small for
  // `SubmitProviderRegistrationDto.photo_data_uri` (a base64 `data:` URI,
  // ~33% larger than the raw image bytes it encodes, up to
  // `MEDIA_CONSTANTS.MAX_IMAGE_SIZE_BYTES`). Left at the default, any real
  // photo triggers Express's own `PayloadTooLargeError` before the request
  // ever reaches Nest's routing/validation/`ErrorEnvelopeFilter` — surfaced
  // to the client as an opaque 500, not the 413 it actually is.
  app.use(json({ limit: Math.ceil(MEDIA_CONSTANTS.MAX_IMAGE_SIZE_BYTES * 1.4) }));

  // File 11 Part 04: base path /v1, additive changes never bump the version.
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  // CORS_ALLOWED_ORIGINS (env.validation.ts) is the explicit allowlist any
  // real deployment should set. Unset falls back to reflecting whatever
  // Origin header the request sends (`origin: true`), which is what makes
  // local dev across arbitrary localhost ports work with zero config — but
  // it's a wildcard-equivalent for a credentialed API, so a production boot
  // without an explicit allowlist logs a loud warning instead of silently
  // shipping it.
  const allowedOrigins = config.get<string[] | null>('cors.allowedOrigins');
  if (allowedOrigins) {
    app.enableCors({ origin: allowedOrigins, credentials: true });
  } else {
    if (config.get<string>('nodeEnv') === 'production') {
      logger.warn(
        'CORS_ALLOWED_ORIGINS is not set — reflecting any Origin in production. Set CORS_ALLOWED_ORIGINS to an explicit comma-separated allowlist before this is reachable from the internet.',
      );
    }
    app.enableCors({ origin: true, credentials: true });
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('MedSuper API').setVersion('1.0').build(),
  );
  SwaggerModule.setup('v1/docs', app, document);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  logger.log(`Server is running on port ${port}`);
}

void bootstrap();
