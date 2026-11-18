import { ExecutionContext } from '@nestjs/common';
import { ForbiddenError } from '../errors/domain-errors';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { RbacGuard } from './rbac.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RbacGuard', () => {
  const handler = () => undefined;
  class Cls {}
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RbacGuard(reflector as any);

  function ctx(user?: any): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => Cls,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }
  function meta(roles?: string[], permissions?: string[]) {
    reflector.getAllAndOverride.mockImplementation((key: string) => (key === ROLES_KEY ? roles : key === PERMISSIONS_KEY ? permissions : undefined));
  }
  beforeEach(() => jest.resetAllMocks());

  it('allows authenticated-only routes (no metadata, or empty arrays)', () => {
    meta(undefined, undefined);
    expect(guard.canActivate(ctx())).toBe(true);
    meta([], []);
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('forbids when metadata requires roles but there is no user', () => {
    meta(['DOCTOR'], undefined);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenError);
  });

  it('forbids a context type outside the required roles', () => {
    meta(['DOCTOR', 'ADMIN'], undefined);
    expect.assertions(2);
    try {
      guard.canActivate(ctx({ contextType: 'PATIENT', permissions: [] }));
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect(e.code).toBe('ROLE_NOT_PERMITTED');
    }
  });

  it('allows a matching role with no permission requirement', () => {
    meta(['DOCTOR'], undefined);
    expect(guard.canActivate(ctx({ contextType: 'DOCTOR', permissions: [] }))).toBe(true);
  });

  it('lists the missing permissions', () => {
    meta(undefined, ['a:read', 'b:write']);
    expect.assertions(3);
    try {
      guard.canActivate(ctx({ contextType: 'DOCTOR', permissions: ['a:read'] }));
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect(e.message).toContain('b:write');
      expect(e.message).not.toContain('a:read');
    }
  });

  it('allows when every permission is held', () => {
    meta(['DOCTOR'], ['a:read']);
    expect(guard.canActivate(ctx({ contextType: 'DOCTOR', permissions: ['a:read', 'x'] }))).toBe(true);
  });
});
