import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const ctxFor = (statusCode: number): any => ({ switchToHttp: () => ({ getResponse: () => ({ statusCode }) }) });

  it('wraps data in the success envelope with correlation id', async () => {
    const interceptor = new ResponseInterceptor({ correlationId: 'corr-1' } as any);
    const out: any = await lastValueFrom(interceptor.intercept(ctxFor(200), { handle: () => of({ a: 1 }) }));
    expect(out).toMatchObject({ success: true, data: { a: 1 }, correlationId: 'corr-1' });
    expect(out.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses null when no correlation id is in scope', async () => {
    const interceptor = new ResponseInterceptor({ correlationId: undefined } as any);
    const out: any = await lastValueFrom(interceptor.intercept(ctxFor(201), { handle: () => of('x') }));
    expect(out.correlationId).toBeNull();
  });

  it('passes 204 responses through without a body', async () => {
    const interceptor = new ResponseInterceptor({ correlationId: 'c' } as any);
    expect(await lastValueFrom(interceptor.intercept(ctxFor(204), { handle: () => of(undefined) }))).toBeUndefined();
  });
});
