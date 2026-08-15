import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // File 11 Part 04: base path /v1, additive changes never bump the version.
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();

  // No CORS config existed at all before this — any browser-based client
  // (Flutter web, a future admin dashboard) got a CORS-preflight 404 on
  // every request, unrelated to auth/business logic. `origin: true`
  // reflects the request's Origin header, which is fine for local dev
  // across arbitrary localhost ports; tighten to an explicit allowlist
  // before any real deployment.
  app.enableCors({ origin: true, credentials: true });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('MedSuper API').setVersion('1.0').build(),
  );
  SwaggerModule.setup('v1/docs', app, document);

  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  logger.log(`Server is running on port ${port}`);
}

void bootstrap();
