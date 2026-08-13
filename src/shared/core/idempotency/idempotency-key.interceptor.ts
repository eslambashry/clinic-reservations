import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, from, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { RedisService } from '../../kernel/redis/redis.service';
import { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ConflictError } from '../errors/domain-errors';

const HEADER = 'idempotency-key';
const TTL_SECONDS = 24 * 60 * 60;

interface IdempotencyRecord {
  status: 'IN_PROGRESS' | 'COMPLETED';
  response?: unknown;
}

/**
 * File 11 Part 11: the concurrency-critical mutating endpoints (hold,
 * confirm, broadcast-accept, delivery creation, prescription submission)
 * require an `Idempotency-Key` header — a retry with the same key must be a
 * safe no-op, not a duplicate side effect. Applied per-route via
 * `@UseInterceptors(IdempotencyInterceptor)` on those specific endpoints,
 * not globally — most endpoints (reads, naturally-idempotent writes) don't
 * need it.
 *
 * A key locks in only a *successful* response — if the handler throws, the
 * lock is released so the same key can be retried (Part 11: "client
 * retries... are safe no-ops", not "client is permanently blocked after one
 * failure").
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const key = request.header(HEADER);

    if (!key) {
      return next.handle();
    }

    const redisKey = this.buildKey(request, key);

    return from(this.tryAcquire(redisKey)).pipe(
      switchMap((existing) => {
        if (existing?.status === 'COMPLETED') {
          return of(existing.response);
        }
        if (existing?.status === 'IN_PROGRESS') {
          throw new ConflictError(
            'IDEMPOTENCY_KEY_REUSE',
            'A request with this idempotency key is already in progress.',
          );
        }

        return next.handle().pipe(
          tap((response) => {
            void this.complete(redisKey, response);
          }),
          catchError((error) => {
            void this.release(redisKey);
            throw error;
          }),
        );
      }),
    );
  }

  private buildKey(request: Request & { user?: AccessTokenPayload }, idempotencyKey: string): string {
    const scope = request.user?.sub ?? 'anon';
    const routePath = request.route?.path ?? request.path;
    return `idempotency:${scope}:${request.method}:${routePath}:${idempotencyKey}`;
  }

  private async tryAcquire(redisKey: string): Promise<IdempotencyRecord | undefined> {
    const record: IdempotencyRecord = { status: 'IN_PROGRESS' };
    const acquired = await this.redis.client.set(redisKey, JSON.stringify(record), 'EX', TTL_SECONDS, 'NX');
    if (acquired === 'OK') {
      return undefined;
    }
    const existing = await this.redis.get(redisKey);
    return existing ? (JSON.parse(existing) as IdempotencyRecord) : undefined;
  }

  private async complete(redisKey: string, response: unknown): Promise<void> {
    const record: IdempotencyRecord = { status: 'COMPLETED', response };
    await this.redis.set(redisKey, JSON.stringify(record), TTL_SECONDS);
  }

  private async release(redisKey: string): Promise<void> {
    await this.redis.del(redisKey);
  }
}
