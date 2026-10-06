import { ExecutionContext } from '@nestjs/common';
import { UnauthenticatedError } from '../errors/domain-errors';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

describe('JwtAuthGuard', () => {
  const handler = () => undefined;
  class Cls {}
  const jwt = { verifyAsync: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new JwtAuthGuard(jwt as any, reflector as any);

  function ctx(request: any): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => Cls,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }
  function flags(flagMap: Record<string, boolean>) {
    reflector.getAllAndOverride.mockImplementation((key: string) => flagMap[key]);
  }
  beforeEach(() => jest.resetAllMocks());

  it('lets @Public routes through without verifying', async () => {
    flags({ [IS_PUBLIC_KEY]: true });
    expect(await guard.canActivate(ctx({ headers: {} }))).toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [handler, Cls]);
  });

  it('throws UNAUTHENTICATED when no bearer token', async () => {
    flags({});
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(guard.canActivate(ctx({ headers: { authorization: 'Basic abc' } }))).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('allows a missing token on optional routes', async () => {
    flags({ [IS_OPTIONAL_AUTH_KEY]: true });
    const req: any = { headers: {} };
    expect(await guard.canActivate(ctx(req))).toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('attaches the verified payload to request.user', async () => {
    flags({});
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    const req: any = { headers: { authorization: 'Bearer tok' } };
    expect(await guard.canActivate(ctx(req))).toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('tok');
    expect(req.user).toEqual({ sub: 'u1' });
  });

  it('maps TokenExpiredError to TOKEN_EXPIRED', async () => {
    flags({});
    const err = new Error('expired');
    err.name = 'TokenExpiredError';
    jwt.verifyAsync.mockRejectedValue(err);
    await expect(guard.canActivate(ctx({ headers: { authorization: 'Bearer t' } }))).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('maps any other verification failure to UNAUTHENTICATED (including non-Error throws)', async () => {
    flags({});
    jwt.verifyAsync.mockRejectedValueOnce(new Error('bad sig')).mockRejectedValueOnce('weird');
    await expect(guard.canActivate(ctx({ headers: { authorization: 'Bearer t' } }))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(guard.canActivate(ctx({ headers: { authorization: 'Bearer t' } }))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('swallows verification failure on optional routes', async () => {
    flags({ [IS_OPTIONAL_AUTH_KEY]: true });
    jwt.verifyAsync.mockRejectedValue(new Error('bad'));
    const req: any = { headers: { authorization: 'Bearer t' } };
    expect(await guard.canActivate(ctx(req))).toBe(true);
    expect(req.user).toBeUndefined();
  });
});
