import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { Observable, map } from 'rxjs';
import { RequestContextService } from '../context/request-context.service';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  requestId: string;
  correlationId: string | null;
}

/**
 * Mirrors File 11 Part 06's error envelope for successful responses — File 11
 * only specifies the error shape explicitly; this is the documented,
 * deliberate counterpart (File 12 Part 07), applied globally so no
 * controller hand-shapes its own success response.
 *
 * `204 No Content` (`@HttpCode(204)`, e.g. logout) is passed through with no
 * body instead of being wrapped — File 11 Part 04 lists 204 as a real,
 * meaningful "success/no-body" convention, and a 204 response carrying a
 * JSON body would contradict the status code it's returning.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T> | undefined> {
  // Explicit `@Inject` — see the identical note on `CorrelationIdMiddleware`
  // (same `tsx`-only `RequestContextService` injection quirk).
  constructor(@Inject(RequestContextService) private readonly context: RequestContextService) {}

  intercept(ctx: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T> | undefined> {
    const response = ctx.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (response.statusCode === 204) {
          return undefined;
        }
        return {
          success: true as const,
          data,
          requestId: randomUUID(),
          correlationId: this.context.correlationId ?? null,
        };
      }),
    );
  }
}
