import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, from, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { RedisService } from '../../kernel/redis/redis.service';
import { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ConflictError } from '../errors/domain-errors';

const HEADER = 'idempotency-key';
/** How long a *successful* response is cached and replayed to a retry with the same key. */
const COMPLETED_TTL_SECONDS = 24 * 60 * 60;
/**
 * How long the `IN_PROGRESS` lock survives before self-healing. Short on
 * purpose: `catchError` below already releases the lock immediately on a
 * caught exception, so this TTL only matters when the handler never gets
 * that far — a process crash, OOM kill, or deploy restart mid-transaction.
 * All locked endpoints are single-transaction and normally sub-second; a
 * generous multiple of that is enough headroom without leaving a crashed
 * lock blocking retries for the full `COMPLETED_TTL_SECONDS` window.
 */
const IN_PROGRESS_TTL_SECONDS = 30;

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
  // Explicit @Inject avoids a `tsx`-only metadata-reflection quirk for
  // constructor injection — see the identical note on `PrismaService`
  // /`RedisService`'s own constructors, which this class had missed.
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

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
            'هناك طلب مطابق قيد التنفيذ بالفعل. انتظر حتى ينتهي قبل إعادة المحاولة.',
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
    const acquired = await this.redis.client.set(redisKey, JSON.stringify(record), 'EX', IN_PROGRESS_TTL_SECONDS, 'NX');
    if (acquired === 'OK') {
      return undefined;
    }
    const existing = await this.redis.get(redisKey);
    return existing ? (JSON.parse(existing) as IdempotencyRecord) : undefined;
  }

  private async complete(redisKey: string, response: unknown): Promise<void> {
    const record: IdempotencyRecord = { status: 'COMPLETED', response };
    await this.redis.set(redisKey, JSON.stringify(record), COMPLETED_TTL_SECONDS);
  }

  private async release(redisKey: string): Promise<void> {
    await this.redis.del(redisKey);
  }
}
