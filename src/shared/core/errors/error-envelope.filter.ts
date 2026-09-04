import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { OptimisticLockError } from '../../kernel/prisma/optimistic-lock';
import { RequestContextService } from '../context/request-context.service';
import { AppError } from './domain-errors';

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
}

/**
 * The single place File 11 Part 06's "hard rule" is enforced: no raw DB
 * error, stack trace, or file path ever reaches a client response. Every
 * exception funnels through here and comes out as the standard envelope.
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
    if (resolved.status >= 500) this.logger.error({ err: exception, ...logContext }, resolved.message);
    else this.logger.warn(logContext, resolved.message);

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
        message: exception.message,
        details: exception.details ?? {},
      };
    }

    if (exception instanceof OptimisticLockError) {
      return {
        status: HttpStatus.CONFLICT,
        code: 'OPTIMISTIC_LOCK_CONFLICT',
        message: 'This record was changed by someone else — please retry with the latest version.',
        details: { entityId: exception.entityId },
      };
    }

    if (exception instanceof BadRequestException) {
      const body = exception.getResponse();
      const fields =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: unknown }).message
          : exception.message;
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: 'The request failed validation.',
        details: { fields: Array.isArray(fields) ? fields : [fields] },
      };
    }

    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        code: httpStatusToGenericCode(exception.getStatus()),
        message: exception.message,
        details: {},
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
          message: 'This action conflicts with an existing record.',
          details: {},
        };
      }
      if (exception.code === 'P2003') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'RESOURCE_NOT_FOUND',
          message: 'A referenced resource was not found.',
          details: {},
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: {},
    };
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
