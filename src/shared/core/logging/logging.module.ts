import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { RequestContextService } from '../context/request-context.service';

/**
 * Structured JSON logger (File 11 Part 24: every line carries
 * `correlationId`, never logs PHI — only `resource_id`, never clinical
 * content, which is a call site discipline, not something this module can
 * enforce).
 *
 * Correlation ID comes from `RequestContextService`'s async-local storage,
 * not from `nestjs-pino`'s own request-object autologging id, so it lines up
 * exactly with the ID `CorrelationIdMiddleware` put on the response header
 * and the one `ErrorEnvelopeFilter` puts in the error body.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService, RequestContextService],
      useFactory: (config: ConfigService, context: RequestContextService) => ({
        pinoHttp: {
          level: config.get<string>('nodeEnv') === 'production' ? 'info' : 'debug',
          autoLogging: true,
          customProps: () => ({
            correlationId: context.correlationId,
          }),
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggingModule {}
