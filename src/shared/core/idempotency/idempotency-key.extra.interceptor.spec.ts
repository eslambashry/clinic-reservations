import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency-key.interceptor';

function contextFor(key: string | undefined, req: Record<string, unknown> = {}): ExecutionContext {
  const handler = () => undefined;
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        path: '/raw/path',
        route: { path: '/route/path' },
        user: { sub: 'u1' },
        header: (name: string) => (name === 'idempotency-key' ? key : undefined),
        ...req,
      }),
    }),
  } as unknown as ExecutionContext;
}

function setup() {
  const redis = { client: { set: jest.fn() }, get: jest.fn(), set: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) };
  return { redis, interceptor: new IdempotencyInterceptor(redis as any) };
}

describe('IdempotencyInterceptor (extra paths)', () => {
  it('passes through when no key and not required', async () => {
    const { interceptor, redis } = setup();
    const next = { handle: jest.fn(() => of('x')) };
    expect(await lastValueFrom(interceptor.intercept(contextFor(undefined), next as any) as any)).toBe('x');
    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it('acquires the lock, runs the handler and caches the completed response under a user/route scoped key', async () => {
    const { interceptor, redis } = setup();
    redis.client.set.mockResolvedValue('OK');
    const next = { handle: jest.fn(() => of({ ok: 1 })) };
    expect(await lastValueFrom(interceptor.intercept(contextFor('k1'), next as any) as any)).toEqual({ ok: 1 });
    expect(redis.client.set).toHaveBeenCalledWith('idempotency:u1:POST:/route/path:k1', JSON.stringify({ status: 'IN_PROGRESS' }), 'EX', 30, 'NX');
    expect(redis.set).toHaveBeenCalledWith('idempotency:u1:POST:/route/path:k1', JSON.stringify({ status: 'COMPLETED', response: { ok: 1 } }), 86400);
  });

  it('rejects a concurrent duplicate with IDEMPOTENCY_KEY_REUSE', async () => {
    const { interceptor, redis } = setup();
    redis.client.set.mockResolvedValue(null);
    redis.get.mockResolvedValue(JSON.stringify({ status: 'IN_PROGRESS' }));
    const next = { handle: jest.fn() };
    await expect(lastValueFrom(interceptor.intercept(contextFor('k'), next as any) as any)).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE' });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('proceeds when the lock vanished between SET NX and GET', async () => {
    const { interceptor, redis } = setup();
    redis.client.set.mockResolvedValue(null);
    redis.get.mockResolvedValue(null);
    const next = { handle: jest.fn(() => of('fresh')) };
    expect(await lastValueFrom(interceptor.intercept(contextFor('k'), next as any) as any)).toBe('fresh');
  });

  it('releases the lock when the handler fails and rethrows', async () => {
    const { interceptor, redis } = setup();
    redis.client.set.mockResolvedValue('OK');
    const boom = new Error('boom');
    const next = { handle: jest.fn(() => throwError(() => boom)) };
    await expect(lastValueFrom(interceptor.intercept(contextFor('k'), next as any) as any)).rejects.toBe(boom);
    expect(redis.del).toHaveBeenCalledWith('idempotency:u1:POST:/route/path:k');
  });

  it('falls back to anon scope and request.path without route/user', async () => {
    const { interceptor, redis } = setup();
    redis.client.set.mockResolvedValue('OK');
    const next = { handle: jest.fn(() => of(1)) };
    await lastValueFrom(interceptor.intercept(contextFor('k', { user: undefined, route: undefined }), next as any) as any);
    expect(redis.client.set.mock.calls[0][0]).toBe('idempotency:anon:POST:/raw/path:k');
  });
});
