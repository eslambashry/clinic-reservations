import {
  BadRequestException,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RATE_LIMIT_DEFAULT } from '../config/constants';
import { AuthCoreModule } from './auth/auth-core.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RbacGuard } from './auth/rbac.guard';
import { RequestContextModule } from './context/request-context.module';
import { ErrorEnvelopeFilter } from './errors/error-envelope.filter';
import { ResponseInterceptor } from './http/response.interceptor';
import { AppLoggingModule } from './logging/logging.module';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { toArabicValidationMessages } from './validation/validation-messages.ar';
import { OutboxModule } from './outbox/outbox.module';

/**
 * File 11 Part 02.3: every cross-cutting concern implemented once, here, and
 * applied to every module — never reimplemented per module. This is the
 * single place global guards/filters/interceptors/pipes are registered, in
 * the order they actually run:
 *
 * `ThrottlerGuard` (reject floods first) → `JwtAuthGuard` (authenticate) →
 * `RbacGuard` (authorize) → handler → `ResponseInterceptor` (wrap success) /
 * `ErrorEnvelopeFilter` (wrap failure).
 */
@Module({
  imports: [
    RequestContextModule,
    AppLoggingModule,
    AuthCoreModule,
    OutboxModule,
    ThrottlerModule.forRoot([
      { ttl: RATE_LIMIT_DEFAULT.TTL_SECONDS * 1000, limit: RATE_LIMIT_DEFAULT.LIMIT },
    ]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        // Arabic-only guarantee for 400s. class-validator writes English
        // sentences ("phone must be a string") straight into the field list
        // the clients render under each input; translating once here beats
        // a `message` option on every one of ~350 decorators, and keeps new
        // DTOs Arabic by default instead of by remembering.
        exceptionFactory: (errors: ValidationError[]) =>
          new BadRequestException({ arFields: toArabicValidationMessages(errors) }),
      }),
    },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
  ],
  exports: [RequestContextModule, AuthCoreModule],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
