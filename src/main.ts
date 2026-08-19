import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

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
