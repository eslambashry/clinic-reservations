import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { DomainError } from '../errors/domain-errors';
import { IdempotencyInterceptor } from './idempotency-key.interceptor';
import { REQUIRE_IDEMPOTENCY_KEY } from './require-idempotency-key.decorator';

function contextFor(key: string | undefined, required = false): ExecutionContext {
  const handler = () => undefined;
  if (required) {
    Reflect.defineMetadata(REQUIRE_IDEMPOTENCY_KEY, true, handler);
  }
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        path: '/v1/prescriptions/provider',
        route: { path: '/v1/prescriptions/provider' },
        user: { sub: 'doctor-1' },
        header: (name: string) => (name === 'idempotency-key' ? key : undefined),
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  function setup() {
    const redis = {
      client: { set: jest.fn() },
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    return { redis, interceptor: new IdempotencyInterceptor(redis as any) };
  }

  it('rejects a provider-marked write before invoking its handler when the key is absent', () => {
    const { interceptor } = setup();
    const next = { handle: jest.fn(() => of({ ok: true })) };

    expect(() => interceptor.intercept(contextFor(undefined, true), next as any)).toThrow(DomainError);
    expect(next.handle).not.toHaveBeenCalled();
    try {
      interceptor.intercept(contextFor(undefined, true), next as any);
    } catch (error) {
      expect(error).toMatchObject({ httpStatus: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
  });

  it('replays a completed response and never invokes the write handler twice for one key', async () => {
    const { interceptor } = setup();
    const tryAcquire = jest
      .spyOn(interceptor as any, 'tryAcquire')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ status: 'COMPLETED', response: { prescriptionId: 'p-1' } });
    jest.spyOn(interceptor as any, 'complete').mockResolvedValue(undefined);
    const next = { handle: jest.fn(() => of({ prescriptionId: 'p-1' })) };

    await expect(lastValueFrom(interceptor.intercept(contextFor('same-key', true), next as any))).resolves.toEqual({ prescriptionId: 'p-1' });
    await expect(lastValueFrom(interceptor.intercept(contextFor('same-key', true), next as any))).resolves.toEqual({ prescriptionId: 'p-1' });
    expect(tryAcquire).toHaveBeenCalledTimes(2);
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});
