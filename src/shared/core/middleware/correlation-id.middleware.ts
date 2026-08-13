import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service';

const HEADER = 'x-correlation-id';

/**
 * Reads/generates a correlation ID per request (File 11 Part 02.3) and runs
 * the rest of the request inside `RequestContextService`'s async-local
 * storage scope, so the logger and the error-envelope filter (Part 06) can
 * both read it without it being passed explicitly.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  // Explicit `@Inject` (not just a typed constructor param) — see the
  // identical note in `PrismaService`/`RedisService`: `tsx`'s decorator
  // metadata emission for constructor `design:paramtypes` is unreliable for
  // some classes (found here via a live `start:dev` crash on the first real
  // request — `this.context` resolved `undefined`, `ts-jest`-run tests never
  // hit it since `tsc` compiles this correctly). Explicit token injection
  // sidesteps the reflection path entirely.
  constructor(@Inject(RequestContextService) private readonly context: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = (req.header(HEADER) || randomUUID()) as string;
    res.setHeader(HEADER, correlationId);

    this.context.run({ correlationId }, () => next());
  }
}
