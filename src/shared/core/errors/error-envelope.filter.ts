import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  ValidationError,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { OptimisticLockError } from '../../kernel/prisma/optimistic-lock';
import { RequestContextService } from '../context/request-context.service';
import { toArabicValidationMessages } from '../validation/validation-messages.ar';
import { AppError } from './domain-errors';
import { arErrorMessage } from './error-messages.ar';

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    requestId: string;
    correlationId: string | null;
  };
}

interface Resolved {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
  /**
   * Developer-facing English/raw text for the log line only. Never
   * serialized — `message` above is what the client reads, and it is always
   * Arabic (see `error-messages.ar.ts`).
   */
  logMessage?: string;
}

/**
 * The single place File 11 Part 06's "hard rule" is enforced: no raw DB
 * error, stack trace, or file path ever reaches a client response. Every
 * exception funnels through here and comes out as the standard envelope.
 *
 * It is also where MedSuper's Arabic-only guarantee is enforced. `resolve`
 * routes every message through `arErrorMessage(code, message)`, which keeps
 * an Arabic message written at the throw site and replaces anything else —
 * a Nest exception, a Prisma error, an untranslated throw added later — with
 * the Arabic catalog entry for that code. English never reaches a client;
 * it is preserved in `logMessage` for the server log instead.
 *
 * `requestId` is fresh per error occurrence (for support/log lookup of this
 * specific failure); `correlationId` is the end-to-end ID threaded via
 * `RequestContextService` across the whole request (Part 02.3/24) — File 11
 * shows both fields without defining the distinction explicitly, this is
 * the deliberate interpretation (File 12 Part 07).
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorEnvelopeFilter.name);

  // Explicit `@Inject` — see the identical note on `CorrelationIdMiddleware`:
  // this class's own crash (this.context resolving undefined under `tsx`)
  // is what surfaced the bug in the first place, since it's the filter that
  // handles the middleware's failure and then failed identically itself.
  constructor(@Inject(RequestContextService) private readonly context: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const resolved = this.resolve(exception);

    const requestId = randomUUID();
    const logContext = {
      status: resolved.status,
      code: resolved.code,
      method: request.method,
      path: request.path,
      requestId,
      correlationId: this.context.correlationId ?? null,
    };
    // Log the developer-facing text (English, raw vendor/DB wording) — the
    // Arabic client copy is deliberately not what an engineer greps for.
    const logLine = resolved.logMessage ?? resolved.message;
    if (resolved.status >= 500) this.logger.error({ err: exception, ...logContext }, logLine);
    else this.logger.warn(logContext, logLine);

    const envelope: ErrorEnvelope = {
      success: false,
      error: {
        code: resolved.code,
        message: resolved.message,
        details: resolved.details,
        requestId,
        correlationId: this.context.correlationId ?? null,
      },
    };

    response.status(resolved.status).json(envelope);
  }

  private resolve(exception: unknown): Resolved {
    if (exception instanceof AppError) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        // Arabic at the throw site wins; anything else is swapped for the
        // catalog entry so a missed translation can never leak.
        message: arErrorMessage(exception.code, exception.message),
        details: exception.details ?? {},
        logMessage: exception.message,
      };
    }

    if (exception instanceof OptimisticLockError) {
      return {
        status: HttpStatus.CONFLICT,
        code: 'OPTIMISTIC_LOCK_CONFLICT',
        message: arErrorMessage('OPTIMISTIC_LOCK_CONFLICT'),
        details: { entityId: exception.entityId },
        logMessage: exception.message,
      };
    }

    if (exception instanceof BadRequestException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: arErrorMessage('VALIDATION_ERROR'),
        details: { fields: this.validationFields(exception) },
        logMessage: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const code = httpStatusToGenericCode(exception.getStatus());
      return {
        status: exception.getStatus(),
        code,
        // Nest writes these in English ("Cannot POST /v1/…", throttler's
        // "ThrottlerException: Too Many Requests"); the catalog answers for
        // all of them.
        message: arErrorMessage(code, exception.message),
        details: {},
        logMessage: exception.message,
      };
    }

    // Fallback for any Prisma error a use-case didn't already translate into
    // an AppError — keeps a raw DB error from leaking as a bare 500 for the
    // two most common cases (unique/FK constraint violations).
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: arErrorMessage('UNIQUE_CONSTRAINT_VIOLATION'),
          details: {},
          logMessage: exception.message,
        };
      }
      if (exception.code === 'P2003') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'RESOURCE_NOT_FOUND',
          message: arErrorMessage('RESOURCE_NOT_FOUND'),
          details: {},
          logMessage: exception.message,
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: arErrorMessage('INTERNAL_ERROR'),
      details: {},
      logMessage: exception instanceof Error ? exception.message : String(exception),
    };
  }

  /**
   * Per-field Arabic copy for a 400. The global pipe's `exceptionFactory`
   * (`core.module.ts`) already translates and attaches the sentences; this
   * reads them back out. A `BadRequestException` thrown anywhere else — by
   * Nest itself, or by hand — still lands here, and is answered with the
   * generic Arabic validation line rather than its English body.
   */
  private validationFields(exception: BadRequestException): string[] {
    const body = exception.getResponse();
    if (typeof body === 'object' && body !== null && 'arFields' in body) {
      return (body as { arFields: string[] }).arFields;
    }
    if (typeof body === 'object' && body !== null && 'validationErrors' in body) {
      return toArabicValidationMessages((body as { validationErrors: ValidationError[] }).validationErrors);
    }
    return [arErrorMessage('VALIDATION_ERROR')];
  }
}

function httpStatusToGenericCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'RESOURCE_NOT_FOUND';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'FILE_TOO_LARGE';
    case HttpStatus.SERVICE_UNAVAILABLE:
    case HttpStatus.BAD_GATEWAY:
      return 'GATEWAY_UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}
